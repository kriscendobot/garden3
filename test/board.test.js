// The board's rules, on boards in memory: posting, dependencies, claim order,
// omega levels (structural, max-plus-one), cost (never decreasing), hand-offs,
// back-tracking, and the sweep.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/board.js';

const NOW = '2026-11-17T00:00:00Z';
const mk = (...specs) => {
  const board = { jobs: {} };
  for (const s of specs) B.post(board, { role: 'builder', title: 't', by: 'test', ...s }, NOW);
  return board;
};
const level = (b, id) => b.jobs[id].job.level;
const levelsOf = (b, ...ids) => ids.map(id => level(b, id));
const where = (b, id) => b.jobs[id]?.where;
const all = { host: 'h', worker: 'w', has: () => true };
const claimId = (b, id, host = 'h') => {
  const skip = Object.keys(b.jobs).filter(j => j !== id);
  assert.equal(B.claim(b, { ...all, host, skip }, NOW), id, `claim ${id}`);
};
const hand = (b, id, tokens, ...steps) =>
  B.handoff(b, id, { reason: 'out of time', elapsed_s: 2300, window_s: 2400, steps: steps.map(s => (typeof s === 'string' ? { id: s } : s)) }, { host: 'h', cost: { tokens, elapsed_s: 2300 } }, NOW);
const finish = (b, id, tokens = 0) => {
  claimId(b, id);
  const rec = B.complete(b, id, 'done', { host: 'h', cost: { tokens, elapsed_s: 10 } }, NOW);
  B.leave(b, id, 'done');
  return rec;
};
const code = fn => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('posting, ids and dependencies', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  assert.equal(B.post(b, { id: 'a', role: 'builder', title: 'again' }, NOW), false, 'posting twice is a no-op');
  assert.equal(code(() => B.post(b, { id: 'Bad Id', role: 'r', title: 't' }, NOW)), 'invalid');
  assert.equal(code(() => B.post(b, { id: '../x', role: 'r', title: 't' }, NOW)), 'invalid');
  assert.equal(code(() => B.post(b, { id: 'self', role: 'r', title: 't', after: ['self'] }, NOW)), 'cycle');
  assert.equal(b.jobs.self, undefined, 'a refused post leaves nothing');
  assert.deepEqual(B.ready(b), ['a'], 'a job waits for its dependency');
  finish(b, 'a');
  assert.deepEqual(B.ready(b), ['b'], 'a dependency is satisfied by leaving the board');
});

test('claims: requirements, host pins, plots, and failed jobs block', () => {
  const b = mk({ id: 'rust', requires: ['rust'] }, { id: 'pinned', requires: ['host=e'] }, { id: 'plotted', plot: 'alder' });
  assert.equal(B.claim(b, { host: 'd', worker: 'w', has: () => false, plot: 'birch' }, NOW), null);
  assert.equal(B.claim(b, { host: 'd', worker: 'w', has: t => t === 'rust' }, NOW), 'plotted');
  assert.equal(B.claim(b, { host: 'd', worker: 'w', has: t => t === 'rust' }, NOW), 'rust');
  assert.equal(B.claim(b, { host: 'e', worker: 'w', has: () => false }, NOW), 'pinned');
  assert.equal(b.jobs.pinned.job.claim.host, 'e');
  assert.equal(code(() => B.complete(b, 'pinned', 'done', { host: 'd' }, NOW)), 'not-held', 'only the holder completes');
  const c = mk({ id: 'x' }, { id: 'y', after: ['x'] });
  claimId(c, 'x');
  B.fail(c, 'x', { host: 'h', cost: { tokens: 5 } }, NOW);
  assert.equal(where(c, 'x'), 'failed');
  assert.deepEqual(B.ready(c), [], 'a failed job keeps blocking its dependents');
  B.release(c, 'x', { by: 'kriskowal' }, NOW);
  assert.deepEqual(B.ready(c), ['x']);
  assert.equal(c.jobs.x.job.cost.tokens, 5, 'the failed run is still in the cost');
});

