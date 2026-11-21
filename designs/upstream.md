---
author: "designer"
created: "2026-11-17"
updated: "2026-11-21"
---

# Adopting from upstream

The garden starts with a few roles and skills and takes more only when it
needs them. "Upstream" is the prior garden and the tower. The record is
`upstream/port-log.yay`; the lineage is [ANCESTRY.md](../ANCESTRY.md).

## What is here to begin with

Roles: the common brief; `steward`, `accountant` and `planner` (the shed's); `builder`,
`designer`, `reviewer` and the plot brief (genome). Skills: `job-board`,
`quiescence`, `upstream-adoption`, `successor-image` (the shed's);
`project-checkout`, `wrap-it-up` (genome). On the gate: `boatman`, `keys`,
`client-orders`, `cutover`.

The prior garden has 39 roles and 107 skills; the tower 8 and 24. None was
copied. The ones here were written for this garden's mechanisms.

## The procedure

1. **A need, stated as a job.** Adoption is work on the board like any other,
   posted by a maintainer or proposed by a job that lacked something.
2. **Read the source at a commit.** Note the repository, the path and the
   full commit id.
3. **Decide its disposition**: *synthesize* (write the garden's own, informed
   by one or both sources; the usual case), *port* (carry the mechanism,
   rewritten for this garden's services), *vendor* (take a file unchanged,
   under `vendor/`, with its license), or *leave*.
4. **Mind the two differences that matter.** The tower is private: carry
   mechanism, never its content, and if unsure leave it out and say so. And
   the garden's idiom is services and YAY, not scripts and front matter
   parsed by `awk`: a ported script becomes a method.
5. **If it needs software, it comes with a capability**
   ([capabilities.md](capabilities.md)); the skill names it and jobs
   `require` it.
6. **Decide where it lives**: the shed, or the genome (then it also goes into
   `plots/genome-paths` and each plot gets it by a landing).
7. **Record it** in `upstream/port-log.yay`: the garden path, the source
   repository, path and commit, the disposition, and a note.
   `test/bootstrap.test.js` checks every entry's path exists and its commit is
   a full id.
8. **A pull request to the shed**, reviewed by a maintainer.

## A job that lacks a skill

The procedure above is the shed's. A plot can also adopt, one skill at a
time, from inside a job ([roles/COMMON.md](../roles/COMMON.md) § When you lack
a skill):

- **What it reads.** Every slot's home holds, under `reference/`, the other
  plots' genomes and the prior garden's `roles/` and `skills/` at a pinned
  commit, with `reference/reference.yay` naming the commits. The prior garden
  is held by the steward in `.garden-state/upstream/garden.git`, fetched by
  `garden plots fetchUpstream` at exactly `config/garden.yay`'s
  `upstream.garden.commit` (depth one); moving the pin is a reviewed change.
  The tower is never there.
- **Where it writes.** `skills/adopted/<name>/`, a genome prefix, so the
  skill lands on the job's own plot through the harvest like any lesson. A
  role it needed is written as a skill there: which roles exist is the shed's
  (dispatch reads them).
- **Provenance.** A job cannot write `upstream/port-log.yay` (it is the
  shed's), so the adopted skill's own front matter carries `adopted_from`:
  `source` (`garden` or `plot/<name>`), `path`, `commit`. When the shed
  takes such a skill (step 6, by a pull request), it gets a port-log entry
  then.
- **Order.** The other plots first, then the prior garden. Adapt to the
  garden's mechanisms; one skill, for the job in hand.

## Everything, on the plots

On 2026-11-21 a maintainer asked for everything to be brought over and the
evolution of plots to sort out what is not needed. The record is
`upstream/inventory.yay`: all 146 of the prior garden's roles and skills
at the pinned commit, each with a certainty (how sure we are it is useful)
and a disposition.

- **Ported (105)** to the plots: each item on a number of the twenty plots
  in proportion to its certainty, all of them at 0.9 and above, at least one.
  A large item is in full on half its plots and abbreviated (about a fifth)
  on the rest, so the plots also try how much of it is worth reading. Each
  file's front matter says `adopted_from`.
- **Merged (24)** into another item, which names them in its last line, or
  into the shed's own (the common brief, the planner, the watcher), which
  is still to do.
- **Already here (3)**, **superseded (6)** by the garden's own machinery.
- **Left out (8)**: four hold private identifiers or secrets (an AWS account,
  Cognito ids, a session token, a credential handoff), four describe only a
  private product.

These are prose. Where an item wants a mechanism a slot cannot have (a
fetch, a probe, a watcher, a steward action), the port says so under
"Not built yet"; 37 do. Those services are shed work, by pull request, the
pull-request seam first ([pull-requests.md](pull-requests.md)).

What sorts them is not built: plot trials and scoring (Open questions). Until
then a job's plot is a hash of its id, and every plot is used alike.

## The library

The prior garden's library (`library/` on its `journal2` branch) was
copied whole onto this garden's `library` branch, an exception to
adopting on demand that a maintainer asked for: it is reference material,
not roles or skills, and it is useful only whole. `provenance.yay` there
names the source commit; its README says how to read it.

- **How a job reads it.** `slots.prepare` exports the root's `library`
  branch into the home under `reference/library/` and names the commit in
  `reference/reference.yay`. The procedure is `skills/library-lookup`; a
  question worth handing off is a `librarian` job. Both are adapted from the
  prior garden's.
- **How it changes.** A job proposes edits to the index and concept pages in
  `outbox/library.yay` (whole new file bodies). Nothing lands them yet: a
  maintainer does, through a clone of the branch. A landing for these
  proposals, and the prior garden's `scholar`, which ingests new sources,
  are not adopted.
- **Keeping up.** The prior garden's library keeps growing. Taking more is a
  copy of the same path at a later commit, with `provenance.yay` advanced;
  `git diff <recorded>..<new> -- library` in its repository shows what
  changed.

## Borrowing history

This repository shares no git history with its ancestors. By default nothing
but content crosses, and provenance is the port log's `source`, `source_path`
and `commit`: enough to find the original and everything that led to it, in
`kriscendobot/garden`, the prior garden's repository, which kept its name.

Real commits are carried only when the history itself is the thing wanted:
a file whose authorship or license trail must stay attached, or a long
evolution a maintainer wants `git log` to show here. Then it is done
deliberately, for those paths alone (a filtered export of the source's
history for the paths, merged once with `--allow-unrelated-histories`), on
the shed, in its own pull request, and the port log entry says
`history: carried`. Never on a high-churn shard, which is truncated anyway.

## Later changes upstream

To see what changed in a source since it was adopted:
`git log <recorded commit>..<branch> -- <source path>` in the ancestor's
repository; apply what is wanted by the same procedure and advance the
recorded commit. This is the tower's `DIVERGENCE.md` § 5, kept.

## Ported from

The tower's `DIVERGENCE.md` (the porting procedure and the port log) and its
starter kit's library-adoption skill, in form.

## Status

The procedure and the port log exist, and the log lists what this pass took.
No tooling beyond the test. Adopted by the procedure: `skills/library-lookup`
and `roles/librarian`, with the library they read (§ The library).

## Open questions

1. **What to adopt next.** The garden's own watcher is built. In this pass's
   judgment: the watcher on managed repositories' pull requests, then the
   steward publishing branches and pull requests, then plot trials and
   scoring, then the pull-request roles (shepherd, fixer, weaver).
2. **Private provenance.** A port-log entry naming a tower path and commit
   discloses that the path exists. The entries here name only mechanisms'
   files. Say if tower sources should be recorded less precisely.
3. **Nothing flows back.** The prior garden's repository,
   `kriscendobot/garden`, is a source only. It is not archived, and a prior
   host still pushes to it ([lineage.md](lineage.md)).
