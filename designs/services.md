---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Services: what the garden is written in

The maintainer does not want the garden rebuilt on shell scripts, or on
Python, is unsure even of JavaScript, and leans toward JavaScript services
with Rust: "we probably get the most relevant experience from a Rust and
JavaScript hybrid." This design acts on the lean and keeps the doubt.

## What the references are written in

Counted from tracked files under `scripts/` and `skills/`:

| | shell | Python | JavaScript |
| --- | --- | --- | --- |
| prior garden | 199,485 lines | 7,984 | 1,657 |
| tower | 36,689 | 6,185 | 473 |

One file, the prior garden's `scripts/jobs/common.sh`, is over 12,000 lines.
So this garden is a **rewrite, not a port**: the mechanisms are carried over
and almost no code is. The one file taken verbatim is the YAY parser
([data-model.md](data-model.md)).

Where the garden is going is built in the same two languages. The public
`endojs/endo-but-for-bots` repository, which minion.town runs, has a Rust
supervisor (`rust/endo`) hosting JavaScript workers, and Endo itself is
hardened JavaScript with object capabilities. That is the split adopted here.

## The line

**Rust: small, privileged, and able to run with nothing installed.** Today
that is one program, the **warden** (`rust/warden`, about 500 lines, one
dependency: `libyay`): it kills a slot account's processes, razes, plants and
re-owns a slot's home, and runs a job as that account under its deadline
([slots.md](slots.md)). It is the only code that runs as root after boot.

**JavaScript: everything that coordinates.** `src/`, about 3,200 lines:

| Module | Is |
| --- | --- |
| `board.js` | the board's rules, levels and cost: pure functions |
| `budget.js`, `quiescence.js`, `clients.js`, `plots.js`, `wrapup.js` | each a set of pure rules plus a service that lands them |
| `shard.js` | compare-and-swap on a branch |
| `boardService.js`, `capabilities.js`, `slots.js`, `journal.js`, `mail.js`, `keys.js`, `host.js` | services |
| `github.js`, `watcher.js`, `steward.js` | the garden's view of GitHub; hearing maintainers; answering them |
| `dispatch.js`, `supervisor.js` | the composition, and the one loop |
| `yay.js`, `shon.js` | the data model on disk and on the command line |
| `powers/node.js` | the only module that imports Node's builtins |
| `cli.js` | `garden <service> <method> [ value ]` |

**Shell: only what must run before a runtime exists**, and none of it holds
garden logic: `entrypoint.sh` (accounts, fetch node, install the warden, hand
over), `garden` (the launcher, on the host), `scripts/shards/bootstrap.sh`
(first creation of the branches), `scripts/lint.sh`, the `wizard` on `main`
(a new host has nothing else), and on the gate `cutover/cutover.sh`. About
620 lines in all.

**No Python.**

## Services, not scripts

The prior garden is some sixty timers, each a script that wakes, clones a
branch, does one thing and exits, sharing state through files and the journal.
Here one process per host holds the services and ticks
([hosts.md](hosts.md)). A service is an object made by a `make*` function from
the powers it is handed; its methods are async and take and return plain data.

What still shells out, and where it is isolated:

| Program | Called from | For |
| --- | --- | --- |
| `git` | `shard.js`, `slots.js`, `project.js`, `plots.js`, `host.js` | everything about repositories; there is no library, by choice: git's own behaviour is the specification |
| `warden` | `slots.js` only | what needs root |
| `curl`, `tar` | `capabilities.js` only | fetching and unpacking |
| `curl` | `github.js` only | the GitHub API, with the token on standard input |
| `cargo` | `cli.js` (`host build`) only | building the warden |
| a capability's verify and install steps | `capabilities.js` | as argument vectors, never through a shell |
| the worker's harness | the warden, for dispatch | the agent itself |

Every call is `run(cmd, args)`: an argument array, no shell, no string
interpolation.

## The seam between the two

A process boundary. JavaScript calls the warden with one request, a YAY value
written as SHON on the command line, and reads one YAY document from its
standard output ([data-model.md](data-model.md)):

```
warden [ --op run --root /garden/slots --slot slot01 --uid 2001 --gid 2001
         --window_s 2400 --log /…/job.log --env [ --PATH /… ] --argv [ claude -p ] ]
ok: true
status: 0
timed_out: false
elapsed_s: 1312
```

Rust parses the request with upstream `libyay`'s `shon` module and writes the
reply with its encoder. JavaScript writes the request with `src/shon.js` and
parses the reply with the vendored `libyay` parser. The same data model is on
disk, on the command line and across the seam. Chosen over native bindings
(which would put root-privileged code inside the service process) and over
WebAssembly (which cannot change users or kill processes). A request names
everything it acts on, so the warden's authority is its arguments, bounded by
one policy file.

## Getting binaries without a new image

The warden is compiled, so a host needs a binary for its own architecture:
amd64 on the Linux hosts, and arm64 if the Oros Studio Mac is Apple silicon
(not recorded in the references; a Mac Studio suggests it). At each
rejuvenation a host **builds the warden from the shed's `rust/`** with the
pinned `rust` capability (`garden host build`): `cargo build --release
--locked`, the lockfile pinning every crate by checksum. Hosts are compared
at verify by shed commit and toolchain pin, not by binary hash, since
binaries differ by architecture. The alternative, fetching prebuilt binaries
by hash from a release, would spare each host a toolchain of several hundred
megabytes and needs a release pipeline and someone to trust for the build.

The bootstrap resolver is **not** Rust: fetching node is thirty lines of
shell over `curl` and `sha256sum`, and a Rust fetcher would need a TLS stack
compiled in and would itself have to be delivered somehow.

## Style, for the ascent

Written so that moving a service into a confined worker is a change of
powers, not a rewrite ([ascent.md](ascent.md)): no module but
`powers/node.js` imports a builtin; every service is `make*(powers)` and
returns a hardened object (`src/harden.js` stands in for SES's `harden`);
methods are async and exchange only plain data; expected failures are
`Refusal`s with a code, not strings to parse.

## Status

Compiled and run in this pass: the warden (debug and release, `cargo build
--offline`, with `libyay` 1.1.1 from the local registry cache), its four
integration tests, `cargo fmt --check` and `cargo clippy -D warnings`; all of
`src/` under `node --test` (Node 22.22.1). The JavaScript drives the real
warden binary in the slot and dispatch tests. Not run: `entrypoint.sh`, the
launcher, `garden host build`, and anything as root.

## Open questions

1. **JavaScript at all.** The maintainer's doubt stands. What was weighed:
   *all Rust* (one static binary, no runtime to bootstrap, strongest typing;
   but the coordinating logic is where the garden will change most, and the
   destination's workers are JavaScript); *Go* (static, quick to write, no
   presence in the destination); *shell kept thin over a Rust core* (the
   habit being left). What would change the answer: if the ascent's target
   turns out to host Rust or Wasm guests as readily as JavaScript, or if the
   services prove hard to keep honest without types, moving the rules
   (`board.js` and its like are pure and small) into Rust would be cheap.
2. **Where the line falls.** Should the supervisor loop itself be Rust,
   hosting the JavaScript services as children as `endo` does? Today the
   supervisor is JavaScript and calls down.
3. **Types.** The JavaScript is untyped and unlinted beyond `node --check`.
   JSDoc checked by `tsc`, as Endo does, is the natural next step and needs
   the toolchain as a capability.
4. **Build on the host, or fetch prebuilt** (above).
5. **A setuid helper or a root daemon** (see slots.md).
