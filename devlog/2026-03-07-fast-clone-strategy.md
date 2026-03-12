---
title: "Fast clone strategy: symlink → deferred background clone"
date: "2026-03-07"
project: "exp"
summary: "Tried symlink strategy for fast cloning, Turbopack killed it, pivoted to deferred background clone via shell wrapper — shipped as opt-in, no perfect solution found"
tags: ["clone-strategy", "turbopack", "performance", "negative-result", "tradeoffs"]
---

# Devlog: Fast clone strategy

**Date:** 2026-03-07

## Starting Point

`exp new` clones via a single `clonefile(2)` syscall — O(N inodes). For onbook (451k inodes in node_modules), this takes ~16s. Benchmarks from a previous session showed root-scan + skip `node_modules` completes in ~490ms. Goal: make forking instant.

The plan coming in was to add a symlink strategy: clone everything except `node_modules`, symlink it back from source. Benchmarks looked great on paper.

## Naming the thing (harder than expected)

Before writing code, spent real time on what to call the config. This matters because the names shape how users think about the feature:

- `excludeStrategy: "symlink" | "skip"` + `exclude: ["node_modules"]` — first attempt. Confusing. "Exclude" implies absence, but symlink means they're still there. And `excludeStrategy` conflates *what to skip* with *what to do after skipping*.
- `clone_strategy=smart` + `smart_exclude` — "exclude" still wrong. We're not excluding, we're handling differently.
- `clone_strategy=symlink` + `symlink_dirs` — honest about the mechanism. But then Joel pushed back: "what if we want true exclusion vs. this copy strategy specific to installables?" The names were conflating two concerns.
- Final answer from Joel: `clone_strategy=symlink`, `symlink_dirs=node_modules`. The strategy *is* symlinking, the config says what to symlink. Clean.

Key insight: when naming keeps feeling wrong, the abstraction is probably wrong too.

## Symlink strategy — built and tested

Built `clone_strategy=symlink`: walk the tree via `walkAndClone()`, clonefile everything, but `symlinkSync()` for dirs matching `symlink_dirs`. First version had `SYMLINK_SEARCH_DEPTH = 3`, recursing into subdirs to find nested `node_modules`.

Tested on onbook — 13 symlinked locations (root + 12 workspace packages). 844ms. Turbopack immediately crashed:

```
Error [TurbopackInternalError]: Symlink apps/web/node_modules is invalid,
it points out of the filesystem root

Debug info:
- Execution of find_package failed
- Symlink apps/web/node_modules is invalid, it points out of the filesystem root
```

## Patching to root-only (wrong instinct)

First reaction: nested symlinks are the problem. Set `SYMLINK_SEARCH_DEPTH = 0` so only root `node_modules` gets symlinked, workspace `node_modules` gets cloned atomically with their parent dirs.

628ms clone, 1 symlinked location. Same error:

```
Symlink node_modules is invalid, it points out of the filesystem root
```

Joel called this out: "you fell into the patching problem." He was right — I patched the symptom without understanding *why* Turbopack rejected the symlink. Depth wasn't the issue.

## Finding the smoking gun

Joel asked to identify all theories and find the actual cause before fixing anything. Theories:

1. Turbopack sandboxes the project root and rejects any symlink resolving outside it
2. Absolute vs relative symlink matters
3. It's `node_modules`-specific
4. Other tools might be fine (Turbopack-only strictness)

Probed in parallel:

```bash
# From the fork root
node -e "require('react')"   # works fine
bun -e "import('react')"     # works fine
ls -la node_modules           # -> /Users/joel/Code/onbook/node_modules (absolute)
cat /var/folders/.../next-panic-*.log  # same error, no extra detail
```

Also spawned a research agent on vercel/next.js GitHub. Found the answer:

