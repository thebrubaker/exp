# CLAUDE.md — exp

Version: v0.3.2

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
│   ├── new.ts          # Clone + metadata + seed + auto-branch + terminal
│   ├── ls.ts           # List forks (compact/detail, --all for global)
│   ├── diff.ts         # Git-native diff vs original (--detail for full)
│   ├── home.ts         # Print original project path (from inside fork)
│   ├── init.ts         # Interactive onboarding wizard
│   ├── trash.ts        # Delete fork
│   ├── open.ts         # Open terminal in fork
│   ├── cd.ts           # Print fork path
│   ├── status.ts       # Project info
│   ├── nuke.ts         # Delete ALL forks
│   └── clean-export.ts # Remove /export files
├── core/               # Business logic
│   ├── config.ts       # EXP_* env vars
│   ├── project.ts      # Project root detection
│   ├── experiment.ts   # Fork resolution, numbering, metadata
│   ├── context.ts      # Detect fork vs project context
│   ├── clone.ts        # APFS clone with fallback
│   └── claude.ts       # CLAUDE.md seeding
└── utils/              # Shared helpers
    ├── colors.ts       # Chalk colors + output helpers
    ├── shell.ts        # Bun.spawn wrappers (exec, execCheck, execOrThrow)
    └── terminal.ts     # Detect + open terminal (Ghostty, iTerm, tmux, Terminal.app)

commands/
└── side-quest.md       # Claude Code /side-quest command
```

## Key Patterns

- **Shell commands:** Always use arrays with `exec()` from `utils/shell.ts`, never template strings
- **Terminal opening:** Ghostty uses `open -na` for new windows; iTerm/Terminal use osascript; tmux uses native commands
- **TTY detection:** `process.stdin.isTTY` auto-suppresses terminal when AI/scripts call exp. Override with `--terminal`/`--no-terminal`
- **Context detection:** `detectContext()` in `core/context.ts` walks up from cwd looking for `.exp` metadata — enables fork-from-fork and `exp home`
- **CLAUDE.md seeding:** Prepends between `<!-- exp:start -->` and `<!-- exp:end -->` HTML comment markers
- **Fork resolution:** By number (`1`), full name (`001-try-redis`), or partial match (`redis`)
- **Auto-branch:** `exp new` creates `exp/<slug>` git branch for PR-ready workflow
- **Diverged size:** `exp ls` reports actual diverged bytes (changed/new files only), not misleading apparent size
- **Confirmations:** Interactive prompts via `@inquirer/prompts` (trash, nuke)

## Reference

The original bash prototype lives at `reference/exp.bash` — this is the spec the TypeScript port was built from.

@PHILOSOPHY.md
