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

Purpose: pin a popover, menu, tooltip or picker to its control, and keep it
on-screen, in CSS alone.

CSS anchor positioning ties an absolutely or fixed positioned element to an
**anchor element**. `anchor()`, `anchor-size()` and `position-area` place and
size it relative to the anchor. `position-try-fallbacks` lists the placements
the browser flips to when the element would overflow a viewport edge, so it
repositions instead of running off-screen. This is the positioning half;
[css-intrinsic-and-content-sizing](../css-intrinsic-and-content-sizing/SKILL.md)
is the sizing half. Gating each feature with `@supports` is its own
discipline (the prior garden's `supports-feature-query-progressive-enhancement`).

Sources, in the library ([library-lookup](../library-lookup/SKILL.md)): the
MDN anchor-positioning reference (`web--mdn-css-anchor-positioning--*`:
overview, anchor function, anchor-size function, position-area grid,
position-try fallbacks and flip, try order and visibility, browser support);
the CSS Working Group's Anchor Positioning Level 1 draft for the normative
flip semantics (`web--csswg-css-anchor-position-1--*`); and Jake Archibald's
customizable-`<select>` essay as the worked example
(`web--goldilocks-select-height--*`). A design names the technique; a
[web-builder](../../roles/web-builder/AGENT.md) implements it.

## When to use

- A floating element must stay with a control: a popover with its invoker, a
  menu with its button, a tooltip with its trigger, an autocomplete list with
  its input, a `::picker(select)` with its `<select>`.
- It must stay on-screen: when the default side would overflow, it flips to
  the other side rather than clipping or scrolling away.
- It is sized from the anchor: "at least as wide as the button", "no taller
  than the space between the anchor and the viewport edge".
- You are about to write JavaScript position math (`getBoundingClientRect`,
  `top`/`left` on scroll and resize) or pull in a positioning library. Anchor
  positioning does it declaratively, flip included.

If the element never risks overflowing and never tracks the anchor's
geometry, ordinary positioning is enough.

## The anchor relationship

The anchor publishes a dashed name with `anchor-name`. The positioned element
must be `position: absolute` or `position: fixed`, and binds to the name with
`position-anchor`, which makes it the element's **default anchor**. With a
default anchor, `anchor()` and `anchor-size()` may omit the name.

```css
.menu-button {
  anchor-name: --menu-button;
}

.menu {
  position: fixed; /* or absolute: required, or there is nothing to place */
  position-anchor: --menu-button;
}
```

`anchor-scope` limits where a name is visible, so the same name can be reused
in different subtrees. A `popover` (top layer) placed by anchor positioning
next to its invoker is the same pair of primitives a customizable `<select>`
picker is built from.

## Placement: anchor() and position-area

**`anchor(<anchor-name>? <anchor-side>, <fallback>?)`** is the position of one
edge or point of the anchor, used in an inset property (`top`, `bottom`,
`left`, `right`, `inset-block-start` and so on). Sides: physical (`top`,
`bottom`, `left`, `right`), logical (`start`, `end`, `self-start`,
`self-end`), `center`, or a percentage along the side. The inset's axis must
match the side: a `top` inset takes a vertical side. A mismatch uses the
fallback, or invalidates the declaration if there is none. Center on an edge
with `translate`:

```css
.tooltip {
  position: absolute;
  position-anchor: --my-button;
  top: anchor(bottom);  /* just below the button */
  left: anchor(center); /* at the button's horizontal center */
  translate: -50% 0;    /* back by half the tooltip's width */
}
```

**`position-area`** is the shorthand to reach for first. It names a cell, or a
span of cells, of a 3 by 3 grid centered on the anchor. Two keywords pick a
cell (one keyword implies `center` on the other axis). Keywords are physical
(`top`, `bottom`, `left`, `right`, `center`) or logical (`block-start`,
`block-end`, `inline-start`, `inline-end`, `start`, `end`, and `self-*`
forms). **Never mix physical and logical in one `position-area`.** `span-*`
keywords (`span-block-end`, `span-inline-start`, `span-all`) widen the
placement.

```css
.menu {
  position: fixed;
  position-anchor: --menu-button;
  position-area: block-end span-inline-end; /* below, spanning to the inline end */
}
```

The chosen region is also the element's inset-modified containing block. That
is what makes `max-block-size: stretch` mean "fill the cell, from the anchor's
edge to the viewport's": the hook between placement and sizing.

## Sizing: anchor-size()

**`anchor-size(<anchor-name>? <anchor-size>?, <fallback>?)`** is one dimension
of the anchor, valid in sizing properties (`width`, `height`, `min-*`,
`max-*`, `inline-size`, `block-size`) and inside `calc()`. Dimensions:
`width`, `height`, `inline`, `block`, and `self-*` forms measured in the
positioned element's own writing mode.

```css
.menu {
  min-inline-size: anchor-size(self-inline);    /* never narrower than the anchor */
  width: calc(anchor-size(self-inline) + 2rem); /* or derive a size */
}
```

It composes with `calc-size()` clamping
([css-intrinsic-and-content-sizing](../css-intrinsic-and-content-sizing/SKILL.md)):
the anchor sets a floor or ceiling, and `calc-size()` on `fit-content` or
`stretch` clamps the rest.

## Staying on-screen: position-try-fallbacks

`position-try-fallbacks` lists alternative placements, tried **in order**,
when the element would overflow in its initial position. An entry is a try
tactic (`flip-block`, `flip-inline`, `flip-start`), a `position-area` value,
or a named `@position-try` option.

- **`flip-block`** mirrors across the block axis: an element above the anchor
  that overflows the top goes below it.
- **`flip-inline`** mirrors across the inline axis: to the other horizontal
  side, in horizontal writing modes.
- **`flip-start`** mirrors diagonally, swapping the block and inline axes.

Tactics can be combined with a space in one entry, composed left to right,
for an element near two edges at once:

```css
.menu {
  position: fixed;
  position-anchor: --menu-button;
  position-area: block-start span-inline-end;
  position-try-fallbacks:
    flip-block,
    flip-inline,
    flip-block flip-inline; /* the diagonally opposite cell */
}
```

A `position-area` value can be an entry by itself
(`position-try-fallbacks: top, top right, right`), but `position-area` values
**cannot** be combined within one entry. For a fallback that changes more
than placement, define `@position-try --name { ... }` and name it. Its
declarations apply while it is chosen and are unset when a later scroll
chooses another.

### What a flip flips

A tactic does not only move the element. It also **swaps the values of the
axis-paired properties** that came with the placement. The draft defines each
tactic geometrically, as a mirror, and the mirror swaps the corresponding
pair. For `flip-block`:

- the block inset pair (`inset-block-start` and `inset-block-end`; `top` and
  `bottom` in horizontal writing modes);
- the block **margin** pair (`margin-block-start` and `margin-block-end`);
- the block part of `position-area` (`block-start` becomes `block-end`);
- block self-alignment.

So a `margin-block-end` that holds a popover off the viewport edge when it
sits below the anchor acts as a `margin-block-start` once `flip-block` puts it
above: the gap stays on the side facing the edge. `flip-inline` does the same
on the inline axis. `flip-start` swaps across the diagonal
(`margin-block-start` with `margin-inline-start`). Tactics work on logical
properties; logical directions resolve against the containing block's writing
mode.

**What is not flipped is a deliberate gap in the spec.** The draft defines the
tactics by their geometry and does not list every affected property, so
engines derive the set, and a flip "works for some properties and not
others". The portable subset is the directional logical pairs: insets,
margins, `position-area`, self-alignment. A single-value `width` or
`block-size`, a `translate`, a non-directional `background` are not mirrored.
Check anything outside the subset in each engine.

### Choosing up front: position-try-order

By default a fallback applies only when the initial position overflows.
`position-try-order` instead picks, at first display, the fallback with the
most room: `most-width`, `most-height`, `most-block-size`, `most-inline-size`
(or `normal`, the default). The candidates are stably sorted by that room,
largest first, so the fallback list's order breaks ties. If no fallback has
more room than the initial position, it has no effect. The `position-try`
shorthand carries both: `position-try: most-height --a, flip-block`.

`position-try-order: most-*` does not work in Firefox or Safari (mid-2026).
Treat it as an enhancement, never as load-bearing.

### The worked example: a margin that survives the flip

The browser's default `::picker(select)` is built from these primitives:
`min-inline-size: anchor-size(self-inline)`, `max-block-size: stretch`,
`position-area: self-block-end span-self-inline-end`,
`position-try-order: most-block-size`, and a list of fallback cells. The
essay's fix keeps the picker off the viewport edge with a margin that stays on
the right side when the picker flips above the button:

```css
.custom-select::picker(select) {
  --viewport-margin: 1em;
  /* Firefox lacks max-block-size: stretch: subtract the margin from a percentage */
  max-block-size: calc(100% - var(--viewport-margin));
  position-try-fallbacks:
    flip-block,
    flip-inline,
    flip-block flip-inline;
  @supports (max-block-size: stretch) {
    max-block-size: stretch;
    margin-block-end: var(--viewport-margin);
  }
}
```

Margins are in the flipped set, so above the button `margin-block-end` acts as
`margin-block-start`. (The CSS Working Group has resolved to change the
default fallbacks for select pickers to something similar, so this override
should become unnecessary.) The essay chose property flipping over an
anchored container query because Safari supports the flip tactics but not
anchored container queries.

## Browser support (mid-2026; check again when you write)

Chrome ships all of it. Firefox and Safari support the core and the `flip-*`
fallbacks and lag on the newer pieces. The gaps are per feature, so the gate
is per feature: `@supports` around the construct, never one "supports anchor
positioning" check.

| Capability | Chrome | Firefox | Safari |
| --- | --- | --- | --- |
| Core (`anchor-name`, `position-anchor`, `anchor()`, `anchor-size()`, `position-area`) | yes | yes | yes |
| `position-try-fallbacks` with `flip-*` | yes | yes | yes |
| `position-try-order: most-*` | yes | no | no |
| `position-visibility` | yes | partial | partial |
| Anchored container queries (`container-type: anchored`, `@container anchored()`) | yes | in progress | no |
| `calc-size()` | yes | no | no |
| `max-block-size: stretch` | yes | no (use `calc(100% - margin)`) | yes |
| Customizable `<select>`, `::picker(select)` | yes | implementing | implementing |

The rules behind the table:

- `flip-*` fallbacks work everywhere. A popover that only flips needs no gate.
- `calc-size()` is Chrome-only. Gate any clamping that uses it, with a
  fallback.
- Firefox lacks `max-block-size: stretch`. Fall back to
  `calc(100% - var(--viewport-margin))`.
- Safari lacks anchored container queries. Use property flipping for
  fallback-dependent margins and insets.

## Procedure

1. **Bind the anchor.** `anchor-name: --x` on the control;
   `position: fixed` or `absolute` and `position-anchor: --x` on the floating
   element.
2. **Place it.** `position-area` first; per-side `anchor()` (with `translate`
   to center) only for finer control. Do not mix physical and logical
   keywords.
3. **Size from the anchor** where the design asks:
   `min-inline-size: anchor-size(self-inline)` for "at least as wide",
   `max-block-size: stretch` (with the Firefox fallback) for "fill the cell".
   Clamp the rest with `calc-size()`.
4. **List the fallbacks.** `flip-*` tactics (combined for two edges),
   `position-area` entries, or named `@position-try` options. Order is the
   tiebreak.
5. **Let directional properties ride the flip.** Write edge margins and insets
   as logical pairs (`margin-block-end`, `inset-block-start`) so a flip moves
   them. Do not hand-write a per-fallback margin for anything in the flipped
   set.
6. **Gate per feature.** `@supports` around `calc-size()`,
   `max-block-size: stretch`, `position-try-order` and anchored container
   queries, each with a fallback. Leave `flip-*` ungated.
7. **Verify** in a full engine (Chrome) and a lagging one (Firefox or
   Safari).

## Verification

- **Placement**: at rest the element is in the intended cell.
- **Flip on overflow**: scroll or shrink the viewport until the default
  placement would clip. The element moves to a fallback, and the directional
  properties went with it: the edge margin or inset faces the viewport edge,
  not the side it started on.
- **Two edges**: drive it into a corner. A combined tactic lands it in the
  diagonally opposite cell.
- **Sized from the anchor**: resize the control; the popover's bound follows.
- **Per engine**: in Chrome the enhanced path is active; in Firefox the
  `calc(100% - margin)` fallback keeps it off the edge; in Safari the flip
  tactics, not container queries, carry the conditional styling.
- **Writing mode**: if the surface supports right-to-left or vertical text,
  check placement and flip under one.

Say in your report which browsers you checked and what you saw. If you could
not run a browser, say so.

## Limitations (name them in the design)

- The flip set is not fully listed. Only insets, margins, `position-area` and
  self-alignment reliably flip.
- Support is per feature, so the gates are per feature.
- Prefer `flip-*` over anchored container queries for conditional styling,
  for Safari.
- The positioned element must be `absolute` or `fixed`.
- This skill places the box. Sizing it is
  [css-intrinsic-and-content-sizing](../css-intrinsic-and-content-sizing/SKILL.md).

## Output

The CSS on the floating element: the binding, the placement, any
`anchor-size()` bounds, the fallback list written so directional margins and
insets ride the flip, and the per-feature gates with their fallbacks. And a
note in the design or report: the anchor relationship, the placement and its
fallbacks, which properties are relied on to flip, and the support caveats.

Adapted from the prior garden's `skills/css-anchor-positioning-and-flip-fallbacks`.
