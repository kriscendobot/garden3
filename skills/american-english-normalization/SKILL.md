---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/american-english-normalization"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# American English normalization

Purpose: keep the bot's prose on a project in American spelling and free of
Botese, using two curated lists that a plain search can check exhaustively.

Two lists, beside this file:

- [divergences.tsv](divergences.tsv): British spellings and their American
  replacements. Columns: `category`, `british`, `american`, `notes`.
- [cliches.tsv](cliches.tsv): Botese phrases and what to write instead.
  Columns: `category`, `phrase`, `suggestion`, `notes`, `scope`.

"Botese" is the maintainer's word for the clichés a model reaches for in place
of saying the thing: "this is the *seam* where", "the *load-bearing*
invariant". The maintainer asked for both (endojs/endo-but-for-bots#282, on
British spellings; #1281, on Botese): find them deterministically, then fix
them.

## Scope

- **The bot's own source and prose on a project whose maintainer asked for
  it**, as endojs/endo-but-for-bots's did. The prior garden applied it to its
  own roles and designs as well; this shed's prose does not follow it yet, so
  a maintainer decides before it is applied here.
- **Not external contributors.** On someone else's pull request the project's
  own rules apply; a finding there is dropped.
- **Never:** identifiers, upstream APIs, quoted text, fixtures, generated
  output, vendored files, or records already written.

## Precision over recall

A false positive that rewrites a real word is worse than a missed one, so both
lists are allow-lists of literal entries, never patterns or suffix rules.

- **Spellings are whole words, every form its own row:** `serialise`,
  `serialised`, `serialising`, `serialiser`, `serialisation` are five rows.
- **Never add an always-`-ise` word:** `surprise`, `advertise`, `exercise`,
  `comprise`, `advise`, `arise`, `compromise`, `disguise`, `franchise`,
  `improvise`, `merchandise`, `supervise`, `televise`.
- **Never add an `-re` or `-our` false friend:** `genre`, `acre`, `massacre`,
  `mediocre`, `macabre`, `ogre`; `contour`, `velour`, `glamour`, `devour`,
  `four`, `hour`, `pour`, `tour`, `your`.
- **SI units keep `-re`** (`metre`, `litre`): international technical writing
  uses them.
- **Botese entries are phrases, not words.** "Seam" and "load-bearing" have
  real uses (a load-bearing wall, a fabric seam, Feathers' testing seam); only
  the cliché construction (`load-bearing invariant`, `seam where`) is listed.
  The one exception: a row with scope `pr-metadata` may be a bare word,
  because it applies only to a pull request's title and description.

## Checking your change

List the candidates in the lines your change adds:

```sh
git diff -U0 <base> -- . | grep '^+' | grep -v '^+++' > scratch/added.txt
grep -v '^#' skills/american-english-normalization/divergences.tsv \
  | cut -f2 | grep . > scratch/british.txt
grep -niwF -f scratch/british.txt scratch/added.txt
grep -v '^#' skills/american-english-normalization/cliches.tsv \
  | awk -F'\t' '$5 != "pr-metadata" { print $2 }' | grep . > scratch/botese.txt
grep -niwF -f scratch/botese.txt scratch/added.txt
```

Matching ignores case. A phrase split across two lines is missed; a
compound (`colourblind`) is missed unless it has its own row.

Then judge each hit:

- **A real divergence or cliché in prose, a comment, a string or a document:**
  fix it. A spelling is a word swap that keeps the case (`Colour` to `Color`).
  A Botese fix is a rephrase following the row's `suggestion`, so the phrase
  is gone, not substituted.
- **An identifier, an upstream name, a quotation, a fixture:** leave it, and
  say why in your report.
- **A real one the list lacks:** fix it, and propose the row in your report.

Repeat until every remaining hit is one you chose to leave.

## Curation

The lists grow only by literal rows, and each addition is reviewed by a
maintainer. A worker proposes; it does not widen the shipped list. Add every
inflected form as its own row, and check the new row against the exclusions
above.

## Not built yet

- **A deterministic check:** a `make*(powers)` module in `src/` that reads
  both lists and a diff and prints `<path>:<line>: <found> -> <replacement>`,
  called from the lint run or a review step, so no one has to remember this.
- **A review seat** that judges each hit as above and posts a job to fix the
  real ones. The prior garden's were the orthographer and thesaurus seats and
  the americanizer and deslopper roles.

Adapted from the prior garden's `skills/american-english-normalization`, with
`skills/botese-normalization` folded in.
