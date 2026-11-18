---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Keys are files

The prior garden passes provider keys to the container as environment
variables. The garden takes the tower's way. Code: `src/keys.js`,
`keys/registry.yay`.

## What the priors do

**The prior garden** (`garden` launcher, `entrypoint.sh`,
`scripts/systemd/seed-api-key-handoff.sh`, `designs/secret-management.md`): six
provider keys are `docker run -e` flags, copied at boot into
`/run/environment.d/60-garden-api-keys.conf`, and so inherited by every unit
and every worker. A file store (`scripts/secrets/`, mode 0700, with a
registry) was added in November 2026 as a compatibility layer; removing the
`-e` path is described as a later release.

**The tower** (`scripts/jobs/set-api-key.sh`, `worker-auth.py`,
`scripts/typesafe/common.sh`, `divergence/image.md`): a key is one file under
`.tower-state/secrets/`, mode 0600 in a 0700 directory. It is written from the
terminal or a pipe, never from argv. A script that needs it reads the file,
refuses it if any group or other bit is set, and hands it to `curl` on stdin.
A worker's environment is stripped of every key variable and it gets its
credential through a helper the harness calls. One exception remains:
`ANTHROPIC_API_KEY` may still be passed with `-e`.

## The garden's rules

1. **No key in the environment, with no exception.** The launcher passes no
   key (`test/bootstrap.test.js` checks its `-e` flags). Dispatch builds a
   worker's environment from nothing and `scrub` removes every known key
   variable and anything named `*_API_KEY`, `*_TOKEN` or `*_SECRET`
   (`test/dispatch.test.js` checks what a worker actually sees).
2. **A key is a file** under `.garden-state/secrets/`, 0600 in 0700, owned by
   the steward. Job accounts cannot read the directory at all
   ([slots.md](slots.md)).
3. **A registry** (`keys/registry.yay`, on the shed) names each key, what it is
   for, a pattern its value must match, and its one **consumer**. `read` is
   refused for any other consumer, and for a file whose mode is not exactly
   0600: a key others could read is treated as leaked.
4. **Set from the gate.** The maintainer writes a key with
   `garden keys set <name>`, the value on standard input; `status`
   shows presence and mode, never a value.
5. **Jobs hold no GitHub credential.** Only the steward reads `github-bot`,
   to publish harvested branches and act on a job's outbox. In both priors a
   worker pushed with the bot's token itself.
6. **The model credential** (`anthropic-worker`) reaches the harness through
   the harness's own key helper, as in the tower, so it is in no environment
   and no argv. The agent process necessarily holds it while it runs.

Client hosts are sent no key over any branch ([clients.md](clients.md)); a key
is placed on a host by its owner.

## Status

Implemented and tested: set, modes, pattern, consumer, refusal of a loose
mode, status without values, the scrub (`test/dispatch.test.js`). `garden keys set <name>` takes the
value on standard input and refuses one given as an argument
(`test/cli.test.js`). The steward's reads and writes to GitHub take the token
from its file on each call and give it to curl on standard input
(`test/watcher.test.js`). Design only: the harness's key helper, and the
steward publishing branches and pull requests.

## Open questions

1. **Subscription logins.** The prior garden's workers mostly run on Claude
   subscription logins stored in the bind-mounted home, not API keys. Where
   does a login live when each job has a fresh home? Probably the steward's
   state, lent to the harness through the helper; this needs a real harness
   to settle.
2. **One bot token for everything the steward does**, or a narrower token per
   act (push to forks, comment, read)?
3. **Rotation.** The prior garden's registry has a maximum age per key and a
   watchdog. Not ported.
