// The thin shell layer: it parses, it agrees with the manifests it shadows,
// and it carries no key into the box.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from '../src/yay.js';
import { SHED, git } from './helpers.js';

const read = f => fs.readFileSync(path.join(SHED, f), 'utf8');

test('bootstrap/node.pin agrees with the node capability', () => {
  const m = parse(read('capabilities/node/capability.yay'));
  const pins = read('bootstrap/node.pin').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(' '));
  assert.deepEqual(pins.map(p => p[0]).sort(), Object.keys(m.sources).sort());
  for (const [arch, version, sha, url] of pins) {
    assert.equal(version, m.version);
    assert.equal(url, m.sources[arch][0].url);
    assert.equal(sha, m.sources[arch][0].sha256 ?? 'unpinned');
  }
});

test('the shell that remains parses, and passes no key into the box', () => {
  for (const f of ['entrypoint.sh', 'garden', 'scripts/shards/seed/main/wizard', 'scripts/shards/bootstrap.sh', 'scripts/lint.sh']) {
    assert.equal(spawnSync(f.endsWith('bootstrap.sh') || f.endsWith('lint.sh') ? 'bash' : 'sh', ['-n', path.join(SHED, f)]).status, 0, f);
  }
  const launcher = read('garden');
  const passed = [...launcher.matchAll(/-e ([A-Z_]+)=/g)].map(m => m[1]);
  assert.match(launcher, /-v "\$HERE:\$HERE"/, 'the checkout is mounted at its own path');
  assert.deepEqual(passed, ['GARDEN_ROOT', 'GARDEN_HOST', 'GARDEN_SLOT_COUNT', 'TERM'], 'the box is created, and entered, with no key in its environment');
  assert.ok(!/garden login|gh auth/.test(launcher), 'the launcher does not drive the login: the operator does it by hand in ./garden sh');
  assert.ok(!/API_KEY|TOKEN/.test(launcher.replace(/#.*$/gm, '')));
  assert.match(read('Dockerfile'), /^FROM debian:/m);
  assert.ok(!/^(COPY|ADD) /m.test(read('Dockerfile')), 'the image copies nothing of the garden in');
  assert.deepEqual(read('.dockerignore').split('\n').filter(l => l && !l.startsWith('#')), ['*']);
});

test('bootstrap.sh creates the shards and their worktrees, idempotently, and pushes nothing', t => {
  const dir = fs.mkdtempSync(path.join(SHED, 'test/.tmp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'root');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.cpSync(path.join(SHED, 'scripts/shards'), path.join(root, 'scripts/shards'), { recursive: true });
  git(root, 'init', '--quiet', '-b', 'shed');
  fs.writeFileSync(path.join(root, '.gitignore'), '/main/\n/board/\n/archive/\n/journal/\n/library/\n/clients/\n/gate/\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  const env = { ...process.env, GARDEN_ROOT: root, GARDEN_COMMIT_TRAILER: 'Trailer: yes', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
  const run = (...args) => spawnSync('bash', [path.join(root, 'scripts/shards/bootstrap.sh'), ...args], { env, encoding: 'utf8' });
  const first = run('--host', 'host-a');
  assert.equal(first.status, 0, first.stderr);
  const branches = git(root, 'branch', '--format=%(refname:short)').split('\n').sort();
  assert.deepEqual(branches, ['archive', 'board', 'clients', 'gate', 'host/host-a', 'journal', 'library', 'main', 'shed']);
  for (const b of ['main', 'board', 'archive', 'journal', 'library', 'clients', 'gate']) {
    assert.equal(git(root, 'rev-list', '--count', `refs/heads/${b}`), '1', `${b} is an orphan root`);
    assert.equal(git(path.join(root, b), 'rev-parse', '--abbrev-ref', 'HEAD'), b, `${b}/ is its worktree`);
    assert.match(git(root, 'log', '-1', '--format=%B', `refs/heads/${b}`), /initialized\n\nTrailer: yes/);
  }
  assert.equal(parse(fs.readFileSync(path.join(root, 'board/quiescence.yay'), 'utf8')).phase, 'idle');
  const before = git(root, 'rev-parse', 'refs/heads/board');
  assert.equal(run().status, 0, 'a second run');
  assert.equal(git(root, 'rev-parse', 'refs/heads/board'), before, 'changes nothing');
  assert.notEqual(run('--push').status, 0, '--push without an origin is refused');
  assert.equal(git(root, 'status', '--porcelain'), '', 'the root checkout is clean: worktrees are ignored');
});

test('the port log names real files and full commits', () => {
  const log = parse(read('upstream/port-log.yay'));
  assert.ok(log.entries.length > 10);
  for (const e of log.entries) {
    assert.ok(fs.existsSync(path.join(SHED, e.path)), `${e.path} exists`);
    assert.match(e.commit, /^[0-9a-f]{40}$/, e.path);
    assert.ok(Object.hasOwn(log.sources, e.source), e.source);
    assert.ok(['port', 'synthesize', 'vendor'].includes(e.disposition), e.disposition);
    assert.ok(e.source_path && e.note);
  }
});
