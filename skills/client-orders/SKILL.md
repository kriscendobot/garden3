---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Orders for client hosts

Design: `shed:designs/clients.md`. A client host follows its record,
`clients/<host>.yay`, on the `clients` branch.

1. Edit the record in the `clients/` worktree: raise `serial`; set `shed`
   (a full commit id), `slots`, `plots`, `arcs`, `capabilities`; add an order
   with a new `id`.
2. Commit and push to `clients`. **Pushing is the authority**: whoever can
   push this branch controls every host that watches it. Keep that set small
   and the branch protected.
3. The host applies it at its next tick, within its owner's limits, and
   reports on its own `host/<name>` branch.

An order can ask for a shed revision, a slot count, plots, arcs, capabilities,
and `quiesce`, `drain`, `resume`, `restart`, `clear-scratch`. It cannot run a
command. What the owner has not allowed is refused, and a record with an
unknown field or operation says so rather than half-applying.
