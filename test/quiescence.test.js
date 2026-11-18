// Quiescence: the phase protocol, truncation of shared history (parked, never
// lost; refused on a race), recovery of stale hosts, and consolidation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkGarden, git } from './helpers.js';
import * as Q from '../src/quiescence.js';
import { makeQuiescenceService } from '../src/quiescence.js';
import { makeBoardService } from '../src/boardService.js';
import { makeFiles } from '../src/powers/node.js';
import { parse, stringify } from '../src/yay.js';
import fs from 'node:fs';
import path from 'node:path';

const NOW = '2026-11-17T00:00:00Z';
const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

test('the protocol: every host acknowledges each phase before the next', () => {
  let q = { phase: 'idle' };
  assert.equal(Q.duty(q, 'a', undefined), 'run');
  q = Q.call(q, { id: 'q-2026-11-17', by: 'a', hosts: ['a', 'b'], shed: 'abc' }, NOW);
  assert.equal(code(() => Q.call(q, { id: 'again', by: 'a', hosts: ['a'], shed: 'x' }, NOW)), 'busy');
  assert.deepEqual([Q.duty(q, 'a'), Q.duty(q, 'b'), Q.duty(q, 'stranger')], ['quiesce', 'quiesce', 'wait']);
  Q.ack(q, 'a', {}, NOW);
  assert.equal(Q.duty(q, 'a'), 'wait');
  assert.match(Q.advance(q, {}, NOW).reason, /waiting for b to quiesce/);
  Q.ack(q, 'b', {}, NOW);
  assert.match(Q.advance(q, { claimed: 1 }, NOW).reason, /still claimed/, 'acks are not enough while a job is claimed');
  assert.equal(Q.advance(q, { claimed: 0 }, NOW).moved, true);
  assert.equal(q.phase, 'truncate');
  assert.equal(code(() => Q.ack(q, 'a', {}, NOW)), 'no-ack');
  assert.match(Q.advance(q, {}, NOW).reason, /has not truncated/);
  q.truncated = { board: 1 };
  Q.advance(q, {}, NOW);
  assert.equal(q.phase, 'rejuvenate');
  Q.ack(q, 'a', { shed: 'abc' }, NOW);
  Q.ack(q, 'b', { shed: 'old' }, NOW);
  assert.match(Q.advance(q, {}, NOW).reason, /b rejuvenated to another shed/);
  Q.ack(q, 'b', { shed: 'abc' }, NOW);
  Q.advance(q, {}, NOW);
  assert.equal(q.phase, 'verify');
  Q.ack(q, 'a', { ok: true, capabilities: { node: 'p1', rust: 'r1' } }, NOW);
  Q.ack(q, 'b', { ok: true, capabilities: { node: 'p2' } }, NOW);
  assert.match(Q.advance(q, {}, NOW).reason, /capability drift: node \(a vs b\)/);
  Q.ack(q, 'b', { ok: false, capabilities: { node: 'p1' } }, NOW);
  assert.match(Q.advance(q, {}, NOW).reason, /b did not verify/);
  Q.ack(q, 'b', { ok: true, capabilities: { node: 'p1' } }, NOW);
  assert.equal(Q.advance(q, {}, NOW).moved, true, 'hosts may hold different sets, but not different pins');
  assert.deepEqual([q.phase, q.last.id, q.last.shed, q.acks], ['idle', 'q-2026-11-17', 'abc', undefined]);
  assert.equal(Q.duty(q, 'a', 'q-2026-11-17'), 'run');
});

test('a host that is offline is marked absent, and catches up before it runs', () => {
  let q = Q.call({ phase: 'idle' }, { id: 'q1', by: 'a', hosts: ['a', 'b'], shed: 's' }, NOW);
  Q.ack(q, 'a', {}, NOW);
  Q.markAbsent(q, 'b');
  assert.equal(Q.duty(q, 'b'), 'wait');
  assert.equal(code(() => Q.ack(q, 'b', {}, NOW)), 'absent');
  assert.equal(Q.advance(q, {}, NOW).moved, true, 'the fleet does not wait for an absent host');
  q.truncated = {};
  Q.advance(q, {}, NOW);
  Q.ack(q, 'a', { shed: 's' }, NOW);
  Q.advance(q, {}, NOW);
  Q.ack(q, 'a', { ok: true, capabilities: {} }, NOW);
  Q.advance(q, {}, NOW);
  assert.deepEqual([q.phase, q.last.absent], ['idle', ['b']]);
  assert.equal(Q.duty(q, 'b', undefined), 'catch-up', 'a returning host rejuvenates alone before claiming');
  assert.equal(Q.duty(q, 'b', 'q1'), 'run');
  assert.equal(Q.duty(q, 'new-host', undefined), 'catch-up', 'so does a host that joined later');
});

