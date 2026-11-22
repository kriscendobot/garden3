---
author: "steward"
created: "2026-11-22"
updated: "2026-11-22"
---

# Dev publish: endo-but-for-bots' llm, on request

The maintainer wants the latest packages from endo-but-for-bots' `llm`
branch published as `dev-*` releases, run by hand through the steward. The
registry is npm.minion.town, which the prior garden built and deployed in
September (endojs/endo-but-for-bots#1362, kriscendobot/minion.town#135). The
project's own design for continuous publishing from `llm`
(`designs/llm-dev-publish.md` there) was merged as a proposal and never
built. This is the same procedure, run on request as `garden devpublish`
(`src/devpublish.js`, [skill](../skills/dev-publish/SKILL.md)).

## A run

1. Clone the branch's tip, shallow, into a fresh run directory under
   `dev_publish.work`.
2. Stamp each public workspace `<x.y.z+1>-dev.<YYYYMMDDHHMMSS>.g<sha7>`: the
   next patch of its version, so it sorts above the published release, and
   the commit's time in UTC. Then and rewrite `workspace:` dependencies to the stamped
   versions.
3. Exclude a workspace whose version is not plain `x.y.z`, or that depends at
   run time on a private workspace, with every workspace that depends on it.
4. Install with `yarn install --immutable --mode=skip-build`, and with
   scripts off.
5. Run each real `build` script (not a placeholder `exit 0`); today that is
   only `ses`. Pack with the project's `scripts/pack-all.mjs`.
6. Publish each tarball under the commit's date tag, `dev-YYYY-MM-DD`,
   skipping a version the registry already serves.
7. When every package is served, move `dev-latest` to each.

`plan` stops after step 5.

## Where it follows the registry, not the project's design

The project's design names per-commit tags (`dev-<stamp>-<sha>`) and versions
without the `g`. The registry as built refuses both: it takes versions
`-dev.<stamp>.g<sha>` and date tags that match the version's commit date
(`packages/npm-registry-server/src/dev-release.js`). The run follows the
registry. One of the two should change to match the other; that is for the
project's maintainers.

## Rehearsed

On 2026-11-21 the procedure ran end to end against a local instance of the
registry server, built from `llm` at `0368767`:
- 67 workspaces packed, and 64 were published under `dev-2026-11-17` in 19
  seconds;
- `dev-latest` moved on all 64, and a `latest` tag was refused (E403);
- a cold install of `@endo/patterns`, `@endo/init` and `ses` at `dev-latest`
  took all 20 packages from that registry, and a smoke test passed.

The three left out were `@endo/agentry` (depends on the private
`@endo/daemon`), `@endo/exo-git` (the private `@endo/pubsub`) and
`@endo/agent-tools` (on `@endo/exo-git`).

Found on the way:
- Yarn's bundled code fails to load under a directory whose `package.json`
  says `"type": "module"`, as the garden's does.
- Yarn's cache must be on the same filesystem as the install, for hard links.
- npm reads a bare `dist/<file>.tgz` as GitHub shorthand, so paths start with
  `./`.

## The operator's rules

The registry's operator sent the garden its token on 2026-11-22, with rules:
- publish only `@endo/*` and `ses`, only from public commits on
  github.com/endojs/endo;
- versions are the next patch of the published version, tagged with the
  commit's UTC date;
- tags move only forward; no unpublish, no deprecate, never `latest`.

endo-but-for-bots is not a fork of endojs/endo, and `llm`'s commits are not
on it, so publishing `llm` is asked of the operator and waits for the answer.
If only endojs/endo is allowed, `dev_publish.repository` and `ref` in
`config/garden.yay` move to endojs/endo's `master`.

## The key

`npm-minion-town` (`keys/registry.yay`): a `PublishGrant` token the registry's
operator issues, for `@endo/*` and `ses`, as the user `garden`, good until
2027-05-21 (a new one is promised in April). `garden devpublish whoami`
checks it. By the registry's policy it can publish only `dev-*` prereleases. The
steward reads it at the start of `publish`, writes it into a 0600 `.npmrc` in
the run directory, and removes that file when the run ends, whether it
succeeded or failed.

## Status

- Built and tested (`test/devpublish.test.js`): the versions and tags, the
  exclusions, and a run against a fixture repository with npm faked. The
  tests check that `dev-latest` moves only after every publish, that a rerun
  skips, and that a failure leaves no token and no moved tag.
- The key is set and `whoami` answers `garden`. No publish yet: it waits for
  the operator's answer about the source repository.
- Not built: a cadence. The maintainer asked for a manual trigger.
