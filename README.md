# exp

Instant experiment forking via macOS APFS clonefile.

[![CI](https://github.com/thebrubaker/exp/actions/workflows/ci.yml/badge.svg)](https://github.com/thebrubaker/exp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/thebrubaker/exp)](https://github.com/thebrubaker/exp/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## The Problem

You want to try something risky without nuking your working state. Your options:

- **Git branches** — no parallel execution; you switch, not fork
- **Git worktrees** — shares `node_modules`, misses `.env`, breaks tools that assume one project root
- **Git stash** — a stack you lose track of; not real isolation
- **Copy the folder** — slow, eats disk, manual cleanup

None of these give you a fully isolated, instant copy you can run side-by-side with the original.

## The Solution

`exp` uses macOS APFS copy-on-write cloning to create an instant, full copy of your project — `.env`, `.git`, `node_modules`, everything — with near-zero disk overhead. Files only consume space when they actually diverge.

```bash
exp new "try redis caching"    # Instant clone, new terminal opens
# ...experiment freely...
exp promote 1                  # Replace original with experiment
# OR
exp trash 1                    # Clean up
```

That's it. Fork, experiment, keep or toss.

## Installation

### Download Binary (Recommended)

Grab the latest binary from [GitHub Releases](https://github.com/thebrubaker/exp/releases/latest):

```bash
# Apple Silicon
curl -L https://github.com/thebrubaker/exp/releases/latest/download/exp-darwin-arm64 -o exp
chmod +x exp
sudo mv exp /usr/local/bin/exp

# Intel Mac
curl -L https://github.com/thebrubaker/exp/releases/latest/download/exp-darwin-x64 -o exp
chmod +x exp
sudo mv exp /usr/local/bin/exp
```

### Build from Source

```bash
git clone https://github.com/thebrubaker/exp.git
cd exp
bun install
bun run build:binary
sudo ln -sf $(pwd)/dist/exp /usr/local/bin/exp
```

### Homebrew

Coming soon.

## Requirements

- **macOS** with APFS filesystem (the core mechanism)
- **Bun** runtime (only if building from source)

## Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `exp new "desc"` | `n` | Clone project + open terminal |
| `exp ls` | `l`, `list` | List experiments |
| `exp diff <id>` | `d` | What changed vs original |
| `exp promote <id>` | `p` | Experiment replaces original (with backup) |
| `exp trash <id>` | `t`, `rm` | Delete experiment |
| `exp open <id>` | `o` | Open terminal in experiment |
| `exp cd <id>` | -- | Print path (use: `cd $(exp cd 3)`) |
| `exp status` | `st` | Project info |
| `exp nuke` | -- | Delete ALL experiments |
| `exp clean-export` | `ce` | Remove `/export` files from original after cloning |

IDs can be a number (`1`), full name (`001-try-redis`), or partial match (`redis`).

## How It Works

`exp` calls the macOS `clonefile(2)` syscall, which creates an atomic copy-on-write clone of your entire project directory. The filesystem handles the magic: both copies share the same physical blocks on disk until a file is actually modified, at which point only the changed blocks are duplicated.

```
~/Code/
  my-project/                  # Your original project
  .exp-my-project/
    001-try-redis/             # Experiment 1 (APFS clone)
    002-refactor-auth/         # Experiment 2 (APFS clone)
```

Experiments live in a sibling directory named `.exp-{project}`. Each experiment gets a sequential number and a slugified description.

A full clone of a project with 500MB of `node_modules` takes under a second and uses almost zero additional disk space. Files only consume real space when they diverge.

## Configuration

### Config File

Create `~/.config/exp` with key=value pairs:

```bash
# Override where experiments are stored
root=/Volumes/fast-ssd/experiments

# Force a specific terminal
terminal=ghostty

# Open editor after cloning
open_editor=cursor

# Directories to delete after cloning (saves rebuild time)
clean=.next .turbo .cache
```

### Environment Variables

Environment variables take priority over the config file:

| Variable | Config Key | Description |
|----------|------------|-------------|
| `EXP_ROOT` | `root` | Override experiment storage location |
| `EXP_TERMINAL` | `terminal` | `auto` \| `ghostty` \| `iterm` \| `warp` \| `tmux` \| `terminal` \| `none` |
| `EXP_OPEN_EDITOR` | `open_editor` | `code` \| `cursor` \| `zed` |
| `EXP_CLEAN` | `clean` | Space-separated dirs to nuke after clone (default: `.next .turbo`) |

### Terminal Detection

`exp` auto-detects your terminal and opens a new window/tab in the right app. Supported: Ghostty, iTerm2, Warp, tmux, Terminal.app. Set `EXP_TERMINAL=none` to skip opening a terminal.

## Claude Code Integration

`exp` was built for developers using [Claude Code](https://docs.anthropic.com/en/docs/claude-code). When you create a new experiment:

1. **CLAUDE.md seeding** -- `exp` prepends experiment context (description, promote/trash commands) to your `CLAUDE.md` so Claude knows it's working in a clone, not the original.

2. **`/export` ride-along** -- Use Claude's `/export` command to save your session context to a file before forking. The export comes along with the clone, giving your next Claude session full context of what you were working on.

```bash
# In Claude Code: /export
exp new "try redis caching"     # Export rides along with the clone
exp clean-export                # Remove export from original (clone keeps it)
```

## License

MIT
