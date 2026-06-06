# Changelog

## v0.12.0 — 2026-06-06

- `exp trash --shrink` reclaims disk from branches you're not ready to fully trash: it stages and removes only the *disposable* dirs inside the selected branches — the union of `defer_dirs` (node_modules) and `clean` (.next, .turbo) — leaving the branch and all code intact. For limbo branches you can't triage yet but know you don't need installed deps for; next use, `pnpm install` / a build regenerates them. Works with every existing trash selector (`<id>`, ranges `1 3-5 8`, `--done`, self from inside a branch, `--force`/`-y`, `--json`). Finds nested workspace `node_modules` recursively (prunes at each match, skips `.git`, never follows symlinks), and reuses trash's instant atomic rename-into-`.trash` + deferred background `rm`. No pre-reclaim size reporting (would require a slow `du`; out per PHILOSOPHY). JSON: `{ shrunk: [...names], reclaimed: <dirCount>, elapsedMs, deferred }`. Nothing to reclaim is reported, never an error.
- Fix: staged-trash names now use the full UUIDv7, not its 8-char prefix. The prefix is a millisecond timestamp, so multiple same-basename targets staged in one tick (e.g. several `node_modules` during a `--shrink`) could collide and fail with `ENOTEMPTY`. Whole-branch trash never hit this (branch dirs have unique names); surfaced by `--shrink` staging many `node_modules` at once.

## v0.11.0 — 2026-06-06

