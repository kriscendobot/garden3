---
author: "steward"
created: "2026-11-17"
updated: "2026-11-22"
---

# Working in the garden

You are in the shed, or in a job's home that is a copy of it. Which, matters.

**If there is a `JOB.yay` beside this file, you are a worker in a slot.** Read
[roles/COMMON.md](roles/COMMON.md), then `roles/PLOT.md` and the brief for the
role your job names, then do the job. You have no credential and no remote;
your home is deleted when you finish; what you commit on your job's branch and
leave in `outbox/` is what survives.

**Otherwise you are working on the garden itself**, in the shed's checkout.

- The garden is public. The tower beside it is private: carry mechanisms from
  it, never its content. If unsure whether something is private, leave it out
  and say so.
- Logic is JavaScript services (`src/`) and one Rust helper (`rust/`). Shell
  is only for what runs before a runtime exists. No Python. New logic goes in
  a `make*(powers)` module that imports no builtin, with tests
  ([designs/services.md](designs/services.md)).
- Prose is American English, without Botese: code, comments, documents,
  commits, pull requests. `scripts/lint.sh` checks it
  ([skills/american-english-normalization](skills/american-english-normalization/SKILL.md)).
- Records and config are YAY; documents carry YAY front matter (`author`,
  `created`, `updated`). Write records with `stringify`, never by hand
  ([designs/data-model.md](designs/data-model.md)).
- Never commit in a root worktree of another branch (`board/`, `journal/`,
  ...): services write through their own clones ([WORKTREES.md](WORKTREES.md)).
- Keys are files the maintainer sets. Never ask for one, print one, or put
  one in an environment ([designs/keys.md](designs/keys.md)).
- Roles and skills carry their provenance ([designs/upstream.md](designs/upstream.md));
  the prior garden's are spread over the plots, and evolution prunes them.
- A change to the shed lands directly on `origin/shed` once `node --test`,
  `cargo test --offline` in `rust/` and `scripts/lint.sh` pass. The maintainer
  does not review shed changes; they correct them through use.

The designs say what is built and what is only designed. Believe the tests
over the prose.