test('claim order: arc rank, then leaf-first, then priority, then age', () => {
  const b = mk({ id: 'big', priority: 1 }, { id: 'late', priority: 7 }, { id: 'soon', priority: 2 }, { id: 'ranked', arc: 'endo', priority: 9 });
  claimId(b, 'big');
  hand(b, 'big', 0, 'big-1');
  finish(b, 'big-1');
  B.sweep(b, { isArchived: () => false, ttlSeconds: 1e9 }, NOW);
  assert.deepEqual(B.order(b, { endo: 1 }), ['ranked', 'soon', 'late', 'big']);
});

test('level is max-plus-one over the trees a job handed off to', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] }, { id: 'c', after: ['b'] }, { id: 'other' });
  assert.deepEqual(levelsOf(b, 'a', 'b', 'c'), [0, 0, 0], 'a job that spawned nothing is at the base');
  claimId(b, 'a');
  hand(b, 'a', 1000, 'a-1', 'a-2');
  assert.deepEqual(levelsOf(b, 'a', 'a-1', 'a-2'), [1, 0, 0]);
  assert.deepEqual(levelsOf(b, 'b', 'c', 'other'), [1, 1, 0], 'recomputed up the graph; unrelated work untouched');
  assert.equal(where(b, 'a'), 'held');
  assert.deepEqual(b.jobs.a.job.handoff_log[0].steps, ['a-1', 'a-2']);
  assert.equal(b.jobs.a.job.cost.tokens, 1000, 'the run that ended in the hand-off is in the cost');
  claimId(b, 'a-1');
  hand(b, 'a-1', 500, 'a-1-x');
  assert.deepEqual(levelsOf(b, 'a', 'a-1', 'a-2', 'b', 'c'), [2, 1, 0, 2, 2], 'a deeper subtree lifts every ancestor');
  claimId(b, 'a-1-x');
  hand(b, 'a-1-x', 200, 'p', 'q');
  assert.deepEqual(levelsOf(b, 'a', 'a-1', 'a-1-x', 'p'), [3, 2, 1, 0]);
  const before = JSON.stringify(b);
  assert.equal(hand(b, 'a-1-x', 999, 'p', 'q'), false, 'replaying a landed hand-off is a no-op');
  assert.equal(JSON.stringify(b), before);
});

test('finished trees still count; back-tracked ones do not; cost never falls', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  claimId(b, 'a');
  hand(b, 'a', 1000, 'a-1', 'a-2');
  claimId(b, 'a-1');
  hand(b, 'a-1', 500, 'a-1-x');
  claimId(b, 'a-1-x');
  hand(b, 'a-1-x', 200, 'p', 'q');
  finish(b, 'p', 40);
  finish(b, 'q', 60);
  B.sweep(b, { isArchived: () => false, ttlSeconds: 1e9 }, NOW);
  assert.equal(level(b, 'a-1-x'), 1, 'a job keeps the level its finished steps gave it');
  assert.deepEqual(b.jobs['a-1-x'].job.under.p, { level: 0, step: true });
  assert.equal(b.jobs['a-1-x'].job.cost_under.tokens, 100, 'their cost moved under it');
  assert.deepEqual(b.jobs['a-1-x'].job.steps, [], 'a record stops listing steps that finished');
  assert.equal(where(b, 'a-1-x'), 'open', 'it reopens for its closing run');
  assert.deepEqual(levelsOf(b, 'a', 'a-1', 'b'), [3, 2, 3]);

  const records = B.abandon(b, 'a-1', { by: 'kriskowal', reason: 'dead end' }, NOW);
  assert.deepEqual(records.map(r => r.id), ['a-1-x', 'a-1'], 'the subtree is archived, steps first');
  assert.ok(records.every(r => r.outcome === 'abandoned' && r.abandon_reason === 'dead end'));
  assert.equal(records[1].cost.tokens, 500, 'an abandoned record keeps what it ran up');
  assert.equal(b.jobs['a-1'], undefined);
  assert.deepEqual(levelsOf(b, 'a', 'b'), [1, 1], 'levels above the branch fall to what remains');
  assert.deepEqual(b.jobs.a.job.abandoned, ['a-1']);
  assert.deepEqual(b.jobs.a.job.after, ['a-2']);
  assert.equal(b.jobs.a.job.cost_under.tokens, 800, 'the whole branch stays in the cost: 500+200+40+60');
  assert.equal(b.jobs.a.job.cost.tokens, 1000);

  B.abandon(b, 'a-2', { by: 'kriskowal' }, NOW);
  assert.deepEqual(levelsOf(b, 'a', 'b'), [0, 0], 'with no tree under it a job is back at the base');
  assert.equal(b.jobs.a.job.cost_under.tokens, 800, 'cost never decreases');
  B.sweep(b, { isArchived: () => false, ttlSeconds: 1e9 }, NOW);
  assert.equal(where(b, 'a'), 'open');
  const rec = finish(b, 'a', 300);
  assert.deepEqual([rec.cost.tokens, rec.cost_under.tokens, rec.level], [1300, 800, 0]);
  assert.deepEqual(b.jobs.b.job.under.a, { level: 0, step: false });
});

