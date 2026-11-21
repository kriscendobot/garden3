// The inventory of what the prior garden had: every role and skill accounted
// for, each one ported to the plots it names, and those plots the garden's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, parseYaydown } from '../src/yay.js';
import { genomeEntries } from '../src/plots.js';
import { git, SHED } from './helpers.js';

const read = f => fs.readFileSync(path.join(SHED, f), 'utf8');
const inventory = parse(read('upstream/inventory.yay'));
const placed = e => [...(e.plots ?? []), ...(e.full ?? []), ...(e.abbreviated ?? [])];

test('the inventory accounts for each item once, with a disposition', () => {
  const seen = new Set();
  for (const e of inventory.entries) {
    assert.ok(!seen.has(e.source_path), `${e.source_path} once`);
    seen.add(e.source_path);
    assert.ok(['port', 'merge', 'done', 'excluded', 'superseded'].includes(e.disposition), `${e.source_path}: ${e.disposition}`);
    assert.ok(e.certainty >= 0 && e.certainty <= 1);
    if (e.disposition === 'merge') assert.ok(e.into, `${e.source_path} names what it merges into`);
    if (e.disposition === 'excluded') assert.ok(e.note, `${e.source_path} says why it is left out`);
  }
  assert.match(inventory.source.commit, /^[0-9a-f]{40}$/);
});

test('a ported item is in the genome, on plots the garden has, in proportion to certainty', () => {
  const genome = genomeEntries(read('plots/genome-paths'));
  const plots = parse(read('config/garden.yay')).plots;
  assert.deepEqual(inventory.plots, plots, 'the inventory places items on the configured plots');
  for (const e of inventory.entries.filter(x => x.disposition === 'port')) {
    assert.ok(genome.includes(e.path), `${e.path} is a genome path`);
    const on = placed(e);
    assert.ok(on.length >= 1 && on.every(p => plots.includes(p)), `${e.path} is on known plots`);
    assert.equal(new Set(on).size, on.length, `${e.path} once per plot`);
    assert.ok(on.length >= Math.min(plots.length, Math.max(1, Math.round(e.certainty * plots.length))) - 1, `${e.path} on enough plots for its certainty`);
  }
});

test('each plot that exists holds what the inventory puts on it, saying where it came from', t => {
  const plots = git(SHED, 'for-each-ref', '--format=%(refname:strip=3)', 'refs/heads/plot/').split('\n').filter(Boolean);
  const landed = inventory.entries.filter(e => e.disposition === 'port' && e.landed);
  if (!landed.length) return t.skip('nothing is landed yet');
  for (const e of landed) {
    for (const plot of placed(e).filter(p => plots.includes(p))) {
      const files = git(SHED, 'ls-tree', '-r', '--name-only', `plot/${plot}`, '--', e.path).split('\n').filter(Boolean);
      const main = files.find(f => /\/(SKILL|AGENT)\.md$/.test(f));
      assert.ok(main, `plot/${plot} holds ${e.path}`);
      const { front } = parseYaydown(git(SHED, 'show', `plot/${plot}:${main}`), main);
      assert.equal(front.adopted_from?.path, e.source_path, `plot/${plot}:${main} says where it came from`);
      assert.match(String(front.adopted_from?.commit), /^[0-9a-f]{40}$/);
    }
  }
});
