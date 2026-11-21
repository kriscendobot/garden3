---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/typist-friendly-code-points"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Typist-friendly code points

Purpose: write only characters a person can type. A glyph with no key on a
standard keyboard makes every later human edit harder: the maintainer cannot
retype it or grep for it from memory, and the text drifts into a mix of the
glyph and its ASCII spelling. Prefer the ASCII spelling from the start.

The maintainer's standing instruction (kriskowal, `endojs/endo-but-for-bots#124`,
2026-07-11): "Avoid code points that are difficult for a typist to maintain.
This is a standing instruction that should be in style guidance and observed by
automation in the jury selection process and automatically fixed." The example
was a design document that used rightwards arrows throughout its prose and
tables, where `->` types and reads as well.

It covers text you write: designs, READMEs and other markdown, code comments,
commit messages, pull request bodies and replies, reports. It targets symbols
and punctuation with an ASCII spelling. Accented letters in names and
loanwords (`Café`, `naïve`, a contributor's name) are spelling, not
typography, and stay.

## Replacements

Mechanical:

| Glyph | Code point | Type instead |
| --- | --- | --- |
| `→` | U+2192 | `->` |
| `←` | U+2190 | `<-` |
| `↔` | U+2194 | `<->` |
| `⇒` | U+21D2 | `=>` |
| `⇐` | U+21D0 | `<=` |
| `…` | U+2026 | `...` |
| `“` `”` | U+201C, U+201D | `"` |
| `‘` `’` | U+2018, U+2019 | `'` |
| `≤` | U+2264 | `<=` |
| `≥` | U+2265 | `>=` |
| `≠` | U+2260 | `!=` |
| `×` | U+00D7 | `x` in prose, `*` in an expression |
| `−` | U+2212 | `-` |
| (invisible) | U+00A0 no-break space | a plain space |

By reading:

| Glyph | Code point | Rewrite as |
| --- | --- | --- |
| `•` | U+2022 | a markdown `-` bullet at the start of a line; a comma or slash between inline items |
| `✓` `✔` | U+2713, U+2714 | `yes`, `[x]` or `PASS`, by what it asserts |
| `✗` `✘` | U+2717, U+2718 | `no`, `[ ]` or `FAIL`, by what it denies |

Two neighbors are handled elsewhere:

- **The em dash** (U+2014) is [em-dash-style](../em-dash-style/SKILL.md)'s.
  Its rewrite (a period, parentheses or a colon) is judgment, never a
  substitution.
- **The en dash** (U+2013) is tolerated in an existing numeric range. In new
  text prefer `80-100` or `80 to 100`. Existing ranges are not worth a sweep.

## Exemptions

- Quoting the maintainer or upstream material verbatim keeps its glyphs.
- Vendored and reference material is read-only.
- A string or fixture whose **value** is the glyph (a Unicode test, a locale
  string, interface text where the typographic character is the product)
  keeps it. The rule is about text a person maintains, not data a program
  checks.
- Fenced code blocks are exempt (they often capture output verbatim). An
  inline code span is exempt only when it quotes the glyph alone to talk
  about it, as this file's tables do. A span with a glyph among other text
  (a signature like `stmt.get(...args) -> object`) is content.
- A markdown file that must carry these glyphs opts out with
  `typist-code-points-exempt` in its first five lines.

Fix existing text **on encounter**: when you edit a file for another reason,
fix its glyphs in the same change. This skill does not authorize a sweep on
its own.

## Enforcement

1. **Guidance**: this skill.
2. **Review**: a reviewer flags these glyphs in a diff, in code and in
   markdown.
3. **The gate**: [pre-push-gates](../pre-push-gates/SKILL.md) checks the added
   lines of changed markdown, substitutes the mechanical set, and fails on the
   glyphs that need reading.

## Finding them

```sh
grep -nP "\x{2192}|\x{2190}|\x{2194}|\x{21D2}|\x{21D0}|\x{2026}|\x{201C}|\x{201D}|\x{2018}|\x{2019}|\x{2264}|\x{2265}|\x{2260}|\x{00D7}|\x{2212}|\x{00A0}|\x{2022}|\x{2713}|\x{2714}|\x{2717}|\x{2718}" path/to/file.md
```

## Pitfalls

- **Smart punctuation.** Editors turn `...` into an ellipsis and straight
  quotes into curly ones, and text copied from GitHub's web pages or
  `gh pr view` carries the typographic forms. Rewrite them when quoting into
  prose. Keep them inside a fence that captures output.
- **Mermaid is already ASCII.** Its edges (`-->`, `->>`) need no arrow glyph.
  An arrow in a Mermaid label is as avoidable as one in prose.
- **Do not corrupt quoted glyphs.** A document that discusses a glyph keeps it
  inside its code span.
- **The multiplication sign needs reading.** `x` in prose (`3x faster`), `*`
  in anything shaped like an expression.

Adapted from the prior garden's `skills/typist-friendly-code-points`.
