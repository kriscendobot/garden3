---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/host-repair"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Host repair

Purpose: diagnose and repair a mechanical failure on one garden host: the
box, its supervisor, its slots, its records, its shed commit. Not the
projects, pull requests or board policy a host symptom happened to expose.

A host is one container (the box) running one supervisor that ticks: its
part in a quiescence, the budget, dispatch into slots, the sweep
([designs/hosts.md](../../designs/hosts.md)). There is no per-host order
channel and no remote shell: a maintainer acts on a host at its terminal.

## 1. Diagnose in a fixed order

Stop as soon as the evidence tells healthy, degraded, down and held apart.

1. **Records, with their times.** The host's own branch `host/<name>`
   (`host.yay`: its shed commit, slot count, capabilities; its usage rows);
   `garden board read` (claims held by this host, their leases, `expiries`,
   `late_runs`, jobs in `failed/`); `garden quiescence status` (a host in a
   quiescence does not claim, and that is not a fault); the leader in
   `journal:config/hosts.yay`.
2. **The box.** `./garden status` (running, and whether the image matches
   the Dockerfile), `./garden logs [<lines>]`, `./garden check`.
3. **Headroom.** Load, memory, swap, disk bytes and inodes, uptime.
4. **Slots.** Which slots hold a job, since when, and whether the job's
   deadline has passed ([designs/slots.md](../../designs/slots.md)). A
   claim is a lease: when it runs out, any host's sweep releases the job
   ([designs/deadlines.md](../../designs/deadlines.md)). Age alone is not a
   fault.

Never run git in a root worktree (`board/`, `journal/`, ...); services
write through their own clones.

## 2. Classify

- **Down:** the box is not running, or the machine is not reachable. Ask a
  person at the machine to start it (`./garden up`). Leases of its jobs
  expire by themselves; do not release them by hand.
- **Up but not claiming:** check for a quiescence first, then for a full
  slot count, then for the budget, then for capability drift
  (`garden capabilities sync`).
- **Stale image:** `./garden check` says the image does not match the
  Dockerfile. Rebuilding and restarting is a maintainer's call.
- **Drift at a quiescence's verify:** the fleet stays quiesced until the
  host is fixed and acknowledges again ([quiescence](../quiescence/SKILL.md)).
- **A slot that will not clear:** the warden kills a slot's processes and
  removes its home; a slot that survives that is a fault to report with the
  warden's answer, not to remove by hand.
- **Disk or inodes exhausted:** find what grew (slots, `repositories/`,
  capabilities) and report it; deleting history or repositories needs a
  person.
- **A key refused:** the work is routed away and the maintainer repairs the
  key. Restarts do not repair authorization.
- **The leader is gone:** no election. Claims, dispatch and the sweep go on
  elsewhere; a quiescence does not advance until a maintainer names
  another leader.

## 3. One rung at a time

Record the precondition, take one step, re-read the failing signal.

1. Observe only, when the diagnosis is enough.
2. `garden capabilities sync`, for capability drift.
3. Everything below is a maintainer's, and needs their explicit word: ask
   for the exact host, operation, evidence, effect and stop condition.
   - `./garden stop`, `./garden up`, `./garden reset` (recreates the box);
   - `./garden build`, `./garden adopt`, `./garden promote`;
   - `garden quiescence call`, `garden quiescence markAbsent <host>`;
   - `garden board release <id> --by <login>` for a failed or held job.
   Truncation is never run by hand outside a quiescence's truncate phase.

## Report

The same record in `outbox/report.md`, or the session's answer:

```
Verdict: healthy | degraded | down | held
Target / leader?: <host> / yes|no
Trigger: <what asked for this>
Evidence: <records and their times, log lines>
Cause: <established, or unknown and what is missing>
Actions: <each step, its result>
Final state: <box, supervisor, slots, claims, shed commit>
Maintainer: <the exact decision asked for, or none>
Next: <what remains, whose it is, what to check first>
```

Record every attempted step, refusals too. A safe held state with one exact
action named is a complete outcome; an unexplained change is not.

## Not built yet

A heartbeat on the host branch, and noticing a dead leader
([designs/hosts.md](../../designs/hosts.md)). Until then "down" is judged
from the box and the age of the host's last records.

Adapted from the prior garden's `skills/host-repair`.
