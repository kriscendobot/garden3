---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/native-customizable-form-control-styling"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Native customizable form control styling

Purpose: style the native `<select>` (its closed button, picker, arrow,
checkmark and each `<option>`) with HTML and CSS alone, instead of rebuilding
it as a `<div role="listbox">` and script. Opt in with
`appearance: base-select`, add a `<button><selectedcontent></selectedcontent></button>`
first child, and target the parts with `::picker(select)`, `::picker-icon`,
`::checkmark`, `:open` and `:checked`. The platform keeps the accessibility
tree, keyboard, focus, form participation and the submitted value. Support is
partial, so it ships as a progressive enhancement behind
`@supports (appearance: base-select)`, falling back to a classic `<select>`.

Grounded in MDN's "Customizable select elements" guide and its reference
pages, as ingested in 2026 (library concept `customizable-select`;
`grep -i customizable reference/library/keywords.md`).

Composes with
[css-anchor-positioning-and-flip-fallbacks](../css-anchor-positioning-and-flip-fallbacks/SKILL.md)
(placing the picker),
[css-intrinsic-and-content-sizing](../css-intrinsic-and-content-sizing/SKILL.md)
(sizing it) and
[supports-feature-query-progressive-enhancement](../supports-feature-query-progressive-enhancement/SKILL.md)
(the gate). A web designer reaches for it; a web builder implements it.

## When to use

- A design wants a styled drop-down (border, background, fonts, icons in
  options, a recoloured arrow, an animated open) and the control is a
  **single-select** picker.
- The control must submit a form value, work from the keyboard, expose the
  right accessible name, and work without script.
- You are tempted to build a `<div>` listbox for the styling. Prefer the
  native control where support allows: the widget is an accessibility
  liability you would have to rebuild and keep correct.

Not for a multi-select **listbox** (several options shown, one or more
chosen): that is a separate platform guide with different markup. And the
classic `<select>` a non-supporting browser falls back to must be acceptable
on its own.

## Why the native control

Lead the design with this. A customizable `<select>` is still a `<select>`:

- **A submitted value.** The selected option takes part in submission. When
  its content is a sub-tree, the value is `trim(textContent)` of the selected
  option.
- **One focus stop.** The first-child `<button>` is inert: interactive
  children inside it are not separately focusable, so the control is one tab
  stop.
- **Keyboard, focus and open state are the platform's**, visible to CSS as
  `:open` and `:checked`.
- **The accessibility tree is kept.** A `<div>` listbox needs `role`,
  `aria-expanded`, `aria-activedescendant`, arrow keys, type-ahead and focus
  handling, all written and tested by hand.

The trade is support, not semantics.

## Markup and opt-in

```html
<form>
  <label for="pet-select">Select pet:</label>
  <select id="pet-select">
    <button>
      <selectedcontent></selectedcontent>
    </button>

    <option value="">Please select a pet</option>
    <option value="cat">
      <img class="icon" src="cat.svg" alt="" aria-hidden="true"
      /><span class="option-label">Cat</span>
    </option>
    <option value="dog">
      <img class="icon" src="dog.svg" alt="" aria-hidden="true"
      /><span class="option-label">Dog</span>
    </option>
  </select>
</form>
```

- **`<button><selectedcontent></selectedcontent></button>`** is the styleable
  closed button. `<selectedcontent>` holds a clone of the selected option's
  content, styleable on its own. Without it the browser renders a default
  button that is harder to style.
- **Rich options** may hold images, non-interactive text-level elements, and
  `::before`/`::after` content (generated content is not part of the value).
- **Mind the value rule** when an option's visible text and intended value
  differ.

```css
select,
::picker(select) {
  appearance: base-select;
}
```

You may opt in the `<select>` alone and leave the picker to the system, but
not the picker without the `<select>`. Once opted in, the control renders
plainly and is yours to style.

## The parts

| Part | Selector | Note |
| --- | --- | --- |
| closed button, while open | `:open` | |
| the selection in the button | `selectedcontent` and descendants | the clone |
| the picker | `::picker(select)` | everything but the button |
| arrow | `::picker-icon` | decorative, outside the accessibility tree |
| selected option | `option:checked` | |
| checkmark | `::checkmark` | decorative, outside the accessibility tree |
| groups | `optgroup`, `legend` | `legend` is the styleable group label |

