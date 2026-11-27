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
  const d = mk();
  B.post(d, { id: 'deep', role: 'designer', title: 't', tier: 'mentat' }, NOW);
  assert.equal(d.jobs.deep.job.tier, 'mentat', 'a job may name its tier');
  assert.equal(code(() => B.post(d, { id: 'deep2', role: 'r', title: 't', tier: 'Top Tier' }, NOW)), 'invalid');
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

// A job that ran out of time hands off: a planner takes its place.
const hand = (b, id, tokens, note = {}) =>
  B.handoff(b, id, { reason: 'out of time', done: 'the survey', remaining: 'the build', elapsed_s: 2300, window_s: 2400, ...note }, { host: 'h', cost: { tokens, elapsed_s: 2300 } }, NOW);
// A planner dispatches the steps it planned, as its children.
const plan = (b, id, tokens, ...steps) =>
  B.plan(b, id, { reason: 'planned', steps: steps.map(s => (typeof s === 'string' ? { id: s } : s)) }, { host: 'h', cost: { tokens, elapsed_s: 600 } }, NOW);
const sweep = b => B.sweep(b, { isArchived: () => false }, NOW);
// The usual opening: `id` runs out of time, its planner plans `steps`.
const handAndPlan = (b, id, tokens, ...steps) => {
  claimId(b, id);
  const r = hand(b, id, tokens);
  claimId(b, r.planner);
  plan(b, r.planner, 0, ...steps);
  return r.planner;
};

test('claim order: arc rank, then leaf-first over the job tree, then priority, then age', () => {
  const b = mk({ id: 'big', priority: 1 }, { id: 'late', priority: 7 }, { id: 'soon', priority: 2 }, { id: 'ranked', arc: 'endo', priority: 9 });
  const planner = handAndPlan(b, 'big', 0, 'big-1');
  // The planner (level 1) waits on its step; the step is a leaf (level 0).
  assert.deepEqual(B.order(b, { endo: 1 }), ['ranked', 'big-1', 'soon', 'late'], 'the leaf of the tree is drawn with the other leaves, by priority and age');
  finish(b, 'big-1');
  sweep(b);
  assert.deepEqual(B.order(b, { endo: 1 }), ['ranked', 'soon', 'late', planner], 'an inner node waits behind every leaf, whatever its priority');
});

test('a hand-off posts a planner in the job\'s place; the planner dispatches flat children', () => {
  const b = mk({ id: 'a', arc: 'endo', projects: ['acme/lib'], body: 'Build the thing.\n' }, { id: 'b', after: ['a'] }, { id: 'c', after: ['b'] }, { id: 'other' });
  assert.deepEqual(levelsOf(b, 'a', 'b', 'c'), [0, 0, 0], 'a job that spawned nothing is at the base');
  claimId(b, 'a');
  const r = hand(b, 'a', 1000);
  assert.equal(r.planner, 'a-plan');
  assert.equal(b.jobs.a, undefined, 'the job that ran out of time has left the board');
  assert.deepEqual([r.record.outcome, r.record.handed_to, r.record.cost.tokens, r.record.handoff.window_s], ['handed-off', 'a-plan', 1000, 2400], 'archived as handed-off, with what it spent');
  const p = b.jobs['a-plan'].job;
  assert.deepEqual([p.role, p.planner, p.replaces, p.arc, p.projects, where(b, 'a-plan')], ['planner', true, 'a', 'endo', ['acme/lib'], 'open']);
  assert.match(p.body, /Plan the steps that remain, all the way to\ncompletion.*What was asked:\n\nBuild the thing\.\n.*done: the survey\n.*remains: the build\n.*branch job\/a\/1/s);
  assert.deepEqual(p.under, { a: { level: 0, step: true } }, 'the job is the planner\'s first underlying tree');
  assert.equal(p.cost_under.tokens, 1000, 'and its cost is carried, never lost');
  assert.deepEqual(b.jobs.b.job.after, ['a-plan'], 'what waited on the job now waits on the planner');
  assert.deepEqual(levelsOf(b, 'a-plan', 'b', 'c', 'other'), [1, 1, 1, 0], 'one level of planning, recomputed up the graph');
  const before = JSON.stringify(b);
  assert.equal(hand(b, 'a', 999), false, 'replaying a landed hand-off is a no-op');
  assert.equal(JSON.stringify(b), before);

  claimId(b, 'a-plan');
  plan(b, 'a-plan', 200, 'a-1', 'a-2');
  assert.deepEqual(levelsOf(b, 'a-plan', 'a-1', 'a-2', 'b'), [1, 0, 0, 1], 'planning adds children, not levels');
  assert.equal(where(b, 'a-plan'), 'held');
  assert.deepEqual([b.jobs['a-plan'].job.plans, b.jobs['a-plan'].job.plan_log[0].steps, b.jobs['a-1'].job.step_of], [1, ['a-1', 'a-2'], 'a-plan']);
  assert.equal(code(() => plan(b, 'a-1', 0, 'x')), 'not-held');
});

