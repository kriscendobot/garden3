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
else
  note cargo "SKIPPED: not installed"
fi

# Documents on the shed carry strict YAY front matter; data files are YAY.
node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
import { parse, parseYaydown } from "./src/yay.js";
let bad = 0;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => [".git", "node_modules", "target", "vendor"].includes(e.name) || e.name.startsWith(".tmp-") ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mine = new Set(fs.readFileSync(0, "utf8").split("\n").filter(Boolean));
for (const f of walk(".")) {
  const rel = f.replace(/^\.\//, "");
  if (!mine.has(rel)) continue;
  try {
    if (rel.endsWith(".yay")) parse(fs.readFileSync(f, "utf8"), rel);
    else if (rel.endsWith(".md") && (!rel.startsWith("scripts/shards/seed/") || rel.startsWith("scripts/shards/seed/main/"))) parseYaydown(fs.readFileSync(f, "utf8"), rel);
  } catch (e) { bad += 1; console.error(`${rel}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);
' < <(git ls-files --cached --others --exclude-standard) && note "YAY and front matter" ok || { note "YAY and front matter" FAILED; rc=1; }
exit $rc
