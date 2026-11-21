---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/no-comment-banners"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# No comment banners

Purpose: never draw decorative rules in code comments, and catch them in
review.

## The rule

A **banner** is a comment line whose body is a run of repeated punctuation
used as a separator, not prose:

```js
// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------
```

Forbidden, in a `//`, `#`, `/* … */` or JSDoc ` * ` comment:

- a body that is four or more of `- = * ~ _` and nothing else;
- a title bracketed by two or more of those on both sides:
  `// --- Fallible work, before the consume ---`, `# === Setup ===`;
- rule lines of `#`, `/` or `+` (`##########`, `//////////`,
  `# +--------+`);
- any Unicode box-drawing or block-element character (U+2500 to U+259F):
  light, heavy or double rules, block rules, boxes framing a title. One such
  glyph in a comment makes it a banner; those characters only draw line art.

Keep the title as a plain comment and delete the rules:

```js
// Section title.
```

The maintainer's reason (`endojs/endo-but-for-bots#503`): banner rules are
"inevitably inconsistent with a human maintainer in the loop." Nobody redraws
the ruler to the same width or agrees on the character, so the decoration
drifts the moment a person edits the file and reads as machine noise. ASCII
box diagrams were retired for the same reason.

## Not a banner

- A directional arrow (`// foo -> bar`) or prose containing a dash
  (`// foo -- bar`). The bracketed shape needs a run at both ends.
- A Markdown thematic break (`---`) dividing prose in a `.md` file.
- Dashes inside a fenced block of sample output or data.
- A banner in a file the change does not otherwise touch. Do not open a diff
  to delete one; sweep only files you are already editing.

## Sweep a file you are editing

```sh
grep -nE '^[[:space:]]*(//|#|\*)[[:space:]]*[-=*~_]{4,}[[:space:]]*$' FILE
grep -nE '/\*[[:space:]]*[-=*~_]{4,}[[:space:]]*\*/' FILE
grep -nE '^[[:space:]]*(//|#|\*)[[:space:]]*[-=*~_]{2,}[[:space:]]+[^-=*~_[:space:]].*[[:space:]][-=*~_]{2,}[[:space:]]*$' FILE
grep -nE '/\*\*?[[:space:]]*[-=*~_]{2,}[[:space:]]+[^-=*~_[:space:]].*[[:space:]][-=*~_]{2,}[[:space:]]*\*/' FILE
grep -nE '^[[:space:]]*(//|#|\*)[[:space:]]*[-=*~_#/+]{4,}[[:space:]]*$' FILE
LC_ALL=C grep -nE $'(^[[:space:]]*[#*]|//|/\\*).*\xe2(\x94[\x80-\xbf]|\x95[\x80-\xbf]|\x96[\x80-\x9f])' FILE
```

Delete each rule-only line. For a bracketed title, strip the runs from both
ends and keep the title, punctuated as a sentence.

## In review

On a diff, the same patterns over the added lines of code files (JS, TS,
shell): `git diff <base>...HEAD -U0 | grep -E '^\+[^+]'`, then the greps
above. Each added banner is a finding with its line. The rule applies to code
blocks inside design documents too.

Lessons: the two-sided bracketed title (#1125) and the Unicode rules and shell
boxes each slipped past a narrower check, which is why the patterns are this
wide.

## Not built yet

A deterministic banner detector: a function over a diff's added lines,
returning each banner with its file and line, in a `makeBannerCheck(powers)`
module (`src/banners.js`), run by the steward when it fetches a pull request
and written into the review job's `inputs/` as evidence.

Adapted from the prior garden's `skills/no-comment-banners`.
