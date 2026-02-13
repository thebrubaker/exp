---
description: Fork an experiment from the current project using exp
argument-hint: <description of what to try>
---

# Side Quest — Fork an Experiment

You are forking the current project into a new experiment using `exp`. This creates an instant APFS copy-on-write clone — everything is copied (node_modules, .env, .git, build cache) with near-zero disk overhead until files diverge.

## Arguments

The experiment description: `$ARGUMENTS`

This becomes the experiment name (slugified) and gets seeded into the clone's CLAUDE.md as the goal.

## Execution

### 1. Verify exp is installed

Run `which exp`. If not found, tell the user:
- `exp` is not installed. Install it from https://github.com/digitalpine/exp
- Or they can manually clone: `cp -c -r . ../experiment` (macOS APFS only)

### 2. Create the experiment

```bash
EXP_TERMINAL=none exp new "$ARGUMENTS"
```

`EXP_TERMINAL=none` suppresses opening a new terminal window — we're already in a session.

### 3. Parse the output

The output contains the experiment name (e.g., `001-try-redis`) and path. Capture both.

### 4. Report back

Tell the user the experiment is ready. Include:

- **Experiment path** — the full path to the clone
- **Open it** — `cd <path> && claude`
- **Check on it later** — `exp ls` to see all experiments, `exp diff <num>` to see what changed
- **Bring it back** — `exp promote <num>` to replace the original with the experiment
- **Discard it** — `exp trash <num>` to delete the clone

Keep the output concise. The user wants to know it worked and how to get there.

## Begin

Create the experiment with the provided description.
