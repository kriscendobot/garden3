// What a job may read beside its own plot: the other plots' genomes and the
// prior garden's roles and skills at a pinned commit, and the library, under
// reference/. And what it may carry out: a skill it adopted, as a new genome
// file, but never a file a symbolic link points at. Driven with a stand-in
// warden, so it runs on a host whose real warden is bound to its own slots
// directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { makeSlots, REFERENCE } from '../src/slots.js';
import { makePlots } from '../src/plots.js';
import { parse } from '../src/yay.js';
import { git, SHED } from './helpers.js';

const WARDEN = path.join(SHED, 'test/fixtures/warden-sim.js');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const gitRun = (cmd, args, opts = {}) => run(cmd, cmd === 'git' ? ['-c', 'protocol.file.allow=always', ...args] : args, { ...opts, env: { ...GIT_ENV, ...(opts.env ?? {}) } });

const setup = t => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-reference-'));
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const write = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  const root = path.join(T, 'root');
  fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'shed');
  write(root, 'roles/COMMON.md', 'common\n');
  write(root, 'plots/genome-paths', 'roles/builder/\nskills/adopted/\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  for (const [name, text] of [['alder', 'alder builder\n'], ['birch', 'birch builder\n']]) {
    const dir = path.join(T, name);
    fs.mkdirSync(dir);
    git(dir, 'init', '--quiet', '-b', `plot/${name}`);
    write(dir, 'roles/builder/AGENT.md', text);
    write(dir, 'plot.yay', 'tier: "standard"\n');
    if (name === 'birch') write(dir, 'skills/adopted/bisect/SKILL.md', 'birch learned to bisect\n');
    git(dir, 'add', '-A'); git(dir, 'commit', '--quiet', '-m', 'genome');
    git(root, 'fetch', '--quiet', dir, `plot/${name}:plot/${name}`);
  }
  // The library branch, apart from the shed.
  const lib = path.join(T, 'library');
  fs.mkdirSync(lib);
  git(lib, 'init', '--quiet', '-b', 'library');
  write(lib, 'keywords.md', '- `harden` -> hardened-javascript\n');
  git(lib, 'add', '-A'); git(lib, 'commit', '--quiet', '-m', 'library');
  git(root, 'fetch', '--quiet', lib, 'library:library');
  // The prior garden, served by commit id.
  const prior = path.join(T, 'prior');
  fs.mkdirSync(prior);
  git(prior, 'init', '--quiet', '-b', 'main2');
  git(prior, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  write(prior, 'roles/shepherd/AGENT.md', 'the prior shepherd\n');
  write(prior, 'skills/ci-triage/SKILL.md', 'the prior triage\n');
  write(prior, 'scripts/jobs/big.sh', 'not for a job to read\n');
  git(prior, 'add', '-A'); git(prior, 'commit', '--quiet', '-m', 'prior');
  const pinned = git(prior, 'rev-parse', 'HEAD');
  write(prior, 'roles/shepherd/AGENT.md', 'a later shepherd, not pinned\n');
  git(prior, 'commit', '--quiet', '-am', 'later');
  const stateDir = path.join(T, 'state');
  const p = makeNodePowers();
  const plots = commit => makePlots({ files: makeFiles, run: gitRun, rootRepo: root, shards: null, stateDir, upstream: { garden: { url: prior, ref: 'main2', commit } }, clock: p.clock });
  fs.mkdirSync(path.join(T, 'slots'));
  const slots = makeSlots({ files: makeFiles, run: gitRun, warden: WARDEN, rootRepo: root, slotsRoot: path.join(T, 'slots'), repositories: path.join(T, 'repositories'), stateDir, upstream: path.join(stateDir, 'upstream/garden.git'), clock: p.clock, count: 2, mode: 'sim' });
  return { T, root, prior, pinned, plots, slots };
};
const job = { id: 'adopt-it', role: 'builder', title: 'Adopt', body: 'Do it.\n', claim: { generation: 1 } };

test('the prior garden is held at its pinned commit, fetched once', async t => {
  const { pinned, plots, T } = setup(t);
  assert.deepEqual(await plots(pinned).fetchUpstream(), { commit: pinned, fetched: true });
  assert.deepEqual(await plots(pinned).fetchUpstream(), { commit: pinned, fetched: false }, 'already held');
  assert.equal(git(path.join(T, 'state/upstream/garden.git'), 'show', 'refs/upstream/garden:roles/shepherd/AGENT.md'), 'the prior shepherd', 'the pin, not the branch tip');
  await assert.rejects(plots('abc').fetchUpstream(), { code: 'invalid' });
  await assert.rejects(makePlots({ files: makeFiles, run: gitRun, rootRepo: T, stateDir: path.join(T, 'state'), clock: null }).fetchUpstream(), { code: 'unset' });
});

