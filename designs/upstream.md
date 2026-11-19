---
author: "designer"
created: "2026-11-17"
updated: "2026-11-19"
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
   under `vendor/`, with its licence), or *leave*.
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

## Borrowing history

This repository shares no git history with its ancestors. By default nothing
but content crosses, and provenance is the port log's `source`, `source_path`
and `commit`: enough to find the original and everything that led to it, in
`kriscendobot/garden`, the prior garden's repository, which kept its name.

Real commits are carried only when the history itself is the thing wanted:
a file whose authorship or licence trail must stay attached, or a long
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
No tooling beyond the test. Nothing has been adopted by the procedure yet.

## Open questions

1. **What to adopt next.** The garden's own watcher is built. In this pass's
   judgement: the watcher on managed repositories' pull requests, then the
   steward publishing branches and pull requests, then plot trials and
   scoring, then the pull-request roles (shepherd, fixer, weaver).
2. **Private provenance.** A port-log entry naming a tower path and commit
   discloses that the path exists. The entries here name only mechanisms'
   files. Say if tower sources should be recorded less precisely.
3. **Nothing flows back.** The prior garden's repository,
   `kriscendobot/garden`, is a source only. It is not archived, and a prior
   host still pushes to it ([lineage.md](lineage.md)).