- `exp help` (and bare `exp`) now print the version in the header (`exp vX.Y.Z`) — makes it obvious which build is running, since a dev symlink (`~/.local/bin/exp`) and a Homebrew install can resolve differently across interactive vs non-interactive shells.
- `exp new` no longer silently forks from the branch you happen to be standing in (DIG-281). The clone source is always the project root unless `--from` is given. Previously, being cwd'd inside a branch made that branch the source via context auto-detection — which combined with auto-cd to corrupt the natural `exp new A && exp new B` pattern: the shell wrapper cd's into A after creating it, so B was forked from A instead of the project. Branch-from-branch is still supported, but now it's opt-in and explicit via `--from <id>`.
- `exp new` always reports its clone source now (`from:` line in default output, previously only shown in `--verbose`). When run from inside a branch without `--from`, it also prints a hint showing how to branch from the current branch instead — no more silent source resolution (PHILOSOPHY.md "no silent behavior").
- Memory bridge: `exp new` symlinks `~/.claude/projects/<branch-slug>/memory` to the parent project's memory dir, so Claude auto-memory written inside a branch lands in the parent's bucket — no more orphaned entries when branches are trashed. (Originally shaped to use `autoMemoryDirectory` in `.claude/settings.local.json`, but verified empirically that Claude only honors that setting from user-level `~/.claude/settings.json` by design — symlink works below Claude's awareness.)
- New config key: `memory_bridge` (default `true`) / `EXP_MEMORY_BRIDGE` env var to disable
- New module: `core/memory-bridge.ts` exporting `claudeProjectSlug`, `claudeProjectDir`, `claudeMemoryDir`, `bridgeMemory`
- JSON output of `exp new` includes `memoryBridge: "linked" | "exists" | "skipped" | "off" | "error"`
- Memory bridge fails gracefully: any filesystem error (permission, slug-rule drift, etc.) produces a warning and the branch is still created. `bridgeMemory` returns `{ status, reason? }` and never throws — `exp new` always succeeds even if the bridge can't be set up.
- Memory bridge self-heals dangling links (DIG-292): if the parent project's Claude bucket is pruned *after* a branch is created, the bridge symlink starts pointing at nothing — and a dangling link hard-fails Claude's memory writes (ENOENT) rather than orphaning them. `exp cd` and `exp open` now recreate the missing target dir before entering the branch (the moment right before a Claude session would start writing). New `healBridge(branchDir)` in `core/memory-bridge.ts` — reads the link's actual target so a redirected link is repaired where it really points, and never throws.

## v0.10.0 — 2026-04-20

- `exp trash` is now ~instant for any size branch via rename-and-defer: stages targets to `<base>/.trash/<uuid>` (atomic `mv` on same APFS volume) and hands the actual `rm -rf` to the shell wrapper to run disowned in the background. 10-branch `exp trash --done` drops from ~158s to ~50ms perceived.
- Multi-target staging is parallelized via `Promise.all`
- `.trash/` orphans (e.g. from a crashed background rm) are swept opportunistically on every `exp trash` invocation
- New `rm:<path>` directive in the EXP_CD_FILE protocol; shell wrappers (zsh/bash/fish) updated. Re-run `exp init` or refresh `eval "$(exp shell-init)"` to pick up the new wrapper.
- Without the shell wrapper, trash falls back to foreground `rmSync` (same speed as before — wrapper users get the speedup)
- `exp trash --json` now includes a `deferred: true|false` flag so callers know whether `elapsedMs` reflects rename-only or full deletion
- New `listBranches(base)` helper centralizes branch enumeration and skips dot-prefixed entries (so `.trash/` is invisible to `ls`, `nuke`, `cd`, `status`, etc.)

## v0.9.0 — 2026-03-14

- All commands now work from inside a branch: `diff`, `trash`, `open`, `done`, `status`, `cd` resolve siblings via context detection
- `exp cd 2` from inside branch 3 navigates to sibling (was "Not found")
- `exp status` from inside a branch shows the parent project, not the branch itself
- `exp new --terminal` no longer cd's the original terminal — only the new terminal window changes directory
- Ghostty terminal opening uses clipboard paste instead of keystroke to prevent character dropping on long paths
- Branch auto-detect only triggers on `/` (e.g. `feat/my-thing`), not bare hyphens — `exp new "my-thing"` correctly applies `joel/` prefix
- Remove CLAUDE.md seeding and assume-unchanged flag
- Rename fork/clone terminology to "branch" across codebase and docs
- Replace `/side-quest` command with global `/exp` skill
- Add `exp done` lifecycle flag for branch cleanup
- Add `exp cp` as alias for raw clonefile copy

## v0.8.0 — 2026-03-07

- `exp init` now includes clone strategy selection (full/fast)
- Clean targets question only shown for full clone strategy
- Shell integration auto-installs for fast clone (wrapper needed for background copying)
- `exp clone` added to init quick reference
- Auto-cd question clarifies it adds a shell wrapper to your profile

## v0.7.0 — 2026-03-07

- Fast clone strategy: `clone_strategy=fast` defers `node_modules` cloning to background (~577ms to prompt vs ~16s full clone)
- Shell wrapper spawns `cp -cR` in background for deferred dirs — user gets prompt immediately
- Extended cd file protocol with `cd:` and `defer:` lines (backwards compatible with bare paths)
- New config keys: `clone_strategy` (`full`|`fast`), `defer_dirs` (default: `node_modules`)
- New flag: `exp new --strategy fast|full` for one-off override
- Add `exp clone <source> [destination]` — raw clonefile(2) utility for copying any directory (alias: `exp cp`)
- Benchmarking scripts for measuring clone performance (`scripts/bench-clone.ts`, `scripts/fixture-setup.ts`)
- Symlink strategy tried and abandoned — Turbopack rejects symlinks pointing outside project root

## v0.6.0 — 2026-02-25

- `exp ls` is fast now — dropped diverged size calculation from compact mode (was ~2s, now instant)
- Color-coded status dots in `exp ls`: green (clean), yellow (modified), red (unpushed commits)
- Column width capping: name 30 chars, description 40 chars, with ellipsis truncation
- Hide description column when it duplicates the fork name slug
- `exp trash` with no args inside a fork offers to self-trash, cd's back to project root
- `exp trash` now shows diverged size instead of misleading full apparent size (was showing 9.6G for a 3.4MB fork)
- `exp trash` prints elapsed time after deletion
- `exp new` auto-adds `.exp` to fork's `.gitignore` (no more accidental metadata commits)
- `exp new` marks `CLAUDE.md` as `assume-unchanged` in forks (seeding stays local)

## v0.5.0 — 2026-02-25

- Shell integration: `exp cd 11` now actually changes your directory (via shell wrapper)
- Add `exp shell-init` command — outputs shell wrapper function for zsh, bash, and fish
- `exp cd` proactively offers to install shell integration on first use without wrapper (asks once, remembers if declined)
- `exp init` now includes shell integration step — detects shell, offers to append eval line to rc file
- `exp new` auto-cd's into the fork when shell wrapper is active
- `exp home` auto-cd's to original project when shell wrapper is active
- Context-aware bare `exp`: shows "First time? Run: exp init" or fork count for current project
- Idempotent `exp init`: skips pitch on reconfigure, pre-fills existing values as defaults
- Fix `writeConfig` to merge with existing config instead of replacing (preserves custom keys like `root`)
- Improve `exp cd` with no args to suggest `exp ls`

## v0.4.0 — 2026-02-16

- Configurable branch naming: `branch_prefix` config / `EXP_BRANCH_PREFIX` env var (default: git first name or "exp")
- Add `--branch` / `-b` flag to `exp new` for exact branch names (e.g. `--branch feat/onl-123`)
- Add `getDefaultBranchPrefix()` helper in `core/experiment.ts`
- Terminal opening is now opt-in: default behavior prints cd path instead of opening a new terminal
- Add `auto_terminal` config / `EXP_AUTO_TERMINAL` env var to restore auto-open behavior
- Add `--terminal` and `--no-terminal` to help text FLAGS section
- Restructure `exp init` wizard: post-fork behavior choice (cd recommended), branch prefix prompt
- Update init pitch text to reflect cd-first workflow

## v0.3.4 — 2026-02-14

- Fix lint errors that broke CI
- Add quality gates (typecheck, test, lint) to release workflow

## v0.3.3 — 2026-02-14

- Fix spinner rendering in non-TTY contexts (agents, piped output, VHS)
- Add `--force` / `-y` flag to `exp trash` for non-interactive use
- Add `--json` output to `trash` command
- `exp nuke` is now human-only — agents get a clear error directing them to `exp trash <id> --force`
- Fix stale VERSION constant (was stuck at 0.3.0)

## v0.3.2 — 2026-02-13

- Rename "experiments" to "forks" across codebase and docs
- Rewrite README with VHS demos
- Add demo app scaffold (backlogged)

## v0.3.1 — 2026-02-13

- Add `--json` flag to `exp new` for machine-readable output
- Add Homebrew formula publishing to release workflow

## v0.3.0 — 2026-02-13

- Add `exp home` command — print original project path from inside a fork
- Add `exp init` command — interactive onboarding wizard (terminal, editor, clean targets)
- Rewrite `exp diff` with git-native output and `--detail` flag
- Auto-create `exp/<slug>` git branch on `exp new` for PR-ready workflow
- Smart TTY detection — suppress terminal opening when called by AI/scripts
- Add `--from` flag to clone from existing forks (fork-from-fork)
- Detect fork context — commands work correctly from inside a fork
- Show diverged disk size in `exp ls` (changed/new files only, not misleading apparent size)
- Add `exp ls --all` for global fork listing across projects
- Remove `promote` and `snap` commands (simplify surface area)
- Add `/side-quest` Claude Code command

## v0.2.0 — 2026-02-13

- Add `exp init` interactive onboarding
- Add `--verbose` flag, clean up default output
- Add spinner animation during clone
- Fix Ghostty multi-window bug (uses `open -na` for new windows)
- Add `clonefile(2)` syscall for true APFS cloning
- Add `~/.config/exp` config file support
- Add CI and release workflows
- Upgrade `exp ls` output formatting

## v0.1.0 — 2026-02-13

- Initial TypeScript/Bun rewrite from 473-line bash prototype
- 10 commands: new, ls, diff, promote, trash, open, cd, status, nuke, clean-export
- APFS clone with `cp -R` fallback
- CLAUDE.md seeding with HTML comment markers
- Terminal detection (Ghostty, iTerm, tmux, Terminal.app)
- EXP_* environment variable configuration
- Compiled to standalone binary via Bun
