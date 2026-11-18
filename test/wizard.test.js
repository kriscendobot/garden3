// The wizard on `main`: it describes without changing anything, checks
// prerequisites, fetches the layout resumably, and takes consent only from a
// person who types the host's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readConsent } from '../src/clients.js';
import { parseYaydown } from '../src/yay.js';
import { mkGarden, git, SHED } from './helpers.js';

const MAIN = path.join(SHED, 'scripts/shards/seed/main');
const wizard = (args, { env = {}, input, cwd } = {}) => spawnSync('sh', [path.join(MAIN, 'wizard'), ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env }, input, cwd, encoding: 'utf8' });

test('main is a README and a wizard, small enough to read', () => {
  assert.deepEqual(fs.readdirSync(MAIN).sort(), ['AGENTS.md', 'CLAUDE.md', 'README.md', 'SETUP.md', 'wizard']);
  for (const f of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'SETUP.md']) parseYaydown(fs.readFileSync(path.join(MAIN, f), 'utf8'), f);
  const lines = fs.readdirSync(MAIN).reduce((n, f) => n + fs.readFileSync(path.join(MAIN, f), 'utf8').split('\n').length, 0);
  assert.ok(lines < 500, `${lines} lines`);
  if (fs.existsSync(path.join(SHED, 'main/wizard'))) {
    for (const f of fs.readdirSync(MAIN)) assert.equal(fs.readFileSync(path.join(SHED, 'main', f), 'utf8'), fs.readFileSync(path.join(MAIN, f), 'utf8'), `the main worktree's ${f} matches its seed on the shed`);
  }
});

