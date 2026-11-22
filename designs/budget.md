---
author: "designer"
created: "2026-11-17"
updated: "2026-11-22"
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

## The garden's version: envelopes

The maintainer's direction (2026-11-22): envelope budgeting, with the
maintainer's discretion tapering into the arcs, and the arcs tapering to fill
the foreman's discretion. This is computed separately for each subscription.

Each pool (a subscription) has a weekly planning total. Through the week its
tokens move between envelopes on a timed schedule:

```
total        = planning_ceiling × weekly_tokens              (per pool; 0.9 by default)
f            = fraction of the week gone, 0 to 1
released(f)  = min(1, f / release_until)                     (release_until 0.5)
taper(f)     = clamp((f − taper_from) / (1 − taper_from))     (taper_from 0.5)
credit(arc)  = total × share(arc) × released(f)
credit(maintainer) = total − Σ credit(arc)
swept(x)     = taper(f) × max(0, credit(x) − spent(x))       (x: an arc, or the maintainer)
available(x) = credit(x) − spent(x) − swept(x)
available(foreman) = Σ swept − spent(foreman)
```

- **The week begins with the maintainer.** At the start the whole total is
  the maintainer's discretion.
- **The first half releases.** Each arc's envelope fills in proportion to its
  **share**, a fraction of the week. Shares sum to at most 1. Whatever the
  shares leave stays with the maintainer.
- **The second half tapers.** Every unspent balance, the maintainer's and
  each arc's, moves steadily into the foreman's discretion. At the week's
  end the foreman holds all that is left.
- **A job draws on an envelope.** Its `arc` names the envelope; `maintainer`
  and `foreman` are reserved names for the two discretions. When its own
  envelope has no room, the foreman's discretion may take it. The claim
  records which envelope admitted the job (`envelope`), and the usage row
  charges that envelope.
- **The admission arithmetic is unchanged.** A claimed job reserves
  `reservation_tokens` until it reports. A pool that has spent its total
  admits nothing.
- **Each pool is computed alone.** A pool lists the hosts that draw on it
  (`hosts`); a host it does not list draws on the first pool. Usage rows
  carry their pool.
- **Setting the budget** is `setShare({by, arc, share})` and
  `setPool({by, pool, weekly_tokens, hosts})`, each one commit to the
  journal, refused unless `by` is a maintainer.
- **Older arcs.** Arcs that carry only the older relative `throttle` (and
  `setThrottle`, which the watcher's `throttle` verb still calls) get shares
  in proportion to it, which fill the week. Once any arc has a `share`,
  throttles are ignored.
- **The day is recorded for publishing.** Once a day the leader writes
  `journal:budget/days/<date>.yay`: each pool's credit, spend, sweep and
  balance for the maintainer, the foreman and every arc, as of that moment.
  A day's spending is the difference between two days. Publishing these is
  parked until there is somewhere to publish: an ocap.site through
  minion.town, once the garden has a minion.town guest account (board job
  `budget-publish-ocap-site`, held).
- **Unknown fails closed**: with no snapshot nothing is claimed.
- **Level plays no part** ([omega.md](omega.md)): the ledger is fed by cost.

The curves are piecewise linear. A different shape, such as a front-loaded
release or a later taper, is a change to `release_until` and `taper_from` in
`config/garden.yay`.

## What changed

- Relative throttles instead of absolute caps or percentages that must sum:
  the slate can never be over-subscribed, and adjusting one arc is one number.
- Usage is sharded by host instead of sitting on the shared journal.
- Not ported: the provider's own seven-day utilization as the preferred
  sensor, the backoff ramp, reset detection and calibration, per-host worker
  leveling, campaigns, the per-call dollar cap, the auction, the road.
  Adopt on demand.

## Status

Implemented and tested (`test/budget.test.js`):
- the envelope curves;
- shares and pools, set by maintainers only, with shares never past the
  whole;
- spend by envelope and pool across hosts' branches, with cache reads
  excluded, and the week boundary;
- admission from the maintainer's discretion, from an arc as it is
  released, and from the foreman's when an arc is dry, with reservations;
- the daily record, and failing closed.

Design only: the weekly statement, the accountant's part in it, reading the
provider's own utilization, and publishing the daily record.

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
