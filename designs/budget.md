---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Budget: a throttle per arc

The prior garden's budgeting, kept, with one number per arc for the
maintainers to turn. Code: `src/budget.js`.

## What the prior garden does

Found in `scripts/jobs/` (`set-apportionment.sh`, `arc-spend.sh`,
`usage-meter.sh`, `claim-job.sh`, `budget-level.sh`, `foreman.sh`) and
`designs/subscription-budget-model.md`:

- **What is metered**: weekly billable tokens per subscription, billable
  being input + output + cache creation; cache reads are free. No dollars.
- **Pools**: `config/budget-pools`, one row per subscription with its weekly
  ceiling, set by hand by the maintainer.
- **Usage**: one row per run in `usage/<job>.jsonl` on the journal, carrying
  host, arc and token counts.
- **Arcs**: a job carries `arc:`. `config/apportionment` is a ranked slate of
  arcs, each with a token cap for the week, set by `set-apportionment.sh
  --authorized-by <login>` (checked against the maintainers allowlist) from
  integers or percentages of the total; the total is 0.9 of the pools. An arc
  at its cap is held. The words in the code are *slice*, *rank* and *slate*;
  "throttle" and "interest" do not appear.
- **Gates**: the claim gate refuses when the host's pool is in backoff; the
  foreman promotes parked work in arc-rank order and skips arcs with no
  headroom.
- A second system, the *budget road*, is present but dormant; its design says
  it comes from the tower. It is not ported, as asked.

## The garden's version

One number per arc, its **throttle**: a relative weight of interest. Only its
ratio to the other arcs' throttles matters.

```
total      = planning_ceiling × Σ pools[].weekly_tokens          (0.9 by default)
cap(arc)   = floor(total × throttle(arc) / Σ throttles of active arcs)
spend(arc) = Σ billable tokens of this week's usage rows for the arc
admit      = arc active  and  spend + reserved + reservation ≤ cap
             and fleet spend < total
```

- `journal:config/arcs.yay` holds the arcs (`arc`, `throttle`, `status`,
  `summary`, who set it and when) and the week's anchor; `pools.yay` the
  subscriptions. Rank on the slate is by throttle, highest first.
- **Turning a throttle** is `budget.setThrottle({by, arc, throttle})`, one
  commit, refused unless `by` is in `journal:config/maintainers.yay`. This is
  the path from a maintainer's comment on GitHub to the slate: the watcher
  passes the commenter's login and this decides. `retire` takes an arc off;
  a throttle of 0 keeps it listed with no allowance. Raising one arc's
  throttle lowers every other arc's share: that is the "relative".
- **Usage rows** are written by each host to its own `host/<name>` branch
  (`recordUsage`), so recording spend contends with nothing. `refresh` sums
  them across hosts. At a quiescence past weeks are folded into
  `journal:budget/weeks/<date>.yay` and dropped from the host branches
  ([quiescence.md](quiescence.md)).
- **Admission** is at claim time. A job reserves a flat `reservation_tokens`
  while it is claimed, so a burst of claims cannot overrun an arc before any
  of them reports; what it is charged in the end is what it cost.
  Unarced work is charged to `unallocated`, an arc like any other.
- **Unknown fails closed**: with no snapshot nothing is claimed.
- **Level plays no part** ([omega.md](omega.md)): the ledger is fed by cost.

## What changed

- Relative throttles instead of absolute caps or percentages that must sum:
  the slate can never be over-subscribed, and adjusting one arc is one number.
- Usage is sharded by host instead of sitting on the shared journal.
- Not ported: the provider's own seven-day utilization as the preferred
  sensor, the backoff ramp, reset detection and calibration, per-host worker
  leveling, campaigns, the per-call dollar cap, the auction, the road.
  Adopt on demand.

## Status

Implemented and tested: the slate arithmetic, authorization, retire and zero,
spend across two hosts' branches, cache reads excluded, the week boundary,
admission with reservations through the claim gate, failing closed
(`test/budget.test.js`). Design only: the weekly statement and the
accountant's part in it; reading the provider's own utilization.

## Open questions

1. **Is "throttle" this?** The reading here is one relative weight per arc.
   The other reading is a multiplier (0 to 1) applied to an arc's separately
   set share, so that an arc can be slowed without the others speeding up.
2. **Hard cap or soft.** An arc at its cap is held for the rest of the week,
   as in the prior garden; nothing borrows from an idle arc.
3. **Multiple subscriptions.** The total pools every subscription together;
   the prior garden gates each host on its own pool. With a client host on
   its own subscription ([clients.md](clients.md)) the per-pool gate may need
   to come back.
4. **Level** and the budget: see omega.md.