```css
select::picker-icon { color: #999999; transition: 0.4s rotate; }
select:open::picker-icon { rotate: 180deg; }

::picker(select) { border: none; border-radius: 8px; }

option {
  display: flex;
  justify-content: flex-start;
  gap: 20px;
  padding: 10px;
  transition: 0.4s;
}
option:nth-of-type(odd) { background: white; }
option:hover, option:focus { background: plum; }
option:checked { font-weight: bold; }

selectedcontent .icon { display: none; }

option::checkmark { order: 1; margin-left: auto; content: "\2611"; }
```

- `::picker(select)` names the element type; reach one control with
  `#pet-select::picker(select)`.
- `<optgroup>` becomes a block container and `<legend>` its label, replacing
  the `label` attribute with the same semantics, so groups stay announced.
- Align option icons with `text-box: trim-both cap alphabetic`, not
  line-height tricks.

## Animating and placing the picker

Button and picker are wired as invoker and popover, with an implicit anchor:
no `anchor-name` or `position-anchor` needed.

```css
::picker(select) {
  opacity: 0;
  transition: all 0.4s allow-discrete;
}
:open::picker(select) { opacity: 1; }
@starting-style {
  :open::picker(select) { opacity: 0; }
}
```

`allow-discrete` lets the discrete `display` and `overlay` animate too, so the
exit transition plays before the picker leaves the top layer.

```css
::picker(select) {
  top: calc(anchor(bottom) + 1px);
  left: anchor(10%);
}
```

The browser ships default `position-try` fallbacks that keep the picker on
screen. For other placement, sizing and flipping, use the two CSS skills
above. To detach the implicit anchor, set `position-anchor` to a name that
does not exist.

## Accessibility: what you get and what you can still break

- **Button content can corrupt the accessible name.** Choose it with the
  exposed name in mind.
- **Hide decoration explicitly**: `aria-hidden="true"` on option icons, so the
  value is not read twice.
- **Pseudo-element `content` is not announced.** `::checkmark` and
  `::picker-icon` are decorative; never the only signal of selection.
- **Groups stay announced** through `<legend>`.
- **Do not re-implement keyboard, focus or open state.** Read them in CSS.

## Support

MDN marks it "Limited availability", not Baseline. At the 2026-04 capture
only Chrome shipped customizable `<select>`, `<selectedcontent>` (also marked
experimental), `::picker(select)`, `::checkmark` and `::picker-icon`; Firefox
and Safari were implementing. Confirm on the reference pages when you write,
not from this paragraph.

- **Frameworks.** Some block these features; in others they break hydration
  under server-side rendering. Test in the real framework.
- **`<selectedcontent>` is not live.** It is re-cloned only when the selection
  changes; mutating the selected option's content afterwards needs a manual
  update.

## The gate

```css
/* Baseline: a classic select, usable on its own. */
select { /* font, colour, what a classic select allows */ }

@supports (appearance: base-select) {
  select,
  ::picker(select) { appearance: base-select; }
  /* all the part styling */
}
```

A non-supporting browser ignores the button structure and strips non-text
option content to its text, and the control still works. Keep the rich
styling inside the gate so other engines never see selectors they cannot
honour.

## Procedure

1. Confirm it is a single-select `<select>`. If a `<div>` widget is on the
   table, state the native-over-widget trade in the design.
2. Write the markup: the button first child, rich options with decoration
   `aria-hidden`. Mind `trim(textContent)`.
3. Opt in on both `select` and `::picker(select)`, inside the gate.
4. Style the parts.
5. Animate and place the picker if the design asks.
6. Write the baseline outside the gate; confirm it is usable alone.
7. Guard the accessible name, then verify.

## Verification

- The right value submits; one tab stop; keyboard open, close and navigation
  work with no script of yours.
- A screen reader announces the intended name, with no doubled icon text and
  silent decoration.
- On a supporting engine the parts render as designed.
- On a non-supporting engine the fallback is a working classic `<select>`.
- In the real framework: no hydration failure, no stale `<selectedcontent>`.
- The gate is load-bearing: misspell `base-select` in the `@supports` test
  and see the control drop to the fallback.

## Say in the design

Single-select only; why native over a widget; that most users get the classic
baseline until other engines ship and that it is acceptable; that
`<selectedcontent>` is not live; that button content and missing
`aria-hidden` can break the accessible name; that pseudo-element glyphs are
decoration; and that `@supports` tests syntax, not rendering parity.

Adapted from the prior garden's `skills/native-customizable-form-control-styling`.