test('a home holds the other plots, the prior garden\'s roles and skills, and the library, to read', async t => {
  const { root, pinned, plots, slots } = setup(t);
  await plots(pinned).fetchUpstream();
  const home = await slots.prepare('slot01', job, 'alder');
  const read = f => fs.readFileSync(path.join(home, f), 'utf8');
  assert.equal(read('roles/builder/AGENT.md'), 'alder builder\n', 'its own plot is laid over the shed');
  assert.equal(read(`${REFERENCE}/plots/birch/skills/adopted/bisect/SKILL.md`), 'birch learned to bisect\n', 'the other plot, to read');
  assert.equal(fs.existsSync(path.join(home, `${REFERENCE}/plots/alder`)), false, 'not its own again');
  assert.equal(read(`${REFERENCE}/upstream/garden/roles/shepherd/AGENT.md`), 'the prior shepherd\n');
  assert.equal(read(`${REFERENCE}/upstream/garden/skills/ci-triage/SKILL.md`), 'the prior triage\n');
  assert.equal(fs.existsSync(path.join(home, `${REFERENCE}/upstream/garden/scripts`)), false, 'roles and skills only');
  assert.equal(read(`${REFERENCE}/library/keywords.md`), '- `harden` -> hardened-javascript\n');
  const ref = parse(read(`${REFERENCE}/reference.yay`));
  assert.deepEqual([ref.plots.map(x => x.plot), ref.upstream.commit, ref.library.commit], [['birch'], pinned, git(root, 'rev-parse', 'library')]);
});

test('without the prior garden held or a library, a home still holds the other plots', async t => {
  const { root, slots } = setup(t);
  git(root, 'branch', '--quiet', '-D', 'library');
  const home = await slots.prepare('slot01', job, 'birch');
  assert.ok(fs.existsSync(path.join(home, `${REFERENCE}/plots/alder/roles/builder/AGENT.md`)));
  const ref = parse(fs.readFileSync(path.join(home, `${REFERENCE}/reference.yay`), 'utf8'));
  assert.deepEqual([ref.upstream, ref.library], [null, null]);
  assert.equal(fs.existsSync(path.join(home, `${REFERENCE}/library`)), false);
});

test('harvest carries out an adopted skill, but not reference/ and never through a link', async t => {
  const { T, pinned, plots, slots } = setup(t);
  await plots(pinned).fetchUpstream();
  const home = await slots.prepare('slot01', job, 'alder');
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true }); fs.writeFileSync(path.join(home, file), text); };
  write('skills/adopted/ci-triage/SKILL.md', '---\nsource: "garden"\n---\n\nadapted\n');
  write(`${REFERENCE}/plots/birch/roles/builder/AGENT.md`, 'scribbled on a neighbor\n');
  const secret = path.join(T, 'secret');
  fs.writeFileSync(secret, 'SECRET-TOKEN-4471\n');
  fs.rmSync(path.join(home, 'roles/builder/AGENT.md'));
  fs.symlinkSync(secret, path.join(home, 'roles/builder/AGENT.md'));
  fs.symlinkSync(secret, path.join(home, 'skills/adopted/ci-triage/notes.md'));
  fs.mkdirSync(path.join(home, 'skills/adopted/linked-dir-target'));
  fs.symlinkSync(path.dirname(secret), path.join(home, 'skills/adopted/elsewhere'));
  const h = await slots.harvest('slot01');
  assert.deepEqual([...h.genome_changed].sort(), ['roles/builder/AGENT.md', 'skills/adopted/ci-triage/SKILL.md'], 'a linked file is changed, and so not kept; a new adopted file is carried');
  const carried = path.join(T, 'state/harvest/adopt-it/genome');
  assert.equal(fs.readFileSync(path.join(carried, 'skills/adopted/ci-triage/SKILL.md'), 'utf8'), '---\nsource: "garden"\n---\n\nadapted\n');
  assert.equal(fs.existsSync(path.join(carried, 'roles/builder/AGENT.md')), false, 'a link is never followed');
  assert.equal(fs.existsSync(path.join(carried, REFERENCE)), false, 'reference/ is not genome');
  const all = fs.readdirSync(carried, { recursive: true }).filter(f => fs.statSync(path.join(carried, f)).isFile()).map(f => fs.readFileSync(path.join(carried, f), 'utf8')).join('');
  assert.ok(!all.includes('SECRET-TOKEN'), 'nothing a link points at was carried out');
});
