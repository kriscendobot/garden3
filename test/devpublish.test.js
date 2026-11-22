// Dev releases: the versions and tags the registry takes, what is left out,
// and a publish that goes all the way or moves nothing shared.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { devRelease, stampWorkspaces, tarball, makeDevPublisher } from '../src/devpublish.js';
import { makeFiles, run } from '../src/powers/node.js';
import { git, tempDir } from './helpers.js';

const SHA = '0368767778a232c38721ff8a1e88d8f68272624d';

test('a dev release is named by its commit time and sha, and tagged with its date', () => {
  assert.deepEqual({ ...devRelease(SHA, '2026-11-17T03:58:38Z') }, { commit: SHA, id: 'dev.20261117035838.g0368767', tag: 'dev-2026-11-17' });
  assert.equal(devRelease(SHA, '2026-11-16T22:58:38-05:00').tag, 'dev-2026-11-17', 'in UTC');
  assert.throws(() => devRelease('llm', '2026-11-17T00:00:00Z'), /not a commit id/);
  assert.equal(tarball('@endo/patterns', '2.1.0-x'), 'endo-patterns-2.1.0-x.tgz');
  assert.equal(tarball('ses', '2.3.0-x'), 'ses-2.3.0-x.tgz');
});

const ws = (name, extra = {}) => ({ location: `packages/${name.replace(/^@endo\//, '')}`, pkg: { name, version: '1.0.0', ...extra } });
const WORKSPACES = [
  ws('@endo/a', { dependencies: { '@endo/b': 'workspace:^', left: '^1.0.0' }, devDependencies: { '@endo/secret': 'workspace:^' } }),
  ws('@endo/b'),
  ws('@endo/secret', { private: true }),
  ws('@endo/leaky', { dependencies: { '@endo/secret': 'workspace:^' } }),
  ws('@endo/downstream', { peerDependencies: { '@endo/leaky': 'workspace:^' } }),
  ws('@endo/pre', { version: '1.0.0-rc.1' }),
];

test('stamping: workspace dependencies get the stamped versions; a private one excludes its dependents', () => {
  const s = stampWorkspaces(WORKSPACES, 'dev.20261117035838.g0368767');
  assert.deepEqual(s.packages.map(p => p.name), ['@endo/a', '@endo/b']);
  const a = s.manifests.find(m => m.pkg.name === '@endo/a').pkg;
  assert.equal(a.version, '1.0.1-dev.20261117035838.g0368767', 'the next patch, so it sorts above the published 1.0.0');
  assert.deepEqual(a.dependencies, { '@endo/b': '1.0.1-dev.20261117035838.g0368767', left: '^1.0.0' });
  assert.deepEqual(a.devDependencies, {}, 'a dev dependency on a private workspace is dropped');
  assert.deepEqual(s.excluded, [
    { name: '@endo/downstream', reason: 'depends on excluded @endo/leaky' },
    { name: '@endo/leaky', reason: 'depends on private @endo/secret' },
    { name: '@endo/pre', reason: 'version 1.0.0-rc.1 is not plain x.y.z' },
  ]);
  assert.equal(WORKSPACES[0].pkg.version, '1.0.0', 'the input is not changed');
});

