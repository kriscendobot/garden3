---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Mail: the boatman

Carrying mail between the garden and the adjacent tower. Code: `src/mail.js`.
The role and skill are on the `gate` branch.

## What is actually in the references

The maintainer asked to keep "the system for carrying mail to and from the
adjacent tower (the boatman)". Two things were found, and they are different:

- **The prior garden's boatman** (`roles/boatman/AGENT.md`, `scripts/ferry.sh`,
  `designs/dedicated-ferry-dispatch.md`) does not carry mail. It carries an
  approved **pull request** from the bot's fork to the upstream repository,
  under the maintainer's identity. It runs on the host, outside the
  container, as the maintainer, from its own board (`jobs/ferry/`), and is
  locked out of the ordinary board in three places.
- **Tower mail has no mechanism.** The tower's `designs/garden-protocol.md`
  says there is no channel to the garden: the liaison drafts and the
  maintainer carries by hand. On disk the tower has `mail/garden/` (pending,
  `YYYY-MM-DD-GARDEN-<slug>.md`) and `mail/garden/archive/`
  (`...-carried-GARDEN-...`); the garden has `drop/archive/`
  (`YYYYMMDD-tower-<slug>.md`). Files in the two archives are byte-identical
  under different names, so the carry has been a renaming copy between sibling
  directories. No script on either side does it; every carry found goes from
  the tower to the garden. The only wire format ever designed, the tower's
  `designs/garden-gate.md`, was abandoned unbuilt.

So this design takes the boatman's *position* (out of the box, the
maintainer's account, a boundary crossed only with the maintainer's say) and
gives it the mail to carry, keeping the names found on disk.

## The carry

```
tower -> garden   <tower>/mail/garden/YYYY-MM-DD-GARDEN-<slug>.md
                    -> <garden>/.garden-state/mail/inbox/YYYYMMDD-tower-<slug>.md
                    original -> <tower>/mail/garden/archive/YYYY-MM-DD-carried-GARDEN-<slug>.md
garden -> tower   <garden>/.garden-state/mail/outbox/YYYY-MM-DD-TOWER-<slug>.md
                    -> <tower>/drop/from-garden/YYYYMMDD-garden-<slug>.md
                    original -> the outbox's archive/
```

- `pending` lists what waits on each bank with its sha256 and size.
- **Nothing crosses unapproved.** `carryToGarden({approve: [sha256...]})`
  carries only the files whose hash the maintainer has approved. An approval
  is for exact bytes: a file edited after it was listed no longer matches and
  is not carried. This keeps the tower's valve (the maintainer sees what
  leaves before it goes) while removing the copying by hand.
- The copy is checked by hash on arrival; a receipt records direction, slug,
  hash, size and time, and **no content**.
- Mail lives under the state directory (`.garden-state/mail/`), which is 0700
  and the steward's: a job's account cannot read it, and git ignores it. The tower is private and the
  garden is public: arriving mail is not published by arriving. It becomes
  work when the steward posts a job for it, which is the point at which its
  text enters a public branch, and the maintainer approved that text for the
  garden when approving the carry.
- Mail carries no authority of its own; it is the maintainer's by being
  carried.

## Ported from

The names and directions on disk in both references; the boatman's position
and lockout from the prior garden; `garden-protocol.md`'s valve; the idea of
receipts from the abandoned `garden-gate.md`.

## What changed

There was no script; now there is one. The garden's inbox is `mail/inbox/`
rather than `drop/`, which was the maintainer's general drop directory.

## Status

Implemented and tested with two temporary directories: listing, approval by
hash, refusal after an edit, archive on both banks, receipts without content
(`test/small.test.js`). Not run against the real tower directory, which this
pass did not write to. Design only: the steward posting a job for arrived
mail; a receipt ledger on the journal.

## Open questions

1. **Is this what was meant?** If "the boatman" meant the pull-request ferry,
   that is not ported here; it is adoptable on its own
   (`scripts/ferry.sh`, about 330 lines).
2. **Writing into the tower's directory.** The carry moves the tower's
   original into its archive and writes into `drop/from-garden/`. The tower's
   rule is that the garden extends privileges to the tower and the tower none
   back; a boatman run by the maintainer is the maintainer, but confirm that a
   garden-side tool may write there.
3. **Front matter on mail.** Found mail has none. Outgoing garden mail could
   carry YAY front matter (to, from, subject) at no cost to the tower.
4. **`drop/to-garden/` and `drop/from-garden/`** exist empty in the tower and
   are referenced by nothing; the design uses the second for arrivals.
