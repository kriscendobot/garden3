---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/liaison-reports"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Maintainer reports

Purpose: know which reports a maintainer asks for, which question each
answers, and how each was made before, so a job asked for one does not
rediscover it.

## Where a report goes

A job writes the report to `outbox/report.md` (or a named file beside it in
`outbox/`), as a document with YAY front matter. The steward decides where it
is published and gives the maintainer its link. Not built yet: a place on the
journal for published reports, with a stable link.

## The reports

| Report | The question | How it was made |
| --- | --- | --- |
| Host disposition | Which hosts are healthy: claims, completions, failures, kills, per kind of worker, over one or more windows? | A deterministic script over the board and claim history. |
| Completions since a moment | What did the garden finish since a quota reset, a change or an incident? | Deterministic enumeration, then a themed narrative with an itemised appendix. |
| Priorities and status | Where does each standing priority stand, and what needs a maintainer's decision now? | A fresh investigation each time: pull request states, board health, recent incidents. |
| Open pull request survey | What state is every open bot-authored pull request in, across watched repositories? | By hand. Look for a tool before deriving it again. |
| Progress over a period | A longer retrospective over a stated period. | By hand. |
| Cost incident | Why did spend spike, for one incident? | By hand, per incident. |
| Library size | How large is the library getting? | Not made in this garden yet. |

## Adding one

When a report gets a reusable tool, or is written by hand often enough to
deserve a name, add a row here. A report with enough procedure to need its
own inputs and output shape gets its own skill, linked from the table.

## Not built yet

The deterministic reports (host disposition, completions) as `make*(powers)`
modules in `src/` reading the board and the journal, and a published home for
reports.

Adapted from the prior garden's `skills/liaison-reports`.
