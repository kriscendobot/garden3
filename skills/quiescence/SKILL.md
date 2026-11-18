---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Quiescence

Purpose: call, follow and, if needed, unstick a coordinated restart. Design:
[quiescence.md](../../designs/quiescence.md).

```sh
garden quiescence status
garden quiescence call [ --id q-2026-11-24 --hosts [ host-a host-b ] --shed <40-hex commit> ]
garden quiescence markAbsent <host>     # give up on a host that has not answered
garden quiescence truncateAll           # a dry run: says what it would rewrite
```

1. Only the leader's host, or a maintainer, calls one. Name the shed commit
   every host is to move to; it must be an ancestor-descendant of what they run.
2. Hosts stop claiming at once and acknowledge when their jobs have ended.
   `status` shows who is awaited. Do not kill jobs to hurry it.
3. The leader's supervisor consolidates and truncates by itself in the
   `truncate` phase. `truncateAll` without `apply` only describes.
4. If a host reports drift at `verify`, the fleet stays quiesced: fix that
   host (`garden capabilities sync`), let it acknowledge again.
5. A host that was away catches up by itself before it claims.

Truncation rewrites shared history. Never run it with `apply` by hand outside
the `truncate` phase; the service refuses, and that refusal is the point.
