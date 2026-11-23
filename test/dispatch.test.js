// One job from claim to cleared slot, three ways: it finishes, it hands off
// when told to wrap up, and it is stopped at its deadline. Real git remote,
// real warden, a shell script standing in for the agent. Also: keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFiles } from '../src/powers/node.js';
import { makeBoardService } from '../src/boardService.js';
import { makeBudgetService } from '../src/budget.js';
import { makeSlots } from '../src/slots.js';
import { makePlots } from '../src/plots.js';
import { makeJournal } from '../src/journal.js';
import { makeDispatcher, argvFor } from '../src/dispatch.js';
import { makeKeys, scrub } from '../src/keys.js';
import { parse, stringify } from '../src/yay.js';
import { mkGarden, git, SHED, WARDEN } from './helpers.js';

const skip = fs.existsSync(WARDEN) ? false : 'the warden is not built (cargo build --offline in rust/)';

// The stand-in agent. It reads its job id and behaves accordingly.
const AGENT = `
id=$GARDEN_JOB_ID
env | sort > outbox/env.txt
case "$id" in
  finish*) test -f PROMPT.md && test -d .hook-state || exit 8
           printf 'builder\\nLesson: read the job twice.\\n' > roles/builder/AGENT.md
           echo "Finished $id." > outbox/report.md ;;
  big)     printf 'done: "the survey"\\nreason: "out of time"\\nremaining: "two parts"\\n' > outbox/handoff.yay
           echo "Did the survey; two parts remain." > outbox/report.md ;;
  big-plan) grep -q 'handed off' PROMPT.md JOB.yay || exit 9
           printf 'steps:\\n  - id: "big-1"\\n    title: "First half"\\n  - after:\\n      - "big-1"\\n    id: "big-2"\\n    title: "Second half"\\n' > outbox/handoff.yay
           echo "Planned two steps." > outbox/report.md ;;
  sleepy)  echo partial > scratch/notes; sleep 30 ;;
  *)       exit 3 ;;
esac
`;

const setup = async t => {
  const g = mkGarden(t, { hostBranches: ['host-a'] });
  const root = path.join(g.root, 'root');
  fs.mkdirSync(root);
  const put = (f, text) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text); };
  git(root, 'init', '--quiet', '-b', 'shed');
  put('plots/genome-paths', 'roles/PLOT.md\nroles/builder/\n');
  put('roles/COMMON.md', 'common\n');
  put('roles/PLOT.md', 'plot\n');
  put('roles/builder/AGENT.md', 'builder\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  const h = g.host('host-a');
  const plots = makePlots({ files: makeFiles, run: h.run, rootRepo: root, shards: h.shards, stateDir: h.stateDir, clock: g.clock });
  await plots.cut('alder');
  git(root, 'push', '--quiet', g.remote, 'plot/alder');
  const config = { plots: ['alder'], worker: { window_seconds: 30 }, budget: { planning_ceiling: 0.9, reservation_tokens: 1000 } };
  const seed = h.shards.shard('seed', 'journal');
  await seed.land('seed', tree => { tree.write('config/pools.yay', stringify({ pools: [{ pool: 'p', weekly_tokens: 1000000 }] })); return {}; });
  const budget = makeBudgetService({ shards: h.shards, host: 'host-a', clock: g.clock, config });
  await budget.refresh();
  const board = makeBoardService({ shards: h.shards, host: 'host-a', clock: g.clock, config, budget });
  fs.mkdirSync(path.join(g.root, 'slots'));
  const sim = makeSlots({ files: makeFiles, run: h.run, warden: WARDEN, rootRepo: root, slotsRoot: path.join(g.root, 'slots'), repositories: path.join(g.root, 'repositories'), stateDir: h.stateDir, clock: g.clock, count: 1, mode: 'sim' });
  // With accounts, a prepared home is the slot account's, and the steward
  // cannot write into it. Sim mode has no accounts, so stand in for that:
  // the home is sealed from prepare until the run starts, and closed from
  // the run's end until harvest releases it.
  const slots = {
    ...sim,
    prepare: async (...args) => { const home = await sim.prepare(...args); fs.chmodSync(home, 0o500); return home; },
    run: async (slot, opts) => {
      const home = path.join(g.root, 'slots', slot);
      fs.chmodSync(home, 0o700);
      try { return await sim.run(slot, opts); } finally { fs.chmodSync(home, 0o000); }
    },
    harvest: async (slot, opts) => { fs.chmodSync(path.join(g.root, 'slots', slot), 0o700); return sim.harvest(slot, opts); },
  };
  const journal = makeJournal({ files: makeFiles, shards: h.shards, stateDir: h.stateDir, host: 'host-a', clock: g.clock });
  const dispatcher = makeDispatcher({
    board, slots, budget, plots, journal, files: makeFiles, clock: g.clock, config,
    worker: {
      argv: ['/bin/sh', '-c', AGENT],
      env: { PATH: '/usr/bin:/bin', ANTHROPIC_API_KEY: 'sk-leak', GH_TOKEN: 'ghp_leak', MY_SERVICE_TOKEN: 'leak' },
      repositories: path.join(g.root, 'repositories'),
      logFile: id => path.join(g.root, `${id}.log`),
      usage: async () => ({ source: 'test', input_tokens: 700, output_tokens: 300, cache_read_tokens: 5000 }),
    },
  });
  const rec = (branch, id) => { const f = g.ls(branch).find(x => x.endsWith(`/${id}.yay`)); return f ? { file: f, ...parse(g.show(branch, f)) } : null; };
  return { g, h, board, budget, dispatcher, rec };
};

