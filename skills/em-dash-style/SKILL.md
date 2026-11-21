---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/em-dash-style"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Em dash style

Purpose: no em dashes (U+2014) in prose. Use a separate sentence,
parentheses or a colon. In technical writing an em dash blurs the rhythm, and
the clause almost always reads better on its own.

Prose only. An em dash inside code (quoting the character, a regex, ASCII art)
is fine. An en dash in an existing numeric range (`80–100`) is tolerated; new
text prefers `80-100` or `80 to 100`
([typist-friendly-code-points](../typist-friendly-code-points/SKILL.md)).

## Scope

Everything the garden writes: `CLAUDE.md`, designs, every role and skill,
reports, and what goes into projects (comments, pull request bodies, commit
messages). Vendored and reference material is left as it is. Fix existing
text on encounter.

## How to rewrite

- A period: `Foo bar — baz qux.` becomes `Foo bar. Baz qux.`
- Parentheses: `Foo bar — baz qux — quux.` becomes `Foo bar (baz qux) quux.`
- A colon: `Foo bar — baz qux.` becomes `Foo bar: baz qux.`

Choose by reading; a mechanical swap often reads worse. A brief aside joined
to a longer clause wants parentheses. An elaboration wants a colon. Two
thoughts that stand alone want a period. This is why the
[pre-push gate](../pre-push-gates/SKILL.md) does not substitute it.

## Finding them

```sh
grep -RnP "\x{2014}" --include='*.md' .
grep -nP "\x{2014}" path/to/file.md
```

## Pitfalls

- **Smart punctuation.** Some editors turn three hyphens into an em dash.
- **Bullet leaders.** `- Foo — bar` reads worse as `- Foo - bar`, where the
  dash blurs with the bullet. Write `- Foo. Bar` or `- Foo (bar)`.
- **Pasted output.** `gh pr view`, GitHub's web pages and many tools emit em
  dashes. Rewrite them when quoting into prose; keep them inside a fence that
  captures output.

Adapted from the prior garden's `skills/em-dash-style`.
