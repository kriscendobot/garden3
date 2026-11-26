#!/bin/bash
# lint.sh — every static check the garden has, in one place. Exit nonzero if
# any failed. A tool that is not installed is reported as SKIPPED, by name,
# never silently passed over.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
rc=0
note() { printf '%-28s %s\n' "$1" "$2"; }

for f in src/*.js src/powers/*.js bin/*.js test/*.js; do node --check "$f" || rc=1; done
note "node --check" "$([ $rc = 0 ] && echo ok || echo FAILED)"

shells="entrypoint.sh garden scripts/shards/seed/main/wizard scripts/shards/bootstrap.sh scripts/lint.sh"
for f in $shells; do bash -n "$f" || rc=1; done
note "bash -n" "ok ($shells)"
if command -v shellcheck >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  if shellcheck $shells; then note shellcheck ok; else note shellcheck FAILED; rc=1; fi
else
  note shellcheck "SKIPPED: not installed (the shellcheck capability is not pinned yet)"
fi

if command -v cargo >/dev/null 2>&1; then
  ( cd rust && cargo fmt --check ) && note "cargo fmt --check" ok || { note "cargo fmt --check" FAILED; rc=1; }
  ( cd rust && cargo clippy --offline --quiet --all-targets -- -D warnings ) && note "cargo clippy" ok || { note "cargo clippy" FAILED; rc=1; }
  # The conformance crate's build scripts and proc-macros run on the host: they
  # need the host's standard library and a C linker, which the box does not have
  # (designs/services.md).
  hostlib="$(rustc --print sysroot)/lib/rustlib/$(rustc -vV | sed -n 's/^host: //p')/lib"
  if [ -d "$hostlib" ] && command -v cc >/dev/null 2>&1; then
    ( cd rust/conformance && cargo fmt --check && cargo clippy --offline --quiet --all-targets -- -D warnings ) && note "conformance fmt, clippy" ok || { note "conformance fmt, clippy" FAILED; rc=1; }
  else
    ( cd rust/conformance && cargo fmt --check ) && note "conformance fmt" ok || { note "conformance fmt" FAILED; rc=1; }
    note "conformance clippy" "SKIPPED: no host standard library or C linker here"
  fi
else
  note cargo "SKIPPED: not installed"
fi

# Documents on the shed carry strict YAY front matter; data files are YAY.
node --input-type=module -e '
import fs from "node:fs";
import { parse, parseYaydown } from "./src/yay.js";
let bad = 0;
// Only what git lists is read: the tree also holds slot homes that belong to
// other accounts and cannot be walked.
const skip = rel => rel.split("/").some(s => ["node_modules", "target", "vendor"].includes(s) || s.startsWith(".tmp-"));
const mine = fs.readFileSync(0, "utf8").split("\n").filter(rel => rel && !skip(rel) && fs.existsSync(rel));
for (const rel of mine) {
  try {
    if (rel.endsWith(".yay")) parse(fs.readFileSync(rel, "utf8"), rel);
    else if (rel.endsWith(".md") && (!rel.startsWith("scripts/shards/seed/") || rel.startsWith("scripts/shards/seed/main/"))) parseYaydown(fs.readFileSync(rel, "utf8"), rel);
  } catch (e) { bad += 1; console.error(`${rel}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);
' < <(git ls-files --cached --others --exclude-standard) && note "YAY and front matter" ok || { note "YAY and front matter" FAILED; rc=1; }

# The garden writes American English, without Botese. The lists themselves,
# and the test that quotes them, are what name the words.
node --input-type=module -e '
import { makeProse, parseLists, SKILL } from "./src/prose.js";
import { makeFiles, run } from "./src/powers/node.js";
import fs from "node:fs";
const lists = parseLists({ divergences: fs.readFileSync(`${SKILL}/divergences.tsv`, "utf8"), cliches: fs.readFileSync(`${SKILL}/cliches.tsv`, "utf8") });
const leave = f => f.startsWith(`${SKILL}/`) || f === "test/prose.test.js" || !fs.existsSync(f);
const hits = makeProse({ files: makeFiles(process.cwd()), run, lists }).check(...fs.readFileSync(0, "utf8").split("\n").filter(f => f && !leave(f)));
for (const h of hits) console.error(h);
process.exit(hits.length ? 1 : 0);
' < <(git ls-files --cached --others --exclude-standard) && note "American English" ok || { note "American English" FAILED; rc=1; }
exit $rc
