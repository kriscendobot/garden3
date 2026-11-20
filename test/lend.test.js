// The operator's subscription login, lent to jobs: a job's home gets the
// access token only, never the refresh token; a login that would expire
// inside a job's window is not lent; and nothing a job made that holds the
// token is carried out. Driven with a stand-in warden, so it runs on a host
// whose real warden is bound to its own slots directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { accessOnly, makeKeys } from '../src/keys.js';
import { makeSlots } from '../src/slots.js';
import { makeDispatcher } from '../src/dispatch.js';
import { git, SHED } from './helpers.js';

const WARDEN = path.join(SHED, 'test/fixtures/warden-sim.js');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const gitRun = (cmd, args, opts = {}) => run(cmd, cmd === 'git' ? ['-c', 'protocol.file.allow=always', ...args] : args, { ...opts, env: { ...GIT_ENV, ...(opts.env ?? {}) } });
const ACCESS = 'sk-ant-oat-ACCESS-7731';
const REFRESH = 'sk-ant-ort-REFRESH-9902';
const login = (expiresAt = Date.parse('2026-11-20T12:00:00Z')) => JSON.stringify({ claudeAiOauth: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt, refreshTokenExpiresAt: expiresAt + 1e9, scopes: ['user:inference'], subscriptionType: 'max' } });
const REGISTRY = 'keys:\n  claude-login:\n    consumer: "steward"\n    file: "steward/.claude/.credentials.json"\n    lend: "access-only"\n    lend_as: ".claude/.credentials.json"\n    provider: "claude"\n  other:\n    consumer: "worker"\n';

test('access-only: the refresh token is gone, the expiry and the secret are said', () => {
  const lent = accessOnly(login());
  assert.ok(!lent.text.includes(REFRESH) && !lent.text.includes('refreshToken'));
  assert.equal(JSON.parse(lent.text).claudeAiOauth.accessToken, ACCESS);
  assert.deepEqual([lent.expires_at, lent.secret], ['2026-11-20T12:00:00Z', ACCESS]);
  assert.throws(() => accessOnly('{}'), { code: 'no-key' });
  assert.throws(() => accessOnly('not json'), { code: 'no-key' });
});

test('keys lend what the registry allows, from a file only the steward can read', async t => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-lend-'));
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const keys = makeKeys({ files: makeFiles, stateDir: T, registryText: REGISTRY, run: gitRun });
  await assert.rejects(keys.lend('claude-login'), { code: 'no-key' });
  fs.mkdirSync(path.join(T, 'steward/.claude'), { recursive: true });
  fs.writeFileSync(path.join(T, 'steward/.claude/.credentials.json'), login(), { mode: 0o644 });
  await assert.rejects(keys.lend('claude-login'), { code: 'bad-mode' }, 'a login others can read is treated as leaked');
  fs.chmodSync(path.join(T, 'steward/.claude/.credentials.json'), 0o600);
  const lent = await keys.lend('claude-login');
  assert.equal(lent.file, '.claude/.credentials.json');
  assert.ok(!lent.text.includes(REFRESH));
  assert.ok(fs.readFileSync(path.join(T, 'steward/.claude/.credentials.json'), 'utf8').includes(REFRESH), 'the steward\'s own login is untouched');
  await assert.rejects(keys.lend('other'), { code: 'not-lendable' });
  await assert.rejects(keys.set('claude-login', 'x'), { code: 'not-settable' });
});

const setup = t => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-lend-'));
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const write = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  const root = path.join(T, 'root');
  fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'shed');
  write(root, 'roles/COMMON.md', 'common\n');
  write(root, 'plots/genome-paths', 'roles/builder/\nskills/adopted/\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  const plot = path.join(T, 'alder');
  fs.mkdirSync(plot);
  git(plot, 'init', '--quiet', '-b', 'plot/alder');
  write(plot, 'roles/builder/AGENT.md', 'build\n');
  write(plot, 'plot.yay', 'tier: "standard"\n');
  git(plot, 'add', '-A'); git(plot, 'commit', '--quiet', '-m', 'genome');
  git(root, 'fetch', '--quiet', plot, 'plot/alder:plot/alder');
  // A project's bare mirror, as the steward keeps it.
  const repositories = path.join(T, 'repositories');
  const src = path.join(T, 'src');
  fs.mkdirSync(src);
  git(src, 'init', '--quiet', '-b', 'main');
  write(src, 'README.md', 'a project\n');
  git(src, 'add', '-A'); git(src, 'commit', '--quiet', '-m', 'start');
  git(T, 'clone', '--quiet', '--bare', src, path.join(repositories, 'o-p.git'));
  fs.mkdirSync(path.join(T, 'slots'));
  const slots = makeSlots({ files: makeFiles, run: gitRun, warden: WARDEN, rootRepo: root, slotsRoot: path.join(T, 'slots'), repositories, stateDir: path.join(T, 'state'), clock: makeNodePowers().clock, count: 2, mode: 'sim' });
  return { T, repositories, slots, write };
};
const job = { id: 'lent-job', role: 'builder', title: 'Lent', body: 'Do it.\n', claim: { generation: 1 } };

