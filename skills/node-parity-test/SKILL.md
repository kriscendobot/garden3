---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/node-parity-test"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Node parity test

Purpose: back a Node.js parity claim with code, not prose. Where a pull
request, a JSDoc comment or a commit message would say "matches Node.js" or
"verified directly with node", write a parity pair instead: one test runs the
artifact under inspection (SES, the compartment mapper, a daemon's loader) on
a fixture; a companion runs the same fixture under plain Node.js; both call
the same assertions. If both pass, parity holds by construction.

A builder writes the pair when a change touches a path that imitates Node; a
reviewer asks for one when a claim of parity has none.

## When to use

- A change introduces or alters behaviour on a Node-adjacent path: a module
  linker, loader, resolver, `require` or `import` edge case, module cache.
- A test or commit message reaches for "matches Node", "same as Node.js",
  "verified under node", "per Node v22".
- A reviewer or maintainer asks "does Node do the same?"

If a parity test in the same package already covers the claim, cite it. If
the case would add a single assertion, add it to an existing pair and note it
in that assertions module's summary rather than make a new set.

## The four files

1. **Shared fixture**: `packages/<pkg>/test/fixtures-<name>/node_modules/app/`.
   Real modules on disk a real loader resolves, not inline source. Its
   `package.json` carries
   `"preinstall": "echo DO NOT INSTALL TEST FIXTURES; exit -1"` so a stray
   workspace install cannot hoist it.
2. **Shared assertions**: `packages/<pkg>/test/_<name>-assertions.js`,
   exporting `assert<Name>(t, namespace)`. The expected values live here
   only. The leading underscore keeps the test runner (Ava) from running it as
   a test.
3. **System under test**: `packages/<pkg>/test/<name>.test.js`. Loads the
   fixture through the artifact and passes the namespace to the assertions.
4. **Node parity**: `packages/<pkg>/test/<name>-node-parity.test.js`. Loads
   the same fixture under plain Node (`import()`, or `require()` for CommonJS)
   and calls the same assertions.

## When parity holds

```js
// packages/compartment-mapper/test/cycle-rename.test.js
import { scaffold } from './scaffold.js';
import { assertCycleRename } from './_cycle-rename-assertions.js';

const fixture = new URL(
  'fixtures-cycle-rename/node_modules/app/main.js',
  import.meta.url,
).toString();

scaffold(
  'cyclic star export with renaming reexport (issue #59)',
  test,
  fixture,
  (t, { namespace }) => assertCycleRename(t, namespace),
  3,
);
```

```js
// packages/compartment-mapper/test/cycle-rename-node-parity.test.js
import test from 'ava';
import { assertCycleRename } from './_cycle-rename-assertions.js';

test('cyclic star export with renaming reexport (issue #59) - node parity', async t => {
  t.plan(3);
  const namespace = await import(
    new URL('fixtures-cycle-rename/node_modules/app/main.js', import.meta.url)
      .href
  );
  assertCycleRename(t, namespace);
});
```

If either side regresses, the shared assertion fails on that side, and the
other side's pass says where the divergence is.

## When it deliberately does not

The fixture is still shared; each side asserts its own behaviour. The Node
side usually asserts an error code, from a fresh Node process:

```js
// packages/compartment-mapper/test/cycle-esm-in-cjs-node-parity.test.js
test('ESM-in-CJS-cycle - node parity (rejects with ERR_REQUIRE_CYCLE_MODULE)', t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-cycle-esm-in-cjs/node_modules/app/main.mjs',
    import.meta.url,
  );
  const result = spawnSync(process.execPath, [fileURLToPath(fixture)], {
    encoding: 'utf8',
  });
  t.not(result.status, 0, 'Expected Node to reject');
  t.regex(result.stderr, /ERR_REQUIRE_CYCLE_MODULE/);
});
```

Both behaviours are pinned: a change that accidentally re-aligns the artifact
with Node fails one test; a Node release that changes its error code fails the
other. The *reason* for the divergence goes in a JSDoc comment on both files.
The reason is prose; the behaviour is code. A divergence pair needs no shared
assertions module, since the two sides assert opposite outcomes.

## Reference pairs

In `endojs/endo-but-for-bots` (`llm`, and carried to `endojs/endo` `master`),
from the `endojs/endo#59` work, under `packages/compartment-mapper/test/`:

- `cycle-rename`: parity, a populated live binding.
- `cycle-rename-unused`: parity, an unused live binding.
- `cycle-cjs-reexporter`: parity, a CommonJS re-exporter.
- `cycle-esm-in-cjs`: divergence, the `spawnSync` and `stderr` shape.

Each is `<name>.test.js`, `<name>-node-parity.test.js`,
`_<name>-assertions.js` (not for the divergence) and `fixtures-<name>/`.

## Norms

- **Plan the count.** Both sides call `t.plan(N)` with the assertions'
  count, so an assertion that silently returned early is caught.
- **Spawn a fresh process for divergence errors.** Importing a divergent
  fixture inside the runner can corrupt its module graph, and once crashed V8
  itself (`Check failed: module_status == ...`, on
  `endojs/endo-but-for-bots#379`).
- **Cite the pair by name** in the commit body and the pull request, instead
  of claiming parity in prose.
- The same fixture often serves as regression evidence too: the SES side
  shows the bug fixed, the Node side the claim of parity
  ([regression-evidence](../regression-evidence/SKILL.md)).

The convention was asked for by a maintainer in review of
`endojs/endo-but-for-bots#379`, in place of "verified directly with node".

Adapted from the prior garden's `skills/node-parity-test`.
