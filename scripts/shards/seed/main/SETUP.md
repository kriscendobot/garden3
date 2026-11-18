---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Set up a host

For an agent and an operator, together, on the host, outside any container.
The form follows the tower's starter kit: the wizard discovers before it
proposes, the operator decides, and where the agent cannot act it gives the
operator a short batch of commands with what each should print.

`./wizard` does the mechanical steps and remembers which are done, so this can
be stopped and resumed at any point: `./wizard status <dir>`.

## Decisions that are the operator's

- **Where** the garden lives on this machine (a directory; everything stays
  under it).
- **What kind of host** this is:
  - a **maintainer-run host**: one of the maintainers operates it and holds
    its keys; or
  - a **client host**: a machine lending capacity, which the maintainers will
    control remotely. This needs the owner's explicit consent (step 4).
- How many jobs it may run at once, and when.

## Sequence

1. **Find the host-access boundary.** Run `./wizard check`. It reports what is
   missing and, importantly, whether this shell can reach the container
   runtime or only the files. If it cannot, tell the operator now that steps
   6 and 7 will be theirs to run, and give them as one batch.
2. **Decide** the points above with the operator. Recommend; do not make them
   design it unaided.
3. **Fetch.** `./wizard fetch <repository url> <dir>`. It says what it will do
   first (`WIZARD_DRY_RUN=1` to only say it). Expect `<dir>/garden.git` (the
   one clone, bare), `<dir>/garden` (the shed), and views of the other
   branches inside it. The board, archive and journal are fetched at depth 1.
   Safe to run again. It ends by saying what this machine is and which
   capabilities have **no pinned artefact for its architecture**
   (`./wizard pins <dir>` repeats it). `CANNOT BOOT` names something every
   host needs: stop and tell the maintainers, rather than finding out at
   first start. `unavailable` is only a limit on which jobs this host will
   take.
4. **Consent, on a client host only.** `./wizard consent <dir>`, run **by the
   operator, in their own terminal**. It shows what remote control means and
   writes `CLIENT-CONSENT.yay` only if the operator types the machine's name.
   An agent must not type it for them. Then have the operator set the limits
   in that file to what they are lending. Skip this step on a
   maintainer-run host.
5. **Keys.** Keys are files, set by the operator, never pasted to an agent
   and never put in an environment: from `<dir>/garden`,
   `bin/garden.js keys status` lists what this kind of host needs, and
   `bin/garden.js keys set <name>` reads one from standard input. (This needs
   the runtime, so on a new host it is done inside the box after step 7.)
6. **The image.** From `<dir>/garden`: `./garden build`. Expect a small
   Debian image and `./garden check` to print `image matches the Dockerfile`.
7. **Start.** `./garden up`, then `./garden status`. The first boot fetches
   the garden's runtime and builds its helper; it needs the network and takes
   a few minutes. The host installs nothing else until a job needs it. At
   each start it records what it is (architecture, size, what it has
   installed) on its own `host/<name>` branch.
8. **Identity.** Inside (`./garden sh`): the bot's git name and email for this
   host, and GitHub authentication for the bot account, placed as the
   `github-bot` key. A client host needs only what lets it push its claims.
9. **Move in.** `./garden sh`, start the agent there, and have it read
   `CLAUDE.md` in the shed. From here the garden's own roles take over.
10. **Joined.** A maintainer adds the host to `journal:config/hosts.yay`.
    Then, inside: `bin/garden.js quiescence status` answers, a `host/<name>`
    branch exists for this host, and `bin/garden.js board claim` returns a
    job or `null` rather than an error. On a client host,
    `bin/garden.js clients read` says `watching: true`.

If a step cannot be done, finish what does not depend on it and leave the
operator one precise action and how to resume.

## Leaving

`./garden stop` stops the box. Deleting `CLIENT-CONSENT.yay` ends remote
control. Removing the directory and the `garden-cap-*` volume removes the
garden from the machine.
