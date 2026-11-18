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
   reason: "the migration needs the schema change first"
   steps:
     - body: "Say what to do and what it starts from: the branch, the commit, what is already proven."
       id: "fix-a-schema"
       title: "Change the schema"
     - after:
         - "fix-a-schema"
       id: "fix-a-migrate"
       title: "Run the migration"
   ```

   Each step is a job someone else will pick up cold: say what it starts from.
   Then say in `outbox/report.md` what is done and what remains. Your job
   waits on those steps and closes when they are done.
4. **At the final note, commit at once**, whatever state it is in, on your
   branch, with a message that says it is unfinished.

Never report an unfinished job as complete. A hand-off is a fine outcome; a
false completion is not.