test('a diamond takes the max over its paths, and a plain dependency adds nothing', () => {
  const b = mk({ id: 'a' }, { id: 'l', after: ['a'] }, { id: 'r', after: ['a'] }, { id: 'z', after: ['l', 'r'] });
  claimId(b, 'a');
  hand(b, 'a', 0, 'a-1');
  assert.deepEqual(levelsOf(b, 'l', 'r', 'z'), [1, 1, 1], 'not the sum of the two paths');
  claimId(b, 'a-1');
  hand(b, 'a-1', 0, 'a-1-1');
  assert.deepEqual(levelsOf(b, 'a', 'l', 'r', 'z'), [2, 2, 2, 2]);
  B.post(b, { id: 'tail', role: 'builder', title: 't', after: ['z'] }, NOW);
  assert.equal(level(b, 'tail'), 2, 'sequenced after: the same level, without the plus one');
  const wide = { jobs: {
    top: { where: 'held', job: { id: 'top', after: ['m1', 'm2', 'd'], steps: ['m1', 'm2'], under: { gone: { level: 4, step: true }, dep: { level: 7, step: false } } } },
    m1: { where: 'held', job: { id: 'm1', after: ['n'], steps: ['n'] } },
    m2: { where: 'open', job: { id: 'm2' } },
    n: { where: 'open', job: { id: 'n' } },
    d: { where: 'open', job: { id: 'd', after: ['n'] } },
  } };
  assert.deepEqual(B.levels(wide), { top: 7, m1: 1, m2: 0, n: 0, d: 0 });
  delete wide.jobs.top.job.under.dep;
  assert.equal(B.levels(wide).top, 5, 'a finished step counts plus one');
});

test('repeated hand-offs are surfaced to the accountant, never blocked', () => {
  const b = mk({ id: 'e', arc: 'endo' });
  for (let n = 1; n <= 5; n += 1) {
    claimId(b, 'e');
    const r = hand(b, 'e', 1000, `e-s${n}`);
    assert.equal(r.n, n);
    assert.equal(r.review, n >= 2 ? `review-e-h${n}` : null);
    finish(b, `e-s${n}`, 100);
    B.sweep(b, { isArchived: () => false, ttlSeconds: 1e9 }, NOW);
  }
  const e = b.jobs.e.job;
  assert.equal(e.handoffs, 5, 'five hand-offs of one job all land');
  assert.equal(e.level, 1, 'sequential re-planning does not inflate the level');
  assert.deepEqual([e.cost.tokens, e.cost_under.tokens, e.handoff_log.length], [5000, 500, 5]);
  assert.equal(b.jobs['review-e-h1'], undefined);
  const review = b.jobs['review-e-h3'].job;
  assert.deepEqual([review.role, review.arc, review.handoffs_seen, review.cost_seen.tokens], ['accountant', 'endo', 3, 3200]);
  assert.deepEqual(e.after, [], 'a review does not block the job it reviews');
  assert.equal(where(b, 'review-e-h3'), 'open');
});

