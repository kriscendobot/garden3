---
author: "designer"
created: "2026-11-17"
updated: "2026-11-22"
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
that is one program, the **warden** (`rust/warden`, about 800 lines, **no
dependencies**): it kills a slot account's processes, razes, plants and
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
| `devpublish.js` | publishing a branch's `dev-*` releases, on the steward's command |
| `prose.js` | American English without Botese: the lists' check, `garden prose` |
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
| `git` | `shard.js`, `slots.js`, `project.js`, `plots.js`, `host.js` | everything about repositories; there is no library, by choice: git's own behavior is the specification |
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

**The warden links nothing.** It first used upstream `libyay` for both
notations. That brought a procedural macro into the build, and so a C compiler
and system linker into the base image. So the warden now reads SHON and writes
YAY with about a hundred lines of its own (`rust/warden/src/wire.rs`), for
exactly the subset it uses, and a separate crate, `rust/conformance`, holds
those lines to upstream `libyay`: the same requests must read the same, and
the warden's replies must parse back equal. JavaScript writes the request with
`src/shon.js` and parses the reply with the vendored `libyay` parser. The same
data model is on disk, on the command line and across the seam. Chosen over
native bindings (which would put root-privileged code inside the service
process) and over WebAssembly (which cannot change users or kill processes).
A request names everything it acts on, so the warden's authority is its
arguments, bounded by one policy file.

## Getting binaries without a new image

The warden is compiled, so a host needs a binary for its own architecture,
whatever that turns out to be. At first boot, and whenever its source on the
shed has changed, a host **builds the warden from the shed's `rust/`**
(`garden host build`) with the `rust` capability: rustc, cargo, rustfmt,
clippy and the musl standard library, nothing else. In the box a plain
`cargo` builds for musl too (`CARGO_BUILD_TARGET`, set by the entrypoint), so
the warden's tests and lints run there; a crate with build scripts or
proc-macros (`rust/conformance`) needs a C linker and does not. It is built for the musl target and linked by
`rust-lld`, the linker inside the toolchain (`rust/.cargo/config.toml`), with
`--locked --offline`: no C compiler, no system linker, no registry, no
network. The result is a static binary of about 500 KB.

The alternative, fetching prebuilt binaries by hash from a release, would
spare each host a 630 MB toolchain and needs a release pipeline and someone to
trust for the build.

The bootstrap resolver is **not** Rust: fetching node is thirty lines of
shell over `curl` and `sha256sum`.

## What running it found

The first real boot, on one host, found these, all fixed:

- `./garden sh` ran a path that did not exist in the box and re-ran the whole
  root entrypoint; it now enters as the steward through one wrapper the
  entrypoint writes.
- The entrypoint's `set --` while reading the node pin overwrote the
  container's command, so `supervise` became `amd64`.
- `garden host build` was not a method of the host service; an unknown method
  crashed instead of being refused.
- The entrypoint fetched node and then the capability record fetched it
  again; it now adopts what is already unpacked and verified.
- The slots directory was root's, so the steward could not build a home in
  it; and the steward read each slot's record from inside the job's home,
  which it cannot do once the home is the job's. The directory is now the
  steward's, the record is in the steward's state, and a new warden operation,
  `release`, kills the job's processes and gives the home back to the steward
  for harvest.
- The warden was not rebuilt when its source changed.
- A capability's verify pattern anchored with `$` never matched output ending
  in a newline.
- The steward's home was the checkout, where gh and ssh-keygen would have
  written a token and a private key.

## Style, for the ascent

Written so that moving a service into a confined worker is a change of
powers, not a rewrite ([ascent.md](ascent.md)): no module but
`powers/node.js` imports a builtin; every service is `make*(powers)` and
returns a hardened object (`src/harden.js` stands in for SES's `harden`);
methods are async and exchange only plain data; expected failures are
`Refusal`s with a code, not strings to parse.

## Status

Compiled and run: the warden, on this host with its own toolchain (tests,
`cargo fmt --check`, `cargo clippy -D warnings`), with the pinned toolchain
and no C compiler on `PATH`, and inside the running box by the entrypoint; the
conformance crate against `libyay` 1.1.1; all of `src/` under `node --test`.
In the box, as real accounts: the setuid warden cleared slots, ran a job as a
slot account under a deadline (stopped at it, status 124), released the home
and razed it. Not run: `users` mode through a whole dispatch with a real
harness, and anything on arm64.

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
