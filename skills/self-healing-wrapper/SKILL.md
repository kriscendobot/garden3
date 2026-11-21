---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/self-healing-wrapper"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Self-healing wrapper

Purpose: when something that runs unattended fails, keep the evidence, hand
it to a responder that knows what that thing does, and turn the diagnosis
into work someone will drain, instead of dying quietly or being restarted
without a word.

This is for whoever builds or changes a garden service (the supervisor's
ticks, the watcher, dispatch), and for a job that diagnoses one. It names a
pattern; the capture half is
[prompt-on-failure-capture](../prompt-on-failure-capture/SKILL.md).

## Three layers, none replacing another

- **Restart** re-runs the thing. It diagnoses nothing.
- **A fleet-wide scan** of logs, if there is one, is the net of last resort:
  late, coarse, one generic prompt for every failure.
- **The wrapper** is per task and immediate: it knows what this tick was
  doing, keeps this failure, and asks a responder fit for this shape.

## When to wrap

All of these hold:

- It runs unattended: nobody watches its errors as they happen.
- A failure is something an agent could classify, fix or turn into a job.
- The failure output is worth more than one line: a transcript, a trace, a
  handler's full output.

Do not wrap a pure compare-and-swap primitive (a board push, a claim, a
cursor) whose only failure is contention: its retry on rejection is the
healing. Capture without a responder where that fits.

## The three parts

1. **Capture.** Before the failure is reported or the process ends, write
   the output to a content-addressed artifact and carry only its hash
   forward. Identical failures hash identically. Tell expected exits (a
   clean stop, a signal from the supervisor) from unexpected ones, so a
   shutdown is not escalated.
2. **Respond.** Give a responder a small brief: who failed, the work item
   (job id, pull request, watch), the state it was in, the exit or error,
   the capture's hash, and one line of context, with the command that reads
   the capture. Never inline the capture: the responder reads only the
   slices it needs. Its role is specific to this failure (a watcher
   classification responder for the watcher; a dispatch debugger for
   dispatch), not a generic one.
3. **Route.** The diagnosis goes somewhere drainable: a job posted to the
   board (`garden board post`) when the fix is a unit of work, or a note
   for the maintainer when it is not. Not only to a log nobody reads.

## Disciplines

- **Known hash, no call.** Before invoking a responder, look the capture's
  hash up among past classifications. Seen before: apply the old
  disposition and skip the model. Recurring flakes then cost nothing.
- **Throttle hard.** At most one responder per (context, error) signature
  per window (the prior garden used thirty minutes), and a daily cap (it
  used twelve), with the state kept outside the failing thing, so a crash
  loop can never spawn a model every few seconds. A pool of identical
  workers shares one context, so a fleet-wide crash is throttled once.
- **Best effort.** Every branch of the wrapper falls back to doing nothing.
  Healing must not become a new failure of what it heals. Bound the
  responder with a timeout, and when it ends for any reason, reap its whole
  process group: a responder left running after its wrapper died kept
  failing the prior garden's restarts.
- **Bound the handler too.** A handler wedged on a hung network call should
  be stopped well inside the outer timeout, and that stop read as a clean
  offline exit, not a failure to diagnose. A long-lived loop is bounded only
  by its own lifetime.
- **Keep the failure visible.** The wrapper diagnoses; it does not hide.
  Preserve the error or exit status so the layers outside still see it.
- **Silent on success.** Nothing on the happy path. A wrapper that narrates
  every good run is noise.
- **Do not swallow what you mean to heal.** The prior garden's worst finding
  was a supervisor that wrote "exited non-zero" and completed the failed job
  as done, discarding the handler's output. Capture first; decide after.
- **A refused responder is not a diagnosis.** When the model answers with a
  quota or usage-limit refusal, do not escalate that text as the unit's
  diagnosis: the prior garden sent 94 near-identical maintainer notes in four
  days that way. Record one fleet-level notice for the condition, amended on
  each occurrence and closed when a responder next answers; the unit's
  capture stays addressable.
- **Reachability.** A capture another host must read has to travel: in a
  committed record, or under a ref that is pushed. Naming a hash in text is
  not enough. Keep a capture indefinitely only if it holds no secrets.

## Not built yet

A wrapper around the supervisor's service ticks: capture, a known-hash
table, a throttled responder, routing to the board. It would be a
`make*(powers)` module in `src/` used by the supervisor
([designs/services.md](../../designs/services.md)).

Adapted from the prior garden's `skills/self-healing-wrapper`.