test('a job that finishes: archived with its cost, lessons landed, slot razed', { skip }, async t => {
  const { g, h, board, dispatcher, rec } = await setup(t);
  assert.equal(await dispatcher.once(), null, 'nothing to do on an empty board');
  await board.post({ id: 'finish-1', role: 'builder', title: 'Finish', body: 'Do it.\n' });
  const r = await dispatcher.once();
  assert.deepEqual([r.id, r.outcome, r.plot, r.cost.tokens], ['finish-1', 'done', 'alder', 1000]);
  const done = rec('archive', 'finish-1');
  assert.deepEqual([done.outcome, done.report, done.cost.tokens, done.cost.engagements], ['done', 'Finished finish-1.\n', 1000, 1]);
  assert.equal(rec('board', 'finish-1'), null);
  assert.deepEqual(r.lessons.paths, ['roles/builder/AGENT.md']);
  assert.match(g.show('plot/alder', 'roles/builder/AGENT.md'), /Lesson: read the job twice\./);
  assert.deepEqual(fs.readdirSync(path.join(g.root, 'slots')), [], 'the slot is razed after the job');
  const usage = parse(g.show('host/host-a', g.ls('host/host-a').find(f => f.startsWith('usage/')))).rows;
  assert.deepEqual([usage[0].id, usage[0].outcome, usage[0].input_tokens], ['finish-1', 'done', 700], 'the ledger is fed by cost');
  const env = fs.readFileSync(path.join(h.stateDir, 'harvest/finish-1/outbox/env.txt'), 'utf8');
  assert.match(env, /GARDEN_DEADLINE_EPOCH=\d+\n/);
  assert.match(env, /GARDEN_WINDOW_S=30\n/);
  assert.ok(!/leak/.test(env), `no key reaches a worker's environment:\n${env}`);
});

test('a job that hands off gets a planner, which dispatches the rest as its children', { skip }, async t => {
  const { board, dispatcher, rec } = await setup(t);
  await board.post({ id: 'big', role: 'builder', title: 'Big' });
  await board.post({ id: 'after-big', role: 'builder', title: 'Waits', after: ['big'] });
  const r = await dispatcher.once();
  assert.deepEqual([r.id, r.outcome], ['big', 'handoff']);
  assert.equal(rec('board', 'big'), null, 'the job left the board');
  assert.deepEqual([rec('archive', 'big').outcome, rec('archive', 'big').handed_to, rec('archive', 'big').handoff.window_s], ['handed-off', 'big-plan', 30], 'archived as handed-off, with the clock it ran out on');
  const p = rec('board', 'big-plan');
  assert.deepEqual([p.file, p.role, p.level, p.cost_under.tokens], ['open/big-plan.yay', 'planner', 1, 1000], 'a planner stands in its place, carrying its cost');
  assert.deepEqual([rec('board', 'after-big').after, rec('board', 'after-big').level], [['big-plan'], 1], 'what waited on the job waits on the planner, and rises');

  const second = await dispatcher.once();
  assert.deepEqual([second.id, second.outcome], ['big-plan', 'handoff'], 'the planner runs next, and dispatches');
  const planned = rec('board', 'big-plan');
  assert.deepEqual([planned.file, planned.level, planned.plans, planned.steps], ['held/big-plan.yay', 1, 1, ['big-1', 'big-2']], 'two steps, still level 1');
  assert.deepEqual(rec('board', 'big-2').after, ['big-1']);
  // The steps have no stand-in behavior: they fail, and keep blocking.
  assert.equal((await dispatcher.once()).outcome, 'failed');
  assert.equal(rec('board', 'big-1').file, 'failed/big-1.yay');
  assert.equal(await dispatcher.once(), null, 'big-2 waits on the failed step; nothing is claimable');
});

