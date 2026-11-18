// The supervisor's tick: which duty a host takes in each state of a quiescence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSupervisor } from '../src/supervisor.js';

const mk = ({ duty, phase = 'idle', leader = false, claimed = 0, jobs = [], swept = [], zombies = [], heard = null }) => {
  const calls = [];
  const rec = name => async (...a) => (calls.push([name, ...a]), undefined);
  const queue = [...jobs];
  const sup = makeSupervisor({
    host: 'h', isLeader: async () => leader, clock: { now: () => '2026-11-17T00:00:00Z' },
    quiescence: { duty: async () => duty, status: async () => ({ phase, id: 'q-1', shed: 'abcdef0123456789', last: { id: 'q-0', shed: 'abcdef0123456789' } }), ack: rec('ack'), advance: async () => (calls.push(['advance']), { moved: true }), truncateAll: async o => (calls.push(['truncate', o]), { results: [{ branch: 'board', ok: true }] }) },
    hostService: { caughtUp: async () => 'q-0', rejuvenate: async o => (calls.push(['rejuvenate', o]), { shed: o.shed }), verify: async () => ({ ok: true, capabilities: { node: 'p' }, drift: [] }), markCaughtUp: rec('caught-up') },
    board: { read: async () => ({ jobs: Object.fromEntries(Array.from({ length: claimed }, (_, i) => [`j${i}`, { where: 'claimed', host: 'h' }])) }), sweep: async () => (calls.push(['sweep']), swept) },
    budget: { refresh: rec('refresh') },
    dispatcher: { once: async () => queue.shift() ?? null, reap: async () => zombies },
    journal: { press: async o => (calls.push(['press', o]), []) },
    ...(heard ? { watcher: { tick: async () => (calls.push(['watch']), heard) }, steward: { report: async () => (calls.push(['report']), ['done issue-1']) } } : {}),
  });
  return { sup, calls, names: () => calls.map(c => c[0]) };
};

test('a running host refreshes its budget and dispatches until nothing is left', async () => {
  const { sup, names } = mk({ duty: 'run', jobs: [{ id: 'a', outcome: 'done' }, { id: 'b', outcome: 'handoff' }] });
  assert.deepEqual(await sup.tick(), ['a: done', 'b: handoff']);
  assert.deepEqual(names(), ['sweep', 'refresh', 'press']);
});

test('quiescing: a host with running jobs waits; an idle one presses and acknowledges', async () => {
  const busy = mk({ duty: 'quiesce', phase: 'quiesce', claimed: 2, jobs: [{ id: 'never', outcome: 'done' }] });
  assert.deepEqual(await busy.sup.tick(), ['quiescing: 2 job(s) still running']);
  assert.deepEqual(busy.names(), ['sweep'], 'it neither acknowledges nor dispatches');
  const idle = mk({ duty: 'quiesce', phase: 'quiesce' });
  assert.deepEqual(await idle.sup.tick(), ['quiesced for q-1']);
  assert.deepEqual(idle.calls, [['press', { includeToday: true }], ['ack', {}], ['sweep']]);
});

test('rejuvenate, verify and catch-up each do their part and never dispatch', async () => {
  const r = mk({ duty: 'rejuvenate', phase: 'rejuvenate', jobs: [{ id: 'never', outcome: 'done' }] });
  assert.deepEqual(await r.sup.tick(), ['rejuvenated to abcdef012345']);
  assert.deepEqual(r.calls, [['rejuvenate', { shed: 'abcdef0123456789' }], ['ack', { shed: 'abcdef0123456789' }], ['sweep']]);
  const v = mk({ duty: 'verify', phase: 'verify' });
  assert.deepEqual(await v.sup.tick(), ['verified']);
  assert.deepEqual(v.calls[0], ['ack', { ok: true, capabilities: { node: 'p' }, drift: [] }]);
  const c = mk({ duty: 'catch-up', jobs: [{ id: 'never', outcome: 'done' }] });
  assert.deepEqual(await c.sup.tick(), ['caught up with q-0']);
  assert.deepEqual(c.names(), ['rejuvenate', 'caught-up', 'sweep'], 'a stale host rejuvenates before it may claim');
});

test('the leader advances and truncates; every host watches deadlines and reaps its own zombies', async () => {
  assert.deepEqual((await mk({ duty: 'wait', phase: 'quiesce', leader: true }).sup.tick()), ['advanced the quiescence']);
  const t = mk({ duty: 'wait', phase: 'truncate', leader: true });
  assert.deepEqual(await t.sup.tick(), ['truncated: board']);
  assert.deepEqual(t.calls, [['truncate', { apply: true }], ['advance'], ['sweep']]);
  const follower = mk({ duty: 'run', swept: ['a: lease ran out'], zombies: ['slot01 (a, generation 1)'] });
  assert.deepEqual(await follower.sup.tick(), ['swept 1', 'reaped slot01 (a, generation 1)'], 'a host that is not the leader watches every claim too');
  const quiescing = mk({ duty: 'wait', phase: 'verify', swept: ['x'] });
  assert.deepEqual(await quiescing.sup.tick(), ['swept 1'], 'and the watch does not stop for a quiescence');
});

test('only the leader listens to GitHub and answers, and only while running', async () => {
  const leader = mk({ duty: 'run', leader: true, heard: ['post issue-1'] });
  assert.deepEqual(await leader.sup.tick(), ['heard: post issue-1', 'reported: done issue-1']);
  assert.deepEqual(leader.names().slice(0, 3), ['sweep', 'watch', 'report']);
  assert.ok(!mk({ duty: 'run', leader: false, heard: ['x'] }).names().includes('watch'));
  const quiescing = mk({ duty: 'wait', phase: 'verify', leader: true, heard: ['x'] });
  await quiescing.sup.tick();
  assert.ok(!quiescing.names().includes('watch'), 'not during a quiescence');
});
