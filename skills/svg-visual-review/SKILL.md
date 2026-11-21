---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/svg-visual-review"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# SVG visual review

Purpose: judge SVG artwork by looking at it rendered. Metadata, `<title>`,
`<desc>` and the source are not evidence that a scene reads; only the
rendered image is.

## Procedure

1. **Find a renderer.** Hosts often lack `rsvg-convert`, `inkscape` and
   `cairosvg`. A headless Chromium often comes with Playwright's browser
   cache (`chrome-headless-shell` under `ms-playwright/`, newest version).
   If the box has none, say so in the report: the review cannot be done
   without one.
2. **Render at native size.** An SVG with only a `viewBox` fills the window,
   so size the window from it:

   ```sh
   vb=$(grep -o 'viewBox="[^"]*"' "$f" | head -1 | sed 's/viewBox="//;s/"//')
   w=$(echo $vb | cut -d' ' -f3); h=$(echo $vb | cut -d' ' -f4)
   "$CHROME" --no-sandbox --disable-gpu --hide-scrollbars \
     --screenshot="scratch/${f%.svg}.png" --window-size=$w,$h "file://$PWD/$f"
   ```

3. **Look at every image** (read the PNG). Note for each whether the thing it
   depicts actually reads, not whether the source says it should.
4. **Check the dark scheme** when the set claims one: put several SVGs as
   `<img>` on a scratch page with the dark background, screenshot it once,
   and look for transparency artifacts and strokes that vanish.
5. **Count in the source only as a supplement**: grep to prove a motif
   appears exactly N times, never instead of looking.

## Measuring a page

To measure a built page rather than only screenshot it, script Playwright:
`playwright-core` may already be installed (import its `index.mjs` and launch
with `executablePath` set to the headless shell). Check overflow, clipping
and overlap (`Range.getClientRects`), and WCAG contrast, at a phone and a
desktop size in light and dark. Inject one deliberate CSS fault to prove the
check can fail. Keep such a script out of `test/`: a bare `node --test` runs
every `.mjs` under a `test/` directory.

## Report

Per image: the file, what it should show, and whether it reads. Then the
set's coherence, any counts verified in source, and one verdict with bounded,
image-specific findings. On a review of the bot's own pull request, GitHub
allows only a comment, not "request changes": state the verdict in the text.

Adapted from the prior garden's `skills/svg-visual-review`.