test('truncation parks history, refuses a race, and stale hosts recover', async t => {
  const g = mkGarden(t);
  const a = g.host('host-a');
  const board = makeBoardService({ shards: a.shards, host: 'host-a', clock: g.clock });
  for (const i of [1, 2, 3, 4, 5]) await board.post({ id: `j${i}`, role: 'builder', title: `J${i}` });
  const old = g.remoteGit('rev-parse', 'board');
  const count = g.remoteGit('rev-list', '--count', 'board');
  const ctx = { shards: a.shards, clock: g.clock };

  const dry = Q.truncate(ctx, 'board');
  assert.deepEqual([dry.ok, dry.applied, dry.park, dry.old], [true, false, 'refs/archive/board/epoch-0', old]);
  assert.equal(g.remoteGit('rev-parse', 'board'), old, 'a dry run moves nothing');
  assert.throws(() => g.remoteGit('rev-parse', '--verify', '--quiet', 'refs/archive/board/epoch-0'), 'and parks nothing');

  // A stale host: its clone predates the truncation, with an unpushed commit.
  const straggler = g.host('host-s').shards.shard('s', 'board');
  straggler.sync();
  straggler.tree.write('open/stray.yay', 'id: "stray"\n');
  git(straggler.dir, 'add', '-A');
  git(straggler.dir, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '--quiet', '-m', 'stray');

  const done = Q.truncate(ctx, 'board', { apply: true });
  assert.deepEqual([done.ok, done.applied, done.next], [true, true, 1]);
  assert.equal(g.remoteGit('rev-list', '--count', 'board'), '1', 'the branch is one commit');
  assert.equal(g.remoteGit('rev-parse', 'refs/archive/board/epoch-0'), old, 'the old tip is parked');
  assert.equal(g.remoteGit('rev-list', '--count', 'refs/archive/board/epoch-0'), count, 'with its whole history');
  assert.deepEqual(parse(g.show('board', 'EPOCH')), { epoch: 1, previous: old, at: parse(g.show('board', 'EPOCH')).at });
  assert.deepEqual(g.remoteGit('diff', '--name-only', old, 'board').split('\n'), ['EPOCH'], 'the tree is the same but for EPOCH');

  assert.notEqual(straggler.push('late'), 'landed', 'a push from the old history is rejected');
  assert.equal(straggler.sync(), true);
  assert.equal(git(straggler.dir, 'rev-parse', 'HEAD'), g.remoteGit('rev-parse', 'board'), 'after a sync the straggler is on the new root');
  assert.equal(straggler.tree.exists('open/stray.yay'), false);
  assert.equal(straggler.epoch(), 1);
  assert.equal(git(straggler.dir, 'rev-list', '--count', 'HEAD'), '1');
  assert.equal((await board.claim({ worker: 'w' })).id, 'j1', 'the board works on across the truncation');

  // A writer lands between the truncater's read and its push: the lease refuses.
  const raced = { ...a.shards, tip: branch => { const tip = a.shards.tip(branch); g.remoteGit('update-ref', 'refs/heads/board', g.remoteGit('commit-tree', `${tip}^{tree}`, '-p', tip, '-m', 'late write')); return tip; } };
  const lost = Q.truncate({ shards: raced, clock: g.clock }, 'board', { apply: true });
  assert.equal(lost.ok, false);
  assert.match(lost.reason, /moved while it was read|push refused/);
  assert.equal(g.remoteGit('log', '-1', '--format=%s', 'board'), 'late write', 'the late write is still the tip');
  assert.throws(() => g.remoteGit('rev-parse', '--verify', '--quiet', 'refs/archive/board/epoch-1'), 'and nothing half-truncated was parked');
  assert.equal(Q.truncate(ctx, 'board', { apply: true }).next, 2, 'a second attempt succeeds');
});