test('a job stopped at its deadline is requeued with its cost, never completed', { skip }, async t => {
  const { g, board, dispatcher, rec } = await setup(t);
  await board.post({ id: 'sleepy', role: 'builder', title: 'Sleepy', window_s: 1 });
  const r = await dispatcher.once();
  assert.equal(r.outcome, 'overrun');
  const job = rec('board', 'sleepy');
  assert.deepEqual([job.file, job.attempts, job.cost.engagements, job.plans, job.level], ['open/sleepy.yay', 1, 1, 0, 0], 'an overrun is not a planning event');
  assert.equal(rec('archive', 'sleepy'), null);
  assert.deepEqual(fs.readdirSync(path.join(g.root, 'slots')), [], 'the slot is razed on this path too');
});

test('a run whose lease ran out is set aside: nothing applied, cost kept, zombie reaped', { skip }, async t => {
  const { g, h, board, dispatcher, rec } = await setup(t);
  await board.post({ id: 'finish-late', role: 'builder', title: 'Late' });
  // Another host expires and re-lets the job while this one is running it:
  // simulated by doing so between this host's claim and its settlement.
  const other = makeBoardService({ shards: g.host('other').shards, host: 'other', clock: g.clock, config: { worker: { window_seconds: 30 } } });
  const realClaim = board.claim;
  const stolen = { ...board, claim: async opts => {
    const job = await realClaim(opts);
    const now = Date.parse(g.clock.now());
    g.clock.set(new Date(Date.parse(job.claim.expires_at) + 400000).toISOString());
    await other.sweep();
    await other.claim({ worker: 'w' });
    g.clock.set(new Date(now).toISOString());
    return job;
  } };
  const slots = makeSlots({ files: makeFiles, run: h.run, warden: WARDEN, rootRepo: path.join(g.root, 'root'), slotsRoot: path.join(g.root, 'slots'), repositories: path.join(g.root, 'repositories'), stateDir: h.stateDir, clock: g.clock, count: 1, mode: 'sim' });
  const plots = makePlots({ files: makeFiles, run: h.run, rootRepo: path.join(g.root, 'root'), shards: h.shards, stateDir: h.stateDir, clock: g.clock });
  const d = makeDispatcher({ board: stolen, slots, plots, files: makeFiles, clock: g.clock, config: { plots: ['alder'], worker: { window_seconds: 30 } },
    worker: { argv: ['/bin/sh', '-c', AGENT], env: { PATH: '/usr/bin:/bin' }, repositories: path.join(g.root, 'repositories'), logFile: id => path.join(g.root, `${id}.log`), usage: async () => ({ input_tokens: 400 }) } });
  const before = g.remoteGit('rev-parse', 'plot/alder');
  const r = await d.once();
  assert.equal(r.outcome, 'superseded');
  const job = rec('board', 'finish-late');
  assert.deepEqual([job.file, job.claim.generation, job.cost.tokens, job.late_runs], ['claimed/other/finish-late.yay', 2, 400, [{ host: 'host-a', generation: 1 }]], "the successor's claim stands; the late run's cost is recorded");
  assert.equal(rec('archive', 'finish-late'), null, 'its report did not complete the job');
  assert.equal(g.remoteGit('rev-parse', 'plot/alder'), before, 'its lessons were not landed');
  assert.deepEqual(fs.readdirSync(path.join(g.root, 'slots')), []);

  // A host that comes back finds a slot still holding a job it no longer has.
  await board.post({ id: 'finish-2', role: 'builder', title: 'Two' });
  const mine = await board.claim({ worker: 'w' });
  await slots.prepare('slot01', mine, 'alder');
  assert.deepEqual(await dispatcher.reap(), [], 'a slot whose claim is still held is left alone');
  g.clock.set(new Date(Date.parse(mine.claim.expires_at) + 400000).toISOString());
  await other.sweep();
  assert.deepEqual(await dispatcher.reap(), ['slot01 (finish-2, generation 1)'], 'its own superseded job is reaped');
  assert.deepEqual(fs.readdirSync(path.join(g.root, 'slots')), []);
});

