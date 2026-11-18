---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Cutover runbook

The prior garden's repository has been moved aside and this garden goes into a
fresh repository under the old name. Design: `shed:designs/lineage.md`.
`./cutover.sh` prints what each remaining step would do; `--apply` does one.

## Done, by the maintainer, outside the script

- [x] `kriscendobot/garden` renamed to **`kriscendobot/gardens-of-yore`**.
- [x] A fresh `kriscendobot/garden` created: public, empty.

The script never renames or creates a repository; `rename` and `create` are
refused as already done, and `state` checks that both are as expected.

## The hazard, now live

Hosts of the prior garden fetch from `kriscendobot/garden`. That name is now
the **fresh repository**: the redirect to the old one ended when the new one
was created. The prior garden is halted (the maintainer's word). A prior host
that was missed, or that a timer or a reboot restarts, will find none of the
branches it expects, fail every fetch, and may try to push its old branches
into the new repository. So step 2 below still stands, and matters more now.

Anyone who revives a prior host must point it at `gardens-of-yore`: its
checkout's `origin` **and** `GARDEN_PRODUCTION_JOURNAL_REPO`, because the prior
garden's `common.sh` refuses any origin but the name it has fixed.

## Remaining

1. **Preflight.** `./cutover.sh preflight`: the checkout is on `shed`, clean,
   and has every branch. Run the shed's tests and lint first.

2. **Verify every prior host is halted**, and will not start by itself (no
   restart policy, no timer or login item that runs `./garden`).

   | Host | Verify |
   | --- | --- |
   | `endolin-garden-ece02cb4` (the leader) | the prior garden's container is gone. **The new garden's box on this machine has the same name**, because a host's name is derived from the machine and the checkout's path, and both are the same. A running `endolin-garden-ece02cb4` on a `garden-base` image is the new one; verify the image, not the name |
   | `oros-studio-garden-ce242c49` (a Mac) | the same; needs someone at the Mac, or Docker Desktop quit |
   | `endolin-garden2-5bcdff64` | archived in `journal2:hosts/` but has a deploy record: confirm it is off |
   | this machine's `/home/kris/prior-garden` | a checkout, not a host: its `origin` still says `kriscendobot/garden`, which is now the new repository. Do not fetch or push from it, or repoint it at `gardens-of-yore` |
   | the tower's view (`tower/garden/`) | its `scripts/garden/attach.sh` fetches `kriscendobot/garden` expecting `main2` and `journal2`: a tower-side change, to `TOWER_GARDEN_URL` |

   Then name each host in `HOSTS_CONFIRMED` as `<host>=halted`; the push
   refuses without all three.

3. **State.** `./cutover.sh --apply state` (read-only, anonymous):
   `gardens-of-yore` holds `main2` and `journal2`; `garden` is empty.

4. **Archive.** `./cutover.sh --apply archive`: `gardens-of-yore` becomes
   read-only on GitHub. Skipped if it already is. Its issues, pull requests,
   deploy keys, webhooks, Pages site, Actions secrets and repository-scoped
   tokens stayed with it and are not in the new repository.

5. **Access, before any host watches.** On `kriscendobot/garden` set who has
   write access, and branch protection at least on `clients`, `shed` and
   `main`. **Push access to `clients` is the control on every client host**
   (`shed:designs/clients.md`).

6. **The bot's login**, on the host that will publish: `./garden login`
   (`shed:designs/keys.md`). Decide whether the first push is made by the bot
   from inside the box or by a maintainer from the host; `cutover.sh push`
   uses whatever git credential the shell that runs it has.

7. **Push.** `HOSTS_CONFIRMED='…' ./cutover.sh --apply push`: adds `origin`,
   pushes `main`, `shed`, `board`, `archive`, `journal`, `library`, `clients`,
   `gate` and every `plot/*`, and makes `main` the default branch.

8. **Verify.** `./cutover.sh --apply verify`. Then carry
   `journal2:maintainers/allowlist` from `gardens-of-yore` into
   `journal:config/maintainers.yay`, and name a leader in
   `journal:config/hosts.yay`.

**None of the remaining steps has been run.**

## Not covered

- The transcripts repository (`kriscendobot/garden-transcripts`) is separate.
- Open pull requests and issues stay with `gardens-of-yore`. Which to re-file
  is the maintainers' to decide.
- The old repository's Pages site, and removing the prior garden's containers
  and state from its hosts.