**Root cause:** Turbopack intentionally enforces a filesystem root boundary for cache validation and file watching performance. Any symlink resolving outside the project boundary is rejected by design. Confirmed by Tim Neutkens in [next.js#77562](https://github.com/vercel/next.js/issues/77562).

There's a `turbopack.root` config to widen the boundary:
```js
// next.config.js
turbopack: { root: path.join(__dirname, '..') }
```

But requiring users to patch their Next.js config defeats the "just works" goal of exp.

**Key finding:** `node` and `bun` resolve symlinks fine. This is Turbopack-specific. But since Next.js/Turbopack is the primary use case (onbook), symlinks are DOA as a general strategy.

## Pivoting: "symlinks is actually an invalid strategy — oh well"

Joel's words. We considered the remaining fast option from benchmarks: root-scan + `bun install` (skip node_modules, reinstall in fork). 490ms clone + 6.3s install = 6.8s total. 2.3x faster than full clone but not instant.

Then Joel had the key insight: **"I was thinking clonefile(2) all but node modules, give control back to the user which will then change directories, while another is running clonefile on all of the node modules?"**

Two-phase clone:
1. Clone everything except `node_modules` (~577ms). User gets cd'd into fork immediately.
2. Clone `node_modules` in background — by the time user needs it (starting dev server), it's probably done.

No symlinks, no install, real files everywhere. Just timing.

## First background attempt: setTimeout (didn't work)

Tried `setTimeout(() => { tryClonefile(...) }, 0)` in the binary. Problem: the binary process stays alive until the clonefile completes, and the shell wrapper waits for the process to exit before running `cd`. User sees 725ms in output but `took 8s` in their prompt.

```
032-test-fast-strategy on  joel/test-fast-strategy 󰷈 1  took 8s
```

The binary can't outlive itself invisibly.

## The shell wrapper insight

Joel suggested: "maybe we can lean into our zsh alias?" The shell wrapper (`exp()` function from `exp shell-init`) already runs *after* the binary exits — it reads the cd file and changes directory. It lives in the parent shell and can spawn background processes.

Extended the cd file protocol. Binary writes structured lines:

```
cd:/Users/joel/Code/.exp-onbook/032-test-deferred-clone
defer:/Users/joel/Code/onbook/node_modules:/Users/joel/Code/.exp-onbook/032-test-deferred-clone/node_modules
```

Shell wrapper parses them:

```bash
case "$line" in
  cd:*)
    builtin cd "${line#cd:}" ;;
  defer:*)
    local src="${payload%%:*}"
    local dst="${payload#*:}"
    /bin/cp -cR "$src" "$dst" &>/dev/null &
    disown 2>/dev/null ;;
  *)
    # Backwards compat: bare path = cd target
    builtin cd "$line" ;;
esac
```

Using `cp -cR` (CoW copy, per-file) instead of `clonefile(2)` (single syscall) because it's trivial to spawn as a background process. Slightly slower but running while the user is doing other things, so who cares.

## Testing on onbook — it works

```
❯ exp new "test deferred clone" --verbose
✓ Cloned via fast in 577ms
  ...
⚠ node_modules cloning in background (1 locations)
  total: 750ms

[5] 83372    # <-- backgrounded cp -cR PID, disowned

032-test-deferred-clone on  joel/test-deferred-clone 󰷈 1  took 12s
```

The `took 12s` includes 11.7s for `exp trash` of the previous fork (deleting is O(N inodes) too). Actual clone + cd was sub-second. `[5] 83372` confirms the wrapper spawned the background copy.

`bun dev` from `apps/web` — Turbopack starts fine, all modules resolve:

```
▲ Next.js 16.0.8 (Turbopack)
✓ Ready in 9s
```

## Where we landed — and the honest assessment

```
clone_strategy=fast     # in ~/.config/exp
defer_dirs=node_modules # default, configurable
```

577ms to prompt. Real files. Background `cp -cR`. No symlinks, no tool compatibility issues.

**But this isn't a perfect solution.** The tradeoffs:

1. **Race condition window.** There are a few seconds after cd'ing into the fork where `node_modules` doesn't exist yet. If you immediately try to run a script or start a dev server, it fails. In practice, the first few seconds are usually spent booting Claude Code or reading files — but it's a real edge case.

2. **Silent failure risk.** If `cp -cR` fails in the background (permissions, disk space, process killed), the fork has no `node_modules` and you don't know why. There's no notification mechanism — the copy is fire-and-forget via `disown`.

3. **Requires shell wrapper.** Fast strategy only works with the shell wrapper installed (`eval "$(exp shell-init)"` in `.zshrc`). Without it, the `defer:` lines in the cd file are never parsed. The binary can't do the background clone itself.

**Decision: opt-in only.** Default stays `full` (dumb, reliable, 16s). `fast` is a power-user option for people who understand the tradeoffs. Going to dogfood it for a few weeks to see if the edge cases actually surface.

Updated `exp init` to ask about clone strategy, with `full` as default. Fast strategy auto-triggers shell integration install since it depends on the wrapper.

Commits:
- `8c7f317` — symlink strategy (tried, abandoned in same session)
- `53812c9` — v0.7.0 docs, benchmarking scripts, version bump
- `4f5e65a` — fast clone strategy via shell wrapper (what shipped)
- `79c2641` — docs update + first devlog draft
- `4db5e9d` — cherry-picked `exp clone` utility command

## Takeaways

- **Symlinks outside project root are rejected by Turbopack by design.** Not a bug. `turbopack.root` config exists but requiring users to patch their Next.js config is a non-starter for a "just works" tool. `node` and `bun` handle symlinks fine — this is bundler-specific.

- **The shell wrapper is a powerful integration point.** It lives in the parent shell, outlives the binary, and can spawn background processes. We used it for cd; now it also handles deferred cloning. The cd file protocol (`cd:`, `defer:`, bare path fallback) is extensible.

- **`eval "$(exp shell-init)"` means auto-updating wrappers.** The wrapper re-evaluates on every shell session. Updating the binary updates the wrapper. No versioning system needed.

- **Probe before patching.** Depth-limiting the symlink search was a wrong turn — one wasted test cycle. Joel's "let's talk about all the theories" approach would have jumped straight to the root cause.

- **Naming reveals abstraction problems.** When `exclude`, `smart`, and `symlink` all felt wrong as config names, it was because the mental model kept shifting. The final `clone_strategy=fast` + `defer_dirs` works because it describes the *user experience* (fast, deferred) rather than the *mechanism* (root-scan, background cp).

- **No perfect solution exists for this problem.** `clonefile(2)` is O(N inodes) — you can't make it faster without skipping work. Skipping work means something isn't there yet. Symlinking it means tool compatibility issues. Background copying means race conditions. Each approach trades one problem for another. The best we found: make the tradeoff opt-in and document it honestly.
