---
author: "designer"
created: "2026-11-17"
updated: "2026-11-23"
---

# The watcher and the steward: steering from GitHub

The garden's purpose is to be operated through GitHub. This is the watcher
on the garden's **own** repositories, and on the pull requests of the
repositories it watches. Code: `src/github.js`, `src/watcher.js`,
`src/steward.js`.

## Which watcher this is

The prior garden has several. `issue-inbox-watcher.sh` is the one described in
its own header as turning "the garden's OWN GitHub repo ISSUES into a
maintainer-interaction inbox", so that a maintainer can "drive the garden by
filing or commenting on an issue". That is the one ported first. `comment-watcher.sh` (comments and reviews on
the pull requests of watched repositories, 2,615 lines) is now ported in
part ([What is watched](#what-is-watched)). Not here yet:
`mention-watcher.sh` (mentions GitHub-wide), `triager.sh` (commits),
`ci-watcher.sh`, `receipt-watcher.sh`.

## How the prior one works

Read: `issue-inbox-watcher.sh`, `handlers/issue-source-gh.sh`, and the headers
of `handlers/comment-reactji-gh.sh`, `comment-reply-gh.sh`, `mention-trust-gh.sh`.

- **Polls**, by `gh api`: `repos/<repo>/issues?state=all&since=…` (pull
  requests filtered out) and `repos/<repo>/issues/comments?since=…`, oldest
  first, from a cursor floored at 24 hours back.
- **Authenticates** as the bot through the fleet's `gh` wrapper, which resolves
  the token on each call.
- **Decides who is a maintainer** from `journal2:maintainers/allowlist` and
  nothing else: stricter than the other watchers, which fall back to
  organization membership. The check is plain code, runs before any text is
  read, and no model is involved anywhere in the watcher. A dropped stranger
  is surfaced once to the maintainer inbox, with structured fields only.
- **Remembers** with one cursor (`last_seen`) on the journal, read and written
  by `cursor-get.sh` and `cursor-set.sh`; posts are idempotent by the issue's
  "spine" (the job's basename); it verifies that a post landed before
  advancing, and holds the cursor below a failed item.
- **An event becomes**: for a new issue, a job keyed to the issue; for a
  comment whose first line starts exactly `@<bot> `, a message to the inbox of
  whichever job is working that issue. A closed issue is terminal; a comment
  after the close is re-engagement.
- **Acknowledges** with a 👀 reaction; replies are comments written by the
  job itself, with a provenance footer the `gh` wrapper adds.
- **Several hosts**: it is a leader-only unit. Nothing else stops two.

## What is watched

`config/garden.yay`'s `github.watch` lists the repositories, each polled at
most once in its `poll_seconds` (the default, `github.poll_seconds`, is 90;
the forks are at 300), each with its own cursor and its own board commit.

- **With `issues: true`** (`kriscendobot/garden3`, the home, and
  `kriscendobot/garden`, the prior garden's, kept online until the house is
  consolidated): a maintainer opening an issue asks for work, as below.
- **Every watch**: a maintainer's comment or review addressed to the bot
  (`@kriscendobot ` at the start) is heard, from three surfaces: issue and
  pull-request conversation comments, inline review comments, and the bodies
  of submitted reviews. Reviews have no `since`, so they are read from the
  pull requests updated since the cursor. A fork's Issues are off by default
  and its comment feed then answers 404 or 410 for good: that is read as a
  feed that is not there, and each recently updated pull request's own
  comments are read instead (the prior garden learned this the hard way).
- **Jobs are named by repository**: `issue-12` is the home's; issue 12 of
  another is `<owner>-<name>-issue-12`. A report goes back to the repository
  that asked. A review cannot carry a reaction, so its 👀 goes on its pull
  request.

The list is the prior garden's `journal2:comment-repos/` (sixteen forks and
`endojs/endo-but-for-bots`) and the two garden repositories. Where the prior
armed a repository with `sender-gate: required`, this gate is already
stricter: maintainers only, no organization fallback.

**Cursors adopted.** The prior garden's cursors (`journal2:cursors/issues/`
and `cursors/comments/`) are recorded in `upstream/watch-cursors.yay`, with
where each came from, and were taken onto the board by `garden watcher adopt
upstream/watch-cursors.yay`, which never moves a later cursor back. The prior
took what came strictly after its `last_seen`, so each is adopted as the next
second. A repository armed without a cursor of its own starts from the prior
leader's last cursor commit (2026-11-18T03:18:31Z). `kriscendobot/garden`
keeps the board's own, later cursor: in the gap between its prior issue and
comment cursors there was nothing but the bot's own comments. `garden
watcher preview` says what the next poll of each would do, and does none of
it.

**Resuming.** `garden watcher resume <record>` takes the record's cursors
even where the board's are later, so the next poll hears again what came
after them; `garden watcher preview <record>` says first what that would do.
A job already on the board is not posted twice. Run on 2026-11-24 with
`upstream/watch-cursors.yay`: eight cursors went back, over 126 events, and
none of them asked for anything.

## The garden's version

**The gate** (`gate`) is one function and the only place the question is
asked. An event whose author is not in `journal:config/maintainers.yay` comes
out of it with its title and body **removed**, so nothing after it can read
them even by mistake. The list and nothing else; case-insensitive; no model.
The strangers' logins (not their words) are kept, the last fifty, and each is
noted once in the journal with the URL.

**What an event becomes** (`decide`, pure):

| A maintainer… | Becomes |
| --- | --- |
| opens an issue | a job `issue-<n>` for the steward, its body the issue's |
| comments `@<bot> <anything>` | a job `issue-<n>-c<comment id>` for the steward |
| comments `@<bot> release <job>` | the job goes back to `open/`, with whose go-ahead |
| comments `@<bot> abandon <job> [reason]` | that branch is back-tracked |
| comments `@<bot> throttle <arc> <number>`, `retire <arc>` | the slate changes ([budget.md](budget.md)) |
| comments `@<bot> status` | a reply with the board's counts |
| comments without addressing the bot | nothing: maintainers talking |

A job the watcher opens names the `maintainer` envelope as its arc
([budget.md](budget.md)): only a maintainer's words pass the gate, so what
they ask for draws on the maintainer's discretion. With no arc it would wait
on `unallocated`, which holds nothing unless a share is set for it.

The verbs are a closed list. A malformed one gets a reply saying what it
needs. An issue already closed when first seen asks nothing. The bot's own
comments are skipped.

**Exactly one host acts on an event.** The cursor (`cursor`, and the ids seen
at that same second) lives on the board, in `watch.yay`, and moves **in the
same commit** as the jobs the events produced. Two watchers that saw the same
comment both try to push; one lands; the other starts again from a board whose
cursor is already past it and does nothing. Only the host whose commit landed
goes on to acknowledge. (The supervisor also runs the watcher on the leader
only, so that one host polls.)

**The watcher is heard while jobs run.** A tick starts jobs and does not wait
on them (`dispatch.start`), so the next tick polls as usual. A run that ends
is settled between ticks, never during one: the tick and each settling take
turns (`makeSerial`), because both write through the same clones.

**State is bounded.** `board:watch.yay` holds, per repository, one cursor and
the few ids at it; fifty strangers' logins; and the list of issue-born jobs
still to report on, which shrinks as they end. A report whose job is neither
on the board nor in the archive's recent months is dropped. Nothing here
grows with time, so there is nothing to consolidate.

**The steward is the only writer to GitHub** (`src/steward.js`):

- `ack`: a 👀 on the issue or comment, after the board commit landed.
- `reply(issue, key, text)`: one comment per key. Each carries an invisible
  marker, `<!-- garden:<key> -->`, and the steward looks for it before
  writing, so a retry or a second host is recognized, not repeated. A footer
  names the host and the shed commit.
- `report`: for each issue-born job that has ended, its report (or its
  outcome) as a comment on its issue, with its level and cost. A job that
  handed off is followed to its planner; a failed one is announced once per
  failure and stays listed.

**Credentials.** `src/github.js` is the whole of the garden's view of GitHub,
over one injected `request`. The real transport gives the bot's token to
`curl` on standard input, read from its key file at each call; it is in no
argument list and no environment ([keys.md](keys.md)). Only the steward's side
constructs it; no job can.

## Ported from

`scripts/jobs/issue-inbox-watcher.sh` and `handlers/issue-source-gh.sh` (the
polling, the allowlist-only gate before any text, the address gate, the 👀,
closed issues, noting a stranger once); the idea of a provenance footer from
`comment-provenance.sh`.

## What changed

- The cursor is on the board and commits with the jobs, instead of a separate
  cursor write verified afterwards.
- A comment on an issue is a new job or a verb, not a message to a running
  job: there are no inboxes ([board.md](board.md)).
- Verbs for release, abandon and throttle, which the prior garden routed
  through the liaison.
- Replies come from the steward, not from the job, which holds no credential.
- No tick budget, cooldown latch or heartbeat machinery: one process, and a
  failed poll simply leaves the cursor where it was.

## Status

Implemented and tested against a fixture that answers in GitHub's documented
shapes (not recorded from a live repository): the gate; the address gate and
verbs; cursor and overlap; a maintainer's issue to a job with its
acknowledgment, in one commit with the cursor; a stranger ignored, noted
once, and their text in no branch; two hosts and one job; release, abandon,
throttle and status by comment; the report on a finished job, once; following
a hand-off; a failed job announced; a refused poll leaving the cursor; the
token on standard input only (`test/watcher.test.js`).

Also tested: many repositories, each its own cursor and commit; issues
heard only where asked; review comments and reviews; a fork with its
comment feed gone; jobs named by repository; adopting cursors; the preview.

**Run against GitHub:** the home repository's watch, from the box (cursor
on the board since 2026-11-19). On 2026-11-20, the adoption and a preview of
every watch: all nineteen repositories answered, the Issues-off forks
included; 118 events lay past the adopted cursors and none of them asked
for anything (the bot's own comments, and maintainers not addressing it).
The multi-repository watch runs once the supervisor restarts on this code.

## What stands between this and a first real run

1. ~~The fresh repository must exist and hold the branches~~: done, `kriscendobot/garden3` ([lineage.md](lineage.md)).
2. `journal:config/maintainers.yay` must list the maintainers (it is empty;
   the watcher is inert until it is not), `journal:config/hosts.yay` must name
   a leader, and `config/garden.yay` names the repository and the bot's login.
3. The bot's token, placed as the `github-bot` key, with rights to react and
   comment on issues in that repository.
4. A box that boots ([image.md](image.md)): the `rust` capability and node for
   arm64 still lack hashes.
5. One poll against the real API to confirm the shapes the fixture assumes,
   starting with reads only.

## Open questions

1. **Pull request comments on the garden's own repositories** are treated
   like comments on issues; reviews and review comments are now polled too.
2. **An acknowledgment can be lost**: if a host lands the board commit and
   dies before reacting, the job exists and the 👀 does not. The alternative
   (react first) acknowledges things that may not have landed.
3. **Edits are not seen.** An issue or comment edited after it was handled is
   not handled again; the prior garden is the same.
4. **Rate limits and conditional requests.** A poll is three list calls,
   plus one per pull request updated since the cursor. Two repositories
   every 90 s and seventeen every 300 s comes to roughly 1,000 calls an hour
   of the bot's 5,000. No `ETag` is used.
5. **What the steward does with a job it is given.** A job for the steward is
   a request to triage into smaller jobs; that role's run is an agent like any
   other and has not been exercised.
