# CLAUDE.md — exp

Version: v0.5.0

## Overview

`exp` is a CLI tool for instant project forking via macOS APFS clonefile. Fast worktrees + convention layer for git. TypeScript/Bun, compiled to a standalone binary.

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
│   ├── ls.ts           # List forks (compact/detail, --all for global)
│   ├── diff.ts         # Git-native diff vs original (--detail for full)
│   ├── home.ts         # cd to original project (from inside fork)
│   ├── init.ts         # Interactive onboarding wizard + shell integration
│   ├── trash.ts        # Delete fork
│   ├── open.ts         # Open terminal in fork
│   ├── cd.ts           # cd to fork directory (+ proactive shell integration install)
│   ├── shell-init.ts   # Print shell wrapper function (zsh/bash/fish)
│   ├── status.ts       # Project info
│   ├── nuke.ts         # Delete ALL forks
│   └── clean-export.ts # Remove /export files
├── core/               # Business logic
│   ├── config.ts       # EXP_* env vars + config file loading (merges on write)
│   ├── project.ts      # Project root detection
│   ├── experiment.ts   # Fork resolution, numbering, metadata, branch prefix
│   ├── context.ts      # Detect fork vs project context
│   ├── clone.ts        # APFS clone with fallback
│   └── claude.ts       # CLAUDE.md seeding
└── utils/              # Shared helpers
    ├── colors.ts       # Chalk colors + output helpers
    ├── shell.ts        # Bun.spawn wrappers (exec, execCheck, execOrThrow)
    ├── terminal.ts     # Detect + open terminal (Ghostty, iTerm, tmux, Terminal.app)
    ├── cd-file.ts      # Write target dir to EXP_CD_FILE for shell wrapper
    └── shell-integration.ts  # Detect shell, rc file, install eval line

commands/
└── side-quest.md       # Claude Code /side-quest command
```

## Key Patterns

- **Shell commands:** Always use arrays with `exec()` from `utils/shell.ts`, never template strings
- **Shell integration (EXP_CD_FILE):** The binary can't cd the parent shell. Solution: `exp shell-init` emits a shell function wrapper. The wrapper sets `EXP_CD_FILE` (temp file path), runs the binary, reads the file after, and `builtin cd`s if there's a target. Commands call `writeCdTarget(dir)` from `utils/cd-file.ts` to write to this file — the wrapper is generic and doesn't need per-command logic. Without the wrapper, commands fall back to printing the path.
- **Shell integration install:** `exp cd` proactively offers to install on first use without wrapper (TTY only, remembers if declined via `shell_integration_prompted` config key). Also offered in `exp init`.
- **Config merging:** `writeConfig()` merges new values with existing config so custom keys (e.g., `root`) aren't lost.
- **Terminal opening:** Ghostty uses `open -na` for new windows; iTerm/Terminal use osascript; tmux uses native commands
- **Terminal behavior:** Terminal opening is opt-in via `--terminal` flag (or `auto_terminal=true` in config). Default: cd into fork.
- **Context detection:** `detectContext()` in `core/context.ts` walks up from cwd looking for `.exp` metadata — enables fork-from-fork and `exp home`
- **CLAUDE.md seeding:** Prepends between `<!-- exp:start -->` and `<!-- exp:end -->` HTML comment markers
- **Fork resolution:** By number (`1`), full name (`001-try-redis`), or partial match (`redis`)
- **Auto-branch:** `exp new` creates `<prefix>/<slug>` git branch (prefix from config, git first name, or "exp" fallback). `--branch` flag for exact names.
- **Diverged size:** `exp ls` reports actual diverged bytes (changed/new files only), not misleading apparent size
- **Confirmations:** Interactive prompts via `@inquirer/prompts` (trash, nuke)

## Reference

The original bash prototype lives at `reference/exp.bash` — this is the spec the TypeScript port was built from.

@PHILOSOPHY.md
@CHANGELOG.md
