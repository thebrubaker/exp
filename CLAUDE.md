# CLAUDE.md — exp

Version: v0.8.0

## Overview

`exp` is a CLI tool for instant project branching via macOS APFS clonefile. Fast worktrees + convention layer for git. TypeScript/Bun, compiled to a standalone binary.

## Development Commands

```bash
pnpm install               # Install dependencies
pnpm run build             # Build to JavaScript (dist/exp.js)
pnpm run build:binary      # Compile to standalone binary (dist/exp)
pnpm run typecheck         # Type check
pnpm run lint              # Biome lint
pnpm run lint:fix          # Biome auto-fix
bun test                   # Run tests
```

**Installation:** Binary symlinked from `~/.local/bin/`:
```bash
ln -sf $(pwd)/dist/exp ~/.local/bin/exp
```

## Architecture

```
src/
├── exp.ts              # Entry point (shebang, arg routing)
├── commands/           # One file per command
│   ├── new.ts          # Clone + metadata + seed + auto-branch + cd
│   ├── ls.ts           # List branches (compact/detail, --all for global)
│   ├── diff.ts         # Git-native diff vs original (--detail for full)
│   ├── home.ts         # cd to original project (from inside branch)
│   ├── init.ts         # Interactive onboarding wizard + shell integration
│   ├── done.ts         # Mark branch as done (safe to trash)
│   ├── trash.ts        # Delete branch (+ --done for batch cleanup)
│   ├── open.ts         # Open terminal in branch
│   ├── cd.ts           # cd to branch directory (+ proactive shell integration install)
│   ├── shell-init.ts   # Print shell wrapper function (zsh/bash/fish)
│   ├── status.ts       # Project info
│   ├── nuke.ts         # Delete ALL branches
│   └── clean-export.ts # Remove /export files
├── core/               # Business logic
│   ├── config.ts       # EXP_* env vars + config file loading (merges on write)
│   ├── project.ts      # Project root detection
│   ├── experiment.ts   # Branch resolution, numbering, metadata, branch prefix
│   ├── context.ts      # Detect branch vs project context
│   ├── clone.ts        # APFS clone with fallback
│   └── claude.ts       # CLAUDE.md seeding
└── utils/              # Shared helpers
    ├── colors.ts       # Chalk colors + output helpers
    ├── shell.ts        # Bun.spawn wrappers (exec, execCheck, execOrThrow)
    ├── terminal.ts     # Detect + open terminal (Ghostty, iTerm, tmux, Terminal.app)
    ├── cd-file.ts      # Write target dir to EXP_CD_FILE for shell wrapper
    └── shell-integration.ts  # Detect shell, rc file, install eval line

commands/                   # (empty — /exp is now a global skill)
```

## Key Patterns

- **Shell commands:** Always use arrays with `exec()` from `utils/shell.ts`, never template strings
- **Shell integration (EXP_CD_FILE):** The binary can't cd the parent shell. Solution: `exp shell-init` emits a shell function wrapper. The wrapper sets `EXP_CD_FILE` (temp file path), runs the binary, reads the file after, and `builtin cd`s if there's a target. Commands call `writeCdTarget(dir)` from `utils/cd-file.ts` to write to this file — the wrapper is generic and doesn't need per-command logic. Without the wrapper, commands fall back to printing the path.
- **Shell integration install:** `exp cd` proactively offers to install on first use without wrapper (TTY only, remembers if declined via `shell_integration_prompted` config key). Also offered in `exp init`.
- **Config merging:** `writeConfig()` merges new values with existing config so custom keys (e.g., `root`) aren't lost.
- **Terminal opening:** Ghostty uses `open -na` for new windows; iTerm/Terminal use osascript; tmux uses native commands
- **Terminal behavior:** Terminal opening is opt-in via `--terminal` flag (or `auto_terminal=true` in config). Default: cd into branch.
- **Context detection:** `detectContext()` in `core/context.ts` walks up from cwd looking for `.exp` metadata — enables branch-from-branch and `exp home`
- **CLAUDE.md seeding:** Prepends between `<!-- exp:start -->` and `<!-- exp:end -->` HTML comment markers
- **Branch resolution:** By number (`1`), full name (`001-try-redis`), or partial match (`redis`)
- **Auto-branch:** `exp new` creates `<prefix>/<slug>` git branch (prefix from config, git first name, or "exp" fallback). `--branch` flag for exact names.
- **Diverged size:** `exp ls` reports actual diverged bytes (changed/new files only), not misleading apparent size

