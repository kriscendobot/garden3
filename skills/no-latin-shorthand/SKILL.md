---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/no-latin-shorthand"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# No Latin shorthand

Purpose: write the English, not the Latin abbreviation. Latin shorthand is
dense, shifts register, and assumes a reader with the writer's training. The
English reads directly to more people.

It covers what you write: code comments, designs, pull request bodies and
replies, commit messages, reports.

The maintainer's ask (kriskowal on `endojs/endo-but-for-bots#351`, 2026-06-02,
on a `cf.` in `packages/compartment-mapper/src/link.js`): "Please avoid Latin."

## Replacements

| Shorthand | Prefer |
| --- | --- |
| `cf.` | "see", "per" or "compare with", by intent: a pointer, a citation, a contrast |
| `i.e.` | "that is" |
| `e.g.` | "for example" |
| `etc.` | "and so on", "and similar", or enumerate the cases |
| `et al.` | "and others" |
| `vs.` | "versus", "compared to" |
| `viz.` | "namely" |
| `ad hoc` | "improvised", "case by case", or name the actual decision |

When the swap reads worse, restructure the sentence. `etc.` often means the
writer did not want to enumerate: if the list is short, write it out; if it is
long, name the category.

Read the sentence around it; the English often wants different punctuation:

- `Foo, e.g. bar.` becomes `Foo, for example bar.` or `Foo (for example, bar).`
- `Foo, i.e. bar.` becomes `Foo. That is, bar.` or `Foo (that is, bar).`
- `Foo, etc.` becomes `Foo and similar cases.`, or the list.
- `cf. § Bar` becomes `See § Bar.`

## `via`

`via` is assimilated English and acceptable. Notice the choice: if "through"
or "by way of" reads naturally, prefer it; if `via <channel>` is the cleanest
fit, keep it.

## Scope

- The maintainer's own writing, quoted verbatim, keeps its wording.
- Vendored and reference material is read-only.
- Fix existing prose **on encounter**, in a file you are already editing for
  another reason. This skill does not authorise a sweep.
- `vs.` in a compact label (a benchmark column header) is a judgment call.

Adapted from the prior garden's `skills/no-latin-shorthand`.
