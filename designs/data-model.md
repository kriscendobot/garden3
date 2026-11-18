---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The data model: YAY everywhere

The maintainer: "we should use YAY and YAY Markdown front matter, as the tower
does", and "being able to embed YAY may prove to be a super-power, especially
since YAY is converging on the data model of OCapN and Endo. There are modules
in YAY for parsing Endo's data model from arguments." Code: `src/yay.js`,
`src/shon.js`, `vendor/libyay/`.

## What YAY is, as found on this machine

The source is `kriskowal/yay` on GitHub (Apache-2.0), present here as the
tower's bare clone `repositories/kriskowal-yay.git`. Upstream `main`
(`f0ba258`, 2026-02-26) holds implementations in C, Go, Java, JavaScript,
Python, Rust and Scheme.

- **The data model**: null, boolean, integer (arbitrary precision), float64,
  string, bytes, array, object. Eight types.
- **JavaScript** (`js/libyay`, 1.1.0): a parser only, one file, no
  dependencies. `parseYay(source, filename)`. No writer.
- **Rust** (`rust/libyay`; 1.1.1 is in this machine's cargo registry cache):
  parser, encoder (`encode(value, Format::Yay)`), a lenient reader, and
  **`shon`**: `parse_shon_bracket(args)` and three siblings. This is the
  module "for parsing Endo's data model from arguments". **SHON** (Shell
  Object Notation, `SHON.md`) writes the same eight types as argv words:
  `[ --name hello --count 42 ]` is `{name: "hello", count: 42}`. It exists
  **only in Rust**; there is no JavaScript SHON upstream.
- **`binyay`**, the `yay` command (Rust): converts and checks formats. The
  tower builds its own from a pinned commit of a tower-local branch that adds
  **Yaydown**: Markdown with strict YAY front matter and exactly one blank
  line after the closing `---` (`scripts/tower/provision-yay.sh`). That
  branch is not on upstream `main`.
- Only upstream `main` and the published crate were read for this design.
  Work in progress beyond them, if any, is not relied on.

## How the tower uses it

`DIVERGENCE.md` § Documents are YAY, `scripts/jobs/yay.sh`: jobs are strict
YAY files with the body a block string; configuration is one YAY file;
records are Markdown with YAY front matter; documents on `main` carry YAY
front matter (`created`, `updated`, `author`). The tower reads with `yay` and
`jq` and writes YAY from `jq`, checking every write by reading it back.

## How the garden uses it

One data model in four places:

| Where | Form |
| --- | --- |
| on disk | `.yay` for records and config; Yaydown for documents |
| on the command line | SHON: `garden board post [ --id fix-a --role builder --title 'Fix A' ]` |
| between JavaScript and Rust | SHON request, YAY reply ([services.md](services.md)) |
| between services | plain data of the same eight types |

- **Reading** is upstream's JavaScript parser, vendored unchanged at
  `vendor/libyay/yay.js`.
- **Writing** is the garden's own (`stringify`): block form, keys sorted so
  two writers produce the same bytes, a multi-line string as a block when that
  is exact and quoted otherwise. Every document is parsed back before it is
  written, and refused if it does not read back equal: the tower's rule. One
  sample was checked against the tower's `binyay` 2.0.0 with
  `--check -f yay -t yay` and is canonical by it.
- **Yaydown** is split and joined here (`parseYaydown`), strictly, since
  upstream's JavaScript does not read it.
- **SHON in JavaScript** (`src/shon.js`) is the garden's own reading of
  `SHON.md`: null, booleans, numbers, strings, arrays, objects. Bytes and the
  file readers are refused. Its output was checked once against `binyay`,
  which read it as intended.
- **In Rust, the warden does not link `libyay`** (it would bring a C
  toolchain into the base image: [services.md](services.md)). It reads SHON
  and writes YAY with its own few lines, and `rust/conformance` tests them
  against upstream `libyay`'s `shon` and parser. So "embedding YAY" is, for
  now, embedding its notation and testing against its library, not linking
  it, on the Rust side.
- **Integers**: YAY keeps integers apart from floats and upstream gives them
  as `BigInt`. The garden converts a safe integer to a number on reading and
  refuses a larger one, because nothing it records needs more.

A command line is therefore a method call with one data argument, with no
flags to parse. The same call can later be an eventual send.

## Where the tooling comes from

Nothing for YAY is in the base image and nothing needs to be a capability:
the JavaScript parser is a vendored file on the shed, and the Rust crate is
used only by the conformance tests on a developer's machine. The `yay` command is
not used by the garden; it would be a capability if a job wanted it.

## Toward OCapN and Endo

Every record the garden keeps (jobs, the quiescence document, usage rows,
manifests, config, orders, receipts) is null, booleans, numbers, strings,
lists and records. All of that is expressible in the OCapN and Endo data
model as it stands, as copyable data, so these records and messages should
carry over with a change of encoding and not of shape.

What is *not* expressible as data, and is deliberately a name today: a
reference to a live thing. A claim says `host: "host-a"`; a job names its
steps by id; a service is found by its name on the command line. In the
destination each of those wants to be a capability (a reference that confers
the right to act), which YAY as found on upstream `main` cannot write.

## Status

Implemented and tested: round-trips, canonical output, awkward strings,
integer handling, Yaydown strictness, SHON round-trips and refusals
(`test/yay.test.js`, `test/shon.test.js`); `scripts/lint.sh` parses every
`.yay` file and every document's front matter on the shed.

## Open questions

1. **Where YAY and the OCapN model still differ**, as far as upstream `main`
   shows: YAY has no undefined, no symbol or selector, no tagged value, no
   error, and no capability or promise reference. The garden uses none of
   them. It *depends* on the gap in one place: names stand where references
   will be (above).
2. **Number or BigInt for integers.** Converting to numbers is convenient and
   is not what Endo does; at an Endo boundary integers should be BigInt
   again.
3. **Which YAY to track.** The vendored parser is upstream `main`; the tower
   runs a newer, tower-local `binyay`. If the garden should read Yaydown or
   check canonical form with the real tool, it needs the tower's changes
   upstream first.
4. **A JavaScript SHON and a JavaScript YAY writer upstream** would replace
   two of the garden's own files.
5. **One file per job with the body inside**, as the tower does, against a
   Yaydown file with the body as Markdown. The first is what is implemented.
