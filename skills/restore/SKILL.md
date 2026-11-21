---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/restore"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Restore

Purpose: recover after a garden-wide interruption (a model provider outage,
a quota exhausted, a long network partition) once service is back. Use it
when a maintainer says "restore", or "we're back, clean up".

## What is left behind

The garden mostly heals itself. A claim is a lease, and every host's sweep
releases a job whose lease ran out, so an orphaned run needs no reaper
([designs/deadlines.md](../../designs/deadlines.md)). What it does not undo:

- **Jobs that failed because of the outage.** A failed job stays in
  `failed/` and blocks what comes after it until a maintainer releases it.
- **Hosts that stopped**, or a box that exited during the outage.
- **Reports that say "could not"** because the model or a fetch failed:
  settled, but with nothing done.

## Procedure

Each step finds nothing to do when there is nothing to recover, so a
restore doubles as a check.

1. **The hosts.** For each host: `./garden status`; if the box is down, a
   person at it runs `./garden up`. A host that comes back catches up by
   itself before it claims ([host-repair](../host-repair/SKILL.md)).
2. **The board.** `garden board read`. Leases past their time are released
   by the next sweep; do not release them by hand.
3. **Failed jobs.** For each job in `failed/`, read its last report. If it
   failed because of the outage, it may go again:
   `garden board release <id> --by <login>`, naming the maintainer who said
   restore. A job that failed for its own reason is not re-run blindly:
   list it for the maintainer instead.
4. **Report** the tally.

Releasing a failed job is a maintainer's go-ahead
([roles/steward](../../roles/steward/AGENT.md)): restore carries one
maintainer's word to the jobs that outage failed, and to no others.

## Report

> Restore complete. Hosts: 2 up. Leases: 1 expired by the sweep and
> re-claimed. Failed: 3 released (outage), 1 left for the maintainer
> (`fix-a`: its test fails on its own).

Adapted from the prior garden's `skills/restore`.