test('a tier puts its model before the prompt; an unknown tier is refused, never run lower', () => {
  const argv = ['claude', '-p', '--settings', 's.json', 'Read PROMPT.md'];
  const tiers = { mentat: { model: 'claude-fable-5-1' } };
  assert.equal(argvFor(argv, tiers, undefined), argv);
  assert.deepEqual(argvFor(argv, tiers, 'mentat'), ['claude', '-p', '--settings', 's.json', '--model', 'claude-fable-5-1', 'Read PROMPT.md']);
  assert.throws(() => argvFor(argv, tiers, 'oracle'), { code: 'unknown-tier' });
});

test('keys are files with exact modes, read only by their consumer', async t => {
  const g = mkGarden(t, { seeds: [] });
  const stateDir = path.join(g.root, 'state');
  fs.mkdirSync(stateDir);
  const asked = [];
  const fakeRun = (cmd, args, opts) => { asked.push({ cmd, args, env: opts?.env }); return { status: 0, stdout: 'gho_FROMGHSTORE\n', stderr: '' }; };
  const keys = makeKeys({ files: makeFiles, stateDir, registryText: fs.readFileSync(path.join(SHED, 'keys/registry.yay'), 'utf8'), run: fakeRun, env: { HOME: path.join(stateDir, 'steward'), PATH: '/usr/bin' } });
  await keys.set('anthropic-worker', 'sk-abcDEF123\n');
  assert.equal(fs.statSync(path.join(stateDir, 'secrets')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(stateDir, 'secrets/anthropic-worker')).mode & 0o777, 0o600);
  assert.equal(await keys.read('anthropic-worker', 'worker'), 'sk-abcDEF123');
  await assert.rejects(keys.read('anthropic-worker', 'steward'), { code: 'wrong-consumer' });
  await assert.rejects(keys.set('anthropic-worker', 'has space'), { code: 'invalid' });
  await assert.rejects(keys.set('nosuch', 'x'), { code: 'unknown-key' });
  fs.chmodSync(path.join(stateDir, 'secrets/anthropic-worker'), 0o640);
  await assert.rejects(keys.read('anthropic-worker', 'worker'), { code: 'bad-mode' }, 'a key others could read is no key');

  // The bot's token has one home, gh's own store, and is read through gh.
  await assert.rejects(keys.set('github-bot', 'ghp_byHand'), { code: 'not-settable' });
  await assert.rejects(keys.read('github-bot', 'steward'), { code: 'no-key' }, 'before the login there is none');
  const store = path.join(stateDir, 'steward/.config/gh/hosts.yml');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  fs.writeFileSync(store, 'github.com: {}\n', { mode: 0o600 });
  assert.equal(await keys.read('github-bot', 'steward'), 'gho_FROMGHSTORE');
  assert.deepEqual([asked[0].cmd, asked[0].args, asked[0].env.HOME], ['gh', ['auth', 'token', '--hostname', 'github.com'], path.join(stateDir, 'steward')], 'gh prints it to a pipe; it is in no argument and no variable');
  await assert.rejects(keys.read('github-bot', 'worker'), { code: 'wrong-consumer' }, 'a job-side consumer cannot read the bot token');
  fs.chmodSync(store, 0o644);
  await assert.rejects(keys.read('github-bot', 'steward'), { code: 'bad-mode' });
  const status = await keys.status();
  assert.deepEqual([status['github-bot'].present, status['github-bot'].mode_ok, status['github-ssh'].present, status['anthropic-worker'].mode_ok], [true, false, false, false]);
  assert.ok(!JSON.stringify(status).includes('gho_') && !JSON.stringify(status).includes('sk-'), 'status never shows a value');
  assert.deepEqual(scrub({ PATH: '/bin', ANTHROPIC_API_KEY: 'x', FOO_TOKEN: 'y', GH_TOKEN: 'z', LANG: 'C' }), { PATH: '/bin', LANG: 'C' });
});