test('a long run of sequential steps is one planner over a flat set: level 1, not a chain', () => {
  const b = mk({ id: 'long' }, { id: 'waits', after: ['long'] });
  const steps = Array.from({ length: 12 }, (_, i) => ({ id: `s${String(i + 1).padStart(2, '0')}`, after: i ? [`s${String(i).padStart(2, '0')}`] : [] }));
  const planner = handAndPlan(b, 'long', 500, ...steps);
  assert.equal(level(b, planner), 1, 'twelve steps in sequence, one level');
  assert.ok(steps.every(s => level(b, s.id) === 0), 'every step is a leaf: being sequenced adds nothing');
  assert.equal(level(b, 'waits'), 1);
  // There is no way to write the chain: a step cannot name its own successor.
  claimId(b, 's01');
  assert.equal(code(() => plan(b, 's01', 0, 'chain-link')), 'not-planner');
  // Work through all twelve in order; the level never moves.
  B.release(b, 's01', { by: 'test' }, NOW);
  for (const s of steps) {
    assert.deepEqual(B.ready(b).filter(x => x.startsWith('s')), [s.id], 'one at a time, in order');
    finish(b, s.id, 100);
    assert.equal(level(b, planner), 1);
  }
  sweep(b);
  const rec = finish(b, planner, 50);
  assert.deepEqual([rec.level, rec.cost_under.tokens, rec.cost.tokens], [1, 500 + 1200, 50], 'the engagement carries the original job\'s cost and every step\'s');
  assert.deepEqual(b.jobs.waits.job.under, { 'long-plan': { level: 1, step: false } });
});

test('a step that itself runs out of time gets its own planner: a real second level', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  const top = handAndPlan(b, 'a', 1000, 'a-1', 'a-2');
  const inner = handAndPlan(b, 'a-1', 500, 'a-1-x', 'a-1-y');
  assert.equal(inner, 'a-1-plan');
  assert.deepEqual([b.jobs[top].job.steps, b.jobs[top].job.after], [['a-1-plan', 'a-2'], ['a-1-plan', 'a-2']], 'the inner planner is the step now');
  assert.deepEqual(levelsOf(b, top, inner, 'a-2', 'a-1-x', 'b'), [2, 1, 0, 0, 2]);
  assert.equal(b.jobs[inner].job.step_of, top);
});

test('finished trees still count; back-tracked ones do not; cost never falls', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] });
  const top = handAndPlan(b, 'a', 1000, 'a-1', 'a-2');
  const inner = handAndPlan(b, 'a-1', 500, 'p', 'q');
  finish(b, 'p', 40);
  finish(b, 'q', 60);
  sweep(b);
  assert.equal(level(b, inner), 1, 'a planner keeps the level its finished steps gave it');
  assert.deepEqual(b.jobs[inner].job.under.p, { level: 0, step: true });
  assert.equal(b.jobs[inner].job.cost_under.tokens, 600, 'the step that handed off, and both children');
  assert.deepEqual(b.jobs[inner].job.steps, [], 'a record stops listing steps that finished');
  assert.equal(where(b, inner), 'open', 'it reopens for its closing run');
  assert.deepEqual(levelsOf(b, top, 'b'), [2, 2]);

  const records = B.abandon(b, inner, { by: 'kriskowal', reason: 'dead end' }, NOW);
  assert.deepEqual(records.map(r => [r.id, r.outcome, r.abandon_reason]), [[inner, 'abandoned', 'dead end']]);
  assert.deepEqual(levelsOf(b, top, 'b'), [1, 1], 'levels above the branch fall to what remains');
  assert.deepEqual(b.jobs[top].job.abandoned, [inner]);
  assert.deepEqual(b.jobs[top].job.after, ['a-2']);
  assert.equal(b.jobs[top].job.cost_under.tokens, 1600, 'the whole branch stays in the cost: 1000 + 500 + 40 + 60');

  B.abandon(b, 'a-2', { by: 'kriskowal' }, NOW);
  assert.deepEqual(levelsOf(b, top, 'b'), [1, 1], 'the planner still stands on the job it replaced');
  assert.equal(b.jobs[top].job.cost_under.tokens, 1600, 'cost never decreases');
  sweep(b);
  const rec = finish(b, top, 300);
  assert.deepEqual([rec.cost.tokens, rec.cost_under.tokens, rec.level], [300, 1600, 1]);
  assert.deepEqual(b.jobs.b.job.under[top], { level: 1, step: false });
});

