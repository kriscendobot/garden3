---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The journal, slowly

Code: `src/journal.js`.

## What made the prior journal fast

Measured on `journal2`: 142,839 commits; 57,861 in the last thirty days, about
1,900 a day. By commit subject, that month: the bulletin 9,558; budget
heartbeats 8,620; the review docket 7,211; claims 3,803; watchdog notices
3,694; completions 3,189; decision logs 2,748; posts 2,356; the gauntlet
2,353; cursors 1,828; fleet health 1,610. The first three are 44% and none is
work on a job. The tree held 89,038 files.

## Where each kind of record goes now

| Was on the journal | Now |
| --- | --- |
| the job board, claims, completions | `board`, `archive` |
| the bulletin and Pages board | dropped |
| heartbeats, health, worker counts | the host's own branch (design); a claim's lease is the liveness that matters |
| usage rows | the host's own branch |
| cursors, decision logs, watchdog notices | host-local state; nothing is committed for them |
| inboxes and messages to running jobs | gone (see board.md) |
| the library | `library` |
| reputation, the review docket, panel runs | not ported |
| entries | the journal, as digests |
| maintainers, arcs, pools, hosts | `journal:config/`, changed by a maintainer's act |

## The press

During the day anything worth remembering is a `note(who, text)`: an append to
a file in the host's state directory. No commit, no push. Once a day the
supervisor presses: each finished day's notes become one entry,
`entries/<YYYY>/<MM>/<date>-<host>.md`, with YAY front matter, and all the days
pressed go in **one commit**. A quiescence presses today as well. So the
journal takes about one commit per host per day, plus one per steering change.

At a quiescence, months older than six are folded into one file each and the
branch is truncated ([quiescence.md](quiescence.md)).

## Ported from

The prior garden's `entries/` and the tower's journal branch apart from jobs
and library.

## Status

Implemented and tested: notes are not commits; two days in one commit; today
waits; a quiescence takes everything (`test/small.test.js`). Design only:
which events the services note. Today dispatch notes any job that did not
simply finish.

## Open questions

1. **How slow.** One commit a day per host is a guess at "more slowly". Weekly,
   at the quiescence only, would be slower still.
2. **What is worth a note.** Without the per-role entries the prior garden
   wrote, less is recorded. The archive has every job's record and report.
3. **Notes are lost if a host dies before the press.** They are a day's
   digest, not a ledger; anything that must survive belongs on the board or
   the archive.
