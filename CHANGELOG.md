# Changelog

## v0.3.3 — 2026-02-14

- Fix spinner rendering in non-TTY contexts (agents, piped output, VHS)
- Add `--force` / `-y` flag to `exp trash` and `exp nuke` for non-interactive use
- Non-TTY without `--force` now errors with helpful message instead of hanging
- Add `--json` output to `trash` and `nuke` commands
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
