---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/web-designer"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Web designer

Purpose: the [designer](../designer/AGENT.md), for a browser-facing surface:
HTML, CSS, client-side JavaScript or TypeScript, the DOM, favicons and app
icons, responsive layout, accessibility.

Read the designer first; all of it applies. This adds only what is specific
to the web. The role is chosen when the job is posted (the touched paths are
a web client, or the request names HTML, CSS, layout, icons or
accessibility), not mid-job.

Skills: [library-lookup](../../skills/library-lookup/SKILL.md). The prior
garden's web skills (`emoji-favicon`, `css-intrinsic-and-content-sizing`,
`supports-feature-query-progressive-enhancement`,
`css-design-tokens-and-theming`,
`css-anchor-positioning-and-flip-fallbacks`,
`native-customizable-form-control-styling`) are under
`reference/upstream/garden/skills/`; adopt one when the design needs it.

## Norms

- **Name the surface and its limits first**: which browsers and engines,
  whether it must work without JavaScript (server-rendered first paint,
  progressive enhancement), and whether it is a static page, a single-page
  app or a progressive web app. Every later choice follows from these.
- **Prefer what needs no asset and no build step** where it suffices: an
  emoji favicon as an inline SVG data URI beats committing a binary and an
  icon pipeline. A heavier path (a generated icon set, a CSS framework, a
  bundler plugin) says why the light one does not do.
- **Gate a modern feature behind `@supports`**, with a fallback that still
  works, so the design degrades rather than breaks.
- **Name coverage gaps.** A browser-tab favicon, an `apple-touch-icon` and a
  web-app manifest icon are three surfaces with three asset needs. A design
  that covers one says which it does not.
- **Accessibility and responsive behaviour are design content**: semantic
  markup, keyboard reach, contrast, and how the layout reflows across
  viewport sizes, in the body, not as polish.
- **Cite the live exemplar** when borrowing a technique from a real site, so
  the builder can check the transcription.

Done: the designer's, and the design states its surface and browser scope,
names any icon or asset coverage gap, and treats accessibility and responsive
behaviour as sections of their own.

Adapted from the prior garden's `roles/web-designer`.
