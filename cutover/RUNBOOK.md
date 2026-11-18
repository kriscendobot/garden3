---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Cutover runbook

Move the prior garden's repository aside whole, and publish this garden in a
fresh repository under the old name. Design: `shed:designs/lineage.md`.
`./cutover.sh` prints what each step would do; `--apply` does one step.
**None of this has been run.**

## The hazard, first

Hosts of the prior garden fetch from `kriscendobot/garden`. After the rename
(step 4) GitHub redirects that URL to the renamed repository, **only until a
new repository takes the name** (step 6). From then on any prior host that was
not stopped or repointed is talking to the fresh repository: it will find none
of the branches it expects, fail every fetch, and may try to push its old
branches into the new repository. The fresh repository also carries a
`clients` branch, which exists to control hosts that watch it. A prior host
does not know that branch; the danger is confusion and stray pushes, not
obedience.

**So: every prior host is stopped, or repointed and seen working against the
renamed repository, before step 6. Until step 6, everything here is undone by
renaming the repository back.**

## Settings

| Setting | Default | |
| --- | --- | --- |
| `OLD` | `kriscendobot/garden` | the repository as it is now |
| `ASIDE` | `garden-prior` | the name it is moved aside to: **a proposal; choose** |
| `QUIET_MINUTES` | 30 | how long `journal2` must have been still |

## Steps

1. **Preflight.** `./cutover.sh preflight`. The new garden's checkout is on
   `shed`, clean, has every branch, and has no `origin` yet. Run the shed's
   tests and lint first.

2. **Every prior host: stop it, or repoint it.** For each, one of:
   - **stop**: on the host, drain (`scripts/jobs/drain-fleet.sh on`), wait for
     its jobs, then `./garden` stop or `docker stop` its container; or
   - **repoint** (only if the prior garden is to keep running beside the new
     one): after step 4, set the checkout's `origin` to the renamed
     repository **and** set `GARDEN_PRODUCTION_JOURNAL_REPO` to its new
     `owner/name` in the host's environment, because the prior garden's
     `common.sh` refuses any origin but the name it has fixed.

   | Host | Where it finds the repository | Check |
   | --- | --- | --- |
   | `endolin-garden-ece02cb4` (the leader) | its checkout's `origin`; `GARDEN_PRODUCTION_JOURNAL_REPO` | container stopped, or pushing to the renamed repository |
   | `oros-studio-garden-ce242c49` (a Mac; lent) | the same | the same; needs someone at the Mac |
   | `endolin-garden2-5bcdff64` | archived in `journal2:hosts/`, but has a deploy record | confirm it is really off |
   | this machine's `/home/kris/prior-garden` | `origin` = `git@github.com:kriscendobot/garden.git` | repoint `origin`, or leave it and never fetch |
   | the tower's view (`tower/garden/`) | `https://github.com/kriscendobot/garden.git` in its `scripts/garden/attach.sh`, expecting `main2`, `journal2` | a tower-side change: point `TOWER_GARDEN_URL` at the renamed repository |

   Hosts that were never recorded cannot be listed here. Step 3 is the check
   that catches them.

3. **Quiet.** `./cutover.sh --apply quiet` (read-only). It fails if anything
   has written to `journal2` in the last `QUIET_MINUTES`. The prior garden
   writes there about once a minute while any host runs, so stillness is the
   evidence that all are stopped. If it fails, find the host.

4. **Rename.** `HOSTS_CONFIRMED='endolin-garden-ece02cb4=stopped
   oros-studio-garden-ce242c49=stopped endolin-garden2-5bcdff64=stopped'
   ./cutover.sh --apply rename`. The script refuses unless every known host is
   named as `stopped` or `repointed`.

   What goes with the renamed repository, and is **not** in the new one:
   issues and pull requests and their numbers; deploy keys; webhooks; the
   Pages site and settings; Actions settings and secrets; branch protection;
   and any fine-grained token scoped to it (scoped by repository id: it
   follows the rename and grants nothing on the new repository).

5. **If any host was repointed**, start it now and see it work against the
   renamed repository. Then `quiet` again, expecting only those hosts.

6. **Create.** `HOSTS_CONFIRMED='...' ./cutover.sh --apply create`. The point
   of no easy return: the old name now means the fresh repository. Old links
   in issues and commit messages resolve here from now on. The older alias
   `kriskowal/garden` (from the 2026-07-28 transfer) resolved through this
   name too; where it leads afterwards was not established: test it.

7. **Access, before any host watches.** On the fresh repository set who has
   write access, and branch protection at least on `clients`, `shed` and
   `main`. **Push access to `clients` is the control on every client host**
   (`shed:designs/clients.md`), so settle it before a client host starts
   watching. New deploy keys and the bot's token for the new repository are
   created here; the old ones stayed with the old repository.

8. **Push.** `./cutover.sh --apply push`: adds `origin`, pushes `main`,
   `shed`, `board`, `archive`, `journal`, `library`, `clients`, `gate` and
   every `plot/*`, and makes `main` the default branch.

9. **Verify.** `./cutover.sh --apply verify`. Then carry
   `journal2:maintainers/allowlist` from the renamed repository into
   `journal:config/maintainers.yay` (a maintainer's edit), and set up the
   first host with the wizard on `main`.

## Not covered

- The transcripts repository (`kriscendobot/garden-transcripts`) is separate
  and is not renamed.
- Open pull requests and issues stay with the renamed repository. Which to
  re-file is the maintainers' to decide.
- Retiring the prior garden's hosts for good, and the Pages site.
