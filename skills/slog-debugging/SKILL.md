---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/slog-debugging"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Slog debugging

Purpose: read an Agoric slog (the SwingSet delivery and syscall log) and
its binary sibling, the flight recorder, to find why a vat delivery or
upgrade failed.

When an XS worker aborts, the slog carries the delivery-level error a bare
exit code does not. This is the reading procedure; what an XS fault means
at the engine level is the prior garden's `xs-debugging` skill, under
`reference/upstream/garden/skills/`.

Scope: agoric-sdk's SwingSet (`packages/swingset-*`,
`packages/cosmic-swingset`). Read-only analysis of your checkout and
captured state.

## What a slog is

SwingSet's structured, append-only record of everything the kernel does:
each delivery to a vat (`deliver`, `deliver-result`), each syscall a vat
makes, vat create and upgrade events, and worker lifecycle (`start-worker`,
crank boundaries). Each line is a JSON record with a `type` and an
increasing sequence. Usually you want the `deliver-result`, or the upgrade
outcome, that carries the failure.

- **Text slog**: JSON lines (`slog.json`, or wherever `SLOGFILE` points).
  Grep it.
- **Flight recorder** (`flight-recorder.bin`): a fixed-size circular binary
  buffer the kernel writes continuously, so the last events survive a crash
  even with no text slog. Often the only artifact after an abort.

## Keep the artifact

The commonest way to lose the evidence: the harness's `shutdown()` removes
its temporary database directory (`/tmp/testdb-*`) and the flight recorder
with it. Copy it out right after the failing crank, before shutdown:

```sh
cp "$(ls -t /tmp/testdb-*/flight-recorder.bin | head -1)" scratch/captured-flight-recorder.bin
```

## Finding the failure

1. **Count the signal.** For an XS overflow the delivery-level cause is
   `Stack meter exceeded`:

   ```sh
   grep -c 'Stack meter exceeded' <slog-or-recorder>
   ```

   A non-zero count on the failing vat's deliveries confirms XS value-stack
   exhaustion.
2. **Read the error record, not `JSON.stringify`.** It appears as
   `{"#error":"Stack meter exceeded","errorId":"error:liveSlots…"}`:
   SwingSet's rendering of XS `E_STACK_OVERFLOW` (exit 12) from
   `manager-subprocess-xsnap.js`. Holding the rejection as a JS `Error`, log
   `err.message` and `err.stack`. Never `JSON.stringify(err)`: it prints
   `{}` and hides the cause.
3. **Find the delivery.** Walk back from the error to the `deliver` that
   produced it: the `vatID`, the method, the incarnation and span bounds
   say which worker and what it was doing (a bundle import, a method). A
   transcript span that opens but stops short of its expected end is itself
   a sign of failure. A span opening is not success; only one reaching its
   full bounds is.
4. **Correlate the incarnation.** For an upgrade, read the current span's
   incarnation before and after
   (`transcriptStore.getCurrentSpanBounds(vatID).incarnation`). A new span
   opens in every case, failure included, so the outcome is the upgrade
   promise's resolution (rejected means failed) and the slog error, not the
   span opening.

## Procedure

1. Get the artifact: the text slog if one was enabled, otherwise the flight
   recorder, saved before teardown.
2. Grep for the failure class: `Stack meter exceeded` for XS overflow; more
   generally `#error` records and any `deliver-result` carrying an error.
3. Anchor it to the delivery: `vatID`, method, incarnation.
4. If it is an XS fault, go on to the engine reading (width or depth, and
   the remedy).

Adapted from the prior garden's `skills/slog-debugging`.
