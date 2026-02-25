# Changelog

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
