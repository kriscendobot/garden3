// Test helpers: a throwaway garden (a bare remote seeded with the shards) and
// hosts that share it. Nothing touches the real repository or a network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { makeShards } from '../src/shard.js';

export const SHED = path.resolve(import.meta.dirname, '..');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@garden.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@garden.invalid' };
export const git = (cwd, ...args) => execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
const gitRun = (cmd, args, opts = {}) => run(cmd, cmd === 'git' ? ['-c', 'protocol.file.allow=always', ...args] : args, { ...opts, env: opts.env ?? GIT_ENV });

/** A fresh garden under a temp directory; `t` cleans it up. */
export const mkGarden = (t, { seeds = ['board', 'archive', 'journal'], hostBranches = [] } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  git(root, 'init', '--quiet', '--bare', remote);
  const push = (branch, dir) => {
    git(dir, 'init', '--quiet', '-b', branch);
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', `${branch}: initialized`);
    git(dir, 'push', '--quiet', remote, `${branch}:refs/heads/${branch}`);
  };
  for (const b of seeds) {
    const dir = path.join(root, `seed-${b}`);
    fs.cpSync(path.join(SHED, 'scripts/shards/seed', b), dir, { recursive: true });
    push(b, dir);
  }
  for (const h of hostBranches) {
    const dir = path.join(root, `seed-host-${h}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'README.md'), `# host/${h}\n`);
    push(`host/${h}`, dir);
  }
  let tick = Date.parse('2026-11-17T00:00:00Z');
  const clock = { now: () => new Date((tick += 1000)).toISOString().replace(/\.\d+Z$/, 'Z'), set: iso => (tick = Date.parse(iso)) };
  const powers = makeNodePowers();
  /** The powers and shards of one host of this garden. */
  const host = name => {
    const stateDir = path.join(root, `state-${name}`);
    fs.mkdirSync(stateDir, { recursive: true });
    const shards = makeShards({ run: gitRun, files: makeFiles, remote, stateDir, identity: { name: 'garden test', email: 't@garden.invalid' } });
    return { name, stateDir, shards, clock, files: makeFiles, run: gitRun, powers };
  };
  const remoteGit = (...args) => git(remote, ...args);
  const show = (branch, file) => {
    try {
      return remoteGit('show', `${branch}:${file}`);
    } catch {
      return null;
    }
  };
  return { root, remote, host, clock, remoteGit, show, ls: branch => remoteGit('ls-tree', '-r', '--name-only', branch).split('\n') };
};
