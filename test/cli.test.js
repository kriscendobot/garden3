// The command line: a method call with a SHON argument, a YAY reply. And the
// host's shed refresh, which only ever fast-forwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from '../src/yay.js';
import { makeHost } from '../src/host.js';
import { makeFiles } from '../src/powers/node.js';
import { mkGarden, git, SHED } from './helpers.js';

test('garden <service> <method> [ value ]', t => {
  const g = mkGarden(t);
  const state = path.join(g.root, 'state');
  const env = { ...process.env, GARDEN_REMOTE: g.remote, GARDEN_STATE: state, GARDEN_HOST: 'host-a', GARDEN_BUDGET: 'off', GARDEN_CAP_ROOT: path.join(g.root, 'cap'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const garden = (...args) => {
    const r = spawnSync(process.execPath, [path.join(SHED, 'bin/garden.js'), ...args], { env, encoding: 'utf8' });
    return { status: r.status, reply: parse(r.stdout || 'ok: false\n'), stderr: r.stderr };
  };
  let r = garden('board', 'post', '[', '--id', 'fix-a', '--role', 'builder', '--title', 'Fix A', '--after', '[]', '--priority', '2', ']');
  assert.deepEqual([r.status, r.reply], [0, { ok: true, result: true }], r.stderr);
  assert.equal(parse(g.show('board', 'open/fix-a.yay')).priority, 2, 'a SHON integer arrives as a number');
  r = garden('board', 'claim', '[', '--worker', 'w1', ']');
  assert.equal(r.reply.result.id, 'fix-a');
  r = garden('board', 'complete', 'fix-a', 'done', '[', '--cost', '[', '--tokens', '5', ']', ']');
  assert.deepEqual([r.status, r.reply.ok], [0, true], 'bare words are positional arguments before the value');
  r = garden('board', 'post', '[', '--id', 'Bad Id', '--role', 'builder', '--title', 'x', ']');
  assert.deepEqual([r.status, r.reply.ok, r.reply.code], [1, false, 'invalid'], 'a refusal is a reply, with its code');
  assert.equal(garden('nosuch', 'x').status, 2);
  const noMethod = garden('keys', 'nosuch');
  assert.deepEqual([noMethod.status, noMethod.reply.code], [1, 'usage'], 'an unknown method is a refusal that lists the real ones, not a crash');
  assert.match(noMethod.reply.error, /this service has: .*status/);
  assert.equal(garden('host', 'build').reply.code, 'build', 'host build is a method (it fails here only for want of a toolchain on PATH)');
  assert.equal(garden('board', 'post', '[', '--id').status, 2, 'malformed SHON is a usage error');
  assert.deepEqual(garden('keys', 'status').reply.result['github-bot'].present, false);
  assert.equal(garden('keys', 'set', 'anthropic-worker', 'sk-inArgv').status, 2, 'a key is never taken from argv');
  const set = spawnSync(process.execPath, [path.join(SHED, 'bin/garden.js'), 'keys', 'set', 'anthropic-worker'], { env, input: 'sk-fromStdin1\n', encoding: 'utf8' });
  assert.equal(set.status, 0, set.stdout);
  assert.equal(fs.readFileSync(path.join(state, 'secrets/anthropic-worker'), 'utf8'), 'sk-fromStdin1\n');
  assert.ok(!set.stdout.includes('sk-'));
  const byHand = spawnSync(process.execPath, [path.join(SHED, 'bin/garden.js'), 'keys', 'set', 'github-bot'], { env, input: 'ghp_x\n', encoding: 'utf8' });
  assert.deepEqual([byHand.status, parse(byHand.stdout).code], [1, 'not-settable'], "the bot's token is written only by its login");

  // The deadline hook speaks the harness's protocol and never fails.
  const hookEnv = { ...env, GARDEN_HOOK_STATE: path.join(g.root, 'hook'), GARDEN_JOB_ID: 'fix-a', GARDEN_WINDOW_S: '2400', GARDEN_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 300) };
  const hook = e => spawnSync(process.execPath, [path.join(SHED, 'bin/garden.js'), 'hook'], { env: e, input: '{"tool":"x"}', encoding: 'utf8' });
  const first = hook(hookEnv);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /Wrap up now/);
  assert.deepEqual([hook(hookEnv).stdout, hook(hookEnv).status], ['', 0], 'the note goes once');
  assert.deepEqual([hook(env).stdout, hook(env).status], ['', 0], 'with no clock it says nothing');
});

test('rejuvenation fast-forwards the shed and refuses anything else', async t => {
  const g = mkGarden(t, { seeds: [] });
  const origin = path.join(g.root, 'origin');
  fs.mkdirSync(origin);
  git(origin, 'init', '--quiet', '-b', 'shed');
  fs.writeFileSync(path.join(origin, 'a'), '1\n');
  git(origin, 'add', '-A'); git(origin, 'commit', '--quiet', '-m', 'one');
  const root = path.join(g.root, 'root');
  git(g.root, 'clone', '--quiet', origin, root);
  fs.writeFileSync(path.join(origin, 'a'), '2\n');
  git(origin, 'commit', '--quiet', '-am', 'two');
  const two = git(origin, 'rev-parse', 'HEAD');
  const h = g.host('host-a');
  const host = makeHost({ files: makeFiles, run: h.run, rootRepo: root, stateDir: h.stateDir, host: 'host-a', clock: g.clock });
  const r = await host.rejuvenate({ shed: two });
  assert.equal(r.shed, two, 'the commit is fetched and the checkout fast-forwarded');
  assert.equal(fs.readFileSync(path.join(root, 'a'), 'utf8'), '2\n');
  assert.equal((await host.rejuvenate({ shed: two })).shed, two, 'again is a no-op');
  fs.writeFileSync(path.join(root, 'a'), 'local edit\n');
  await assert.rejects(host.rejuvenate({ shed: two }), { code: 'dirty' }, 'local changes are never overwritten');
  git(root, 'checkout', '--quiet', 'a');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '--quiet', '--allow-empty', '-m', 'local commit');
  fs.writeFileSync(path.join(origin, 'a'), '3\n');
  git(origin, 'commit', '--quiet', '-am', 'three');
  await assert.rejects(host.rejuvenate({ shed: git(origin, 'rev-parse', 'HEAD') }), { code: 'diverged' }, 'a diverged checkout is reported, not merged');
  assert.equal(await host.caughtUp(), undefined);
  await host.markCaughtUp('q-1');
  assert.equal(await host.caughtUp(), 'q-1');
  assert.equal((await host.verify()).ok, true);
});
