import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify, parseYaydown, stringifyYaydown } from '../src/yay.js';

test('records round-trip through YAY', () => {
  const job = {
    id: 'fix-a',
    title: 'Fix "A": the\\thing',
    after: ['x', 'y'],
    requires: [],
    under: {},
    level: 0,
    throttle: 0.2,
    big: 2000000,
    hold: { reason: 'handoff', at: '2026-11-17T00:00:00Z' },
    handoff_log: [
      { n: 1, steps: ['a-1', 'a-2'], reason: 'out of time', window_s: null },
      { n: 2, steps: [], reason: '' },
    ],
    cost: { tokens: 12, elapsed_s: 3, engagements: 1 },
    nested: [[1, 2], [3]],
    flag: true,
    body: 'Line one.\n\n  indented line\nLine "three" with `backticks` and # hash.\n',
  };
  const text = stringify(job);
  assert.deepEqual(parse(text), job);
  assert.match(text, /^after:\n {2}- "x"\n {2}- "y"\n/, 'keys are sorted and arrays are block lists');
  assert.match(text, /\nbody: `\n {2}Line one\.\n\n {4}indented line\n.*\n\ncost:/, 'a multi-line string is a block');
  assert.equal(stringify(parse(text)), text, 'writing is canonical');
});

test('awkward strings are quoted rather than written wrong', () => {
  for (const s of ['', ' ', 'a\n', 'trailing space \nx\n', '\nleading\n', 'no newline at end\nx', 'tab\there\n', 'two\n\n', '# not a comment', '- not a list', 'key: value', '\u0001', '😀']) {
    assert.deepEqual(parse(stringify({ s })), { s }, JSON.stringify(s));
  }
});

test('multi-line strings anywhere in a record survive, block or quoted', () => {
  const deep = {
    body: 'top\nlevel\n',
    hold: { note: 'nested\nobject\n' },
    handoff_log: [{ n: 1, reason: 'in a\nlist item\n', steps: ['a'] }],
    steps: [{ id: 's', body: 'a step\nbody\n', inner: { text: 'deeper\nstill\n' } }],
    lines: ['one\ntwo\n'],
  };
  const text = stringify(deep);
  assert.deepEqual(parse(text), deep);
  assert.match(text, /^body: `\n {2}top\n {2}level\n/, 'a top-level one is still a block');
  assert.match(text, /reason: "in a\\nlist item\\n"/, 'inside a list item it is quoted');
  assert.equal(stringify(parse(text)), text);
});

test('integers and floats stay distinct', () => {
  const text = stringify({ i: 3, f: 0.5, whole: 2 });
  assert.match(text, /^f: 0\.5\ni: 3\nwhole: 2\n$/);
  assert.equal(typeof parse('n: 9007199254740991\n').n, 'number');
  assert.throws(() => parse('n: 9007199254740993\n'), /too large/);
});

test('what cannot be a document is refused', () => {
  assert.throws(() => stringify({}));
  assert.throws(() => stringify([1]));
  assert.throws(() => stringify({ f: () => 1 }));
  assert.throws(() => parse('a: [1,\n'));
});

test('Yaydown front matter is strict', () => {
  const doc = stringifyYaydown({ created: '2026-11-17', author: 'steward' }, '# Title\n\nBody.\n');
  assert.equal(doc, '---\nauthor: "steward"\ncreated: "2026-11-17"\n---\n\n# Title\n\nBody.\n');
  assert.deepEqual(parseYaydown(doc), { front: { author: 'steward', created: '2026-11-17' }, body: '# Title\n\nBody.\n' });
  assert.throws(() => parseYaydown('---\na: 1\n---\n# no blank line\n'));
  assert.throws(() => parseYaydown('---\na: 1\n---\n\n\n# two blank lines\n'));
  assert.throws(() => parseYaydown('# no front matter\n'));
});