test('a diamond takes the max over its paths, and a plain dependency adds nothing', () => {
  const b = mk({ id: 'a' }, { id: 'l', after: ['a'] }, { id: 'r', after: ['a'] }, { id: 'z', after: ['l', 'r'] });
  handAndPlan(b, 'a', 0, 'a-1');
  assert.deepEqual(levelsOf(b, 'l', 'r', 'z'), [1, 1, 1], 'not the sum of the two paths');
  handAndPlan(b, 'a-1', 0, 'a-1-1');
  assert.deepEqual(levelsOf(b, 'a-plan', 'l', 'r', 'z'), [2, 2, 2, 2]);
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

test('re-planning is surfaced to the accountant, never blocked, and stays flat', () => {
  const b = mk({ id: 'e', arc: 'endo' });
  claimId(b, 'e');
  const { planner } = hand(b, 'e', 1000);
  for (let n = 1; n <= 5; n += 1) {
    claimId(b, planner);
    const r = plan(b, planner, 200, `e-s${n}`);
    assert.equal(r.n, n);
    assert.equal(r.review, n >= 2 ? `review-${planner}-p${n}` : null);
    finish(b, `e-s${n}`, 100);
    sweep(b);
  }
  const e = b.jobs[planner].job;
  assert.equal(e.plans, 5, 'five plans by one planner all land');
  assert.equal(e.level, 1, 'planning again does not deepen the tree');
  assert.deepEqual([e.cost.tokens, e.cost_under.tokens, e.plan_log.length], [1000, 1500, 5]);
  assert.equal(b.jobs[`review-${planner}-p1`], undefined);
  const review = b.jobs[`review-${planner}-p3`].job;
  assert.deepEqual([review.role, review.arc, review.plans_seen, review.cost_seen.tokens], ['accountant', 'endo', 3, 1000 + 600 + 200], 'the original job, three plans, two finished steps');
  assert.deepEqual(e.after, [], 'a review does not block the planner it reviews');
  assert.equal(where(b, `review-${planner}-p3`), 'open');
});

test('refusals, and graphs that are already malformed', () => {
  const b = mk({ id: 'a' }, { id: 'b', after: ['a'] }, { id: 'pl', planner: true });
  assert.equal(code(() => hand(b, 'a', 0)), 'not-held', 'a job nobody holds cannot hand off');
  claimId(b, 'a');
  assert.equal(code(() => plan(b, 'a', 0, 'x')), 'not-planner', 'an ordinary job cannot dispatch steps of its own');
  B.post(b, { id: 'a-plan', role: 'builder', title: 'in the way' }, NOW);
  assert.equal(code(() => hand(b, 'a', 0)), 'duplicate');
  delete b.jobs['a-plan'];
  claimId(b, 'pl');
  assert.equal(code(() => hand(b, 'pl', 0)), 'is-planner', 'a planner dispatches or is requeued; it does not hand off');
  const before = JSON.stringify(b);
  assert.equal(code(() => plan(b, 'pl', 0)), 'empty');
  assert.equal(code(() => plan(b, 'pl', 0, 'b')), 'duplicate');
  assert.equal(code(() => plan(b, 'pl', 0, { id: 'pl-1', after: ['w'] }, { id: 'w', after: ['pl'] })), 'cycle');
  assert.equal(code(() => plan(b, 'pl', 0, 'ok-1', 'Not Ok')), 'invalid');
  assert.equal(JSON.stringify(b), before, 'a refused plan leaves the board exactly as it was');
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
  assert.equal(code(() => B.handoff(b, 'a', { reason: 'late' }, old, NOW)), 'superseded');
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

test('lends: only a credential the garden lends; a plan\'s steps inherit the poster\'s grant and cannot widen it', () => {
  const b = mk({ id: 'asked', lends: ['github'] }, { id: 'plain' });
  assert.deepEqual([b.jobs.asked.job.lends, 'lends' in b.jobs.plain.job], [['github'], false]);
  assert.equal(code(() => mk({ id: 'x', lends: ['aws'] })), 'invalid');
  handAndPlan(b, 'asked', 10, { id: 'step-1', lends: ['github', 'aws'] });
  assert.deepEqual(b.jobs['step-1'].job.lends, ['github'], 'the step has what its parent had, whatever the plan says');
  handAndPlan(b, 'plain', 10, { id: 'step-2', lends: ['github'] });
  assert.equal('lends' in b.jobs['step-2'].job, false, 'and a plan cannot grant what its parent was not given');
});
