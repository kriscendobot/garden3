---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/review-queue-poll"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Review queue poll

Purpose: know which open pull requests wait on a maintainer's review, and
notice when that set changes, so the garden can prepare each one before the
maintainer reaches it.

The queue is the set GitHub returns for `review-requested:<login>`, open, for
a maintainer named in the garden's maintainers list. It is trusted GitHub
state: logins, numbers and titles, never pull request bodies or comment text
fed to a model. That is why it is safe to poll.

## The queue as a record

The poller keeps one canonical set, written with `stringify`, one entry per
pull request:

```yay
pulls:
  - repo: "endojs/endo"
    number: 123
    title: "..."
    url: "https://github.com/endojs/endo/pull/123"
    author: "<login>"
    draft: false
    base: "master"
    archived: false
    updated: "2026-11-21T20:00:00Z"
```

- `base` is the branch the pull request targets (`master`, `llm`, `main`).
  Partition by it before any further sorting.
- `archived` is the repository's flag. Drop archived rows before acting.
- `updated` is the pull request's last change, not when review was requested:
  a usable proxy for a new pull request, a poor one for an old one that
  re-requested review. A requested-at time needs the timeline, one call per
  pull request.

Each poll compares the new set with the previous by `(repo, number)`, and
records an **add** for each new key, a **remove** for each missing one, or
"unchanged".

## Reacting

- **An add** is a pull request that now waits on the maintainer. It becomes a
  job for it (a review, or whatever the arc says), keyed so a repeat is a
  no-op: `garden board post` with an id from the repository and number
  ([job-board](../job-board/SKILL.md)).
- **A remove is not evidence of anything.** The maintainer reviewed it, the
  request was withdrawn, or it merged or closed: only the pull request's own
  state says which. Never retire work on a remove; read the review or the
  terminal state first.

A job that is given the queue (as `inputs/review-queue.yay`) reads it as data:
sort by base, then by `updated`, and say in its report which rows it acted on.

## Limits learned

- One search returns pull requests across all visible repositories, at one
  search-rate point; the search budget is about 30 a minute, so a poll every
  two minutes leaves room.
- The search stops at 1,000 results. A queue that reaches 1,000 is invisible
  past it: that count is itself the signal to narrow the query and tell the
  maintainer.
- `base` and `archived` are not in the search result. Fetch `base` once per
  added pull request and keep it; cache `archived` per repository for a day.
  A failed fetch keeps the last known value.
- Back off on errors: a 401 means the credential is gone (stop until it is
  fixed); a 403 or 429, five minutes; a 5xx, one minute.

## Not built yet

The poller. It is a steward-side service: a `makeReviewQueue(powers)` module
in `src/reviewQueue.js`, run on the steward's tick beside the watcher
(`src/watcher.js`), holding the set and its cursor on the board's side and
posting a job per add. A job never polls GitHub itself.

Adapted from the prior garden's `skills/review-queue-poll`; its poll script
stays behind.
