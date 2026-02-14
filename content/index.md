---
name: exp
tagline: Instant project forking via APFS clonefile. Zero disk, zero fear.
description: A CLI tool for macOS that creates fully isolated project copies in milliseconds using APFS copy-on-write cloning. Fork your project, try something wild, promote or trash it.
subdomain: exp
status: prototype
github: thebrubaker/exp
links:
  - label: Install via Homebrew
    url: https://github.com/thebrubaker/exp#installation
---

# The Moment Before You Break Everything

You're three days into a feature. The codebase is in a good state — tests pass, the architecture feels right. Then you get an idea. Not a small idea. The kind that touches six files and might require ripping out the router.

You *want* to try it.

But you also know what happens next. You'll stash your work (and forget the stash name). Or create a branch (and forget to clean it up). Or — if you're being honest — you'll just start hacking in place and pray `git checkout .` will save you if it goes sideways.

**None of these give you what you actually want: a full, isolated copy of your project that you can blow up without consequence.**

---

# What If Forking Was Free?

macOS sits on APFS — a filesystem with copy-on-write cloning built in. When you clone a file, the OS doesn't copy the bytes. It just says "these two files share the same data, and I'll only allocate new space when one of them changes."

This means you can clone an entire project — `node_modules`, `.env`, build artifacts, everything — in milliseconds. The copy takes near-zero disk space until you actually change something.

`exp` is a thin CLI that wraps this into a workflow:

```bash
$ exp new "try the new router"

  ✓ Cloned to .exp-myproject/001-try-the-new-router
  ✓ Created branch exp/try-the-new-router
  ✓ Seeded CLAUDE.md with fork context
  ✓ Opening terminal...

  ~484 bytes diverged (basically nothing)
```

That's it. You're in a full copy of your project. Your original is untouched. Go wild.

---

# How I Actually Use This

I built `exp` because I run Claude Code agents in parallel — and they need isolated workspaces. But the tool turned out to be useful for things I didn't anticipate.

## The Orchestrator Pattern

When I have a feature that decomposes into independent streams, I fork once per stream:

```bash
exp new "api endpoints"      # → 001
exp new "service layer"      # → 002
exp new "client integration" # → 003
```

Each agent works in its own clone. No file ownership rules, no merge conflicts during work. When they're done, I diff each fork against the original and reconcile:

```bash
$ exp diff 001

  Modified:  src/api/routes.ts
  Modified:  src/api/middleware.ts
  Added:     src/api/validators.ts

  3 files changed, ~2.1KB diverged
```

Copy the changed files back, verify, trash the forks. The whole cycle takes minutes.

## The Side Quest

Sometimes you're working on something and a tangent appears — not related to the current task, but interesting enough that you don't want to lose it. With `exp`, the cost of exploring is basically zero:

```bash
exp new "what if we used sqlite instead"
```

If it works out, `exp promote` replaces your original with the fork (with a backup). If it doesn't, `exp trash` and you're back where you started. No branches to clean up, no stash to remember, no mental overhead.

## The Safety Net

Before doing anything destructive — a major refactor, a dependency upgrade, a database migration — I fork first. Not because I don't trust `git reset --hard`, but because a full project clone (including `node_modules`, `.env`, running state) gives me a confidence that version control alone doesn't.

---

# Under the Hood

## Why Not Just `cp -R`?

Of course, you could just `cp -R` the project. But consider: a typical Node.js project with `node_modules` is 500MB–2GB. Copying that takes 10–30 seconds and doubles your disk usage.

APFS clonefile does it in *milliseconds* with *near-zero* disk overhead. Files only consume additional space when they diverge. A fork where you changed three files might use 50KB total.

```tsx rechart height=200
const data = [
  { method: 'cp -R', time: 25, disk: 1800 },
  { method: 'git worktree', time: 3, disk: 400 },
  { method: 'exp (APFS)', time: 0.05, disk: 0.5 },
];

const barColors = [theme.colors.muted, theme.colors.tertiary, theme.colors.primary];

<BarChart data={data} layout="vertical">
  <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.grid} />
  <XAxis type="number" stroke={theme.colors.text} fontSize={theme.fontSize} label={{ value: 'Seconds to clone', position: 'bottom', fill: theme.colors.text, fontSize: theme.fontSize }} />
  <YAxis type="category" dataKey="method" stroke={theme.colors.text} fontSize={theme.fontSize} width={100} />
  <Tooltip formatter={(value) => [`${value}s`, 'Clone time']} />
  <Bar dataKey="time" radius={[0, 4, 4, 0]}>
    {data.map((entry, index) => (
      <Cell key={index} fill={barColors[index]} />
    ))}
  </Bar>
</BarChart>
```

## Claude Code Integration

Every fork gets its CLAUDE.md seeded with context — what the fork is for, where the original lives, how to diff and trash. When an AI agent opens the fork, it immediately knows what it's working on and how to get back.

```markdown
<!-- exp:start -->
## Side quest: try-the-new-router

APFS clone of `myproject`. Original untouched at `/Users/joel/Code/myproject`.
Goal: **try-the-new-router**
Diff: `exp diff 001` | Trash: `exp trash 001`
<!-- exp:end -->
```

This isn't an afterthought — it's the reason the tool exists. Isolated agent workspaces that are fully context-aware.

---

# Trade-offs

### macOS Only

This is an APFS tool. That's the point — without copy-on-write cloning, it's just a slower `cp`. A fallback exists for non-APFS filesystems, but it loses the magic.

### ~55MB Binary

The TypeScript/Bun compiled binary is larger than the 17KB bash prototype it replaced. For a developer tool that saves minutes per use, this is the right trade.

### Port Conflicts Are Your Problem

If your original runs a dev server on port 3000 and you open a fork, they'll fight over the port. `exp` doesn't solve this — it's a filesystem tool, not a process manager. Kill the original's server first, or use a different port.

---

# Where This Is Going

`exp` is v0.3. The core — fork, diff, promote, trash — is solid. Ten commands, no configuration, and fork IDs are flexible enough that `exp diff redis` resolves to `001-try-redis` without thinking about it.

What I keep reaching for that doesn't exist yet: a `cherry` command that copies specific files back from a fork without doing a full promote. Right now I `/bin/cp` them manually during reconciliation. It's fine for three files. It's annoying for twelve.

---

This project was built *using itself*. Every feature was developed in an `exp` fork, tested in isolation, and promoted back when it worked. The orchestration workflow described above? That's literally how the three-agent rewrite of `exp ls` shipped — three Opus agents, three clones, reconciled in minutes.
