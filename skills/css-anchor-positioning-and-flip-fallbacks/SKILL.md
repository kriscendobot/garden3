---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/css-anchor-positioning-and-flip-fallbacks"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# CSS anchor positioning and flip fallbacks

Purpose: pin a popover, menu, tooltip or picker to its control and keep it
on-screen, in CSS alone, without position math in JavaScript.

## Norms

- Bind the two elements: `anchor-name: --x` on the control, and
  `position: fixed` (or `absolute`) with `position-anchor: --x` on the
  floating element.
- Place with `position-area` first (a cell of the 3 by 3 grid around the
  anchor). Use per-side `anchor()` only for finer control. Never mix physical
  and logical keywords.
- Size from the anchor with `anchor-size()`, for example
  `min-inline-size: anchor-size(self-inline)`.
- List overflow fallbacks in `position-try-fallbacks`: `flip-block`,
  `flip-inline`, or both together (`flip-block flip-inline`). Order breaks
  ties.
- A flip swaps logical pairs: insets, margins, `position-area` and
  self-alignment. Write edge margins as `margin-block-end` so they follow the
  flip. Do not expect a flip to move `width`, `translate` or other
  non-directional properties.
- Gate each feature on its own. `flip-*` works everywhere. `calc-size()` is
  Chrome-only. Firefox lacks `max-block-size: stretch` (use
  `calc(100% - margin)`). Safari lacks anchored container queries.
  `position-try-order` is Chrome-only.
- Verify in Chrome and in Firefox or Safari. Check that the element flips at
  the edge and that its margin stays on the side facing the edge. Say what you
  checked.

Sizing is [css-intrinsic-and-content-sizing](../css-intrinsic-and-content-sizing/SKILL.md).
Sources are in the library under `web--mdn-css-anchor-positioning--*` and
`web--csswg-css-anchor-position-1--*`.

Adapted from the prior garden's `skills/css-anchor-positioning-and-flip-fallbacks`.
