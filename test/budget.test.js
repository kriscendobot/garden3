// The budget: per-arc throttles become a weekly slate; spend is summed from
// each host's own usage branch; admission reserves a flat amount per job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkGarden } from './helpers.js';
import * as budget from '../src/budget.js';
import { makeBudgetService } from '../src/budget.js';
import { makeBoardService } from '../src/boardService.js';
import { parse, stringify } from '../src/yay.js';

const setup = async t => {
  const g = mkGarden(t, { hostBranches: ['host-a', 'host-b'] });
  const mk = name => {
    const h = g.host(name);
    return makeBudgetService({ shards: h.shards, host: name, clock: g.clock, config: { budget: { planning_ceiling: 0.9, reservation_tokens: 2000000 } } });
  };
  const seed = g.host('seed').shards.shard('seed', 'journal');
  await seed.land('seed', tree => {
    tree.write('config/maintainers.yay', stringify({ maintainers: ['kriskowal'] }));
    tree.write('config/pools.yay', stringify({ pools: [{ pool: 'p1', weekly_tokens: 60000000 }, { pool: 'p2', weekly_tokens: 40000000 }] }));
    return {};
  });
  return { g, a: mk('host-a'), b: mk('host-b'), mk };
};
const cap = (snap, arc) => snap.slate.arcs.find(x => x.arc === arc).cap;

test('throttles become a slate; only maintainers set them', async t => {
  const { g, a } = await setup(t);
  await a.setThrottle({ by: 'KrisKowal', arc: 'endo', throttle: 3, summary: 'the endo arc' });
  await a.setThrottle({ by: 'kriskowal', arc: 'garden', throttle: 1 });
  await assert.rejects(a.setThrottle({ by: 'mallory', arc: 'endo', throttle: 100 }), { code: 'not-maintainer' });
  const arcs = parse(g.show('journal', 'config/arcs.yay')).arcs;
  assert.deepEqual([arcs[1].arc, arcs[1].throttle, arcs[1].set_by], ['endo', 3, 'KrisKowal']);
  const snap = await a.refresh();
  assert.equal(snap.slate.total, 90000000, 'the ceiling times the pools');
  assert.deepEqual([cap(snap, 'endo'), cap(snap, 'garden')], [54000000, 18000000], 'three fifths and one fifth');
  assert.deepEqual(snap.slate.arcs.map(x => x.arc), ['endo', 'unallocated', 'garden'], 'highest throttle first; ties keep file order');
  await a.setThrottle({ by: 'kriskowal', arc: 'garden', retire: true });
  const after = await a.refresh();
  assert.equal(cap(after, 'endo'), 67500000, "a retired arc's share goes to the others");
  assert.equal(budget.admits(after, { arc: 'garden' }, null, 2000000).admit, false);
  await a.setThrottle({ by: 'kriskowal', arc: 'garden', throttle: 0 });
  assert.equal(budget.admits(await a.refresh(), { arc: 'garden' }, null, 2000000).admit, false, 'a throttle of zero admits nothing');
});

test('spend is summed from every host branch; level plays no part in admission', async t => {
  const { g, a, b } = await setup(t);
  await a.setThrottle({ by: 'kriskowal', arc: 'endo', throttle: 3 });
  await a.recordUsage({ id: 'j1', arc: 'endo', pool: 'p1', input_tokens: 1000000, output_tokens: 500000, cache_creation_tokens: 250000, cache_read_tokens: 9000000 });
  await b.recordUsage({ id: 'j2', arc: 'endo', pool: 'p2', input_tokens: 2000000 });
  await a.recordUsage({ id: 'j3', input_tokens: 7 });
  assert.ok(g.ls('host/host-a').some(f => f.startsWith('usage/')), 'rows land on the host’s own branch');
  assert.ok(!g.ls('board').some(f => f.includes('usage')), 'and never on the board');
  const snap = await a.refresh();
  assert.deepEqual([snap.spend.by_arc.endo, snap.spend.by_arc.unallocated, snap.spend.by_host['host-b']], [3750000, 7, 2000000]);
  assert.equal(budget.spend([{ ts: '2020-01-01T00:00:00Z', arc: 'endo', input_tokens: 9e9 }], snap.slate.week_start).rows, 0, 'rows before the week start do not count');
  assert.equal(budget.admits(snap, { arc: 'endo', level: 0 }, null, 2000000).admit, true);
  assert.equal(budget.admits(snap, { arc: 'endo', level: 9 }, null, 2000000).admit, true, 'a high level does not change admission');
  assert.equal(budget.admits(snap, { arc: 'nosuch' }, null, 2000000).admit, false);
  assert.equal(budget.admits(null, { arc: 'endo' }, null, 2000000).admit, false, 'an unknown budget fails closed');
  assert.equal(budget.weekStart('2026-10-31T17:00:00Z', '2026-11-17T00:00:00Z'), Date.parse('2026-11-14T17:00:00Z') / 1000);
});

test('the claim gate: arc rank orders, reservations hold, no snapshot refuses', async t => {
  const { g, a } = await setup(t);
  await a.setThrottle({ by: 'kriskowal', arc: 'endo', throttle: 3 });
  await a.setThrottle({ by: 'kriskowal', arc: 'tiny', throttle: 0.2 });
  const h = g.host('host-a');
  const board = makeBoardService({ shards: h.shards, host: 'host-a', clock: g.clock, budget: a });
  for (const i of [1, 2, 3]) await board.post({ id: `t${i}`, role: 'builder', title: 't', arc: 'tiny' });
  await board.post({ id: 'e1', role: 'builder', title: 'e', arc: 'endo', priority: 9 });
  assert.equal(await board.claim({ worker: 'w' }), null, 'with no budget snapshot nothing is claimed');
  const snap = await a.refresh();
  assert.equal(cap(snap, 'tiny'), 4285714);
  assert.equal((await board.claim({ worker: 'w0' })).id, 'e1', 'the higher-ranked arc is drawn first, whatever the priority');
  assert.equal((await board.claim({ worker: 'w1' })).id, 't1');
  assert.equal((await board.claim({ worker: 'w2' })).id, 't2', 'two reservations fit in 4.28M');
  assert.equal(await board.claim({ worker: 'w3' }), null, 'the third is held by the two in flight');
});
