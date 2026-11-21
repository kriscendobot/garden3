---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/prompt-on-failure-capture"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Prompt on failure, by capture

Purpose: let deterministic code hand a step it cannot resolve to a model,
without pasting a large log into the prompt: store the log by its hash,
name the hash in a small brief, and let the responder read what it needs.

The capture half of the [self-healing-wrapper](../self-healing-wrapper/SKILL.md).

## When to use

- A service reaches a state its plain-code predicate cannot resolve. The
  prior example: a review verdict that reads "almost approve, with one
  footnote", which a predicate cannot place.
- A watcher meets an event its filter cannot classify.
- A helper fails in a way the surrounding code cannot interpret.

When the predicate succeeds, the code goes on by itself. This is the escape
hatch, not the default.

## Procedure

1. **Capture.** Write the failure context (a log, a payload, a diff, a
   verdict body) to a content-addressed store and keep its hash. In git:
   `git hash-object -w --stdin < failure.log`. Identical inputs give
   identical hashes.
2. **Short-circuit on a known hash.** Look the hash up in the service's
   table of past classifications. A hit: apply the recorded disposition and
   skip the model. The match is exact: a log differing by one timestamp
   hashes differently and goes on.
3. **Brief.** Fill the slots, plus the hash and one paragraph of context:

   ```
   You are classifying an escalation from <service>.

   Work item:  <pull request, job id, or "(none)">
   Design:     <path, or "(none)">
   Role:       <the role that escalated>
   State:      <the state it was in>
   Capture:    <hash>

   Context: <one paragraph a person wrote for this case>

   Read the capture on demand, narrowing with a pipe; never inline it:
     git cat-file -p <hash> | tail -n 200

   Reply with one record naming the classification and the next action.
   ```

   Some uses add a slot (the prior pull requests a design depends on; a
   conflict's parent commits).
4. **Invoke** the responder with the brief. Its cost is bounded by the
   brief, not the capture.
5. **Apply and remember.** Apply the answer, then record hash to
   classification so the next identical capture skips the model.

## Notes

- **Keep or let go.** An unreferenced blob is collected after git's grace
  window. Keep one (under a ref) only when it is worth revisiting: a
  recurring flake to turn into a test, a classification worth reusing, a
  case someone flagged.
- **Across hosts.** A blob written to one clone is not on any other. A
  responder elsewhere needs it committed in a pushed tree, or under a pushed
  ref it asks for by name. Naming the hash in a committed file does not
  carry the blob: the prior garden lost transcripts that way.
- **Secrets.** A capture keeps whatever leaked into it. Never keep one
  indefinitely unless it is safe to.
- **The prompt stays small.** Inlining the log brings back the cost this
  removes.

Not built yet: a capture store and classification table for the garden's
services; it belongs with the self-healing wrapper in `src/`.

Adapted from the prior garden's `skills/prompt-on-failure-capture`.
