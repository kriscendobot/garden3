---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/verify-upstream-state-before-pinning"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Verify upstream state before pinning

Purpose: pin an external dependency, its version or its checksum only to
values read from the upstream itself, never to a remembered or quoted one.

A version or release date in a job or a review suggestion is often a guess
from training data, months stale. Committing it ships wrong metadata and can
silently mismatch a download cache.

1. Read the upstream's current release from the source: its release page,
   directory listing or downloads index. Name, date, URL, checksum.
2. Compute the sha256 from a fresh download; do not trust one from elsewhere.
3. Put the version and the checksum in workflow-level variables, so a bump is
   a two-line change.
4. Key any download cache by both version and checksum, so a stale blob
   cannot shadow a bump.
5. Cite the source (the listing or release URL) in the commit body.

A slot has no network. If the garden's library or the project's checkout does
not hold the upstream's current release, you cannot verify the pin: do not
commit a guessed value. Report the pin as unverified and name the URL to
check, so the steward or a maintainer can.

Done: a version and checksum that were read, not guessed, a cache keyed by
both, and a commit body citing where they came from; or a report saying the
pin could not be verified here.

Adapted from the prior garden's `skills/verify-upstream-state-before-pinning`.