/** A monorepo on disk, and a run that does git for real and plays yarn, node and npm. */
const fixture = ({ failPublish } = {}) => {
  const T = tempDir('devpublish-');
  const repo = path.join(T, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  for (const w of WORKSPACES.slice(0, 3)) {
    fs.mkdirSync(path.join(repo, w.location), { recursive: true });
    fs.writeFileSync(path.join(repo, w.location, 'package.json'), JSON.stringify({ ...w.pkg, ...(w.pkg.name === '@endo/b' ? { scripts: { build: 'make' } } : { scripts: { build: 'exit 0' } }) }));
  }
  git(repo, 'init', '-q', '-b', 'llm');
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'tip');
  const registry = new Map(); // name@version -> tags
  const calls = [];
  const fake = (cmd, args, opts = {}) => {
    if (cmd === 'git') return run(cmd, args, opts);
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'node' && args[0] === 'scripts/pack-all.mjs') {
      for (const f of fs.readdirSync(path.join(opts.cwd, 'packages'))) {
        const p = JSON.parse(fs.readFileSync(path.join(opts.cwd, 'packages', f, 'package.json'), 'utf8'));
        if (p.private) continue;
        fs.mkdirSync(path.join(opts.cwd, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(opts.cwd, 'dist', tarball(p.name, p.version)), 'tgz');
      }
    }
    if (cmd === 'npm') {
      const rc = args[args.indexOf('--userconfig') + 1];
      assert.match(fs.readFileSync(rc, 'utf8'), /^\/\/npm\.example\/:_authToken=tok\n$/);
      assert.equal(fs.statSync(rc).mode & 0o777, 0o600);
      if (args[0] === 'whoami') return { status: 0, stdout: 'garden\n', stderr: '' };
      if (args[0] === 'view') return registry.has(args[1]) ? { status: 0, stdout: `${args[1].split('@').pop()}\n`, stderr: '' } : { status: 1, stdout: '', stderr: 'E404' };
      if (args[0] === 'publish') {
        if (failPublish && args[1].includes(failPublish)) return { status: 1, stdout: '', stderr: 'npm error code E400' };
        const nv = path.basename(args[1], '.tgz').replace(/^endo-(\w+)-/, '@endo/$1@');
        registry.set(nv, [args[args.indexOf('--tag') + 1]]);
      }
      if (args[0] === 'dist-tag') registry.get(args[2]).push(args[3]);
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const notes = [];
  const work = path.join(T, 'work');
  const make = (key = async () => 'tok') =>
    makeDevPublisher({
      files: makeFiles, run: fake, env: { PATH: process.env.PATH }, keys: { read: key }, journal: { note: async (who, text) => notes.push(text) },
      clock: { now: () => '2026-11-22T01:02:03.004Z' }, work,
      config: { repository: 'endojs/endo-but-for-bots', url: repo, ref: 'llm', registry: 'https://npm.example/', key: 'npm-minion-town' },
    });
  return { make, registry, calls, notes, work, sha: git(repo, 'rev-parse', 'HEAD') };
};

test('plan stamps, builds what builds, packs, and publishes nothing', async () => {
  const f = fixture();
  const r = await f.make().plan();
  assert.equal(r.commit, f.sha);
  assert.equal(r.tag.slice(0, 4), 'dev-');
  assert.deepEqual(r.names.map(n => n.split('@').slice(0, 2).join('@')), ['@endo/a', '@endo/b']);
  assert.ok(f.calls.some(c => c === 'corepack yarn workspace @endo/b run build'), 'a real build script runs');
  assert.ok(!f.calls.some(c => c.includes('workspace @endo/a run build')), 'a placeholder does not');
  assert.ok(!f.calls.some(c => c.startsWith('npm ')), 'nothing touches the registry');
  assert.deepEqual(fs.readdirSync(path.join(f.work, 'runs')), [], 'the run is cleaned up');
});

test('publish: every package under the date tag, then dev-latest; a rerun skips what is there', async () => {
  const f = fixture();
  const r = await f.make().publish({ by: 'kriskowal' });
  assert.equal(r.published, 2);
  const tags = [...f.registry.values()];
  assert.deepEqual(tags.map(t => t[1]), ['dev-latest', 'dev-latest']);
  const npm = f.calls.filter(c => c.startsWith('npm '));
  assert.ok(npm.findLastIndex(c => c.startsWith('npm publish')) < npm.findIndex(c => c.startsWith('npm dist-tag')), 'dev-latest moves after every publish');
  assert.match(f.notes[0], /2 published, 0 already there, 0 excluded; asked by kriskowal/);
  assert.deepEqual(fs.readdirSync(path.join(f.work, 'runs')), [], 'no .npmrc and no run left behind');
  const again = await f.make().publish();
  assert.equal(again.published, 0);
  assert.equal(again.skipped, 2);
});

test('a failed publish moves no dev-latest, leaves no token, and keeps the run to look at', async () => {
  const f = fixture({ failPublish: 'endo-b-' });
  await assert.rejects(f.make().publish(), /publish-failed|E400/);
  assert.ok(![...f.registry.values()].some(t => t.includes('dev-latest')));
  const [kept] = fs.readdirSync(path.join(f.work, 'runs'));
  assert.ok(kept, 'the run is kept');
  assert.ok(!fs.existsSync(path.join(f.work, 'runs', kept, '.npmrc')), 'the token is gone');
});

test('whoami checks the key against the registry, and leaves no token behind', async () => {
  const f = fixture();
  assert.equal(await f.make().whoami(), 'garden');
  assert.deepEqual(fs.readdirSync(path.join(f.work, 'check')), []);
});

test('no key, no run', async () => {
  const f = fixture();
  await assert.rejects(f.make(async () => { throw Object.assign(new Error('no npm-minion-town key on this host'), { code: 'no-key' }); }).publish(), /no npm-minion-town key/);
  assert.equal(f.calls.length, 0, 'nothing was cloned or built');
});