test('refusals, and graphs that are already malformed', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  assert.equal(code(() => hand(b, 'a', 0, 'a-1')), 'not-held', 'a job nobody holds cannot hand off');
  claimId(b, 'a');
  const before = JSON.stringify(b);
  assert.equal(code(() => hand(b, 'a', 0)), 'empty');
  assert.equal(code(() => hand(b, 'a', 0, 'b')), 'duplicate');
  assert.equal(code(() => hand(b, 'a', 0, { id: 'a-1', after: ['b'] })), 'cycle');
  assert.equal(code(() => hand(b, 'a', 0, 'ok-1', 'Not Ok')), 'invalid');
  assert.equal(JSON.stringify(b), before, 'a refused hand-off leaves the board exactly as it was');
  const cyc = { jobs: {
    x: { where: 'open', job: { id: 'x', after: ['z'], steps: ['z'] } },
    y: { where: 'open', job: { id: 'y', after: ['x'], steps: ['x'] } },
    z: { where: 'open', job: { id: 'z', after: ['y'], steps: ['y'] } },
    free: { where: 'open', job: { id: 'free', after: [] } },
  } };
  assert.deepEqual(B.cycles(cyc), ['x', 'y', 'z'], 'the cycle guard names every job on a cycle');
  assert.equal(B.levels(cyc).free, 0, 'levels over a cyclic graph still terminate');
  assert.deepEqual(B.ready(cyc), ['free'], 'nothing on a cycle is ever ready');
  assert.deepEqual(B.treeCost({ jobs: { p: { job: { id: 'p', steps: ['q'], cost: { tokens: 1 }, cost_under: { tokens: 5 } } }, q: { job: { id: 'q', cost: { tokens: 10 } } } } }, 'p').tokens, 16);
});

test('the sweep: a crashed completion is finished', () => {
  const b = mk({ id: 'half' });
  claimId(b, 'half');
  B.sweep(b, { isArchived: id => id === 'half' }, NOW);
  assert.equal(b.jobs.half, undefined, 'a claim the archive already has is dropped');
});

// --- deadlines: every claim is a lease, watched by all, failing open ---------

