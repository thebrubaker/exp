# PHILOSOPHY.md — exp

## Problem

Git worktrees, branches, and stash don't give you parallel, fully-isolated copies of a project. You can't run the original dev server while experimenting in a clone. Worktrees share node_modules and miss .env files. Branches require cleanup. Stash is a stack you lose track of. Developers — especially those running Claude Code — need to create forks instantly without touching the original.

## Appetite

Build (small). Clean TypeScript/Bun rewrite of a proven 473-line bash prototype. The spec exists. No discovery, just translation + improvement.

## Priorities

1. Instant APFS clone with zero-disk overhead (the core value prop)
2. Claude Code integration (CLAUDE.md seeding, /export ride-along)
3. Simple mental model (numbered forks, flexible ID resolution)
4. Terminal integration (auto-detect, open new window)

## Trade-offs

- macOS-only by design (APFS clonefile is the point) — non-APFS fallback exists but degrades to full copy
- ~55MB compiled binary vs 17KB bash — acceptable for a developer tool
- Forks are full clones including .git — accidental push risk accepted, user responsibility
- Port conflicts and shared databases are documented gotchas, not solved problems

## Boundaries

**In:** All 10 commands (new, ls, diff, promote, trash, open, cd, status, nuke, clean-export). APFS clone with cp -R fallback. CLAUDE.md seeding with HTML comment markers. Terminal detection (Ghostty, iTerm, tmux, Terminal.app). Typed JSON metadata. EXP_* env var config. Vitest tests. Compiled binary.

**Out:** Session forking (blocked by Claude Code limitation). Volume check warnings. Disk usage tracking. Editor integration. Slash command wrapper.

**Maybe:** `cherry` command (copy files back without promote). Zsh completions. `lsof` check on promote. Warp terminal support.

## Rabbit Holes

- APFS clonefile can't be tested in CI — clone strategy is separated, tests cover orchestration
- osascript terminal opening is untestable — extracted as strategy, detection tested
- CLAUDE.md `@import` conflicts with prepend — match bash behavior, revisit later

## Quality Bar

Every behavior in the bash spec works identically. Tests cover all non-platform-specific logic (ID resolution, slugification, numbering, metadata, CLAUDE.md manipulation). Binary installs to PATH.
