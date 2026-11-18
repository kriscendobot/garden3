import test from 'node:test';
import assert from 'node:assert/strict';
import { toArgs, fromArgs } from '../src/shon.js';

test('SHON round-trips the data the garden passes on command lines', () => {
  const cases = [
    { op: 'clear', slot: 'slot01', uid: 2001 },
    { name: 'hello', count: 42, nested: { verbose: true, off: false, none: null }, list: [1, 2.5, 'three', [4]] },
    { tricky: ['42', '-t', '--', '[', ']', '-7', '--key', '', 'has space', '1.5'] },
    { empty_list: [], empty_obj: {} },
    [1, 'two', { three: 3 }],
  ];
  for (const c of cases) assert.deepEqual(fromArgs(toArgs(c)).value, c, JSON.stringify(c));
});

test('the spelling is the one SHON.md gives', () => {
  assert.deepEqual(toArgs({ name: 'hello', count: 42 }), ['[', '--name', 'hello', '--count', '42', ']']);
  assert.deepEqual(toArgs({ servers: ['a:1', 'b:2'], options: { verbose: true } }), ['[', '--servers', '[', 'a:1', 'b:2', ']', '--options', '[', '--verbose', '-t', ']', ']']);
  assert.deepEqual(toArgs({ s: '42' }), ['[', '--s', '--', '42', ']']);
  assert.deepEqual(fromArgs(['[', '--x', '1.0', '--y', '2', ']', 'more']), { value: { x: 1, y: 2 }, rest: ['more'] });
  assert.deepEqual(fromArgs(['[--]']).value, {});
});

test('malformed and unsupported input is refused', () => {
  for (const bad of [['hello'], ['['], ['[', '--k', ']'], ['[', '--a', '1', 'stray', ']'], ['[', '-x', 'cafe', ']'], [']']]) {
    assert.throws(() => fromArgs(bad), /SHON/, bad.join(' '));
  }
  assert.throws(() => toArgs({ 'bad key': 1 }));
  assert.throws(() => toArgs('scalar'));
});
