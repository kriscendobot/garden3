---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/css-design-tokens-and-theming"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# CSS design tokens and theming

Purpose: express a web surface's colours (and spacing, elevation, radii) as
CSS custom properties on `:root`, derived from a named authority, re-bound per
scheme, with a rationale per token, so a theme change is one place to edit
and can be reviewed.

Grounded in the chat client's colour-schemes design on
endojs/endo-but-for-bots's `llm` branch, which the garden's library indexes
([library-lookup](../library-lookup/SKILL.md)).

## When

- A surface with more than one scheme (dark, high contrast) or a brand to
  follow.
- A stylesheet collecting hard-coded colours that should vary by scheme.
- A theme change a maintainer must be able to judge.

A single-scheme surface that will never be rebranded may need only a small
fixed palette. Scale the apparatus to the surface.

## Tokens

Name tokens by role, not appearance, so a component reads as its intent and a
re-theme renames nothing:

```css
:root {
  --bg-primary:     #ffffff; /* main content */
  --bg-secondary:   #f8f9fa; /* bars, headers, hints */
  --text-primary:   #212529;
  --text-muted:     #868e96; /* placeholders, hints */
  --accent-primary: #228be6; /* links, focus rings, controls */
  --border-color:   #dee2e6;
  --shadow-lg:      0 10px 25px rgba(0, 0, 0, 0.1); /* modals, menus */
}
```

Components use `var(--text-primary)`. No hard-coded colour outside `:root`.

## Schemes

Another scheme re-binds the same names, so no component changes:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary:     #1a1a1a;
    --text-primary:   #e0e0e0;
    --accent-primary: #d4455a; /* brand-derived, see rationale */
  }
}
:root[data-theme="dark"] { /* the same, for an explicit toggle */ }
```

## A named authority

Do not invent a palette from primaries. Name what the tokens derive from (a
brand guide, a WCAG contrast target, a documented preference) and which
source colour seeds each token. The chat client's dark scheme derives from
the endojs.org brand: its link colour, button colour and gradient.

## The rationale table

Pair the tokens with a table: each token's value per scheme and why. Without
it a `:root` block is opaque numbers.

| Role         | Light     | Dark      | Rationale                                       |
| ------------ | --------- | --------- | ----------------------------------------------- |
| Accent       | `#228be6` | `#d4455a` | endojs.org link colour, lightened for dark      |
| Code strings | `#0a3069` | `#fb923c` | orange from the endojs.org gradient             |
| Backgrounds  | cool grey | warm grey | warm tones suit the burgundy and coral accent   |

A change to a token explains why its row changes; it does not just flip the
value.

## Intentional exceptions

Text on a saturated accent (a sent-message bubble, an active row) is designed
against the accent, so it keeps a fixed `white` in every scheme. Record each
such exception in a comment at the declaration, so an audit for hard-coded
colours finds only documented exceptions or regressions.

## Procedure

1. Inventory the hard-coded values and group them by role.
2. Name the authority and derive the palette from it.
3. Declare role tokens on `:root`; replace every component value with
   `var(--token)`.
4. Add a block per extra scheme, re-binding the same names.
5. Write the rationale table in the design.
6. Comment each intentional exception.
7. Verify.

## Verification

- Every scheme re-themes every surface with no component change.
- A search for colour literals outside `:root` finds only documented
  exceptions.
- Contrast holds in each scheme against the named standard. Tokens
  centralise change; they do not guarantee contrast.
- Each rationale row matches the value shipped.

If you cannot run a browser in the slot, say which of these you checked by
reading and which you did not check.

Adapted from the prior garden's `skills/css-design-tokens-and-theming`.
