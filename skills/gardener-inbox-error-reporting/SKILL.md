---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/gardener-inbox-error-reporting"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Error reporting

Purpose: an unexpected failure is seen by someone who can act on it, not left
in a transcript nobody remembers to read. Whoever fails says so durably, with
the evidence attached and bounded.

The prior garden had every service and worker script trap its errors, commit
the transcript to the journal under its content hash, and append a section to
a host's gardener inbox. There are no inboxes here and no shell services; the
discipline carries over, the plumbing does not.

## In a job

When something fails that you did not expect (a tool crashes, a command the
job depends on errors, the checkout is not what the job said), and you cannot
work around it:

1. **Keep the evidence, bounded.** Save the failing command's output under
   `outbox/` (for example `outbox/failure.log`). If it is long, keep the
   beginning and the end and put a line between them saying how many bytes of
   the middle were left out: early setup and the final error both matter. Do
   not keep an empty file; write a line saying the output was empty. About
   64 KiB is enough; a transcript that is routinely megabytes is capturing
   too much.
2. **Say what failed, in `outbox/report.md`**, as its own section:

   ```markdown
   ## Failure: <what> during <stage>

   - Pull request: <owner/repo#n, or none>
   - Stage: <what you were doing>
   - Command: <what you ran>
   - Evidence: outbox/failure.log (<n> bytes, middle <m> bytes omitted)
   - Context: <one line>
   ```

3. **Do not report the job complete.** Either hand off
   ([wrap-it-up](../wrap-it-up/SKILL.md)) with the failure as the reason, or
   end with the job's work undone and say so. A failure noted is not a
   failure fixed.
4. **Do not retry blindly.** One retry of something plausibly transient, said
   in the report; then stop.

## Norms

- **Visible by default.** A failure that only lands in a log file has not
  been reported.
- **Name exactly the bytes a reader will see.** Truncate before you cite, so
  the size in the report is the size in `outbox/`.
- **One failure, one section.** Several distinct failures get several
  sections, in the order they happened.
- **No secrets in evidence.** If a transcript could hold a key or token, cut
  that part and say you did.

## Not built yet

- **A service's failures.** When a garden service (`src/`) throws
  unexpectedly in the supervisor's tick, nothing records its error with
  bounded evidence where a maintainer will see it. It would be the
  supervisor catching the error, keeping a bounded head-and-tail transcript,
  and noting it in the journal (`note(who, text)`) with the evidence beside
  it, once per distinct failure, from `src/supervisor.js`.
- **Surfacing a job's failure section.** The steward posts a job's report;
  it does not yet pick out failure sections for the maintainers.

Adapted from the prior garden's `skills/gardener-inbox-error-reporting`.
