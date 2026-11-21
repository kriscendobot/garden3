---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/emoji-favicon"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Emoji favicon

Purpose: give a web page a tab icon drawn from one emoji, with no asset file,
no build step and no extra request: an inline SVG data URI in the head.
The technique is the one `https://play.emojiquest.app/` uses.

## Static

```html
<link
  rel="icon"
  href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%228%22 font-size=%228%22>🧙</text></svg>"
/>
```

- Raw SVG, not base64, so it stays readable and diffable.
- `%22` is an encoded double quote: the URI sits inside a `"`-delimited
  attribute. `<`, `>` and the emoji pass through.
- `y` is the baseline, not the top. `viewBox="0 0 100 100"` with
  `font-size="90"` and `y=".9em"` is a common alternative; nudge until the
  glyph neither clips nor floats.
- `xmlns` is required, or the browser will not parse it as SVG.

## Chosen at run time

When the emoji follows the application's state, set it from script and let
`encodeURIComponent` do the quoting:

```js
const setEmojiFavicon = emoji => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<text y=".9em" font-size="90">${emoji}</text></svg>`;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
```

Keep a static default in the served head, so the tab is not blank before
script runs.

## Limits

- The browser tab only. iOS home-screen icons (`apple-touch-icon`) and a PWA
  manifest still want raster PNGs; say so in the design if they are needed.
- The viewer's emoji font draws it, so it differs across platforms.
- Old browsers (legacy Edge) ignore SVG favicons; add a raster `favicon.ico`
  only if they matter.
- A multi-code-point emoji (a ZWJ sequence, a skin tone) works if the file is
  UTF-8; check it survives the editor and the minifier.

## Verification

Load the page in a Chromium browser and in Firefox, hard-reload, and see the
emoji in the tab. If the slot has no browser, say it was not verified.

Adapted from the prior garden's `skills/emoji-favicon`.
