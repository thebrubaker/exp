# Backlog

## exp ls: slow performance

`exp ls` takes ~2s even for a modest list of forks. Likely bottleneck is serial stat/git calls per fork (diverged size calculation, age). Should profile and parallelize or cache where possible.

## exp ls: column width is too wide

The output stretches way too wide when fork names or descriptions are long. Columns are padded to max width regardless of terminal size.

**Example:** A list of 17 forks produces lines well over 120 chars, making it hard to scan.

**Fix ideas:**
- Truncate name/description columns to a max width (e.g. 40 chars with ellipsis)
- Use terminal width to calculate proportional column widths
- Drop the description column if it's just repeating the name (many are identical or near-identical)

## Auto-add `.exp` to `.gitignore`

Running `exp new` creates a `.exp/` metadata directory in the project root, but it's not automatically added to `.gitignore`. Users have to manually add it, which is easy to forget and creates noisy diffs.

**Fix:** On first `exp new` (or `exp init`), check if `.exp` is in `.gitignore`. If not, append it and inform the user.

Also: modifying `CLAUDE.md` (the seeding behavior) is annoying — revisit whether the prepend approach is the right default, or if it should be opt-in.

## Stale fork cleanup / triage

Forks accumulate and it's hard to tell which are finished, which have pending work, and which are stale. No good workflow for bulk cleanup.

**Desired behavior:**
- Show fork age + change status in `exp ls` (e.g. "no uncommitted changes", "3 files modified", "has unpushed commits")
- `exp ls --stale` or `exp ls --older-than 7d` to filter old forks
- `exp ls --status` to show git dirty state per fork
- `exp trash --stale 7d` to bulk-delete forks older than N days with no pending changes
- For forks with pending changes, show a preview of what would be lost before confirming deletion
- Consider color-coding: green (clean/safe to delete), yellow (has changes), red (has unpushed commits)

**Key insight:** "Old + no changes = safe to kill. Old + minimal changes = easy to kill with a preview. Old + significant changes = needs attention."
