# CRITICAL — cross-scope notices

Read this **at the start of every session and before starting every new task**. The version on `main` is the one that counts:

```bash
git fetch -q origin && git show origin/main:CRITICAL.md
```

## What goes here

Only things the **other scope must act on**:
- a contract change (new or changed field, file or metric definition),
- a broken or wrong data file already on `main`,
- a changed demo site ID, a changed path, or a blocker that changes the plan or timeline.

Not here: progress updates (they go in `docs/status-A.md` / `docs/status-B.md`) or ideas.

## Rules

1. **Append-only.** Never delete or rewrite an entry. To close one, change its `Status`.
2. **Only humans commit this file to `main`.** Agents (leads included) draft the entry in their status file under "Draft CRITICAL notice". Their human reviews it and commits it straight to `main`. This file is the one exception to "PR + approval", because it must land fast.
3. **A notice is not a contract change.** If the notice changes the contract, the contract PR must follow. Until it merges, the notice says what to do in the meantime.
4. **Acknowledge.** When the affected scope has done the action, its lead adds one line under the entry: `ACK <scope> <time> — <what was done>`. The author sets `Status: closed` once it's ACKed.
5. Agents: if a notice is `open` and affects your scope, **do it before your current task continues**, or report to your lead if you can't.

## Entry template

```
### C-00X · <short title>
- Date (CET): 2026-11-14 15:20
- From: scope A | scope B
- Affects: scope A | scope B | both
- Severity: blocking | must-fix-before-freeze
- Contract: none | v1.2.0 PR #__ (pending/merged)
- What changed / what's wrong:
- Action required:
- Workaround until fixed:
- Status: open
```

---

## Notices

_(none yet)_
