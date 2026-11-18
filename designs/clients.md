---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Client hosts: remote control of lent capacity

A client host runs a garden on a machine someone has lent. The first is the
Oros Studio host. The `clients` branch is how the maintainers run it without
being at it. Code: `src/clients.js`.

## Oros Studio today

From the prior garden's scripts and `context/operations/`:
`oros-studio-garden-ce242c49` is a follower on a Mac, running the container in
a Docker Desktop Linux VM with the garden's directory on virtiofs. It has its
own subscription pool (`claude-oros`, 180M tokens a week), runs Claude workers
only, has no AWS credential and a narrower GitHub token. Its slow filesystem
is the stated cause of several of the prior garden's clone and contention
fixes.

The maintainer has since said: Oros Studio is **donated without terms**. The
donor sets no hours and no load limits, so any limits are the garden's own
choice. Its operator's interest is in learning to operate a meta-harness and
in encouraging open-source technologies they can rely on. The consent file's
limits therefore default to what the garden chooses (two slots, no hours),
and the mechanism for an owner's limits stays, for this host if that changes
and for others.

What the prior garden can do to it: send `sysop` operations over the journal
(set worker counts, drain, restart or stop a unit, deploy a commit), pin jobs
to it, release it a deploy, zero its worker cap if it goes offline. What it
cannot: see why a drained or offline host is so; rebuild or recreate the
container; place a key; notice load on the machine. At the commit read, Oros
was three deploys behind the leader with a failing unit, a state the garden
could observe and not repair.

## The branch

`clients:clients/<host>.yay` is the state the maintainers want one host's
garden in:

```yay
host: "oros-studio"
serial: 12                  # rises with every change
shed: "<40-hex commit>"     # the shed revision to run
slots: 2                    # how many jobs at once; 0 drains it
plots: ["alder"]            # which plots it runs
arcs: ["endo"]              # which arcs it draws from
capabilities: ["node", "rust"]
orders:                     # standing orders, each done once, by id
  - id: "q-2026-11-17"
    op: "quiesce"           # quiesce | drain | resume | restart | clear-scratch
expires_at: "2026-11-24T00:00:00Z"   # optional
```

The branch is control only. A client host **reports on its own
`host/<name>` branch** (usage rows; status when written), never here.

A client host finds its section by its own name. It fetches the branch from
the one repository it is configured with, over the same authenticated
transport as every other shard.

## Authority is push access

Decided by the maintainer: trusting push access to the repository is
sufficient. There are no signed orders. What follows from that, plainly:

- **The set of people and tokens that can push to the `clients` branch is the
  set that controls every watching host's garden.** That set is what must be
  managed: branch protection on `clients`, and who holds write access to the
  repository, should be settled before any client host starts watching.
- A client host itself needs push access (it claims jobs and writes its host
  branch), so unless the branch is protected, a client host's own credential
  can write orders for any other. Branch protection restricting `clients` to
  the maintainers closes that.

## The opt-in is on the host, and visible

A host watches only if its owner has written `CLIENT-CONSENT.yay` in the
garden's directory on that machine:

```yay
watch: true
host: "oros-studio"
limits:
  max_slots: 2
  hours_utc: {from: 6, to: 22}    # optional: outside these the garden drains
allow:
  shed: true                      # may the shed revision be changed remotely
  capabilities: true              # may capabilities be installed remotely
  orders: ["quiesce", "drain", "resume", "restart", "clear-scratch"]
```

With no such file the branch is not even fetched. The file is never tracked
and never written by the garden. **To revoke**, the owner sets `watch: false`
or deletes the file: the next tick stops watching. Stronger: `./garden stop`;
removing the container and its volume; removing the host's deploy key on
GitHub.

## What reconcile does

`reconcile` turns the record into a list of actions and a list of refusals,
and is pure. The watcher only reads; the supervisor carries a plan out and
then records its serial and order ids, so nothing is done twice.

| The record says | Action |
| --- | --- |
| `shed` differs from the running one | `rejuvenate` to it ([quiescence.md](quiescence.md)) |
| `slots` | `set-slots`, clamped to the owner's `max_slots` (and noted) |
| `plots`, `arcs`, `capabilities` | `set-plots`, `set-arcs`, `set-capabilities` |
| an order not yet done | `quiesce`, `drain`, `resume`, `restart`, `clear-scratch` |

What a host will not do whatever the branch says, as a matter of containment
and correctness rather than distrust of whoever pushed:

- **There is no order that runs a command** or reads a file. Control is of
  the garden inside its container, not of the lender's machine. The launcher
  mounts only the garden's own directory and a capability volume.
- A record that is not well-formed YAY, names another host, or uses a field or
  an operation outside the vocabulary is refused: a malformed record whole,
  an unknown part by itself, with the reason. Nothing is half-applied
  silently.
- A record with a lower serial than the last applied is ignored, so a stale
  fetch cannot roll a host back.
- The owner's limits win: slots are clamped, the hours are kept, and what
  `allow` withholds is refused.
- No key travels by any branch ([keys.md](keys.md)).

## Client hosts and maintainer-run hosts

A maintainer-run host takes its orders from a maintainer at its terminal and
from the fleet's quiescence. A client host does that and also follows its
record on `clients`. A client host is never the leader, runs no watcher, and
holds no key but its own model credential and a token to push with.

## What this replaces

The prior garden's `sysop.sh` and `send-host-op.sh` (per-host message topics
with attested operations), `hosts/<host>` worker counts, `config/worker-leveling`
caps, `rolling-deploy.sh` and `self-deploy.sh` for a follower, and
`worker-derotate.sh`. Desired state on a branch replaces a stream of
operations: a host that was off for a week reads one record and knows what it
should be, instead of replaying a topic.

## Status

Implemented and tested: the record and consent formats, reconcile (clamping,
hours, refusals, already-done orders), the watcher (no consent means no
fetch; stale and malformed records; revocation) (`test/clients.test.js`).
Design only: the supervisor carrying a plan out (`set-slots` and the rest are
names with no effect yet); the host's status report; load awareness.

## Open questions

1. **Its architecture.** Not recorded in the references and not yet answered.
   Nothing in the garden assumes amd64 for a client host: capabilities are
   per architecture, the warden is built on the host for the host, and the
   entrypoint picks the node pin by `uname -m`. But node for arm64 has no
   hash yet, so an arm64 host cannot boot until it is pinned.
2. **Load on the lender's machine.** The prior garden has an unbuilt design
   for backing off under CPU pressure
   (`designs/cpu-back-pressure-job-dispatch.md`). Hours and a slot limit are
   the only protections here.
3. **Docker Desktop on a Mac.** Slots need real accounts and a setuid helper
   inside the VM's container; virtiofs made git slow enough to shape the prior
   garden. Whether the box's state should live in a volume rather than on the
   Mac's filesystem is for whoever first runs it there.
4. **Recreating the container remotely** (for a new base image) is not in the
   vocabulary: it needs the lender's Docker, outside the box.
