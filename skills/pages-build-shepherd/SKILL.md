---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pages-build-shepherd"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pages build shepherd

Purpose: bring a GitHub Pages build and deploy back to green after a push:
the [shepherd](../../roles/shepherd/AGENT.md) applied to a branch push with
no pull request.

On GitHub, every push to a Pages source branch runs the built-in
`pages-build-deployment` workflow: a **build** job makes the artifact from
the source directory, then a **deploy** job publishes it. The run fails if
either does. Content a site fetches at runtime from another branch does not
trigger a rebuild; only a push to the source branch does.

## What you are given

The failing run's URL, head commit and conclusion in the job's body; under
`inputs/`, the runs on that branch (`inputs/checks.yay`) and the failed
jobs' log tails (`inputs/logs/<job>.log`); and the repository through
`garden project add`.

## Procedure

1. **Check the state you were given is still the state.** If a newer run on
   the branch is green, or a newer push replaced the failing commit, there is
   nothing to fix: report `next: none` and name the green run.
2. **Classify the failure** from the log tails:
   - **A transient deploy failure**: the deploy job failed with a GitHub-side
     message such as `Deployment failed, try again later.`, and the build job
     succeeded and uploaded its artifact. Not a code problem. Report
     `next: rerun` with the run; no commit.
   - **A content or build error**: the build job failed: a malformed file in
     the source directory, a broken or absolute asset path, an artifact too
     large, a Jekyll or Liquid error if Jekyll is on. This is a code problem.
     Make the smallest fix that makes the build pass, one concern per commit,
     on your job's branch. Check what you can locally: the referenced assets
     exist and paths resolve under the source directory.
   - **A configuration or permission impasse**: the Pages source branch, the
     build type, the deploy token or its permissions. Settings the garden
     cannot change from a job. Do not guess: report `next: maintainer` with
     exactly what you saw.
3. **Report**: the failing run, `flake`, `content-error` or
   `config-impasse`, what you did, and `next:`.

## Norms

- Never disable a Pages check or add `continue-on-error` to force green.
- Never delete site content to make a build error disappear: fix the
  content.
- Touch only the Pages source directory.

## Notes

- A job keyed on the failing head commit makes a second look at the same red
  commit a no-op, while the fix (a new commit) gets a new run and, if that
  fails, a new job: a repair never collides with its predecessor.

Not built yet: the steward watching Pages runs and posting this job, fetching
the runs and log tails into `inputs/`, rerunning a failed run, and pushing a
fix to the source branch then watching the new run to green. The garden's own
Pages board was dropped ([designs/hosts.md](../../designs/hosts.md)), so this
applies only to a project that publishes with Pages.

Adapted from the prior garden's `skills/pages-build-shepherd`.
