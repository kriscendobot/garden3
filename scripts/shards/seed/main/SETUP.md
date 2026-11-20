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
   and never put in an environment. Inside the box (`./garden sh`, after step
   7), `garden keys status` lists what this kind of host needs, and
   `garden keys set <name>` reads one from standard input. The bot's GitHub
   token and ssh key are not set this way: they come from its login, step 8.
6. **The image.** From `<dir>/garden`: `./garden build`. Expect a small
   Debian image and `./garden check` to print `image matches the Dockerfile`.
7. **Start.** `./garden up`, then `./garden status`. The first boot fetches
   the garden's runtime and builds its helper; it needs the network and takes
   a few minutes. The host installs nothing else until a job needs it. At
   each start it records what it is (architecture, size, what it has
   installed) on its own `host/<name>` branch.
8. **The bot's login**, on a host that publishes. The operator does this by
   hand, in their own terminal; an agent does not. `./garden sh` opens a shell
   in the box as the steward, already set up so that everything below lands
   under the steward's home in the state directory and nowhere in the
   checkout.

   ```sh
   ./garden sh
   garden capabilities install gh        # once; this host installs its own gh
   gh auth login --hostname github.com --git-protocol ssh --web --scopes admin:public_key
   ```

   gh asks whether to generate a new SSH key: **yes**, with **no passphrase**
   (the steward uses it unattended), and accept the title it offers. It then
   shows a one-time code and a URL. Open the URL in a browser that is signed
   in to GitHub **as the bot**, enter the code, and authorize. Then check:

   | Type | Expect |
   | --- | --- |
   | `gh auth status` | `Logged in to github.com account kriscendobot`; git protocol `ssh`; scopes include `admin:public_key`. The token is shown masked |
   | `ssh -T git@github.com` | `Hi kriscendobot! You've successfully authenticated, but GitHub does not provide shell access.` |
   | `ssh-keygen -lf ~/.ssh/id_ed25519.pub` | one line: `256 SHA256:… (ED25519)`, the same fingerprint GitHub lists under the bot's SSH keys |
   | `garden bot status` | `ok: true`, `login` and `ssh` both `kriscendobot`, `problems: []` |
   | `garden keys status` | `github-bot` and `github-ssh`: `present: true`, `mode_ok: true`. No values are shown |

   If `gh auth status` or `ssh -T` names **any other account**, stop: run
   `gh auth logout`, remove the key gh uploaded from that account on GitHub,
   and log in again with the browser signed in as the bot. The first
   connection is checked against GitHub's published host keys, which the box
   pinned at boot; if ssh reports a host key problem, stop and tell the
   maintainers.

   Commits the steward makes in the box are the bot's
   (`Kriscendo Bot`), set in the steward's own git configuration in the
   state directory. Nothing changes the identity you commit with outside the
   box. A client host needs only what lets it push its claims: the same login,
   as whichever account the maintainers give it.
9. **Move in.** `./garden` with no argument opens a Claude Code session in
   the box, in the shed, as the steward (it installs the harness on first
   use; the operator logs it in there, once). Have it read `CLAUDE.md` in
   the shed. From here the garden's own roles take over.
10. **Joined.** A maintainer adds the host to `journal:config/hosts.yay`.
    Then, inside: `garden quiescence status` answers, a `host/<name>` branch
    exists for this host, and `garden board claim` returns a job or `null`
    rather than an error. On a client host, `garden clients read` says
    `watching: true`.

If a step cannot be done, finish what does not depend on it and leave the
operator one precise action and how to resume.

## Leaving

`./garden stop` stops the box. Deleting `CLIENT-CONSENT.yay` ends remote
control. Removing the directory and the `garden-cap-*` volume removes the
garden from the machine.
