---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/changeset-discipline"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Changeset discipline

Purpose: write a changeset (`.changeset/<name>.md`, from `@changesets/cli`)
only when a change is user-observable, and write it for the person deciding
whether to upgrade.

## When to write one

- A new exported API.
- A change in the observable behaviour of an exported API.
- A bug fix a user could have noticed.
- A breaking change: a removed export, a changed signature, stricter
  validation.
- A migration step the user must take on upgrade.

## When not to

Write none, not even a "no-op" entry, when the change lets the user do nothing
new, obliges no migration, and could not be detected from the package's
documentation, signatures or behaviour. For example: removing an unused
devDependency; moving tests into a sibling test package; renaming an internal
file under `src/`; a private subpath behind a test export condition; a fixture
refactor; a comment, JSDoc or README that describes existing behaviour; CI,
build or lint changes; anything under `.claude/`.

A changelog full of "removed unused devDep" teaches readers to skip it, and
then they miss the entries that matter.

## When in doubt, ask

An entry is easier to add than to remove: once published it ships forever.
Ask in the pull request description rather than writing one by default. When
you omit one on purpose, the description's documentation line says "no
changeset (internal hygiene)".

## What goes inside

The reader is a downstream author reading release notes.

- **One changeset per pull request per release.** A fix answering review is
  part of the same change: revise the entry, do not add a second. Several
  files for one pull request almost always want merging.
- **Keep it current.** When the interface, a name or the migration path
  changes in review, sweep the changeset in the same commit. A description of
  an earlier draft misleads.
- **No implementation detail:** the new affordance, the obligation, the
  breakage, not which helper was extracted.
- **No process:** "reverted from earlier draft", "split out of #N", "addresses
  reviewer ask" belong in the commit or the description, not in release notes.

## A new package's first release

The release tooling regenerates `CHANGELOG.md` from changesets, so a
hand-written first changelog is always wrong.

- `CHANGELOG.md` is the empty stub and nothing else:

  ```
  # Change Log

  All notable changes to this project will be documented in this file.
  See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
  ```

- `package.json` has version `0.1.0`.
- The changeset bumps `major`, so the first release is `1.0.0`. A `minor` or
  `patch` would publish `0.2.0` or `0.1.1`.
- What the package is goes in the changeset's body.

The model in endo is `@endo/cancel`. The directive (kriskowal,
endojs/endo-but-for-bots#513): "keep the initial changelog empty, the first
version 0.1.0, and a changeset bumping the major, such that the first release
is 1.0.0 as will be reflected in the change log."

Adapted from the prior garden's `skills/changeset-discipline`.
