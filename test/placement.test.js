// Hosts install their own software. A host says what it is and what it has or
// could install; a job goes only where its capabilities can be met; an install
// happens before the claim; a job nobody can run is shown; and hosts being
// different from each other is not drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { makeCapabilities } from '../src/capabilities.js';
import { describe, makeHostInfo } from '../src/hostinfo.js';
import { makeBoardService } from '../src/boardService.js';
import { makeDispatcher } from '../src/dispatch.js';
import * as B from '../src/board.js';
import * as Q from '../src/quiescence.js';
import { reconcile } from '../src/clients.js';
import { parse, stringify } from '../src/yay.js';
import { mkGarden } from './helpers.js';

const p = makeNodePowers();
// One shed of manifests; hosts of different architectures with their own roots.
const world = t => {
  const g = mkGarden(t, { hostBranches: ['amd', 'arm'] });
  const manifests = path.join(g.root, 'manifests');
  const tool = (name, version, { arches = ['amd64', 'arm64'], sha, requires = [] } = {}) => {
    const d = path.join(g.root, 'build', `${name}-${version}`, 'pkg', 'bin');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, name), `#!/bin/sh\necho "${name} ${version}"\n`, { mode: 0o755 });
    const tar = path.join(g.root, 'build', `${name}-${version}.tar`);
    execFileSync('tar', ['-C', path.join(g.root, 'build', `${name}-${version}`), '-cf', tar, 'pkg']);
    fs.mkdirSync(path.join(manifests, name), { recursive: true });
    const src = [{ url: `file://${tar}`, sha256: sha ?? p.sha256File(tar), strip: 1 }];
    fs.writeFileSync(path.join(manifests, name, 'capability.yay'), stringify({ name, version, summary: 't', requires, bin: [`bin/${name}`], sources: Object.fromEntries(arches.map(a => [a, src])), verify: [{ run: [name], expect: `^${name} ` }] }));
  };
  const host = (name, arch, { base = [] } = {}) => {
    const h = g.host(name);
    const caps = makeCapabilities({ files: makeFiles, run, sha256File: p.sha256File, sha256: p.sha256, clock: g.clock, arch, root: path.join(g.root, `cap-${name}`), manifestsDir: manifests, stateDir: h.stateDir, base, env: process.env });
    const board = makeBoardService({ shards: h.shards, host: name, clock: g.clock, capabilities: caps });
    const info = makeHostInfo({ shards: h.shards, host: name, clock: g.clock, probe: () => ({ arch, os: 'linux', cores: arch === 'arm64' ? 10 : 16, memory_bytes: 64 * 2 ** 30, devices: arch === 'amd64' ? ['/dev/kfd'] : [] }), capabilities: caps, slots: 2, shed: () => 'abc' });
    return { name, h, caps, board, info };
  };
  return { g, tool, host, policy: (h, doc) => { fs.mkdirSync(path.join(h.h.stateDir, 'capabilities'), { recursive: true }); fs.writeFileSync(path.join(h.h.stateDir, 'capabilities/policy.yay'), stringify(doc)); } };
};

test('a host describes itself, and writes the record only when it changes', async t => {
  const { g, tool, host } = world(t);
  tool('hammer', '1.0');
  tool('amdtool', '1.0', { arches: ['amd64'] });
  const arm = host('arm', 'arm64');
  const d = await arm.info.describe();
  assert.deepEqual([d.host, d.arch, d.os, d.cores, d.memory_gb, d.gpu, d.client, d.slots], ['arm', 'arm64', 'linux', 10, 64, false, false, 2]);
  assert.deepEqual(d.capabilities, { installed: [], available: ['hammer'] }, 'what has no artifact for this architecture is not available here');
  assert.equal(await arm.info.publish(), true);
  const before = g.remoteGit('rev-parse', 'host/arm');
  assert.equal(await arm.info.publish(), false, 'unchanged: no commit');
  assert.equal(g.remoteGit('rev-parse', 'host/arm'), before);
  await arm.caps.install('hammer');
  assert.equal(await arm.info.publish(), true, 'an install changes the record');
  const rec = parse(g.show('host/arm', 'host.yay'));
  assert.deepEqual([rec.arch, rec.capabilities.installed, rec.capabilities.available], ['arm64', ['hammer'], []]);
  const amd = host('amd', 'amd64');
  await amd.info.publish();
  assert.deepEqual((await amd.info.fleet()).map(h => [h.host, h.arch, h.gpu]), [['amd', 'amd64', true], ['arm', 'arm64', false]]);
  assert.deepEqual(describe({ host: 'x', probe: { arch: 'riscv64', os: 'linux', cores: 4, memory_bytes: 2 ** 33, devices: [] }, offer: { installed: [], available: [] }, slots: 1, shed: 's' }).arch, 'riscv64', 'an architecture nobody planned for is reported as it is');
});