- **Confirmations:** Interactive prompts via `@inquirer/prompts` (trash, nuke)
- **Clone strategy:** `clone_strategy=fast` in config or `--strategy fast` flag. Root-scans the source, clonefiles everything except `defer_dirs` (default: `node_modules`), returns in ~577ms. The shell wrapper then spawns `cp -cR` in the background for deferred dirs — user gets their prompt immediately, `node_modules` appears seconds later. Symlink strategy was tried first but Turbopack rejects symlinks pointing outside the project root.

## Benchmarking & Sanity Checks

Scripts for measuring clonefile performance and validating assumptions. Run these when changing clone strategy or investigating slowness.

```bash
# First-time fixture setup (creates tests/fixtures/turbo-mono, installs deps, runs build)
bun scripts/fixture-setup.ts
bun scripts/fixture-setup.ts --reset   # recreate from scratch

# Benchmark clone strategies against the turbo fixture
bun scripts/bench-clone.ts

# Benchmark against any real project
bun scripts/bench-clone.ts --fixture /path/to/your/large-project
```

**What the fixture is:** A `create-turbo` pnpm monorepo with `pnpm install` + `turbo build` run — gives you realistic `node_modules`, `.turbo` cache, and `.next` output to benchmark against. Lives at `tests/fixtures/turbo-mono` (gitignored).

**Two tiers:** The turbo fixture is lightweight (~20k inodes) — good for quick logic checks. For real-world scale benchmarks, run against a large project (e.g., one with 400k+ inodes in node_modules). The fixture intentionally stays small so setup is fast. If you want to test at scale locally, add heavy packages to `apps/web/package.json` (prisma, shadcn/ui, stripe, trpc) and `--reset` the fixture.

**Benchmark output:** Measures wall-clock time and actual disk cost (`df` before/after) for three strategies:
1. `clonefile(2)` whole tree — current behavior
2. walk-clone excluding `node_modules`
3. walk-clone excluding `node_modules` + `.turbo` + `.next`

**Known findings (large monorepo, 451k node_modules inodes, bun):**

| Strategy | Clone | Install | Total | Disk |
|---|---|---|---|---|
| `clonefile(2)` whole tree (current) | 15.8s | — | 15.8s | 163 MB |
| smart-clone, exclude all `node_modules` recursively + install | 1.7s | 9.5s | 11.2s | 59 MB |
| **root-scan, exclude `node_modules` + install** | **490ms** | **6.3s** | **6.8s** | **71 MB** |
| root-scan, exclude `node_modules` + `.turbo` + install | 490ms | 6.0s | 6.5s | 67 MB |

**Recommended: root-scan + install. 2.4x faster end-to-end.**

Root-scan: list root entries, skip excluded, `clonefile(2)` each remaining entry as an atomic subtree. O(root entries) syscalls (~15 for a typical monorepo). Nested workspace `node_modules` (apps/web, packages/ui, etc.) are included via atomic clonefile of their parent — for bun/pnpm this is safe (~3,200 inodes, negligible).

**Why smart-clone (recursive exclusion) loses:** The `subtreeHasExcluded` check is itself a full tree walk — you pay traversal cost twice. And removing all nested `node_modules` makes install take longer (bun has to create them too). Root-scan leaves workspace node_modules in place so bun only installs root.

**Nested node_modules by package manager:**
- **bun**: aggressive hoisting, nested dirs are tiny (~3,200 inodes across a dozen workspace packages) — root-scan safe
- **pnpm**: workspace node_modules are symlinks to `.pnpm/` — tiny, root-scan safe
- **npm/yarn**: version conflicts can create real nested node_modules — potential risk, but uncommon for well-maintained projects

**Key learnings:**
- `clonefile(2)` is O(N inodes) — not truly instant at scale (451k inodes → 16s, ~0.04ms/inode)
- "Apparent size" from `du -sh` is misleading for CoW clones — use `df` delta for actual disk cost
- Even clonefile has real disk cost at scale: 163MB for 451k inodes (B-tree entries + block refs)
- Smart-clone (correct recursive exclusion) is SLOWER than root-scan for bun/pnpm — double traversal cost + install has to create nested dirs too
- `.turbo` has only 155 inodes but 1.5G of large cache files — CoW setup for big files still costs ~500ms
- The spinner freezes during clonefile (synchronous FFI) — runs on main thread, blocks event loop

## Reference

The original bash prototype lives at `reference/exp.bash` — this is the spec the TypeScript port was built from.

@PHILOSOPHY.md
@CHANGELOG.md
