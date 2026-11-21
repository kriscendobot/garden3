---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/bid-auction"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Bid auction

Purpose: choose which kind of worker runs a job by what it has cost to get
that kind of job merged, in real dollars, rather than by who claims first.
This is a design to keep, not a procedure a worker follows: nothing here is
built in this garden.

## The idea

The prior garden let workers bid for jobs marked for auction. Each bid came
from the worker's reputation on an **arm**: its kind, provider, model and
thoughtfulness, for the job's class of work and target. The cheapest to
merge, in agentic dollars measured plus human review dollars inferred, won.
Not the cheapest per token: a cheap model that needs three review rounds
costs more.

## What carried the weight

- **No central auctioneer.** Every worker computed the same award from the
  same data, and the board's own compare-and-swap on claiming was the only
  point of serialization. One claim lands; a mistimed one is a mis-award,
  never a double award or a lost job.
- **Deterministic draws.** Each bid was a Thompson sample seeded from a hash
  of the job, the bidder and the arm, so any award could be recomputed and
  audited from the records. A bidder's self-reported posterior was checked,
  not trusted.
- **Staged liveness.** The winner had a grace period; then ranks one and two
  were eligible, then one to three, then anyone. A dead winner never
  stranded a job.
- **Exploration without starvation.** An arm with few cost samples, or never
  accepted, drew from a wide prior, so new kinds of worker still won some
  jobs and were measured.
- **Cost and acceptance are separate measurements.** A run whose cost was
  not reported still counted toward acceptance. A missing cost was never
  read as zero: that would bid the floor and win every auction.
- **Wall-clock time priced the unpriced.** Where a provider reported no
  dollars, the run's measured duration times a rate card for that model
  stood in, marked as an estimate, widening the draw in proportion. The raw
  count of unpriced runs never shrank, and a missing rate meant no estimate,
  never zero.
- **Earlier attempts count.** A requeued job's earlier attempts were charged,
  each capped, because how long the board waited for a dead worker is not how
  long it ran.
- **The race stays.** With no bids, or one, it degrades to first claim;
  urgent and mechanical work never auctions.

## Not built yet

All of it. It would want: per-job cost and acceptance records written when a
job settles (beside the budget's records, [designs/budget.md](../../designs/budget.md)),
a reducer that folds them into per-arm estimates, and a bidding step in
dispatch (`src/dispatch.js`) for jobs marked to auction. A maintainer decides
whether the garden wants it.

Adapted from the prior garden's `skills/bid-auction`.
