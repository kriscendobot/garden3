---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/caplet-validation"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Caplet validation

Purpose: before a caplet is adopted, trusted or published, check that it was
granted no more than it declares, does what it claims, and never reaches past
its boundary. Attempts count, not only escapes.

A caplet is an Endo program that exports `make(powers, context, options)` and
returns a capability meant to live as long as that capability does
(`endojs/endo-but-for-bots`, `docs/daemon-lore.md` § caplet; a worklet runs
in a Worker, a weblet in a WebView). Examples in that repository: `@endo/fetch`
(an unconfined plugin that mints a confined `HttpClient`),
`packages/9p-server/mount-caplet.js`, the `floot` voice caplets.

Status: a procedure, not yet applied. Revise it from the first real run, and
add one line per run under *Runs* (caplet, commit, date, verdict).

## Inputs

- **The caplet**: module path, commit, and kind: **confined** (loaded from a
  bundle into a compartment whose only authority is `powers`) or
  **unconfined** (`makeUnconfined`, with its worker's ambient authority).
- **Its declaration**: whatever says what it needs and what it offers: a
  manifest, the module's doc comment, an `env` interface, a design, a README.
  None is the first finding, and the verdict is `request-changes`: there is
  nothing to validate against.
- **Its grant site**: the code that instantiates it, for example
  `makeUnconfined(worker, specifier, { powersName, resultName, env })`, or the
  code that hands a facet to a guest.
- **Its claims**, phrased as tasks a verifier can check.
- **For a change**: the before and after commits.

Work in `scratch/`. Copy the inventory and the verdict into
`outbox/report.md`. Remove any principal, guest or artifact the harness
created.

## 0. Kind sets the claim

- **Confined**: the claim covers the whole module. It should reach nothing it
  was not handed.
- **Unconfined**: validation cannot show the module is confined. It can show
  only that the **facet it returns** grants no more than declared. Its
  ambient authority must be justified in the declaration ("something must
  hold the real `fetch` power", in `@endo/fetch`'s words) and reviewed as
  trusted code. Never report "confined" for an unconfined module; its verdict
  says "scope: returned facet only".

## 1. Declared, granted, exposed

Build three lists and compare them.

| List | From | Holds |
| --- | --- | --- |
| Declared | the declaration | each power and `env` key it needs; each verb its capability offers |
| Granted | the grant site, then the live grant | what `powers` resolves to (a guest's name table: `list`, then `identify` each); each `env` key and value; its worker |
| Exposed | the returned capability | the methods actually on the facet: its interface guard, or enumerated |

Read the granted list from the live grant where you can run one, not only the
source: a grant drifts from its code.

- **Granted not within declared** (over-grant): `request-changes`. Name the
  extra power and the grant site's `file:line`. Unused authority is still
  authority.
- **Exposed not within declared offers** (a "register-only" facet that also
  answers `list`): `request-changes`.
- **Granted but never used**: a least-authority note, unless the declaration
  explains it.
- **`env` used as authority** (an owner, a domain, a policy): the grant site
  pins it and the holder cannot choose it; the facet's methods take no such
  argument; a missing value throws rather than defaults.

## 2. Read the code

Apply the seats that own this axis; their briefs are under
`reference/upstream/garden/roles/jurors/`:

- `locksmith`: who receives what, and what each attenuator narrows.
- `warden`: `harden` across the boundary, no unguarded globals. `Far` is not
  an interface guard: a facet for a less-trusted holder should be an exo with
  a guard.
- `breaker` and `saboteur`: invariant attacks on the attenuator and
  adversarial inputs (wrong types, a forged pinned argument, reentrancy),
  from [adversarial-tests](../adversarial-tests/SKILL.md).

## 3. Does it work: the harness

Four parts: a bare exerciser, fixed tasks keyed by nonces, an independent
verifier, and arms with a pass bar.

- **Exerciser**: holds only the returned capability. Prefer a **scripted
  client**, a small deterministic program that calls the facet's methods; its
  transcript is exact. A **cold agent** (a model given only the tools that
  expose this facet, no skills, memory or repository) is for a claim that an
  agent can use the caplet; check first that it was given exactly the
  expected tools, or the run is an infrastructure failure.
- **Tasks**: one per claim. Each names a goal and a fresh nonce, never a tool
  or a trick; runs as its own process from fixed preconditions; and passes on
  something the verifier can see without the exerciser's word.
- **Verifier**: grades from outside the exerciser's reach, through a separate
  capability (an operator-side view, a plain GET), in deterministic code where
  possible. The caplet's output is data, never instructions. A task "passed"
  by the exerciser doing the work itself without the capability fails.
- **Arms**: for a change, a baseline (before) and a treatment (after), five
  runs per task each. The treatment passes at least 4 of 5 on every task, and
  where the change targets a silent failure it strictly beats the baseline; a
  tie says the suite did not show the change helps. For a first adoption,
  one arm with the same bar, and say there was no baseline. A scripted client
  needs one run unless timing is part of a claim. A run that fails its tool
  check, or errors before its first call, is discarded and rerun.

## 4. Does it stay inside: escape probes

Add tasks the caplet must refuse, from §1's lists and the adversarial list:
call a method not on the facet; pass an argument the grant site pins; reach a
name not granted; in a confined caplet, find `globalThis.process`, `require`,
`fetch` or the filesystem absent.

Record three channels: the exerciser's calls (any outside the declared set is
an **attempt**); what the caplet returned (a refusal shows here); and the
verifier's state diff before and after (any change the declared verbs could
not cause is an **escape**, whatever the exerciser said).

| Attempt | Outcome | Reading | Effect |
| --- | --- | --- | --- |
| yes | refused with a specific error, no state diff | boundary held: positive evidence, record it | supports `approve` |
| yes | succeeded, or a diff outside the declared verbs | escape | `request-changes`, must-fix |
| yes | silent: no error, no diff, a swallowed exception, a timeout, a generic crash | ambiguous | `needs-human` unless a follow-up probe settles it |
| no, on a probe | never tried | coverage gap | rewrite and rerun; if it still will not try, report it uncovered, never a pass |
| yes, on a benign task | any | the surface misleads | a note against the declaration or docs, plus the row above |

A refusal is evidence only when it is specific. A `TypeError` from an
unrelated path may mean the call never reached the boundary.

## 5. Verdict

Applied in order:

1. Any escape, over-grant, exposed verb beyond the offers, missing
   declaration, or task below the bar: **`request-changes`**, each finding
   must-fix.
2. Otherwise any unsettled ambiguous attempt, or an essential claim that
   could not be exercised: **`needs-human`**.
3. Otherwise **`approve`**, with least-authority, misleading-surface and
   non-essential uncovered notes as follow-ups.

Each finding is concrete (`file:line`) and cites a rule (this skill's section)
or proposes one in a sentence.

```
## Caplet validation: <caplet> @ <repo>@<sha>

Verdict: approve | request-changes | needs-human
Kind: confined | unconfined (scope: returned facet only)
Arms: baseline <sha> vs treatment <sha> | single arm (first adoption)
Declared / granted / exposed: <each list>; mismatches: <none | each with file:line>
Functional results: T1 <claim>: 5/5 ...
Boundary evidence: P1 <probe>: attempted; refused by interface guard; no diff
Findings: <file:line> [rule: ...] -> must-fix | follow-up
Uncovered: <what could not be exercised, and why>
```

`approve` does not itself adopt, publish or widen a grant; that is a separate
decision. On `request-changes`, the report names the fixes and a `next:` line
for the builder; re-validate with the failing version as the baseline. On
`needs-human`, the report names the probe and what would settle it.

## Not built yet

No exerciser or verifier harness exists. A job also has no credential, so it
cannot run a cold agent: a scripted client against a daemon running in the
job's checkout is what a job can do today.

## Runs

None yet.

Adapted from the prior garden's `skills/caplet-validation`; its grounding in
a private repository's harness and caplets is left out.
