---
author: "designer"
created: "2026-11-17"
updated: "2026-11-19"
---

# Lineage and the cutover

The garden goes into a **fresh repository**, `kriscendobot/garden3`. The
prior garden keeps its own repository, and its name, untouched. This
supersedes two earlier plans: keeping one repository and archiving its
branches, and moving the prior garden aside so the fresh repository could
take the name `kriscendobot/garden`. The procedure written for the second
plan is on the `gate` branch (`cutover/RUNBOOK.md`, `cutover/cutover.sh`)
and has not been brought up to date ([Status](#status)).

## The decision

- The prior garden stays at **`kriscendobot/garden`**. It was renamed to
  `kriscendobot/gardens-of-yore` and then given its name back, so the
  repository is the same one (id `1237049701`), with its branches, issues,
  pull requests and everything attached to it. GitHub still redirects
  `gardens-of-yore` to it, for as long as nothing takes that name.
- The fresh repository is **`kriscendobot/garden3`**, created 2026-11-18,
  public. It shares no git history with the prior one. Its default branch is
  `main`: a README and the setup wizard. The shed's `origin` and
  `config/garden.yay`'s `github.repo` name it.
- The prior garden is recorded as the immediate ancestor by reference
  ([ANCESTRY.md](../ANCESTRY.md)), and history is borrowed only as needed
  ([upstream.md](upstream.md)).

So branch names here need not avoid the old ones, and the new repository
needs no namespace for them. (`refs/archive/` remains, for this repository's
own truncated history.)

## The hazard, retired

The plan to reuse the name carried a hazard: after a rename GitHub redirects
the old URL only until a new repository takes the old name, so a prior host
left running would have found itself fetching from, and pushing its old
branches into, the fresh repository. Reviving a prior host would also have
meant repointing it, because its `scripts/jobs/common.sh` fixes
`GARDEN_PRODUCTION_JOURNAL_REPO` to `kriscendobot/garden` and refuses any
other GitHub repository as foreign.

With the name kept, none of that applies. A prior host's `origin` and
`common.sh` are already right, and nothing of the new garden is at the URLs
they know. What remains is the converse: **anything written for the
name-reuse plan that names `kriscendobot/garden` as the new repository now
points at the prior garden**. The cutover script on `gate` is one
([Status](#status)).

## What knows which URL

| What | Points at |
| --- | --- |
| `endolin-garden-ece02cb4`, the prior leader | `kriscendobot/garden`, correctly. The new garden's first box, on the same machine and path, has this same name: tell them apart by image (`garden-base`), not by name |
| `oros-studio-garden-ce242c49` | `kriscendobot/garden`, on the Mac. **Still running**: it pushed `journal2` on 2026-11-19 |
| `endolin-garden2-5bcdff64` | archived in `hosts/`, still has a deploy record: check it is really off |
| the checkout at `/home/kris/prior-garden` on this machine | `kriscendobot/garden`, correctly |
| the tower's read-only view of the garden | `scripts/garden/attach.sh`, `https://github.com/kriscendobot/garden.git`, expecting `main2` and `journal2`: correct as it is |
| the transcripts repository | separate (`kriscendobot/garden-transcripts`); its captures come from the prior hosts |
| the shed, and every host of this garden | `kriscendobot/garden3` |
| `cutover/cutover.sh` on `gate` | `NEW` defaults to `kriscendobot/garden` and `YORE` to `kriscendobot/gardens-of-yore`, which now redirects to the same repository: wrong for both |

## On the new repository, before any host watches it

Who may push is now the control on every client host
([clients.md](clients.md)): write access and branch protection (at least on
`clients`, `shed` and `main`) are set on `kriscendobot/garden3` before a
client host starts watching.

## Status

Done, by the maintainer, outside the script: the rename and its reversal,
the creation of `kriscendobot/garden3`, adding it as `origin`, the first
push, and `main` as its default branch. `garden3` holds `main`, `shed`,
`board`, `archive`, `journal`, `library`, `clients`, `gate`, a `host/` branch
and the `plot/` branches.

Not done: push access and branch protection on `garden3` (not verified
here); archiving the prior repository, which is not archived and is still
written to by `oros-studio-garden-ce242c49`.

`cutover.sh` and `RUNBOOK.md` on `gate` still describe the name-reuse plan.
**Do not run `cutover.sh` with its defaults**: its `archive` step would
archive the live prior repository through the `gardens-of-yore` redirect,
and its `push` step would push the new branches into
`kriscendobot/garden`. They are to be corrected, or retired, on `gate`.

## Open questions

1. **Archiving the prior garden.** Is it still to be archived, and when? A
   prior host is running, so the earlier note that it was already halted no
   longer holds: halt `oros-studio-garden-ce242c49` (and confirm
   `endolin-garden2-5bcdff64` is off) first.
2. **Open work.** Open pull requests and issues stay with the prior
   repository. Which are re-filed against `garden3`?
3. **The cutover script.** Correct it for `garden3`, or retire it now that
   its steps were done by hand?