const at = (base, plusSeconds) => new Date(Date.parse(base) + plusSeconds * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
const LEASE = { windowS: 2400, killAfterS: 30, graceS: 600 };

test('a claim is a lease with a generation and an expiry', () => {
  const b = mk({ id: 'a' }, { id: 'short', window_s: 60 });
  B.claim(b, { ...all, host: 'client', skip: ['short'], lease: LEASE }, NOW);
  B.claim(b, { ...all, host: 'client', skip: ['a'], lease: LEASE }, NOW);
  const c = b.jobs.a.job.claim;
  assert.deepEqual([c.generation, c.window_s, c.expires_at], [1, 2400, at(NOW, 2400 + 30 + 600)], 'window, then the kill, then the grace');
  assert.equal(b.jobs.short.job.claim.expires_at, at(NOW, 60 + 30 + 600), "a job's own window sets its lease");
});

test('an elapsed lease is expired whoever holds it, without confirming the run stopped', () => {
  const b = mk({ id: 'mine' }, { id: 'theirs' }, { id: 'waits', after: ['theirs'] });
  B.claim(b, { ...all, host: 'leader', skip: ['theirs'], lease: LEASE }, NOW);
  B.claim(b, { ...all, host: 'client', skip: ['mine'], lease: LEASE }, NOW);
  const due = at(NOW, 3030);
  assert.deepEqual(B.expire(b, { toleranceS: 300 }, at(due, 300)), [], 'not until the tolerance for clock skew has passed too');
  assert.deepEqual(B.expire(b, { toleranceS: 300 }, at(due, 301)).map(x => [x.id, x.host, x.generation]), [['mine', 'leader', 1], ['theirs', 'client', 1]], "the watcher's own jobs and a silent client's alike");
  assert.deepEqual([where(b, 'mine'), where(b, 'theirs')], ['open', 'open'], 'the work is available again');
  const j = b.jobs.theirs.job;
  assert.deepEqual([j.expiries, j.claim, j.expired_claims[0].host, j.expired_claims[0].generation], [1, undefined, 'client', 1], 'the expiry is on the record');
  assert.deepEqual(B.expiriesByHost(b), { leader: 1, client: 1 }, 'so an unreliable host shows');
  assert.deepEqual(B.expire(b, { toleranceS: 300 }, at(due, 9999)), [], 'expiring again is a no-op');
  assert.deepEqual(B.ready(b).sort(), ['mine', 'theirs'], 'a dependent is not left stuck behind a dead claim');
});

test('a watcher whose clock is ahead or behind stays within the tolerance', () => {
  const lease = at(NOW, 3030);
  for (const [skew, expect] of [[-200, false], [0, false], [200, false], [301, true]]) {
    const b = mk({ id: 'a' });
    B.claim(b, { ...all, lease: LEASE }, NOW);
    // The claimant's clock wrote the lease; the watcher's reads it, off by `skew`.
    assert.equal(B.expire(b, { toleranceS: 300 }, at(lease, skew)).length === 1, expect, `watcher ${skew}s past the lease`);
  }
  const fast = mk({ id: 'a' });
  B.claim(fast, { ...all, lease: LEASE }, at(NOW, -250)); // a claimant whose clock runs 250 s slow
  assert.deepEqual(B.expire(fast, { toleranceS: 300 }, at(NOW, 3030)), [], 'a slow claimant is not expired early by a correct watcher');
});

test('a re-claim bumps the generation, and the superseded run is fenced', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  B.claim(b, { ...all, host: 'client', lease: LEASE }, NOW);
  B.expire(b, { toleranceS: 0 }, at(NOW, 4000));
  B.claim(b, { ...all, host: 'leader', lease: LEASE }, at(NOW, 4001));
  assert.deepEqual([b.jobs.a.job.claim.generation, b.jobs.a.job.claim.host], [2, 'leader']);
  const before = JSON.stringify(b);
  const old = { host: 'client', generation: 1, cost: { tokens: 900, elapsed_s: 4100 } };
  assert.equal(code(() => B.complete(b, 'a', 'done', old, NOW)), 'superseded');
  assert.equal(code(() => B.fail(b, 'a', old, NOW)), 'superseded');
  assert.equal(code(() => B.handoff(b, 'a', { steps: [{ id: 'a-1' }] }, old, NOW)), 'superseded');
  assert.equal(code(() => B.release(b, 'a', { by: 'client', ...old }, NOW)), 'superseded', 'it may not even requeue its successor');
  assert.equal(JSON.stringify(b), before, 'nothing the superseded run wrote took effect');
  // The same host re-claiming is fenced against its own earlier run too.
  assert.equal(code(() => B.complete(b, 'a', 'done', { host: 'leader', generation: 1 }, NOW)), 'superseded');
  // Its time was still spent: cost is recorded, and the late run is visible.
  assert.equal(B.late(b, 'a', old), true);
  assert.deepEqual([b.jobs.a.job.cost.tokens, b.jobs.a.job.late_runs], [900, [{ host: 'client', generation: 1 }]]);
  // The current holder completes normally, and carries the whole cost.
  const rec = B.complete(b, 'a', 'done', { host: 'leader', generation: 2, cost: { tokens: 100 } }, NOW);
  assert.deepEqual([rec.cost.tokens, rec.expiries, rec.generation], [1000, 1, 2]);
  B.leave(b, 'a', 'done');
  assert.equal(B.late(b, 'a', old), false, 'once the job has left, a late report has nothing to charge');
});