test('availability follows architecture and the host\'s own policy', async t => {
  const { tool, host, policy } = world(t);
  tool('hammer', '1.0');
  tool('amdtool', '1.0', { arches: ['amd64'] });
  tool('heavy', '9.0');
  const [amd, arm] = [host('amd', 'amd64'), host('arm', 'arm64')];
  assert.deepEqual((await amd.caps.offer()).available, ['amdtool', 'hammer', 'heavy']);
  const a = await arm.caps.availability();
  assert.deepEqual([a.hammer, a.amdtool], ['available', 'it has no sources for arm64']);
  policy(arm, { forbid: ['heavy'] });
  assert.equal((await arm.caps.availability()).heavy, "forbidden by this host's policy");
  assert.deepEqual(await arm.caps.provide(['heavy']), { ok: false, installed: [], failed: { name: 'heavy', reason: "forbidden by this host's policy" } });
  policy(arm, { install_on_demand: false });
  assert.deepEqual((await arm.caps.offer()).available, [], 'a host may install nothing on demand');
});

test('the claim filter: a job goes only where it can run, and an unplaceable one is shown', async t => {
  const { tool, host } = world(t);
  tool('hammer', '1.0');
  tool('amdtool', '1.0', { arches: ['amd64'] });
  const [amd, arm] = [host('amd', 'amd64'), host('arm', 'arm64')];
  await amd.board.post({ id: 'needs-amd', role: 'builder', title: 't', requires: ['amdtool'] });
  await amd.board.post({ id: 'needs-ghost', role: 'builder', title: 't', requires: ['ghost'] });
  await amd.board.post({ id: 'pinned-arm', role: 'builder', title: 't', requires: ['amdtool', 'host=arm'] });
  assert.equal(await arm.board.nextNeeds(), null, 'the arm host can take none of these');
  assert.equal(await arm.board.claim({ worker: 'w' }), null);
  assert.deepEqual(await amd.board.nextNeeds(), { id: 'needs-amd', missing: ['amdtool'] }, 'the amd host could, after installing');
  assert.equal(await amd.board.claim({ worker: 'w' }), null, 'but a claim never takes a job the host cannot run yet');
  await amd.info.publish();
  await arm.info.publish();
  assert.deepEqual(await amd.board.unplaceable(await amd.info.fleet()), [
    { id: 'needs-ghost', requires: ['ghost'], reason: 'no live host can provide ghost' },
    { id: 'pinned-arm', requires: ['amdtool', 'host=arm'], reason: 'arm cannot provide what it requires, or is not live' },
  ]);
  assert.deepEqual(await amd.board.unplaceable([]), [
    { id: 'needs-amd', requires: ['amdtool'], reason: 'no live host can provide amdtool' },
    { id: 'needs-ghost', requires: ['ghost'], reason: 'no live host can provide ghost' },
    { id: 'pinned-arm', requires: ['amdtool', 'host=arm'], reason: 'no live host can provide amdtool' },
  ], 'with no host described, everything that requires something is unplaceable');
});