test('describe and check change nothing; check finds what is missing', t => {
  const dir = fs.mkdtempSync(path.join(SHED, 'test/.tmp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const d = wizard([], { cwd: dir });
  assert.equal(d.status, 0);
  assert.match(d.stdout, /Nothing is changed by reading this/);
  for (const step of ['check', 'fetch', 'consent', 'keys', 'image', 'start', 'login', 'move in', 'joined']) assert.match(d.stdout, new RegExp(`\\d+\\. ${step}`), step);
  assert.deepEqual(fs.readdirSync(dir), []);
  // A host with a shell and little else: tools are named, with the reason.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const tool of ['sh', 'id', 'sed', 'cut', 'grep', 'hostname']) fs.symlinkSync(spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim(), path.join(bin, tool));
  const bare = wizard(['check'], { env: { PATH: bin } });
  assert.equal(bare.status, 1);
  assert.match(bare.stdout, /MISSING {2}git: the garden is a git repository/);
  assert.match(bare.stdout, /OPERATOR no container runtime found/);
  assert.match(bare.stdout, /check found something to fix/);
  // A runtime that is installed but out of this shell's reach is the operator's.
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.match(wizard(['check'], { env: { PATH: bin } }).stdout, /OPERATOR docker is installed but this shell cannot reach it: the operator runs steps 6 and 7/);
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.match(wizard(['check'], { env: { PATH: bin } }).stdout, /ok {7}docker is reachable/);
  assert.deepEqual(fs.readdirSync(dir), ['bin'], 'check wrote nothing');
  assert.equal(wizard(['nonsense']).status, 1);
});

test('fetch: a bare repository and worktrees, shallow where it churns, resumable', t => {
  const g = mkGarden(t);
  // Give the throwaway remote the rest of the layout.
  const seedDir = path.join(g.root, 'more');
  for (const b of ['main', 'shed', 'library', 'clients', 'gate', 'plot/alder']) {
    const d = path.join(seedDir, b.replace('/', '-'));
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'README.md'), `${b}\n`);
    git(d, 'init', '--quiet', '-b', b); git(d, 'add', '-A'); git(d, 'commit', '--quiet', '-m', b);
    git(d, 'push', '--quiet', g.remote, `${b}:refs/heads/${b}`);
  }
  const board = g.host('h').shards.shard('t', 'board');
  for (const i of [1, 2, 3]) { board.sync(); board.tree.write(`open/j${i}.yay`, `id: "j${i}"\n`); board.push(`j${i}`); }
  const home = path.join(g.root, 'home');
  const url = `file://${g.remote}`;

  const dry = wizard(['fetch', url, home], { env: { WIZARD_DRY_RUN: '1' } });
  assert.match(dry.stdout, /fetch will: make .*home; clone .* once as .*garden\.git \(bare\)/);
  assert.match(dry.stdout, /dry run: nothing was done/);
  assert.equal(fs.existsSync(home), false, 'a dry run makes nothing');

  const run = wizard(['fetch', url, home]);
  assert.equal(run.status, 0, run.stderr);
  const bare = path.join(home, 'garden.git');
  assert.equal(git(bare, 'rev-parse', '--is-bare-repository'), 'true');
  assert.equal(git(path.join(home, 'garden'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'shed', 'the garden directory is the shed');
  for (const b of ['board', 'archive', 'journal', 'library', 'clients', 'gate']) assert.equal(git(path.join(home, 'garden', b), 'rev-parse', '--abbrev-ref', 'HEAD'), b);
  assert.equal(git(bare, 'rev-list', '--count', 'refs/heads/board'), '1', 'the board is fetched at depth 1');
  assert.equal(git(bare, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.ok(git(bare, 'rev-parse', '--verify', 'refs/heads/plot/alder'), 'plots come too');
  assert.equal(fs.readFileSync(path.join(home, 'garden/board/open/j3.yay'), 'utf8'), 'id: "j3"\n');
  assert.match(wizard(['status', home]).stdout, /done {5}fetched\ndone {5}worktrees\npending {2}consented\nthis is not a client host/);

  fs.rmSync(path.join(home, 'garden/journal'), { recursive: true });
  git(bare, 'worktree', 'prune');
  assert.equal(wizard(['fetch', url, home]).status, 0, 'run again after an interruption');
  assert.ok(fs.existsSync(path.join(home, 'garden/journal/README.md')), 'it completes what was missing');
  assert.notEqual(wizard(['fetch', 'file:///elsewhere.git', home]).status, 0, 'and refuses to repoint an existing clone');

  // Consent: only by typing the host's name.
  const env = { GARDEN_HOST: 'oros-studio' };
  const file = path.join(home, 'garden/CLIENT-CONSENT.yay');
  for (const input of ['', 'yes\n', 'y\n', 'OROS-STUDIO\n']) {
    const no = wizard(['consent', home], { env, input });
    assert.equal(no.status, 1, JSON.stringify(input));
    assert.equal(fs.existsSync(file), false, 'nothing is written without the exact name');
  }
  const yes = wizard(['consent', home], { env, input: 'oros-studio\n' });
  assert.equal(yes.status, 0);
  assert.match(yes.stdout, /CONSENT TO REMOTE CONTROL OF THE GARDEN ON THIS MACHINE/);
  assert.match(yes.stdout, /whoever can push to the 'clients' branch/);
  const consent = readConsent(fs.readFileSync(file, 'utf8'), 'oros-studio');
  assert.deepEqual([consent.watching, consent.consent.limits.max_slots], [true, 2], 'the file is one the garden accepts');
  assert.match(wizard(['consent', home], { env, input: 'oros-studio\n' }).stdout, /already consented/);
  assert.match(wizard(['status', home]).stdout, /done {5}consented\nthis is a client host/);
  assert.equal(git(path.join(home, 'garden'), 'status', '--porcelain', '--', 'CLIENT-CONSENT.yay').startsWith('??'), true);
});

test('the wizard names what is not pinned for this host\'s architecture, as the garden itself reads it', async () => {
  const { manifestProblem } = await import('../src/capabilities.js');
  const { parse } = await import('../src/yay.js');
  const home = fs.mkdtempSync(path.join(SHED, 'test/.tmp-'));
  try {
    fs.mkdirSync(path.join(home, 'garden'));
    fs.cpSync(path.join(SHED, 'capabilities'), path.join(home, 'garden/capabilities'), { recursive: true });
    const names = fs.readdirSync(path.join(SHED, 'capabilities')).filter(n => fs.existsSync(path.join(SHED, 'capabilities', n, 'capability.yay')));
    for (const arch of ['amd64', 'arm64', 'riscv64']) {
      const r = wizard(['pins', home], { env: { WIZARD_ARCH: arch } });
      assert.match(r.stdout, new RegExp(`^this host is ${arch} `));
      for (const n of names) {
        const problem = manifestProblem(parse(fs.readFileSync(path.join(SHED, 'capabilities', n, 'capability.yay'), 'utf8')), n, arch);
        const named = new RegExp(`^(CANNOT BOOT|unavailable) +${n}: `, 'm').test(r.stdout);
        assert.equal(named, problem !== null, `${n} on ${arch}: the wizard and the garden agree (${problem ?? 'pinned'})`);
      }
      const base = parse(fs.readFileSync(path.join(SHED, 'config/garden.yay'), 'utf8')).capabilities.base;
      const blocking = base.filter(n => manifestProblem(parse(fs.readFileSync(path.join(SHED, 'capabilities', n, 'capability.yay'), 'utf8')), n, arch));
      assert.equal(r.status, blocking.length ? 1 : 0);
      for (const n of blocking) assert.match(r.stdout, new RegExp(`CANNOT BOOT +${n}: `), `${n} is needed by every host`);
    }
    assert.match(wizard(['pins', home], { env: { WIZARD_ARCH: 'riscv64' } }).stdout, /CANNOT BOOT {2}node: no artefact for riscv64/, 'an architecture nobody planned for is told so plainly');
    assert.match(wizard(['check']).stdout, /this {5}machine is (amd64|arm64|\S+); no architecture is assumed/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
