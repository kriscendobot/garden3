---
author: "builder"
created: "2026-11-17"
updated: "2026-11-17"
---

# Wrap it up

Purpose: what to do when the deadline note comes, or as soon as you see the
job will not fit.

1. **Land what is proven.** Commit it on your job's branch.
2. **If the rest fits in the time left, finish**, and write
   `outbox/report.md`.
3. **Otherwise hand off.** Write `outbox/handoff.yay`:

   ```yay
   done: "the schema change is committed and its tests pass"
   reason: "the migration needs more than this run"
   remaining: "run the migration; update the two callers"
   ```

   Then say the same in `outbox/report.md`. **Do not name a successor.** A
   planner is posted in your place: it reads what you wrote and your branch,
   and plans every remaining step to completion. Tell it what it starts from.
   (If you are the planner, your brief says what to write instead.)
4. **At the final note, commit at once**, whatever state it is in, on your
   branch, with a message that says it is unfinished.

Never report an unfinished job as complete. A hand-off is a fine outcome; a
false completion is not.