test('a home is lent the access token, mode 0600, and harvest carries out nothing that holds it', async t => {
  const { T, repositories, slots, write } = setup(t);
  const lent = { file: '.claude/.credentials.json', ...accessOnly(login()) };
  const home = await slots.prepare('slot01', job, 'alder', undefined, [lent]);
  const creds = path.join(home, '.claude/.credentials.json');
  assert.equal(fs.statSync(creds).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(home, '.claude')).mode & 0o777, 0o700);
  assert.ok(!fs.readFileSync(creds, 'utf8').includes(REFRESH), 'never the refresh token');
  await assert.rejects(slots.prepare('slot02', job, 'alder', undefined, [{ ...lent, file: '../escape' }]), { code: 'invalid' });

  // The job leaks the token three ways, and also does honest work.
  const wt = path.join(home, 'worktrees/o/p');
  git(T, 'clone', '--quiet', '--shared', path.join(repositories, 'o-p.git'), wt);
  write(wt, 'notes.md', `the token is ${ACCESS}\n`);
  git(wt, 'checkout', '--quiet', '-b', 'job/lent-job/1');
  git(wt, 'add', '-A'); git(wt, '-c', 'user.name=j', '-c', 'user.email=j@j', 'commit', '--quiet', '-m', 'leak');
  write(wt, 'notes.md', 'scrubbed afterwards\n');
  git(wt, 'add', '-A'); git(wt, '-c', 'user.name=j', '-c', 'user.email=j@j', 'commit', '--quiet', '-m', 'hide it');
  write(home, 'skills/adopted/leaky/SKILL.md', `use ${ACCESS}\n`);
  write(home, 'skills/adopted/honest/SKILL.md', 'a real skill\n');
  write(home, 'outbox/report.md', `done; token ${ACCESS}\n`);
  write(home, 'outbox/handoff.yay', 'reason: "fine"\n');
  const h = await slots.harvest('slot01', { secrets: [ACCESS] });
  assert.deepEqual([...h.refused].sort(), ['o/p refs/heads/job/lent-job/1', 'outbox/report.md', 'skills/adopted/leaky/SKILL.md'], 'a branch is judged by its history, not only its tip');
  assert.deepEqual([h.genome_changed, h.outbox], [['skills/adopted/honest/SKILL.md'], ['handoff.yay']]);
  assert.equal(git(path.join(repositories, 'o-p.git'), 'for-each-ref', 'refs/heads/job'), '', 'the leaking branch never reached the mirror');
  const carried = fs.readdirSync(path.join(T, 'state/harvest/lent-job'), { recursive: true }).filter(f => fs.statSync(path.join(T, 'state/harvest/lent-job', f)).isFile()).map(f => fs.readFileSync(path.join(T, 'state/harvest/lent-job', f), 'utf8')).join('');
  assert.ok(!carried.includes(ACCESS));
});

test('a login that would expire inside the window is not lent: the job goes back, untouched', async () => {
  const released = [];
  const prepared = [];
  const job2 = { ...job, window_s: 2400, claim: { generation: 3 } };
  const board = { claim: async () => job2, release: async (id, o) => { released.push([id, o.generation]); return true; } };
  const slots = { free: async () => 'slot01', prepare: async (...a) => { prepared.push(a); return null; } };
  const at = '2026-11-20T10:00:00Z';
  const dispatcher = lend => makeDispatcher({ board, slots, files: makeFiles, clock: { now: () => at }, config: {}, worker: { argv: ['true'], lend, killAfterS: 30 } });
  // 2400 + 30 + 60 s from 10:00 is 10:41:30.
  assert.equal(await dispatcher(async () => ({ ...accessOnly(login(Date.parse('2026-11-20T10:41:00Z'))), file: '.claude/.credentials.json' })).once({ workerId: 'w' }), null);
  assert.deepEqual([released, prepared.length], [[['lent-job', 3]], 0]);
  assert.equal(await dispatcher(async () => { throw Object.assign(new Error('no login'), { code: 'no-key' }); }).once({ workerId: 'w' }), null, 'no login: nothing is claimed');
  assert.equal(released.length, 1);
});
