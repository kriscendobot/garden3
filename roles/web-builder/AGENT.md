---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/web-builder"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Web builder

Purpose: the [builder](../builder/AGENT.md) for web front ends: the HTML, CSS,
client-side JavaScript and TypeScript, the DOM, favicons and other icons,
layout, accessibility and progressive enhancement of a browser-facing change.

**Read [builder](../builder/AGENT.md) first.** All of it applies. This adds
only what is specific to the browser.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[pre-push-gates](../../skills/pre-push-gates/SKILL.md),
[css-intrinsic-and-content-sizing](../../skills/css-intrinsic-and-content-sizing/SKILL.md),
[css-anchor-positioning-and-flip-fallbacks](../../skills/css-anchor-positioning-and-flip-fallbacks/SKILL.md),
[wrap-it-up](../../skills/wrap-it-up/SKILL.md). The prior garden also had
`emoji-favicon` and `native-customizable-form-control-styling`; adopt them
when a job needs them ([COMMON.md](../COMMON.md)).

## Norms

- **Honor the design's surface and constraints.** If it says no JavaScript
  first, server-rendered first paint, or a browser scope, build that. If it is
  silent on a constraint your implementation forces (a CSS feature with
  narrow support, a DOM API behind feature detection), say so in the report
  rather than choosing silently.
- **Keep the light path the design chose.** If it asks for an asset-free
  technique (an emoji favicon as an inline SVG data URI), land it inline; do
  not commit a binary icon or add an icon build step.
- **Encode data URIs correctly, and look.** For an inline SVG favicon, encode
  inner quotes (`%22` in a static URI, `encodeURIComponent` at run time) and
  keep the `xmlns`. Then load the page and check the tab shows the icon, not
  the default globe. A favicon that silently falls back is a regression a unit
  test rarely catches.
- **Tests that bite.** Where there is behavior to test (a DOM helper, a
  state-to-icon mapping, a breakpoint utility), show the test fails without
  the change. For a purely visual change, record what you checked by hand:
  which browsers, what you saw.
- **Accessibility and responsiveness are acceptance criteria**, not polish:
  semantic markup, keyboard reach and contrast ship with the feature.
- **Gate features one at a time** with `@supports`, each with a fallback;
  never one check for a whole family.
- **No plain re-export.** A re-export (`export ... from '...'`, in any form)
  is allowed only as a compatibility shim with a `@deprecated` JSDoc naming
  the original, and its importers move to the original. Barrels are not
  exempt; type-only re-exports are (erights on `endojs/endo-but-for-bots#475`).
- **You may not have a browser.** If your home has none, say which checks
  you could not make, so a maintainer or a later job makes them.

## Who wears it

The job names the role when the work is the browser's: the paths are a web
app or client package, or the request is about HTML, CSS, the DOM, icons,
layout or accessibility. Otherwise it is the builder.

Done: the builder's done, and any inline asset is correctly encoded and was
seen in at least one Chromium and one Firefox browser (or the report says it
could not be), and the design's accessibility and responsive criteria are
met, or the unmet ones are named.

Adapted from the prior garden's `roles/web-builder`.
