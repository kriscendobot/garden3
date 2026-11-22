// The budget: weekly envelopes per pool (maintainer, arcs, foreman); spend is
// summed from each host's own usage branch; admission reserves a flat amount
// per job and names the envelope it draws on.
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

test('envelopes: the maintainer releases to the arcs, and everything tapers to the foreman', () => {
  const at = (f, spent) => budget.envelopes({ total: 1000, shares: { ironhorse: 0.25, endo: 0.5 }, f, spent });
  const credit = e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.available]));
  assert.deepEqual(credit(at(0)), { ironhorse: 0, endo: 0, maintainer: 1000, foreman: 0 }, 'the week starts with the maintainer');
  assert.deepEqual(credit(at(0.25)), { ironhorse: 125, endo: 250, maintainer: 625, foreman: 0 }, 'half released by a quarter of the week');
  assert.deepEqual(credit(at(0.5)), { ironhorse: 250, endo: 500, maintainer: 250, foreman: 0 }, 'all released by mid-week; the unshared quarter stays with the maintainer');
  assert.deepEqual(credit(at(0.75)), { ironhorse: 125, endo: 250, maintainer: 125, foreman: 500 }, 'half of every balance tapered by three quarters');
  assert.deepEqual(credit(at(1)), { ironhorse: 0, endo: 0, maintainer: 0, foreman: 1000 }, 'the foreman holds it all at the end');
  const spent = at(0.75, { ironhorse: 200, foreman: 100 });
  assert.deepEqual([spent.ironhorse.available, spent.ironhorse.swept, spent.foreman.credit, spent.foreman.available], [25, 25, 400, 300], 'only the unspent balance tapers, and the foreman spends from what came to it');
  const over = at(0.25, { endo: 400 });
  assert.equal(over.endo.available, -150, 'an envelope can be overdrawn by a run that cost more than its reservation');
});

test('shares and pools: fractions of the week, set by maintainers, never past the whole', async t => {
  const { g, a } = await setup(t);
  await a.setShare({ by: 'kriskowal', arc: 'ironhorse', share: 0.25, summary: 'the test262 ratchet' });
  await assert.rejects(a.setShare({ by: 'kriskowal', arc: 'endo', share: 0.8 }), { code: 'over' });
  await assert.rejects(a.setShare({ by: 'kriskowal', arc: 'maintainer', share: 0.1 }), { code: 'invalid' });
  await assert.rejects(a.setShare({ by: 'mallory', arc: 'endo', share: 0.1 }), { code: 'not-maintainer' });
  await assert.rejects(a.setPool({ by: 'mallory', pool: 'p1', weekly_tokens: 1 }), { code: 'not-maintainer' });
  await a.setPool({ by: 'kriskowal', pool: 'p1', weekly_tokens: 100000000, hosts: ['host-a'] });
  const pools = parse(g.show('journal', 'config/pools.yay')).pools;
  assert.deepEqual(pools.map(p => [p.pool, p.weekly_tokens]), [['p1', 100000000], ['p2', 40000000]]);
  g.clock.set('2026-11-18T05:00:00Z'); // half the week from 2026-11-14T17:00Z
  const snap = await a.refresh();
  assert.deepEqual(snap.slate.arcs.map(x => [x.arc, x.share]), [['ironhorse', 0.25], ['unallocated', 0]], 'once any arc has a share, an arc without one has none');
  assert.equal(snap.pool, 'p1', 'a host draws on the pool that lists it');
  const p1 = snap.pools.find(p => p.pool === 'p1');
  assert.equal(p1.total, 90000000);
  assert.ok(Math.abs(p1.envelopes.ironhorse.credit - 22500000) <= 2, 'a quarter of the total, all released at mid-week');
  assert.equal(p1.envelopes.maintainer.credit, 90000000 - p1.envelopes.ironhorse.credit);
});

test('the claim gate: maintainer discretion early, arcs as released, the foreman when an arc is dry', async t => {
  const { g, a } = await setup(t);
  await a.setShare({ by: 'kriskowal', arc: 'ironhorse', share: 0.25 });
  const h = g.host('host-a');
  const board = makeBoardService({ shards: h.shards, host: 'host-a', clock: g.clock, budget: a });
  await board.post({ id: 'm1', role: 'builder', title: 'm', arc: 'maintainer' });
  await board.post({ id: 'i1', role: 'builder', title: 'i', arc: 'ironhorse', priority: 0 });
  assert.equal(await board.claim({ worker: 'w' }), null, 'with no budget snapshot nothing is claimed');
  g.clock.set('2026-11-14T17:00:30Z'); // the week has just begun
  await a.refresh();
  const first = await board.claim({ worker: 'w0' });
  assert.deepEqual([first.id, first.envelope], ['m1', 'maintainer'], 'only the maintainer has tokens at the start');
  assert.equal(await board.claim({ worker: 'w1' }), null, 'the arc has nothing released yet, and the foreman nothing');
  g.clock.set('2026-11-20T05:00:00Z'); // past the release, well into the taper
  await a.refresh();
  const second = await board.claim({ worker: 'w2' });
  assert.deepEqual([second.id, second.envelope], ['i1', 'ironhorse']);
  await a.recordUsage({ id: 'i0', arc: 'ironhorse', input_tokens: 50000000 });
  await board.post({ id: 'i2', role: 'builder', title: 'i', arc: 'ironhorse' });
  await a.refresh();
  const third = await board.claim({ worker: 'w3' });
  assert.deepEqual([third.id, third.envelope], ['i2', 'foreman'], 'an overdrawn arc is carried by the foreman');
  await a.recordUsage({ id: 'i2', arc: 'ironhorse', envelope: 'foreman', input_tokens: 1000 });
  assert.equal((await a.refresh()).spend.by_envelope.foreman, 1000, 'and charged to it');
});

test('the day is recorded once, with every envelope of every pool', async t => {
  const { g, a } = await setup(t);
  await a.setShare({ by: 'kriskowal', arc: 'ironhorse', share: 0.25 });
  g.clock.set('2026-11-19T00:00:00Z');
  await a.refresh();
  assert.equal(await a.recordDay(), 'budget/days/2026-11-19.yay');
  assert.equal(await a.recordDay(), null, 'once a day');
  const day = parse(g.show('journal', 'budget/days/2026-11-19.yay'));
  assert.deepEqual(day.pools.map(p => p.pool), ['p1', 'p2']);
  assert.deepEqual(Object.keys(day.pools[0].envelopes).sort(), ['foreman', 'ironhorse', 'maintainer', 'unallocated']);
  assert.ok(day.week_fraction > 0.6 && day.week_fraction < 0.62);
});
