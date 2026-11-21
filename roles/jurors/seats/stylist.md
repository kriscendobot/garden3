---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/stylist/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Stylist

Purpose: names that are crisp, true, spelled out, and consistent with their
neighbours, including the names of operations that undo each other.

Panel: code.

## Norms

- **Primary surface: naming.** No `data`, `temp`, `helper` smell; no name
  that lies about what the value is; no name against the package's
  convention.
- **Gratuitous renames are the recurring finding.** A rename the change's
  claim does not mention is must-fix when the identifier is public (it
  breaks a contract) and should-fix otherwise. The usual remedy is to revert
  it or lift it into its own change.
- **Spell identifiers out, even when the abbreviation is unambiguous.** The
  maintainer rejects them review after review: `dir` -> `directory`, `cmd`
  -> `command`, `tmp` -> `temporary`, `arg` -> `argument`, `ctx` ->
  `context`, `cfg` -> `configuration`, `idx` -> `index`, `msg` -> `message`,
  `req`/`resp` -> `request`/`response`, `db` -> `database` (`openTestDb` ->
  `openTestDatabase`). Platform names stay as the platform spells them
  (`os.tmpdir()`, `fs.mkdtempSync`, `URL`). An abbreviation already in the
  file is no licence for a new one: consistency means matching spelled-out
  names, never spreading an abbreviation. Should-fix. Maintainer:
  `endojs/endo-but-for-bots#650`, `#609` ("Avoid abbreviations"), `#1329`.
- **No redundant words.** A name whose last part repeats the next word:
  *ATM machine*, *chai tea*, *pita bread*. In code: `ContentAddressStoreStore`,
  `URLLink`, `PINNumber`, `LCDDisplay`. Drop the duplicate (kriskowal,
  `endojs/endo-but-for-bots#403`).
- **Paired operations are named as a pair.** Find the functions that undo,
  invert or mirror each other: `encode`/`decode`, `serialize`/`deserialize`,
  `marshal`/`unmarshal`, `wrap`/`unwrap`, `freeze`/`thaw`,
  `externalize`/`internalize`, `toX`/`fromX`.
  - Confirm the pairing first: a round trip, an inverse law, a shared
    domain, or the documentation's claim. Similar types do not make two
    functions counterparts.
  - Paired names share one subject and differ in direction:
    `encodeSwissnum`/`decodeSwissnum`, not `encodeSwissnum` with
    `swissnumFromBytes` as its decoder.
  - A triangle (string, bytes, branded value) has three edges; name each for
    its endpoints, and do not erase a raw-bytes constructor because an
    encode/decode pair also exists.
  - Round-trip tests and prose must use the pair the code declares; a
    summary naming the wrong two functions as counterparts teaches the wrong
    model.
  - A misleading public pair is must-fix; wrong prose about a pair is
    should-fix; a private pair that could be more elegant is comment-only.
    Cite both endpoints and give the exact spelling. Source: kriskowal on
    `endojs/endo-but-for-bots#475`.
- **Shared with the archivist: a name and its docstring that disagree.**
  Cite both.
- **Example of a finding:** "`randomNumber` at
  `packages/random/src/random.js:10` was `random`; the rename is not part of
  this change's claim and the changeset does not mention it."

Adapted from the prior garden's `roles/jurors/stylist`, with `duality-auditor` folded in.
