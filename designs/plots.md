---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Plots and the shed

The tower's parapets and vestibule, in the garden's words. Code:
`src/plots.js`, `plots/genome-paths`.

## The words

| Tower | Garden | Is |
| --- | --- | --- |
| vestibule | **the shed** | what is the same for every job and changes only by review: the common brief, the dispatching and judging roles, all code, designs, config |
| parapet | **a plot** | one of several competing variants of the working roles, as branch `plot/<name>` |
| genome | genome | the paths a plot may hold and change: `plots/genome-paths`, plus `plot.yay` |

A job runs on one plot. It reads the common brief from the shed and its working
role from its plot, and what it learns it may write only into its plot's
genome. Plots that learn better lessons do better work; the shed is not
something a job can talk its way into changing.

## What is implemented

- **The rule** (`genomeEntries`, `isGenome`): an entry ending in `/` is a
  prefix; anything else is an exact file. The same rule as the tower's.
- **Cutting a plot** (`cut`): a parentless commit holding the shed's genome at
  some commit, plus `plot.yay`, becomes `plot/<name>`. Plots share no history
  with the shed or each other.
- **A job's view**: its slot's home is the shed with the plot's genome laid
  over it ([slots.md](slots.md)), which is what the tower's overlay of
  symlinks achieves for one shared user. The plot is chosen at dispatch: the
  job's `plot` if it names one, else by a hash of its id over the configured
  plots.
- **Confinement** (`land`, `wall`): at harvest, only files under the plot's
  genome paths are collected; a change a job made to anything of the shed's
  is not carried out at all. The collected files become one commit on the
  plot's branch if they pass the wall: inside the genome; no symbolic link; no
  `CLAUDE.md` or `AGENTS.md` (a harness would auto-load it); nothing
  executable outside `scripts/`; `plot.yay` only alone, in a commit titled
  `mutation: ...`.

## The wall is on the wrong side of the push, and why

The tower enforces the wall with a `pre-receive` hook on its local hub: a push
that breaks it is refused by the repository itself. GitHub runs no such hook.
So the garden enforces the wall where the push is made: a job has no
credential and cannot push ([keys.md](keys.md)), and `land` is the only code
that writes a plot branch. A host's steward could bypass it; so could anyone
with push access. A required status check on plot branches that re-runs
`wall` over each pushed range would restore a server-side refusal and is
design only.

## Ported from

`roles/PARAPET.md`; `scripts/vestibule/genome-paths`, `cut.sh`, `pre-receive`,
`overlay-links.sh`, `land.sh` (its cherry-pick landing reduced to one commit
of harvested files); `skills/vestibule-quarantine`; `designs/vestibule.md`.

## Not ported, adopt on demand

The tower's competition is most of `scripts/vestibule/`, and none of it is
here yet:

- **Trials and pairs** (`trial.sh`, `choose.sh`): running the same job on two
  plots against a private copy of the hub, then landing the winner and only
  the lessons of the loser.
- **Scoring** (`row.sh`, `score.sh`, `settle.sh`): a ledger of pairs, a
  Bradley–Terry ranking on price, time and quality, a judge for the pick.
- **Quarantine** (`invariants.sh`): checking each new plot commit for breaches
  and taking the plot out of dispatch.
- **Audit, salvage, eject** and the merge helpers for append-only files.

Without them the plots drift apart with nothing comparing them. That is
acceptable for a first instance with two plots, and it is the first thing to
adopt ([upstream.md](upstream.md)).

## Status

Implemented and tested: the rule, the wall, cut, land, refusal of a change
outside the genome, the other plot untouched (`test/plots.test.js`,
`test/slots.test.js`, `test/dispatch.test.js`).

## Open questions

1. **Shed and plot, or the tower's own words?** The maintainer said "perhaps".
   The mapping above is one to one, so switching is a rename.
2. **How many plots, and who cuts a new one.** Two are cut (`alder`,
   `birch`). The tower has four.
3. **Server-side enforcement** of the wall (above): worth a required check?
4. **Which paths are genome.** Three working roles and two skills to start.
   The steward and accountant are the shed's, as the tower keeps its liaison,
   foreman and accountant in the vestibule.
