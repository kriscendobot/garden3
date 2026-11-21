---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/url-path-math"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# URL path math

Purpose: in Endo JavaScript, do path math rooted at a module URL with
`new URL(...)`, not Node's `path` module. URL resolution is portable and keeps
the value a URL until an API needs a native filename.

## The rule

Write:

```js
const workerUrl = new URL('./worker.js', import.meta.url);
const directoryPath = fileURLToPath(new URL('.', import.meta.url));
```

not:

```js
import path from 'node:path';

const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'worker.js');
const directoryPath = path.dirname(fileURLToPath(import.meta.url));
```

A directory URL with a trailing slash is the base for what is under it:

```js
const assetsUrl = new URL('./assets/', import.meta.url);
const iconUrl = new URL('icon.svg', assetsUrl);
```

Convert with `fileURLToPath` only where a Node API needs a native path. Do
not convert to a string to do more path math.

## Scope

- Endo JavaScript and TypeScript, where the path is relative to
  `import.meta.url` or another file URL.
- `node:path` is fine when the value starts as a native path (an argument,
  an environment variable, a filesystem result) or when the operation has no
  URL form. The question is whether URL resolution serves the operation.
- Do not rewrite unrelated path code. Apply the rule where you write or edit
  the calculation.

It is a review rule, not a blocking check: whether a native path already
exists, or a URL form serves a given API, needs the surrounding code. A
builder applies it when writing Endo code; a reviewer looks for new
`node:path` imports and `path.resolve` or `path.dirname` doing URL-relative
work.

## Why

kriskowal asked for the convention to be recorded and reviewed for, on
`endojs/endo-but-for-bots` pull request #124 (2026-08-06). The code derived
a directory with `path.dirname(fileURLToPath(import.meta.url))`; the URL form
is `fileURLToPath(new URL('.', import.meta.url))`.

Adapted from the prior garden's `skills/url-path-math`.