test('fit is a filter with one tie-break: runnable now before needing an install', () => {
  const board = { jobs: {} };
  const post = (id, extra) => B.post(board, { id, role: 'builder', title: 't', ...extra }, '2026-11-17T00:00:0' + Object.keys(board.jobs).length + 'Z');
  post('install-first', { requires: ['lathe'] });
  post('ready', {});
  post('urgent-install', { requires: ['lathe'], priority: 1 });
  const has = () => false;
  const view = { host: 'h', has, can: () => true };
  assert.deepEqual(B.order(board, {}, j => B.needs(j).length > 0), ['urgent-install', 'ready', 'install-first'], 'priority still comes first; the tie-break only separates equals, ahead of age');
  assert.deepEqual(B.nextNeeds(board, view), { id: 'urgent-install', missing: ['lathe'] });
  assert.deepEqual(B.nextNeeds(board, { ...view, can: () => false }), { id: 'ready', missing: [] }, 'what cannot be installed here is skipped');
  assert.equal(B.claim(board, { host: 'h', worker: 'w', has }, '2026-11-17T00:00:09Z'), 'ready');
});

test('install before the claim; a failed install costs the job nothing', async t => {
  const { g, tool, host } = world(t);
  tool('hammer', '1.0');
  tool('broken', '1.0', { sha: '0'.repeat(64) });
  const amd = host('amd', 'amd64');
  const ran = [];
  const slots = { free: async () => 'slot01', prepare: async () => { throw new Error('stop here'); }, info: async () => null, clear: async () => {}, occupied: async () => [] };
  const mkDispatcher = () => makeDispatcher({ board: amd.board, slots, capabilities: amd.caps, hostinfo: amd.info, files: makeFiles, clock: g.clock, config: { plots: ['alder'] }, worker: { argv: ['true'], logFile: () => '/dev/null' }, log: l => ran.push(l) });
  const job = id => { const f = g.ls('board').find(x => x.endsWith(`/${id}.yay`)); return f ? { file: f, ...parse(g.show('board', f)) } : null; };

  await amd.board.post({ id: 'needs-broken', role: 'builder', title: 't', requires: ['broken'], priority: 1 });
  const tip = g.remoteGit('rev-parse', 'board');
  assert.equal(await mkDispatcher().once(), null, 'nothing is run');
  assert.equal(g.remoteGit('rev-parse', 'board'), tip, 'and the board was never written: no claim to release');
  assert.deepEqual([job('needs-broken').file, job('needs-broken').attempts, job('needs-broken').generation], ['open/needs-broken.yay', 0, undefined], 'no attempt and no lease counted against the job');
  assert.match(ran.join('\n'), /could not install broken for needs-broken: .*sha256.*the job stays open/);
  assert.match((await amd.caps.availability()).broken, /^its install failed at /, 'the host stops offering it for a while');
  assert.deepEqual(parse(g.show('host/amd', 'host.yay')).capabilities.available, ['hammer'], 'and says so on its branch');
  assert.equal(await amd.board.nextNeeds(), null);
  g.clock.set(new Date(Date.parse(g.clock.now()) + 3700 * 1000).toISOString());
  assert.equal((await amd.caps.availability()).broken, 'available', 'after the retry time it may try again');

  await amd.board.post({ id: 'needs-hammer', role: 'builder', title: 't', requires: ['hammer'], priority: 0 });
  const r = await mkDispatcher().once();
  assert.match(ran.join('\n'), /installed hammer for needs-hammer/);
  assert.equal(r.id, 'needs-hammer', 'installed first, then claimed');
  const claimedAt = Date.parse(parse(g.remoteGit('show', `${g.remoteGit('rev-list', '-n', '1', 'board', '--grep=claim(needs-hammer)')}:claimed/amd/needs-hammer.yay`)).claim.at);
  assert.ok(claimedAt >= Date.parse((await amd.caps.record()).hammer.installed_at), 'the lease began after the install finished');
  assert.ok((await amd.caps.record()).hammer.used_at, 'and the use is noted');
});

