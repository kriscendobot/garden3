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
import { makeDispatcher } from '../src/dispatch.js';
import { makeKeys, scrub } from '../src/keys.js';
import { parse, stringify } from '../src/yay.js';
import { mkGarden, git, SHED } from './helpers.js';

const WARDEN = path.join(SHED, 'rust/target/debug/warden');
const skip = fs.existsSync(WARDEN) ? false : 'the warden is not built (cargo build --offline in rust/)';

// The stand-in agent. It reads its job id and behaves accordingly.
const AGENT = `
id=$GARDEN_JOB_ID
env | sort > outbox/env.txt
case "$id" in
  finish*) printf 'builder\\nLesson: read the job twice.\\n' > roles/builder/AGENT.md
           echo "Finished $id." > outbox/report.md ;;
  big)     printf 'reason: "out of time"\\nsteps:\\n  - id: "big-1"\\n    title: "First half"\\n  - after:\\n      - "big-1"\\n    id: "big-2"\\n    title: "Second half"\\n' > outbox/handoff.yay
           echo "Did the survey; two parts remain." > outbox/report.md ;;
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
  const slots = makeSlots({ files: makeFiles, run: h.run, warden: WARDEN, rootRepo: root, slotsRoot: path.join(g.root, 'slots'), repositories: path.join(g.root, 'repositories'), stateDir: h.stateDir, clock: g.clock, count: 1, mode: 'sim' });
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

test('a job that hands off: steps posted, level raised, then closed', { skip }, async t => {
  const { board, dispatcher, rec } = await setup(t);
  await board.post({ id: 'big', role: 'builder', title: 'Big' });
  await board.post({ id: 'after-big', role: 'builder', title: 'Waits', after: ['big'] });
  const r = await dispatcher.once();
  assert.equal(r.outcome, 'handoff');
  const big = rec('board', 'big');
  assert.deepEqual([big.file, big.level, big.handoffs, big.steps, big.cost.tokens], ['held/big.yay', 1, 1, ['big-1', 'big-2'], 1000]);
  assert.equal(big.handoff_log[0].window_s, 30, 'the hand-off records the clock it ran out on');
  assert.equal(rec('board', 'after-big').level, 1, 'what waits on it rises too');
  assert.deepEqual(rec('board', 'big-2').after, ['big-1']);
  assert.equal(rec('archive', 'big'), null, 'a hand-off is not a completion');
  // The steps have no stand-in behaviour: they fail, and keep blocking.
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
  assert.deepEqual([job.file, job.attempts, job.cost.engagements, job.handoffs, job.level], ['open/sleepy.yay', 1, 1, 0, 0], 'an overrun is not a planning event');
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

test('keys are files with exact modes, read only by their consumer', async t => {
  const g = mkGarden(t, { seeds: [] });
  const stateDir = path.join(g.root, 'state');
  fs.mkdirSync(stateDir);
  const keys = makeKeys({ files: makeFiles, stateDir, registryText: fs.readFileSync(path.join(SHED, 'keys/registry.yay'), 'utf8') });
  await keys.set('github-bot', 'ghp_abcDEF123\n');
  assert.equal(fs.statSync(path.join(stateDir, 'secrets')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(stateDir, 'secrets/github-bot')).mode & 0o777, 0o600);
  assert.equal(await keys.read('github-bot', 'steward'), 'ghp_abcDEF123');
  await assert.rejects(keys.read('github-bot', 'worker'), { code: 'wrong-consumer' }, 'a job-side consumer cannot read the bot token');
  await assert.rejects(keys.set('github-bot', 'not a token'), { code: 'invalid' });
  await assert.rejects(keys.set('github-bot', 'sk-wrong-kind'), { code: 'invalid' });
  await assert.rejects(keys.set('nosuch', 'x'), { code: 'unknown-key' });
  fs.chmodSync(path.join(stateDir, 'secrets/github-bot'), 0o640);
  await assert.rejects(keys.read('github-bot', 'steward'), { code: 'bad-mode' }, 'a key others could read is no key');
  const status = await keys.status();
  assert.deepEqual([status['github-bot'].present, status['github-bot'].mode_ok, status['anthropic-worker'].present], [true, false, false]);
  assert.ok(!JSON.stringify(status).includes('ghp_'), 'status never shows a value');
  assert.deepEqual(scrub({ PATH: '/bin', ANTHROPIC_API_KEY: 'x', FOO_TOKEN: 'y', GH_TOKEN: 'z', LANG: 'C' }), { PATH: '/bin', LANG: 'C' });
});