test('consolidation folds append-only records into bounded ones, idempotently', t => {
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, '.tmp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tree = makeFiles(dir);
  tree.write('done/2026/08/old-1.yay', stringify({ id: 'old-1', outcome: 'done', level: 2, cost: { tokens: 9 }, body: 'long\nbody\n', report: 'long\nreport\n' }));
  tree.write('done/2026/08/old-2.yay', stringify({ id: 'old-2', outcome: 'abandoned' }));
  tree.write('done/2026/11/new.yay', stringify({ id: 'new', outcome: 'done' }));
  assert.deepEqual(Q.rollupArchive(tree, NOW, 2), ['archive: 2026-08 rolled up (2 jobs)']);
  const roll = parse(tree.read('rollup/2026-08.yay'));
  assert.deepEqual(roll.jobs.map(j => [j.id, j.level, j.body]), [['old-1', 2, undefined], ['old-2', undefined, undefined]]);
  assert.equal(roll.jobs[0].cost.tokens, 9, 'cost and level survive; bodies and reports do not');
  assert.equal(tree.exists('done/2026/08'), false);
  assert.equal(tree.exists('done/2026/11/new.yay'), true, 'recent months stay whole');
  assert.deepEqual(Q.rollupArchive(tree, NOW, 2), [], 'a repeat changes nothing');

  tree.write('entries/2026/03/2026-03-01-host-a.md', 'March first.\n');
  tree.write('entries/2026/03/2026-03-02-host-a.md', 'March second.\n');
  tree.write('entries/2026/11/2026-11-01-host-a.md', 'Recent.\n');
  assert.deepEqual(Q.rollupEntries(tree, NOW, 6), ['journal: 2026-03 consolidated (2 digests)']);
  assert.match(tree.read('entries/2026-03.md'), /2026-03-01-host-a\.md -->\n\nMarch first\.\n\n<!-- 2026-03-02/);
  assert.equal(tree.exists('entries/2026/11/2026-11-01-host-a.md'), true);

  const ws = Date.parse('2026-11-14T17:00:00Z') / 1000;
  const rows = [
    { ts: '2026-11-08T00:00:00Z', arc: 'endo', pool: 'p1', input_tokens: 100 },
    { ts: '2026-11-09T00:00:00Z', arc: 'endo', pool: 'p1', output_tokens: 50, cache_read_tokens: 999 },
    { ts: '2026-11-02T00:00:00Z', input_tokens: 7 },
    { ts: '2026-11-15T00:00:00Z', arc: 'endo', input_tokens: 1000000 },
  ];
  assert.equal(Q.rollupUsage(tree, 'host-a', rows, ws).length, 2, 'two past weeks; the current week is left alone');
  const week = parse(tree.read('budget/weeks/2026-11-07.yay'));
  assert.deepEqual([week.billable, week.by_arc.endo, week.hosts['host-a'].rows], [150, 150, 2]);
  assert.deepEqual(Q.rollupUsage(tree, 'host-a', rows, ws), [], 'a host is not counted twice');
  Q.rollupUsage(tree, 'host-b', [{ ts: '2026-11-08T00:00:00Z', arc: 'endo', input_tokens: 1 }], ws);
  assert.equal(parse(tree.read('budget/weeks/2026-11-07.yay')).billable, 151, 'hosts add up');

  const hostTree = makeFiles(path.join(dir, 'host'));
  hostTree.write('usage/2026-11-08.yay', stringify({ rows: [rows[0]] }));
  hostTree.write('usage/2026-11-15.yay', stringify({ rows: [rows[3]] }));
  assert.deepEqual(Q.dropConsolidatedUsage(hostTree, tree, 'host-a'), ['2026-11-08.yay'], 'only rows a statement covers are dropped');
});

test('a whole quiescence through the service, two hosts', async t => {
  const g = mkGarden(t);
  const [ha, hb] = [g.host('host-a'), g.host('host-b')];
  const mk = (h, n) => ({ q: makeQuiescenceService({ shards: h.shards, host: n, clock: g.clock }), board: makeBoardService({ shards: h.shards, host: n, clock: g.clock }) });
  const [a, b] = [mk(ha, 'host-a'), mk(hb, 'host-b')];
  for (const i of [1, 2, 3]) await a.board.post({ id: `j${i}`, role: 'builder', title: 't' });
  await b.board.claim({ worker: 'w' });
  await assert.rejects(a.q.truncateAll({ apply: true }), { code: 'wrong-phase' }, 'truncation is refused outside its phase');
  await a.q.call({ id: 'q-1', hosts: ['host-a', 'host-b'], shed: 'abc123' });
  assert.equal(await a.board.claim({ worker: 'w' }), null, 'no host claims during a quiescence');
  assert.equal(await b.q.duty(), 'quiesce');
  await a.q.ack();
  await b.q.ack();
  assert.match((await a.q.advance()).reason, /1 job\(s\) still claimed/);
  await b.board.complete('j1', 'done');
  assert.deepEqual(await a.q.advance(), { moved: true });
  const dry = await a.q.truncateAll();
  assert.equal(dry.applied, false);
  assert.equal(g.remoteGit('rev-list', '--count', 'board') > 1, true, 'the dry run rewrote nothing');
  const wet = await a.q.truncateAll({ apply: true });
  assert.deepEqual(wet.results.map(r => [r.branch, r.ok]), [['archive', true], ['journal', true], ['board', true]]);
  assert.equal((await a.q.status()).truncated.board, 1);
  await a.q.advance();
  await a.q.ack({ shed: 'abc123' });
  await b.q.ack({ shed: 'abc123' });
  await a.q.advance();
  await a.q.ack({ ok: true, capabilities: { node: 'x' } });
  await b.q.ack({ ok: true, capabilities: { node: 'x' } });
  assert.deepEqual(await a.q.advance(), { moved: true });
  assert.deepEqual([(await b.q.status()).phase, (await b.q.status()).last.id], ['idle', 'q-1']);
  assert.equal((await b.board.claim({ worker: 'w' })).id, 'j2', 'work resumes on the truncated board');
  for (const b2 of ['board', 'archive', 'journal']) assert.ok(g.remoteGit('rev-parse', `refs/archive/${b2}/epoch-0`), `${b2} history is parked`);
  assert.ok(g.show('archive', g.ls('archive').find(f => f.endsWith('/j1.yay'))), 'the archive kept its records across its truncation');

  // An absent host's claims are released when the leader gives up on it.
  await a.q.call({ id: 'q-2', hosts: ['host-a', 'host-b'], shed: 'abc123' });
  await a.q.markAbsent('host-b');
  assert.ok(g.show('board', 'open/j2.yay'), "the absent host's claim went back to open");
  await assert.rejects(b.board.complete('j2', 'done'), { code: 'not-held' }, 'and its late result is refused');
});
