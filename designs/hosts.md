---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Hosts: one garden on several machines

Code: `src/supervisor.js`, `src/shard.js`, `src/host.js`. Client hosts, the
ones on lent capacity, are in [clients.md](clients.md).

## What the prior garden does

From its scripts:

- **Identity**: a host is `<hostname>-<directory>-<8 hex of the path>`, set as
  the container's hostname by the launcher.
- **Leader**: one line in `journal2:leader`, written by hand
  (`set-main-host.sh`). There is no election and no failover. Thirty-three
  timers are leader-only (the watchers, the foreman, the reaper, the
  scheduler); the rest run on every host.
- **Coordination** is entirely through the journal branch: claims by
  compare-and-swap, `hosts/<host>` for worker counts, `fleet/deployed/` and
  `fleet/health/`, `budget/live/` as the heartbeat (a host is offline after
  1,800 s without one).
- **Orders to one host**: `send-host-op.sh` writes a message to that host's
  topic; `sysop.sh` on each host polls every 20 s and carries out a closed
  vocabulary of operations, some needing a maintainer's attestation.
- **Deploys**: the leader releases followers one at a time
  (`rolling-deploy.sh`); each follower fast-forwards itself
  (`self-deploy.sh`).
- Live hosts at the commit read: `endolin-garden-ece02cb4` (leader),
  `oros-studio-garden-ce242c49`; `endolin-garden2-5bcdff64` is archived.

## The garden's version

- **Identity** is the same derivation (`garden` launcher).
- **One process per host.** The supervisor ticks: its part in any quiescence;
  refresh the budget; dispatch while there is a job and a free slot; press the
  journal once a day. The prior garden's sixty-odd systemd units become
  branches of one loop.
- **Leader**: `journal:config/hosts.yay` names it, set by a maintainer. Still
  no election. Leader-only: advancing and truncating a quiescence, and (design
  only) the GitHub watchers. The sweep, with its deadline watch, runs on every
  host ([deadlines.md](deadlines.md)).
- **Per-host records live on the host's own branch**, `host/<name>`: usage
  rows now; status and a heartbeat when written. A host never contends with
  another to record something about itself. This is the main difference in
  kind from the prior garden, where heartbeats alone were 8,620 commits a
  month on the shared branch and one host's health reports 1,540.
- **Orders to hosts**: fleet-wide through the quiescence document; to a
  client host through the `clients` branch. There is no per-host message
  topic and no `sysop`.
- **Getting code**: at a quiescence, all hosts together
  ([quiescence.md](quiescence.md)).

## Steering from GitHub

The purpose is unchanged: the same maintainers operate the garden through
GitHub. The first watcher is built: the one on the garden's own repository,
by which a maintainer opens work with an issue and releases, abandons and
throttles by comment, and the steward answers there
([watcher.md](watcher.md)). The watchers on the managed project repositories
are **not ported**: in the prior garden they are `comment-watcher.sh` (2,600
lines), `mention-watcher.sh`, `triager.sh`, `ci-watcher.sh` and
`receipt-watcher.sh`. They are next, on the same client and the same gate.

Dropped on purpose: the GitHub Pages board (`docs/bulletin/`, `bulletin.sh`,
the pages watcher and shepherd, the journalist), which was also the largest
single source of journal commits (9,558 a month); and everything that advances
minion.town (the screening units, the MCP bridge and watchdog, the publishing
skills, its arcs and schedules).

## Status

Implemented and tested: the supervisor's tick and its leader gating, claims
between hosts, per-host usage branches, catch-up of a returning host. Design
only: status and heartbeat on the host branch; the watchers on managed repositories;
noticing a dead leader.

## Open questions

1. **Leader failure.** If the leader dies, claims, dispatch and the deadline
   watch continue on other hosts, but no quiescence advances until a
   maintainer names another leader. The prior garden is the same.
2. **Which watcher comes next**: comments on managed repositories' pull
   requests is the one most work arrives by. Whether its verb table (rebase,
   retcon, shepherd, review, and the rest) is carried over unchanged.
3. **No per-host orders for maintainer-run hosts.** A maintainer acts on such
   a host at its terminal. Is a remote order needed there too, or is that
   what `clients` is for?
