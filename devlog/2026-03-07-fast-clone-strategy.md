---
title: "Fast clone strategy: symlink → deferred background clone"
date: "2026-03-07"
project: "exp"
summary: "Tried symlink strategy for fast cloning, Turbopack killed it, pivoted to deferred background clone via shell wrapper"
tags: ["clone-strategy", "turbopack", "performance", "negative-result"]
---

# Devlog: Fast clone strategy

**Date:** 2026-03-07

## Starting Point

`exp new` clones via a single `clonefile(2)` syscall — O(N inodes). For onbook (451k inodes), this takes ~16s. Benchmarks from a previous session showed root-scan + skip `node_modules` completes in ~490ms. Goal: make forking instant.

## Symlink strategy (first attempt)

Built `clone_strategy=symlink`: walk the tree, clonefile everything, but symlink `node_modules` back to source instead of cloning it. Config: `symlink_dirs=node_modules`.

First version symlinked at all depths (13 locations in onbook monorepo — root + workspace packages). Turbopack immediately crashed:

```
Error [TurbopackInternalError]: Symlink apps/web/node_modules is invalid,
it points out of the filesystem root
```

## Patching to root-only (wrong instinct)

Assumed nested symlinks were the problem. Set `SYMLINK_SEARCH_DEPTH = 0` so only root `node_modules` gets symlinked, workspace `node_modules` gets cloned with parent dirs atomically.

Same error, now for root `node_modules`:

```
Symlink node_modules is invalid, it points out of the filesystem root
```

This was the "patching problem" — fixing the symptom without understanding the cause.

## Finding the smoking gun

Probed in parallel:
- `node -e "require('react')"` — **works** through symlink
- `bun -e "import('react')"` — **works** through symlink
- Turbopack panic log — same error, no additional detail
- Research agent on vercel/next.js issues

**Root cause:** Turbopack intentionally sandboxes the project root for cache validation and file watching. Any symlink resolving outside the project boundary is rejected. Confirmed by Tim Neutkens in [next.js#77562](https://github.com/vercel/next.js/issues/77562).

There's a `turbopack.root` config to widen the boundary, but requiring users to patch their Next.js config defeats the "just works" goal.

**Key learning:** `node` and `bun` resolve symlinks fine. This is Turbopack-specific strictness, not a general Node.js limitation.

## Naming journey

Along the way, iterated on config naming:
- `excludeStrategy: "symlink" | "skip"` + `exclude: ["node_modules"]` — confusing, conflated clone strategy with post-clone behavior
- `clone_strategy=smart` + `smart_exclude` — "exclude" implies absence, but we're bringing them back
- `clone_strategy=symlink` + `symlink_dirs` — honest about what happens
- Final: `clone_strategy=fast` + `defer_dirs` — describes the user experience, not the mechanism

## Deferred background clone (final approach)

Instead of symlinks, defer `node_modules` cloning to after the user gets control:

1. Binary root-scans, clonefiles everything except `defer_dirs` (~577ms)
2. Binary writes `cd:` and `defer:src:dst` lines to the cd file
3. Shell wrapper parses the file: `cd`s the user in, spawns `cp -cR src dst &` and disowns
4. User has prompt immediately, `node_modules` appears seconds later

First attempt used `setTimeout` in the binary — process stayed alive blocking the shell wrapper. Moved to the shell wrapper approach where the wrapper itself spawns the background copy.

Commits: `8c7f317` (symlink), `53812c9` (docs/version), `4f5e65a` (fast/deferred)

## Where We Landed

```
clone_strategy=fast     # in ~/.config/exp
defer_dirs=node_modules # default, configurable
```

577ms to prompt. Real files everywhere (no symlinks). `node_modules` cloned in background by shell wrapper. Turbopack, bun, node all happy.

## Takeaways

- Symlinks outside project root are rejected by Turbopack by design — not a bug, not fixable without user config changes
- The shell wrapper is a powerful integration point — it runs in the parent shell, can spawn background processes, and outlives the binary
- "Exclude" as a concept was misleading when the dirs still need to be present — naming matters for mental models
- Always probe the actual error before patching: depth-limiting the symlink search was a wrong turn that cost a test cycle
