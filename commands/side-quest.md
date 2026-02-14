---
description: Fork the current project using exp
argument-hint: <description of what to try>
---

# Side Quest — Fork the Project

You are forking the current project into a new fork using `exp`. This creates an instant APFS copy-on-write clone — everything is copied (node_modules, .env, .git, build cache) with near-zero disk overhead until files diverge.

## Arguments

The fork description: `$ARGUMENTS`

This becomes the fork name (slugified) and gets seeded into the clone's CLAUDE.md as the goal.

## Execution

### 1. Verify exp is installed

Run `which exp`. If not found, tell the user:
- `exp` is not installed. Install it from https://github.com/digitalpine/exp
- Or they can manually clone: `cp -c -r . ../fork` (macOS APFS only)

### 2. Create the fork

```bash
EXP_TERMINAL=none exp new "$ARGUMENTS"
```

`EXP_TERMINAL=none` suppresses opening a new terminal window — we're already in a session.

### 3. Parse the output

The output contains the fork name (e.g., `001-try-redis`) and path. Capture both.

### 4. Report back

Tell the user the fork is ready. Include:

- **Fork path** — the full path to the clone
- **Open it** — `cd <path> && claude`
- **Check on it later** — `exp ls` to see all forks, `exp diff <num>` to see what changed
- **Bring it back** — commit, push the branch, merge via git/PR
- **Discard it** — `exp trash <num>` to delete the clone

Keep the output concise. The user wants to know it worked and how to get there.

## Begin

Create the fork with the provided description.
