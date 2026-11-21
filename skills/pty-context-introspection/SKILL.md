---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pty-context-introspection"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Context introspection

Purpose: let a worker read how much of its context window it has used, from
a figure it can prove is fresh, so it can wrap up before it runs out.

Claude Code hands a session its real context measurement in one place only:
the JSON it pipes to the `statusLine` command. That fires only in an
interactive terminal, never under `claude -p`. Running the session inside a
pseudo-terminal makes it fire; a status-line script then writes the figure
to a per-job file. This skill is the reader's side.

## The figure

One record per job, written by the status-line script on each refresh:

```yay
job: "<job id>"
session: "<session id>"
at: "<UTC ISO time of the refresh>"
used_percentage: 41
remaining_percentage: 59
input_tokens: 0
output_tokens: 0
context_window_size: 1000000
model: "<display name>"
```

## Reading it

- **Fresh or absent.** Trust the figure only when its `job` is yours, its
  `session` is yours, and `at` is within the freshness window (two minutes).
  A missing file means the figure is absent. A stale file, or one written by
  another session, is also absent, never "probably right". A leftover from
  yesterday's session must never read as today's.
- **Blank early.** `used_percentage` is blank on a session's first refresh,
  before any turn is counted. A high value appears only once real context is
  used, which is when it matters.
- **Act on it** as on the deadline note: at about 80% used, checkpoint
  (commit, write what remains) and hand off rather than be compacted
  mid-thought ([wrap-it-up](../wrap-it-up/SKILL.md)).

When the figure is absent, the worker has no measurement, and says so if it
matters; it does not guess one.

## Not built yet

The pseudo-terminal lane and its status-line writer. A slot runs its worker
without a terminal, so no figure exists today, and every read is "absent".
Building it means the dispatcher (`src/dispatch.js`) optionally running the
worker under a pseudo-terminal with a `statusLine` command that writes the
record above into the slot, removed when the job ends.

Adapted from the prior garden's `skills/pty-context-introspection`.