test('verification is per host; different sets are not drift; a shared capability must be the same pin', async t => {
  const { tool, host } = world(t);
  tool('hammer', '1.0');
  tool('plane', '0.3');
  tool('runtime', '1.0');
  const [amd, arm] = [host('amd', 'amd64', { base: ['runtime'] }), host('arm', 'arm64', { base: ['runtime'] })];
  assert.deepEqual((await amd.caps.sync({ verifyOnly: true })).drift, ['runtime: not installed from the manifest the shed pins'], 'the base every host needs is part of each host\'s own set');
  await amd.caps.sync();
  await arm.caps.sync();
  await amd.caps.install('hammer');
  await arm.caps.install('plane');
  const [va, vb] = [await amd.caps.sync({ verifyOnly: true }), await arm.caps.sync({ verifyOnly: true })];
  assert.deepEqual([va.ok, vb.ok, Object.keys(va.pins), Object.keys(vb.pins)], [true, true, ['hammer', 'runtime'], ['plane', 'runtime']], 'each host is checked against its own set');
  const q = Q.call({ phase: 'idle' }, { id: 'q1', by: 'amd', hosts: ['amd', 'arm'], shed: 's' }, 't');
  Object.assign(q, { phase: 'verify', acks: { amd: { verify: { ok: true, capabilities: va.pins } }, arm: { verify: { ok: true, capabilities: vb.pins } } } });
  assert.deepEqual(Q.advance(structuredClone(q), {}, 't'), { moved: true }, 'hosts holding different capabilities is normal');
  q.acks.arm.verify.capabilities = { ...vb.pins, runtime: '0.9@deadbeef' };
  assert.match(Q.advance(q, {}, 't').reason, /capability drift: runtime/, 'the same capability at two pins is the one cross-host fault');
});

test('rejuvenation keeps what a host uses and drops what it has not, by its own policy', async t => {
  const { g, tool, host, policy } = world(t);
  tool('runtime', '1.0');
  tool('hammer', '1.0');
  tool('plane', '0.3');
  tool('bench', '2.0', { requires: ['plane'] });
  tool('kept', '1.0');
  const amd = host('amd', 'amd64', { base: ['runtime'] });
  for (const n of ['runtime', 'hammer', 'bench', 'kept']) await amd.caps.install(n);
  fs.writeFileSync(path.join(amd.h.stateDir, 'capabilities/wanted.yay'), stringify({ wanted: ['kept'] }));
  g.clock.set(new Date(Date.parse(g.clock.now()) + 20 * 86400 * 1000).toISOString());
  await amd.caps.used(['bench']);
  assert.deepEqual(await amd.caps.prune(), [], 'nothing is a month old yet');
  g.clock.set(new Date(Date.parse(g.clock.now()) + 15 * 86400 * 1000).toISOString());
  assert.deepEqual(await amd.caps.prune(), ['hammer'], 'unused for 35 days: dropped');
  assert.deepEqual(Object.keys(await amd.caps.record()).sort(), ['bench', 'kept', 'plane', 'runtime'], 'the base, the standing set, what was used, and what that requires all stay');
  assert.equal(fs.existsSync(path.join(g.root, 'cap-amd/hammer')), false);
  assert.equal((await amd.caps.availability()).hammer, 'available', 'and it can come back when a job needs it');
  policy(amd, { unused_days: 1 });
  assert.deepEqual(await amd.caps.prune(), ['bench', 'plane'], 'a host may choose to forget sooner');
});

test('a client order pins capabilities; the owner and the maintainers can forbid some', () => {
  const consent = { watch: true, host: 'oros', limits: { max_slots: 2, forbid_capabilities: ['ollama'] }, allow: { capabilities: true, orders: [] } };
  const plan = desired => reconcile({ desired: { host: 'oros', serial: 2, ...desired }, consent, current: { last_serial: 1 }, host: 'oros', now: '2026-11-17T00:00:00Z' });
  const p1 = plan({ capabilities: ['node', 'ollama', 'rust'] });
  assert.deepEqual(p1.actions, [{ do: 'set-capabilities', capabilities: ['node', 'rust'] }]);
  assert.deepEqual(p1.refused, ['the owner forbids the capability ollama on this host']);
  assert.deepEqual(plan({ forbid_capabilities: ['browser'] }).actions, [{ do: 'forbid-capabilities', capabilities: ['browser', 'ollama'] }], 'the owner\'s list is always part of it');
});
