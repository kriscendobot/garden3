---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/ownership-map"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Ownership map

Purpose: make a design that spans more than one component or layer state,
before review, who owns each responsibility at every boundary, so a
responsibility given to the wrong layer is visible on the page.

## Why

A design for Ironhorse panic handling (endojs/endo-but-for-bots#1018) put an
engine-side `CrankOutcome` at the `Machine` boundary and described the
engine worker as owning transcript state, while other prose gave the
supervisor durable release, discard, restart and replay. Six review rounds
checked local consistency and missed it. A crank is the supervisor's commit
unit; the engine only evaluates and runs to quiescence. The correction renamed
the type `ExecutionOutcome`. A map written first would have shown the
conflict.

## When

Any design that spans two or more components or layers: an engine and its
supervisor, a mechanism and a store, a client and a server, an inner runtime
and an outer coordinator. A design inside one layer owes none. When in doubt,
write it; it is cheap.

## The section

A `## Ownership map` in the design, with one row per boundary:

| Column | What it records |
| --- | --- |
| Boundary | the two sides (`engine → supervisor`) |
| Mechanism | what each side does, without policy |
| Policy | who decides: commit or discard, retry or fail, admit or reject |
| Durable state | who owns each persistent datum: one side per datum |
| Lifecycle and commit | who owns restart, replay and the commit decision |
| Value crossing | the value that crosses, and whose vocabulary names it |

Under the table, answer for the whole design:

1. Who owns durable state? If two layers touch a datum, name the one owner
   and the other's read or derived role.
2. Who owns the commit or discard decision?
3. Who owns restart and replay?
4. Who classifies how execution ended (committed, threw, terminated), as
   distinct from who decides what to do about it?

## Inner and outer names

An inner mechanism must not be named for an outer layer's lifecycle. Walk the
design's type and API names and flag any inner result, handle, status or
context named with an outer word: crank, commit, transaction, snapshot,
replay, embargo, checkpoint, rollback, durable, persist. `CrankOutcome` to
`ExecutionOutcome` is the example.

## Notes

- The map stays in the design after it lands; it is the boundary's statement,
  not review scratch.
- A reviewer reconstructs the same map and challenges it. A design with a
  clear map is not penalised for naming several layers; one whose ownership
  is only implicit is the shape to send back.
- Keep it to one screen. A map that needs many rows says the design should
  split.

Adapted from the prior garden's `skills/ownership-map`.
