---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/model-selection"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Model selection

Purpose: say how thoughtful a model a piece of work needs, in one closed
vocabulary, so routing is a decision someone made and not a default
someone forgot.

## The tiers

In descending thoughtfulness:

| Tier | What it is for |
| --- | --- |
| **mentat** | The most capable model available. Manual only: a maintainer asks for it by name, for one job. |
| **mentor** | The default ceiling. Designing, building, repair. |
| **minion** | The tier below: routine, well-specified work, and the fallback. |
| **myrmidon** | Expedient: quick lookups, mechanical transforms. Never an escalation. |

Today, on the garden's Claude subscription, that is roughly Fable, Opus,
Sonnet and Haiku. The mapping is a list a maintainer keeps, not something
a job decides.

## Rules

- **Closed.** Every model has exactly one tier. A model not in the list is
  unclassified and is not routed to automatically. No wildcards: a new
  model must be classified by someone.
- **Nothing automatic reaches mentat.** A watcher, a planner or a steward
  posting jobs never emits the top tier. Only a maintainer, explicitly.
- **A floor per role.** Work is never demoted below the tier its role
  needs: `designer`, `builder` and `mechanic` at mentor, the rest at
  minion. A retry after a failure does not drop a job to a tier that cannot
  do it; that turns one transient failure into a certain one.
- **Name the tier, not the model.** A request says `tier`, never a concrete
  model id, so the list can change under it.
- **Within a job, only downshift.** A worker that hands parts of its work to
  subagents may give mechanical parts (a search, a lookup) a cheaper model;
  never a more expensive one than the job's own. Review seats work the same
  way: each seat's tier is chosen for what it checks, and only downwards.
- **Slots and budgets are not tiers.** How many workers a host runs, and an
  arc's throttle, do not change what tier a job needs.

## Not built yet

A `tier` on the job record and dispatch choosing the model from it. Today
every job runs on the model the lent subscription login defaults to
([designs/keys.md](../../designs/keys.md)). The tier list would be a YAY
record in `config/`, read by `src/dispatch.js`; `garden board post` would
accept `--tier`, refuse `mentat` unless a maintainer posts it, and refuse a
tier below the role's floor.

Adapted from the prior garden's `skills/model-selection`.
