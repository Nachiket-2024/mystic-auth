# Staying in Sync with Upstream Template Updates

---

"Upstream" just means the original mystic-auth template repo: the one you clicked **Use this template** on. Every so often it gets new fixes or features, and you can pull those into your own project whenever you want. See [Using This Repository as a Template](../overview.md) for everything else about building on top of this template; this page is just the sync mechanism itself.

**Before anything else, the thing most people worry about here: this will not fill your project's history with the template's own commits.** Your `git log` stays exactly what it's always been: your own commits, plus one extra commit for whatever you just pulled in after a sync. Upstream's own commit-by-commit history (all the work that went into building this template) never gets attached to your project at all, no matter how many times you sync over the life of your project. What follows is purely about *file changes* landing in your project, not upstream's history becoming part of it.

If you've never pulled updates from a "template" repo into your own project before, that's fine. It's not a common everyday git workflow. Nothing below requires git knowledge beyond `git add` and `git commit`. Just follow the steps in order.

Prefer to hand this whole process to an AI coding agent (Claude Code, Codex, or similar) instead? See [`agent-prompts/sync-with-upstream.md`](../../../../agent-prompts/mystic_auth/sync-with-upstream.md) at the repo root for a ready-to-paste prompt.

---

## Step by step

---

### Step 1: Check that you don't have unsaved work

```bash
git status
```

If this lists any files, save your work first: either commit it normally, or run `git stash` to set it aside temporarily. Why: the next steps will write changes into your project files, and if you also have your *own* unsaved changes sitting there at the same time, it gets confusing to tell which change came from where. Starting clean avoids that.

---

### Step 2: Run the sync script

Do this from the main folder of your project (the repo you created from **Use this template**).

```bash
./scripts/mystic_auth/upstream-sync/sync-upstream.sh        # Git Bash / WSL / Linux / macOS
# .\scripts\mystic_auth\upstream-sync\sync-upstream.ps1      # PowerShell
# scripts\mystic_auth\upstream-sync\sync-upstream.cmd        # Command Prompt
```

The real logic only exists once, as the bash script: it's dense git plumbing with its own regression suite, and a second, independently-written PowerShell copy of that same logic would just be two places for the same subtle bug to hide. The `.ps1`/`.cmd` entry points instead locate the Git Bash that already ships with Git for Windows (the same `git` install this needs either way) and run the real script through it, so PowerShell/Command Prompt users still get one command, no manual "open Git Bash first" step.

The very first time you run this, it also quietly sets up a second connection to the original template repo (git calls this a "remote", and this one's named `upstream`). That's just so the script knows where to download updates from. It does not touch your existing GitHub connection (`origin`) and does not push or upload anything anywhere. It only downloads.

---

### Step 3: Read what it found, and say yes or no

You'll see something like this printed:

```
Incoming commits from upstream/main:
a1b2c3d Add rate limiting to login
9f8e7d6 Fix OAuth redirect edge case

Sync these into the current branch now? [y/N]
```

That's the list of what's new upstream since you last synced (or ever, if this is your first time). Type `y` and press Enter if you want to bring those changes in. Type `N` (or just press Enter) if you'd rather wait: nothing will be changed, and you can run the script again later whenever you're ready.

---

### Step 4: The script copies upstream's changes into your files

This step is fully automatic: you don't type or decide anything here. For almost every file, this just quietly works: your code and upstream's code are kept in separate files/folders by design (see [overview.md](../ownership-split.md)'s ownership table), so there's usually nothing to fight over. When it's done, one of four things will have happened, checked automatically in this order:

1. **Something silently failed to apply** (rare): go to [If it reports a silent partial apply](troubleshooting.md#if-it-reports-a-silent-partial-apply).
2. **It hit what's called a "conflict"**: go to [Step 6](troubleshooting.md#step-6-conflict-resolve-it).
3. **It produced two alembic migration heads** (rare, only if this app and upstream both added a migration since your last sync): go to [If it reports multiple alembic heads](troubleshooting.md#if-it-reports-multiple-alembic-heads).
4. **None of the above (everything applied cleanly)**: go to **Step 5**.

Most syncs hit none of 1-3 and go straight to Step 5. The two "rare" cases are safety nets, not expected steps, they exist so a bad sync fails loudly instead of quietly.

---

### Step 5: Clean sync: you're basically done

You'll see normal `git commit` output on screen, ending with a message confirming the sync succeeded. There's no Step 6 here; that number belongs to the conflict-resolution path in [Troubleshooting](troubleshooting.md#step-6-conflict-resolve-it), which a clean sync skips entirely. Continue to [Step 7: Rebuild and test](rebuild-and-push.md#step-7-rebuild-and-test-before-you-trust-any-of-it).

---

## Pages

- [Rebuild, Push, and Reference](rebuild-and-push.md): rebuilding and testing, pushing, how the sync stays fast across many syncs, and a worked conflict-resolution example.
- [Troubleshooting](troubleshooting.md): a silent partial apply, a merge conflict, or multiple alembic heads.
- [Syncing with an AI Coding Agent](agent-prompt.md): a copy-paste starting prompt for handing this whole process to an agentic coding tool instead of following the steps above by hand.

---
