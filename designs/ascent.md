---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The ascent: not now, and not foreclosed

The long-term goal is to move the garden's workers into minion.town and
torrent.nexus, and to use ocap.site pages for its control and observability
surfaces. That needs the garden's shell idioms translated into "the new
idiom". None of it is built here. This says what was done so that it can be.

The garden is **not** responsible for advancing minion.town; nothing here
watches, screens, publishes to or presses that project.

## What the new idiom is, from the references

minion.town runs `endojs/endo-but-for-bots`: a Rust supervisor hosting
JavaScript workers, speaking OCapN. Endo is hardened JavaScript: code runs in
compartments with no ambient authority, and can act only through object
references it has been handed (capabilities), calling them with eventual sends.
The tower already corresponds with the town through its own Endo daemon and
holds a publishing capability; its designs for ocap.site describe pages
published by capability. (Those designs are the tower's and were read only
for what the idiom is.)

So the translation is from "a script with the whole machine's authority,
finding things by path and environment" to "an object with only the
references it was given".

## What was done with that in mind

| Shell idiom | Here now | In the destination |
| --- | --- | --- |
| a script reads the environment and the filesystem | a service is `make*(powers)`; only `src/powers/node.js` imports a builtin | the powers are capabilities handed to a worker |
| scripts call scripts, passing strings | services call methods, passing plain data | eventual sends between vats |
| a command with flags | `garden <service> <method> [ SHON value ]` | the same method, sent |
| front matter and JSON parsed with `awk` and `jq` | YAY, the data model converging on OCapN's ([data-model.md](data-model.md)) | the same records, another encoding |
| exit codes and stderr | a `Refusal` with a code, or a result | a rejected promise, or a result |
| a timer per script | one supervisor ticking services | a vat's own turns |
| the worker as a subprocess with the garden's home | a job in a slot with nothing but its own home ([slots.md](slots.md)) | a worker in a confined guest |
| root where needed | one small Rust helper behind a narrow request ([services.md](services.md)) | the supervisor's own powers |

The pure rule modules (`board.js`, and the rules in `budget.js`,
`quiescence.js`, `clients.js`, `plots.js`, `wrapup.js`) import nothing and
should run under SES unchanged; that has not been tried.

## What stands in the way

- **Git is the database.** Every shard is a branch written by `git push`. A
  vat cannot shell out. Either the shard becomes a capability (an object
  offering `land(mutation)`, behind which git stays), or the records move
  into the destination's own storage.
- **Names where references should be.** A claim names a host; a job names its
  steps; a service is found by name. Each is a place a capability belongs.
- **The control surfaces.** There is no dashboard, by decision (the Pages
  board is dropped). The status calls return plain data (`quiescence.status`,
  `board.read`, the slate, `expiriesByHost`), which is what a page on
  ocap.site would be handed a read-only view of.
- **The agent harness** runs as a subprocess with a filesystem. Whether a
  worker in the town is that harness inside a guest, or something else, is the
  destination's question.

## Open questions

1. **Which moves first**: the workers (a job runs in the town) or the
   services (the board lives in the town)? The slot boundary suggests workers.
2. **Is a shard-as-capability the bridge**, keeping GitHub as the place
   maintainers steer from?
3. **What an ocap.site control page is handed**: a read-only view, or
   attenuated authority to release and abandon?
4. **torrent.nexus's part** is not understood from what was read here.
