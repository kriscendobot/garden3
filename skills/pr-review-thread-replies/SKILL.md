---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-review-thread-replies"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request review thread replies

Purpose: after addressing review comments, answer each thread with the commit
that addressed it, so the reviewer need not walk the diff again; and give one
summary that maps every item to its outcome.

The close-out of [review-feedback-followup-commits](../review-feedback-followup-commits/SKILL.md).

## Who posts

You hold no credential and post nothing. You write the replies; the steward
posts them. Your job's body (or `inputs/`) carries the review comments, each
with its id, path, line, author, body and diff hunk, as the steward fetched
them. If it does not, you cannot see the threads: say so and stop, rather than
guessing what was asked.

## Writing the replies

Put them in `outbox/report.md` under a heading `Replies`, one per thread:

```
- comment 3223741240 (packages/x/src/a.js:42): Addressed in abc1234 (fix(x): keep the guard on retry).
- comment 3223741388 (packages/x/src/b.js:7): Following up in a separate pull request. Needs the store change first.
```

Then a summary for the top-level comment: each item, the commit that
addressed it, and each deferral with its reason. The report goes up as one
comment.

## Rules

- **Take every cited commit id from git, never from memory.** Write the
  replies from `git rev-parse HEAD` and `git log --format=%H` output in the
  same session. A model that extends a remembered short id to forty
  characters invents the tail, and every link 404s at once (it happened to all
  ten replies and the summary on `endojs/endo-but-for-bots#475`). Short ids
  are fine if they are git's.
- **Answer the question asked, and stop.** When a reviewer asks "which test
  proves this?", the reply is a permalink to the test
  (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<line>`), perhaps
  with its title. Do not walk through its assertions; the reviewer will read
  it. A reply over about 80 words, or with three or more bullets, is
  explaining what a link would show. Cut it. (A 235-word, four-bullet answer
  to "which test tells us it's deliberate?" once drew a pointer to Grice's
  maxims; a one-line permalink closed the thread.)
- **A deferral says so**: "Following up in a separate pull request", with a
  one-line reason. Deferring needs the reviewer's or the job's leave.
- **A type comment** is usually about what a refactor lost. Read the diff hunk
  and fix the structure rather than reverting.
- **Comments you can see but that have no id** (a review still pending on the
  reviewer's side) cannot be threaded. Map them in the summary by path and
  line, and say they were pending.

## When you are writing a body for any tool

A reply body never goes on a shell command line. Backticks and `$(...)` in a
body are run by the shell before the tool sees them, which silently deletes
inline code and is an injection sink for any text that came from outside.
Write the body to a file and pass the file.

## Not built yet

The steward posts a job's report as one marked comment
([pull-requests.md](../../designs/pull-requests.md)). Posting each reply into
its own thread (GitHub's `pulls/<n>/comments/<id>/replies` endpoint, never the
parent endpoint, which makes a new top-level comment) from a job's `Replies`
section is not built. Until it is, the replies reach the reviewer inside the
one comment.

Adapted from the prior garden's `skills/pr-review-thread-replies`.
