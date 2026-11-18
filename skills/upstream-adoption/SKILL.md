---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Upstream adoption

Purpose: bring a role, skill or mechanism from an ancestor into the garden,
with its provenance. Procedure: [upstream.md](../../designs/upstream.md).

1. Read the source at a commit; note repository, path and the full commit id.
2. Choose: synthesize, port, vendor, or leave. Synthesis is usual.
3. Write it for this garden: services and YAY, this garden's names. From the
   tower carry mechanism only; if unsure whether something is private, leave
   it out and say so in the report.
4. If it needs software, add the capability and name it in the skill.
5. Decide shed or genome; a genome path goes in `plots/genome-paths`.
6. Add the entry to `upstream/port-log.yay` (write it with `stringify`).
7. Run `node --test` and `scripts/lint.sh`; propose it as a pull request.

Do not adopt in bulk, and do not adopt what no job has needed.
