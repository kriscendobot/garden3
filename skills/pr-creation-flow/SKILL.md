---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-creation-flow"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request creation flow

Purpose: the stages a garden pull request passes before a maintainer sees it
(**the gauntlet**), each its own job, run to the end.

Order: **build** (the steward opens the draft) → **assayer** (tests for this
change, same branch) → **cleaner** (coverage, CI green) → **panel**, with a
fixer and a fresh panel on each must-fix → **appellate** pass → **ready**.
A tiny change skips the cleaner; a design-only change skips assayer and
cleaner and gets the design panel
([panel](../panel/SKILL.md)).

## Norms

- **Every pull request is opened as a draft.** Opening one ready skips the
  whole review. Only the end of the panel moves it to ready.
- **One job, one pull request**: find by head branch and by a
  `<!-- garden-job: <id> -->` marker before opening; more than one found is
  for a maintainer.
- **Designs and implementations are separate pull requests**: designs on the
  roadmap branch (`llm`), implementations on the natural base (`master`).
- **Next stage owed**, from the pull request's state, first match: conflicting
  → rebase; out of draft → done; passed but draft → ready; must-fix → fixer;
  fixed since verdict → panel; cleaned and green → panel; built → cleaner.
- Never force a head; the steward pushes under a lease.
- Each job ends with `next:` the stage owed.

Not built yet: the steward's publishing and the drive that posts each stage
([designs/pull-requests.md](../../designs/pull-requests.md)).

Adapted from the prior garden's `skills/pr-creation-flow`.
