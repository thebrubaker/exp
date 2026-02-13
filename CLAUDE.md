# CLAUDE.md — exp

Version: v0.1.0

## Overview

`exp` is a CLI tool for instant experiment forking via macOS APFS clonefile. TypeScript/Bun rewrite of a bash prototype. Compiled to a standalone binary.

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
│   ├── new.ts          # Clone + metadata + seed CLAUDE.md + terminal
│   ├── ls.ts           # List experiments
│   ├── diff.ts         # Recursive diff vs original
│   ├── promote.ts      # Experiment replaces original (with backup)
│   ├── trash.ts        # Delete experiment
│   ├── open.ts         # Open terminal in experiment
│   ├── cd.ts           # Print path
│   ├── status.ts       # Project info
│   ├── nuke.ts         # Delete ALL experiments
│   └── clean-export.ts # Remove /export files
├── core/               # Business logic
│   ├── config.ts       # EXP_* env vars
│   ├── project.ts      # Project root detection
│   ├── experiment.ts   # Resolve, numbering, metadata
│   ├── clone.ts        # APFS clone with fallback
│   └── claude.ts       # CLAUDE.md seeding + stripping
└── utils/              # Shared helpers
    ├── colors.ts       # Chalk colors + output helpers
    ├── shell.ts        # Bun.spawn wrappers (exec, execCheck, execOrThrow)
    └── terminal.ts     # Detect + open terminal (Ghostty, iTerm, tmux, Terminal.app)
```

## Key Patterns

- **Shell commands:** Always use arrays with `exec()` from `utils/shell.ts`, never template strings
- **Terminal opening:** Ghostty uses `open -na` for new windows; iTerm/Terminal use osascript; tmux uses native commands
- **CLAUDE.md seeding:** Prepends between `<!-- exp:start -->` and `<!-- exp:end -->` HTML comment markers
- **Experiment resolution:** By number (`1`), full name (`001-try-redis`), or partial match (`redis`)
- **Confirmations:** Interactive prompts via `@inquirer/prompts` (promote, trash, nuke)

## Reference

The original bash prototype lives at `reference/exp.bash` — this is the spec the TypeScript port was built from.

@import PHILOSOPHY.md
