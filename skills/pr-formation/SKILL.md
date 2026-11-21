---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-formation"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request formation

Purpose: write a pull request's title and description so a maintainer can
decide whether the change is the right shape without first reading the diff.

Use it when a job opens a pull request, when a review asks for the
description to be redrafted, and when the scope has grown past what the
description says (reset it to the template; do not append).

## Who does what

You write the **title and body**, in `outbox/pr-title.txt` and
`outbox/pr-body.md`, and say in your report that they are there. The steward
decides **which pull request** they belong to: it finds the job's existing
pull request by a marker carrying the job id, and opens one only if there is
none, so a job that runs twice does not open two (it happened:
endojs/endo-but-for-bots#865 and #871). That marker is an HTML comment the
steward adds, the one sanctioned exception to "no methodology" below. You do
not write it.

## The template, section for section

Fill the base branch's `.github/PULL_REQUEST_TEMPLATE.md`, read from your
checkout at the base commit:

```sh
git -C <checkout> show <base commit>:.github/PULL_REQUEST_TEMPLATE.md > outbox/pr-body.md
```

- Keep every heading, verbatim and in order. Add none in their place.
- A section that does not apply gets one sentence saying so ("No
  documentation changes."); its heading stays.
- Delete the template's guidance (the `> ...` prompts, `#XXXX` placeholders)
  before you finish.
- **Do not wrap paragraphs.** GitHub renders a single newline in a body as a
  break. One paragraph is one line; lists and headings keep their own lines.
  This is the exception to wrapping prose.

A description that replaced the template's sections with its own ("Goal",
"What was noisy") was the failure that made this a rule
(endojs/endo-but-for-bots#1281).

## What goes inside

In order:

1. **What it does**, in one or two sentences of user-facing or API-facing
   prose. The first sentence is the title's source.
2. **Why.** Cite the issue, design or directive. Do not paraphrase it.
3. **What to attend to:** the riskiest invariant, where an incompatibility
   lurks, the assumption the change makes. One short paragraph.
4. **What is out of scope**, when the diff stops short of something the
   reviewer would otherwise ask about.

Cut to what the reviewer cannot get from the diff
([gricean-maxims](../gricean-maxims/SKILL.md)):

- **No checklists** (`- [ ] item`). A reviewer tries to verify each one. State
  the verification once, in prose.
- **No per-file or per-package tour.** Say the behavior in a sentence; name
  only the invariant that needs attention.
- **No file callouts** ("I changed `packages/foo/src/bar.js`..."). Name a path
  only when it is the fact itself ("the entry point moved from `foo/index.js`
  to `foo/lib/index.js`").
- **No test tallies** ("553 passed under Node 22 and 26"). Say what the tests
  pin, in a clause.
- **Past about 300 words, cut.** One or two sentences per section is normal.

## No methodology

The title and body describe the change, never how the garden made it: no
role, skill, job, slot, board, steward, checklist or template workflow, and
above all no `roles/...` or `skills/...` path, which shows every reader of a
public pull request the garden's internals. Cite the substance ("reverting
the fix makes the new assertions fail"), not the discipline that produced it.

## Title

The project's conventional-commit prefix (`feat(<scope>):`, `fix(<scope>):`,
`design(<scope>):`), then the same one-sentence summary. No pull request
numbers, file paths, history or methodology.

- Bad: `feat(cli): assorted CLI additions, workers, zip checkin/out, read-text, write-text (re-opened from #38 under the bot)`
- Better: `feat(cli): workers, zip in/out, and text-file IO verbs`

## Phase and evidence ledger

When the change implements a design with numbered phases, stop gates or an
acceptance section, add a `## Phase and evidence ledger` (a heading the
template does not name, which is allowed):

```markdown
<!-- garden-phase-evidence-ledger:v1 -->
## Phase and evidence ledger

Design: `designs/example.md`
Disposition: deliverable
Phase 1: satisfied | production substrate landed at <commit or PR>
Phase 2: satisfied | this change wires the landed substrate
Acceptance: satisfied | the observations the design requires, at <where>
<!-- /garden-phase-evidence-ledger -->
```

List every phase, superseded and not-applicable ones too, each with its
evidence or reason. A `deliverable` uses only `satisfied`, `superseded` or
`not-applicable`; an open prerequisite means it is not a deliverable. Do not
offer lint and unit tests as acceptance when the design calls them
prerequisites. A slice that leaves later phases to a named successor is
`Disposition: orchestrated-slice` with `Successor: <job>`, and stays a draft.
When the design is in another repository, link it.

## Branches

The head branch follows the project's convention (`feat/<topic>`,
`fix/<issue>-<topic>`). A fork-side pull request's base is a frozen snapshot
`<base>-<sha7>`, never the moving trunk
([frozen-base-branch](../frozen-base-branch/SKILL.md)).

## Example

```markdown
## What

The `endo` CLI gains a `workers` verb that prints the worker process tree, `zip checkin` and `zip checkout` verbs that move directory bundles in and out of the daemon's store, and `read-text` / `write-text` verbs for one text file by name.

## Why

Closes endojs/endo-but-for-bots#38.

## What to attend to

The zip verbs assume the daemon's store accepts directory bundles by name; if the verb names should differ, the discussion on #160 is the place to decide.

## Out of scope

The chat-side surface for these verbs, tracked in #203.
```

The directive (kriskowal, [endojs/endo-but-for-bots#128](https://github.com/endojs/endo-but-for-bots/pull/128#issuecomment-4437027474)):
"Please redraft the PR description and title to reflect the proposed
changes. Use the github template for pull requests. Do not include
checklists or draw attention to specific files."

## Not built yet

- **The steward's half:** opening or finding the pull request by its job
  marker, and setting its title and body from `outbox/` (designs/pull-requests.md,
  beside `src/steward.js`).
- **A template check:** a `make*(powers)` module that refuses a body which
  drops or reorders a template heading or keeps its guidance, and checks a
  phase ledger against its design, run by the steward before it publishes.

Adapted from the prior garden's `skills/pr-formation`, with the pull request
template part of `skills/pre-pr-checklist` folded in.
