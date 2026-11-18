// The board as a service, against a real (throwaway) git remote: records are
// YAY on the shard, claims are compare-and-swap between hosts, completions go
// archive-first, and every clone stays shallow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkGarden, git } from './helpers.js';
import { makeBoardService } from '../src/boardService.js';
import { parse } from '../src/yay.js';

const svc = (g, name, extra = {}) => {
  const h = g.host(name);
  return { h, board: makeBoardService({ shards: h.shards, host: name, clock: g.clock, ...extra }) };
};

test('post, claim, complete: records are YAY and the archive is written first', async t => {
  const g = mkGarden(t);
  const a = svc(g, 'host-a');
  const b = svc(g, 'host-b');
  assert.equal(await a.board.post({ id: 'fix-a', role: 'builder', title: 'Fix A', arc: 'endo', body: 'Do the thing.\nThen stop.\n' }), true);
  assert.equal(await a.board.post({ id: 'fix-a', role: 'builder', title: 'again' }), false, 'posting twice is a no-op');
  await a.board.post({ id: 'fix-b', role: 'builder', title: 'Fix B', after: ['fix-a'] });
  const text = g.show('board', 'open/fix-a.yay');
  assert.match(text, /^after: \[\]\narc: "endo"\n/, 'the record is canonical YAY');
  assert.match(text, /\nbody: `\n {2}Do the thing\.\n {2}Then stop\.\n/, 'with the body as a block string');
  assert.equal(parse(text).title, 'Fix A');
  await assert.rejects(a.board.post({ id: '../x', role: 'builder', title: 'x' }), { code: 'invalid' });

  const job = await a.board.claim({ worker: 'w1' });
  assert.equal(job.id, 'fix-a', 'the ready job is claimed, not the blocked one');
  assert.ok(g.show('board', 'claimed/host-a/fix-a.yay'));
  assert.equal(await b.board.claim({ worker: 'w1' }), null, 'nothing else is claimable yet');
  await assert.rejects(b.board.complete('fix-a', 'done'), { code: 'not-held' }, 'only the holder may complete');

  await a.board.complete('fix-a', 'done', { cost: { tokens: 1234, elapsed_s: 60 }, report: 'It is done.\n' });
  assert.equal(g.show('board', 'claimed/host-a/fix-a.yay'), null);
  const month = g.ls('archive').find(f => f.endsWith('/fix-a.yay'));
  const rec = parse(g.show('archive', month));
  assert.deepEqual([rec.outcome, rec.cost.tokens, rec.report, rec.level], ['done', 1234, 'It is done.\n', 0]);
  assert.equal(await a.board.complete('fix-a', 'done'), false, 'completing twice is a no-op');
  assert.equal(g.remoteGit('log', '--oneline', 'archive', '--', month).split('\n').length, 1);
  assert.equal((await b.board.claim({ worker: 'w1' })).id, 'fix-b', 'the dependent is claimable once its dependency left');
  assert.deepEqual(parse(g.show('board', 'claimed/host-b/fix-b.yay')).under['fix-a'], { level: 0, step: false });
});

test('two hosts race for one job: exactly one wins', async t => {
  const g = mkGarden(t);
  const [a, b, c] = ['host-a', 'host-b', 'host-c'].map(n => svc(g, n));
  await a.board.post({ id: 'race', role: 'builder', title: 'Race' });
  // Both read the same tip, then both try to push their claim.
  b.h.shards.shard('board', 'board').sync();
  c.h.shards.shard('board', 'board').sync();
  const won = (await Promise.all([b.board.claim({ worker: 'w' }), c.board.claim({ worker: 'w' })])).filter(Boolean);
  assert.equal(won.length, 1);
  assert.equal(g.ls('board').filter(f => f.endsWith('/race.yay')).length, 1);
});

test('a lost push is retried from the fresh tip, and clones stay shallow', async t => {
  const g = mkGarden(t);
  const a = svc(g, 'host-a');
  const b = svc(g, 'host-b');
  await a.board.post({ id: 'one', role: 'builder', title: '1' });
  // host-b's clone is now stale; its post must still land on top of host-a's.
  b.h.shards.shard('board', 'board').sync();
  await a.board.post({ id: 'two', role: 'builder', title: '2' });
  await b.board.post({ id: 'three', role: 'builder', title: '3' });
  assert.deepEqual(g.ls('board').filter(f => f.startsWith('open/') && f.endsWith('.yay')), ['open/one.yay', 'open/three.yay', 'open/two.yay']);
  const clone = b.h.shards.shard('board', 'board');
  clone.sync();
  assert.equal(git(clone.dir, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.equal(git(clone.dir, 'rev-list', '--count', 'HEAD'), '1', 'a synced clone holds one commit, whatever the history');
});

test('hand-off, back-track and sweep through the service', async t => {
  const g = mkGarden(t);
  const { board } = svc(g, 'host-a');
  await board.post({ id: 'a', role: 'builder', title: 'A' });
  await board.post({ id: 'b', role: 'builder', title: 'B', after: ['a'] });
  await board.claim({ worker: 'w' });
  const r = await board.handoff('a', { reason: 'out of time', elapsed_s: 2300, window_s: 2400, steps: [{ id: 'a-1', body: 'First part.\n' }, { id: 'a-2' }] }, { cost: { tokens: 1000 } });
  assert.equal(r.n, 1);
  const level = id => parse(g.show('board', g.ls('board').find(f => f.endsWith(`/${id}.yay`)))).level;
  assert.deepEqual([level('a'), level('b'), level('a-1')], [1, 1, 0]);
  assert.ok(g.show('board', 'held/a.yay'));
  assert.deepEqual(await board.abandon('a-1', { by: 'kriskowal', reason: 'dead end' }), ['a-1']);
  assert.equal(parse(g.show('archive', g.ls('archive').find(f => f.endsWith('/a-1.yay')))).outcome, 'abandoned');
  assert.equal(level('a'), 1, 'a-2 still holds the level');
  await board.abandon('a-2');
  assert.deepEqual([level('a'), level('b')], [0, 0], 'levels fall when the branches are gone');
  assert.deepEqual(await board.sweep(), ['a: steps done; reopened for its closing run']);
  assert.ok(g.show('board', 'open/a.yay'));
  assert.deepEqual(await board.sweep(), [], 'a sweep with nothing to do lands nothing');
});

test('a quiescence stops claims', async t => {
  const g = mkGarden(t);
  const a = svc(g, 'host-a');
  await a.board.post({ id: 'q1', role: 'builder', title: 'Q' });
  const s = a.h.shards.shard('test', 'board');
  await s.land('phase', tree => (tree.write('quiescence.yay', 'phase: "quiesce"\n'), {}));
  assert.equal(await a.board.claim({ worker: 'w' }), null);
  await s.land('phase', tree => (tree.write('quiescence.yay', 'phase: "idle"\n'), {}));
  assert.equal((await a.board.claim({ worker: 'w' })).id, 'q1');
});

test('deadlines: two watchers expire one silent claim; the late run is fenced', async t => {
  const g = mkGarden(t);
  const config = { worker: { window_seconds: 100, kill_after_seconds: 10 }, board: { expiry_grace_seconds: 50, clock_tolerance_seconds: 30 } };
  const mk = name => { const h = g.host(name); return { h, board: makeBoardService({ shards: h.shards, host: name, clock: g.clock, config }) }; };
  const [client, w1, w2] = ['client', 'watcher-1', 'watcher-2'].map(mk);
  await w1.board.post({ id: 'job', role: 'builder', title: 'J' });
  await w1.board.post({ id: 'next', role: 'builder', title: 'N', after: ['job'] });
  const claimed = await client.board.claim({ worker: 'w' });
  assert.deepEqual([claimed.claim.generation, claimed.claim.window_s], [1, 100]);
  assert.deepEqual(await w1.board.sweep(), [], 'a live lease is left alone');

  // The client goes silent. Its lease (100 + 10 + 50 s) and the tolerance pass.
  g.clock.set(new Date(Date.parse(claimed.claim.expires_at) + 31000).toISOString());
  // Both watchers read the same tip, then both sweep.
  w1.h.shards.shard('board', 'board').sync();
  w2.h.shards.shard('board', 'board').sync();
  const notes = (await Promise.all([w1.board.sweep(), w2.board.sweep()])).flat();
  assert.equal(notes.length, 1, 'exactly one expiry lands');
  assert.match(notes[0], /job: lease held by client \(generation 1\) ran out; released without waiting/);
  const job = parse(g.show('board', 'open/job.yay'));
  assert.deepEqual([job.expiries, job.expired_claims.length, job.expired_claims[0].host], [1, 1, 'client'], 'counted once, not twice');

  const second = await w1.board.claim({ worker: 'w' });
  assert.deepEqual([second.id, second.claim.generation], ['job', 2]);

  // The client wakes and reports, under the generation it was claimed with.
  await assert.rejects(client.board.complete('job', 'done', { generation: 1, cost: { tokens: 50 }, report: 'late\n' }), { code: 'superseded' });
  await assert.rejects(client.board.handoff('job', { steps: [{ id: 's' }] }, { generation: 1 }), { code: 'superseded' });
  await assert.rejects(client.board.release('job', { generation: 1 }), { code: 'superseded' });
  assert.equal(g.ls('archive').some(f => f.endsWith('/job.yay')), false, 'nothing of the late run reached the archive');
  assert.equal(parse(g.show('board', 'claimed/watcher-1/job.yay')).claim.generation, 2, "the successor's claim stands");
  assert.equal(await client.board.holds('job', 1), false);
  assert.equal(await w1.board.holds('job', 2), true);
  assert.equal(await client.board.late('job', { generation: 1, cost: { tokens: 50, elapsed_s: 400 } }), true);
  assert.deepEqual(parse(g.show('board', 'claimed/watcher-1/job.yay')).cost, { tokens: 50, elapsed_s: 400, engagements: 1 }, 'its time is still in the cost');

  await w1.board.complete('job', 'done', { generation: 2, cost: { tokens: 10 }, report: 'on time\n' });
  const rec = parse(g.show('archive', g.ls('archive').find(f => f.endsWith('/job.yay'))));
  assert.deepEqual([rec.report, rec.cost.tokens, rec.expiries], ['on time\n', 60, 1]);
  assert.equal((await w2.board.claim({ worker: 'w' })).id, 'next', 'the dependent was never stuck');
});
