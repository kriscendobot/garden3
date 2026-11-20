// Capabilities: pinned install from a local archive, verification, the
// installed record and digest, drift detection, re-pinning, and removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { makeCapabilities, manifestProblem } from '../src/capabilities.js';
import { parse, stringify } from '../src/yay.js';
import { SHED, tempDir } from './helpers.js';

const setup = t => {
  const T = tempDir('garden-cap-');
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const p = makeNodePowers();
  const arch = p.arch();
  const mkTool = (name, version) => {
    const d = path.join(T, 'build', `${name}-${version}`, 'pkg', 'bin');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, name), `#!/bin/sh\necho "${name} ${version}"\n`, { mode: 0o755 });
    const tar = path.join(T, 'build', `${name}-${version}.tar`);
    execFileSync('tar', ['-C', path.join(T, 'build', `${name}-${version}`), '-cf', tar, 'pkg']);
    return { tar, sha: p.sha256File(tar) };
  };
  const mkManifest = (name, version, sha, extra = {}) => {
    const dir = path.join(T, 'manifests', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'capability.yay'), stringify({
      name, version, summary: 'test tool', requires: [], bin: [`bin/${name}`],
      sources: { [arch]: [{ url: `file://${T}/build/${name}-${version}.tar`, sha256: sha, strip: 1 }] },
      verify: [{ run: [name], expect: `^${name} ${version.replace('.', '\\.')}\\n$` }], ...extra,
    }));
  };
  const caps = makeCapabilities({ files: makeFiles, run, sha256File: p.sha256File, sha256: p.sha256, clock: p.clock, arch, root: path.join(T, 'cap'), manifestsDir: path.join(T, 'manifests'), stateDir: path.join(T, 'state'), env: process.env });
  const runTool = name => execFileSync(path.join(T, 'cap', 'bin', name), { encoding: 'utf8' }).trim();
  return { T, caps, mkTool, mkManifest, runTool, tool: (n, v, extra) => mkManifest(n, v, mkTool(n, v).sha, extra) };
};

test('install is pinned, verified, recorded and idempotent', async t => {
  const { T, caps, tool, mkTool, mkManifest, runTool } = setup(t);
  tool('hammer', '1.0');
  assert.deepEqual(await caps.install('hammer'), { name: 'hammer', version: '1.0', changed: true });
  assert.equal(runTool('hammer'), 'hammer 1.0');
  const rec = await caps.record();
  assert.deepEqual([rec.hammer.version, rec.hammer.verified], ['1.0', true]);
  assert.equal((await caps.install('hammer')).changed, false, 'installing again is a no-op');

  mkTool('saw', '1.0');
  mkManifest('saw', '1.0', '0'.repeat(64));
  await assert.rejects(caps.install('saw'), { code: 'checksum' }, 'a wrong sha256 aborts the install');
  assert.equal(fs.existsSync(path.join(T, 'cap', 'saw', '1.0')), false, 'and unpacks nothing');
  assert.equal(fs.existsSync(path.join(T, 'cap', 'bin', 'saw')), false, 'and links nothing');
  mkManifest('saw', '1.0', null);
  await assert.rejects(caps.install('saw'), { code: 'not-installable' }, 'an unpinned source cannot be installed');
  await assert.rejects(caps.install('nosuch'), { code: 'not-installable' });
  await assert.rejects(caps.install('../x'), { code: 'invalid' });

  tool('plane', '0.3');
  tool('bench', '2.0', { requires: ['hammer', 'plane'] });
  await caps.install('bench');
  assert.equal((await caps.record()).plane.version, '0.3', 'installing brings what it requires');
  assert.deepEqual([...(await caps.verifiedSet())].sort(), ['bench', 'hammer', 'plane']);
});

test('drift is detected by verify-only and repaired by sync', async t => {
  const { T, caps, tool, runTool } = setup(t);
  tool('hammer', '1.0');
  tool('plane', '0.3');
  await caps.install('hammer');
  await caps.install('plane');
  const healthy = await caps.sync({ verifyOnly: true });
  assert.deepEqual([healthy.ok, healthy.drift], [true, []]);
  assert.match(healthy.pins.hammer, /^1\.0@[0-9a-f]{16}$/);

  fs.writeFileSync(path.join(T, 'cap', 'plane', '0.3', 'bin', 'plane'), '#!/bin/sh\necho tampered\n');
  const drifted = await caps.sync({ verifyOnly: true });
  assert.deepEqual(drifted.drift, ['plane: does not verify']);
  assert.notEqual(drifted.digest, healthy.digest, 'the digest no longer matches a healthy host');
  assert.equal((await caps.verifiedSet()).has('plane'), false, 'an unverified capability satisfies no job');
  const repaired = await caps.sync();
  assert.deepEqual([repaired.ok, repaired.digest, runTool('plane')], [true, healthy.digest, 'plane 0.3']);

  tool('hammer', '1.1'); // the shed moves a pin
  assert.deepEqual((await caps.sync({ verifyOnly: true })).drift, ['hammer: not installed from the manifest the shed pins']);
  await caps.sync();
  assert.equal(runTool('hammer'), 'hammer 1.1');
  assert.equal(fs.existsSync(path.join(T, 'cap', 'hammer', '1.0')), false, 'the old version is gone');

  fs.rmSync(path.join(T, 'manifests', 'plane'), { recursive: true }); // a capability leaves the shed
  assert.deepEqual((await caps.sync({ verifyOnly: true })).drift, ['plane: installed, but no longer on the shed']);
  await caps.sync();
  assert.equal((await caps.record()).plane, undefined);
  assert.equal(fs.existsSync(path.join(T, 'cap', 'plane')), false);
});

test('demand from the board, and the standing set', async t => {
  const { T, caps, tool, mkManifest } = setup(t);
  tool('hammer', '1.0');
  await caps.install('hammer');
  mkManifest('saw', '1.0', null);
  const board = { jobs: { j: { where: 'open', job: { requires: ['hammer', 'saw', 'lathe', 'host=x'] } }, k: { where: 'held', job: { requires: ['ignored'] } } } };
  assert.deepEqual(await caps.demand(board), [{ name: 'lathe', state: 'unknown' }, { name: 'saw', state: 'unpinned' }]);
  tool('lathe', '1.0');
  assert.deepEqual((await caps.demand(board))[0], { name: 'lathe', state: 'installable' });
  fs.mkdirSync(path.join(T, 'state', 'capabilities'), { recursive: true });
  fs.writeFileSync(path.join(T, 'state', 'capabilities', 'wanted.yay'), stringify({ wanted: ['lathe'] }));
  assert.equal((await caps.sync()).ok, true);
  assert.deepEqual(await caps.demand(board), [{ name: 'saw', state: 'unpinned' }]);
});

test("the shed's own manifests are well formed", () => {
  const dir = path.join(SHED, 'capabilities');
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name, 'capability.yay');
    if (!fs.existsSync(f)) continue;
    const m = parse(fs.readFileSync(f, 'utf8'), f);
    assert.equal(m.name, name);
    assert.ok(m.version && m.summary && m.verify.length > 0, name);
    for (const step of m.verify) assert.ok(Array.isArray(step.run) && (!step.expect || new RegExp(step.expect)), name);
    const problem = manifestProblem(m, name, 'amd64');
    // Unpinned manifests must say so in the README's table rather than pass silently.
    if (problem) assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), new RegExp(`\`${name}\` \\| (no|draft)`), `${name}: ${problem}`);
  }
});
