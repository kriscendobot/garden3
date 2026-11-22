---
author: "steward"
created: "2026-11-22"
updated: "2026-11-22"
---

# Dev publish

Purpose: publish the packages of endo-but-for-bots' `llm` branch to
npm.minion.town as `dev-*` releases, when a maintainer asks. Design:
[dev-publish.md](../../designs/dev-publish.md).

```sh
garden devpublish whoami                     # the key and the registry: answers "garden"
garden devpublish plan                       # everything but publishing: versions, tag, what is left out
garden devpublish publish [ --by <login> ]   # publish the tip, then move dev-latest
```

0. **Mind the operator's rules.** npm.minion.town's operator allows
   publishing only from public commits on github.com/endojs/endo, for
   `@endo/*` and `ses`. Whether endo-but-for-bots' `llm` may be published
   too is asked and not yet answered: until it is, do not run `publish`
   against it.
1. **Run `plan` first** when the branch has changed in a way you have not
   seen: new public packages, a new build step. It clones, installs, stamps,
   builds and packs, and says what would go and what is excluded and why.
2. **`publish`** does the same, then publishes every package under the
   commit's date tag (`dev-YYYY-MM-DD`). Only when all are served does it move
   `dev-latest`. Name the maintainer who asked with `--by`.
3. **Report** the commit, the tag, the counts and the exclusions to the
   maintainer who asked. The journal already has a note of the run.

## When it fails

- **`no-key`**: the maintainer has not set `npm-minion-town`. Say so; never
  ask for the value. They set it with `garden keys set npm-minion-town`, from
  a pipe.
- **A failed publish** leaves `dev-latest` where it was and keeps the run
  under the work directory (`dev_publish.work` in `config/garden.yay`) for a
  look. Fix the cause and run `publish` again: what is already published is
  skipped.
- **A refused tag** (`tag-failed`): the registry moves tags only forward. A
  commit older than the one `dev-latest` points at cannot take it.
- **Excluded packages** depend at run time on a private workspace, which npm
  could not resolve. That is for the project to fix, not this run.

Consumers install with `npm_config_registry=https://npm.minion.town/ npm
install @endo/<pkg>@dev-latest`, or the date tag for a fixed day.
