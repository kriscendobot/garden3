---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/css-intrinsic-and-content-sizing"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# CSS intrinsic and content sizing

Purpose: size an element from its content or from its available space, and
clamp it between a content-driven floor and a fixed ceiling with
`calc-size()`. The "Goldilocks" size: as large as the content wants until a cap
takes over.

From Jake Archibald's essay on sizing a customizable `<select>` picker
(`https://jakearchibald.com/2026/goldilocks-select-height/`), in the library as
`web--goldilocks-select-height--*` (concept `css-intrinsic-sizing`;
[library-lookup](../library-lookup/SKILL.md)). A design names the size; a
[web-builder](../../roles/web-builder/AGENT.md) implements it. Positioning the
box is [css-anchor-positioning-and-flip-fallbacks](../css-anchor-positioning-and-flip-fallbacks/SKILL.md).

## When to use

- A menu, popover, picker, autocomplete list, side panel or growing region
  should fit its content, but only up to a cap.
- You are about to write a fixed `max-height` in pixels, when the content
  height should win until it passes a sensible cap.
- You want a floor of "the content height, but no more than N", so a short
  list is not boxed in empty space and a long one is still bounded.

If only the cap matters, a plain `max-block-size` is enough.

## The intrinsic keywords

Sizing properties (`block-size`, `inline-size`, `min-*`, `max-*`, and
`height`, `width`) accept intrinsic keywords:

- **`fit-content`**: the content's natural size, no larger than the space.
- **`min-content`**: the smallest the content can be without overflowing.
- **`max-content`**: the size the content wants with unlimited room.
- **`stretch`**: all the available space on that axis (the containing block,
  or the anchor-positioning cell for a popover).

Prefer the logical properties so the size follows the writing mode. The
problem is almost always on the block axis.

## The problem

"The content height, but never taller than 12em" wants
`min(fit-content, 12em)`, and that does not work: `min()`, `max()` and
`clamp()` do not take intrinsic keywords. A bare `min-block-size: 12em` stops
collapse but forces a tall box around a little content.

## calc-size()

`calc-size(<intrinsic>, <calc>)` resolves the intrinsic size and binds it to
`size` inside the calculation:

```css
.picker {
  /* floor: the content height, but never demand more than 12em */
  min-block-size: calc-size(fit-content, min(size, 12em));
}
```

A two-option list gets its small content height as the floor; a long list's
floor stops at 12em. The ceiling works the same way over `stretch`:

```css
.picker {
  --max-size: 30em;
  --viewport-margin: 1em;
  /* ceiling: the available space, but never taller than 30em */
  max-block-size: calc-size(stretch, min(size, var(--max-size)));
  margin-block-end: var(--viewport-margin);
}
```

Together the box is held between a content-aware floor and a fixed ceiling,
at its content height in between.

## Support and the gate

As of mid-2026 `calc-size()` is Chrome-only, and Firefox lacks
`max-block-size: stretch`. Put the `calc-size()` path behind `@supports` with
a fallback: a fixed bound, and optionally a structural short-list detector
(`:has()` with `:nth-of-type()`). The complete gated CSS for the picker is in
`web--goldilocks-select-height--final-css-and-browser-support`.

## Procedure

1. **Name the axis and both bounds** as custom properties (`--min-size`,
   `--max-size`), so they can be tuned and reviewed.
2. **Pick the keyword per bound**: `fit-content` for a content floor,
   `stretch` for a space ceiling. Plain shrink-to-fit needs only
   `fit-content`.
3. **Write the modern path**: `calc-size(<keyword>, min(size, <cap>))` for
   each bound that mixes an intrinsic size with a length.
4. **Gate it** with `@supports`, and write the fallback.
5. **Verify** in Chrome and in Firefox or Safari.

## Verification

- With `calc-size()`: a short list shrink-wraps (no empty space below the
  options); a long list stops at `--max-size`.
- Without it: the fallback still gives a usable box.
- Resize the viewport: the ceiling respects the available space and the
  margin.
- If the surface supports right-to-left or vertical text, check one.

Say in your report which browsers you checked.

## Limitations (name them in the design)

- `calc-size()` is not universal. The modern path is the enhancement; always
  ship the fallback.
- `min()`, `max()` and `clamp()` still reject intrinsic keywords;
  `calc-size()` is the only way to do arithmetic on them.
- This sizes the box; it does not place it.
- The essay does not use `field-sizing`, so neither does this skill.

## Output

The gated sizing CSS on the element, with its bounds named as custom
properties, and a note recording the two bounds, the keyword chosen for each,
and the support caveat.

Adapted from the prior garden's `skills/css-intrinsic-and-content-sizing`.
