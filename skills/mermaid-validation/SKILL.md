---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/mermaid-validation"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Mermaid validation

Purpose: check that every ` ```mermaid ` fence in a document parses, before
you commit it, without a browser. An invalid diagram renders on GitHub as an
error box, and one has already cost a pull request of its own to fix.

`mermaid.parse()` runs the real grammar for every diagram type and throws on
the inputs GitHub's renderer rejects. It needs only a fake DOM. Rendering
with `@mermaid-js/mermaid-cli` (`mmdc`) needs Chromium, which fails in a
sandbox (first puppeteer's sandbox, then missing shared libraries such as
`libnspr4.so`); parse-only answers the actual question.

## Procedure

1. **Extract each block** to its own file, in a directory of your own under
   `scratch/`:

   ```sh
   mmdir=scratch/mermaid; mkdir -p "$mmdir"
   awk -v d="$mmdir" '/^```mermaid$/{f=1;n++;file=d"/mm-"n".mmd";next} /^```$/{f=0} f{print > file}' path/to/doc.md
   ```

2. **Have `mermaid` and `jsdom` importable.** You have no network, so they
   cannot be installed from a job. Use a directory where they are already
   installed (a capability your job requires, or the project's own
   `node_modules` if it has both). If neither exists, say in your report that
   the diagrams were not validated; do not claim they were.
3. **Write `check.mjs`** beside those packages:

   ```js
   import { readFileSync } from 'fs';
   import { JSDOM } from 'jsdom';

   const dom = new JSDOM('<!DOCTYPE html><body></body>');
   globalThis.window = dom.window;
   globalThis.document = dom.window.document;
   Object.defineProperty(globalThis, 'navigator', {
     value: dom.window.navigator,
     configurable: true,
   });
   globalThis.DOMPurify = { sanitize: x => x, addHook: () => {} };
   const mermaid = (await import('mermaid')).default;
   mermaid.initialize({ startOnLoad: false });

   let fail = 0;
   for (const f of process.argv.slice(2)) {
     try {
       const r = await mermaid.parse(readFileSync(f, 'utf8'));
       console.log(f, 'OK', r.diagramType);
     } catch (e) {
       fail = 1;
       console.log(f, 'PARSE-FAIL:', e.message?.slice(0, 300));
     }
   }
   process.exit(fail);
   ```

4. **Run it** on the extracted blocks: `node check.mjs "$mmdir"/mm-*.mmd`.

## Output

One line per block, `OK <diagramType>` or `PARSE-FAIL: <message>`, and a
nonzero exit if any failed. Cite the `OK` lines in your report as the
evidence: "diagrams validated" means this, not reading them by eye.

## Notes

- `globalThis.navigator` is getter-only on recent Node; a bare assignment
  throws, hence `Object.defineProperty`.
- Parse-only catches grammar, not layout (labels overflowing, huge graphs).
  Grammar is what breaks GitHub's rendering.
- In a `sequenceDiagram`, an ASCII arrow (`->`) inside a message's text,
  after the colon, is read as an arrow and fails the parse. Rephrase the
  message ("A then B", "A to B").

Not built yet: a capability that brings `mermaid` and `jsdom`, pinned, so a
job can require it ([capabilities](../../capabilities/README.md)).

Adapted from the prior garden's `skills/mermaid-validation`.
