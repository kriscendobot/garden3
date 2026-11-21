// Slots: a job's home is built from nothing, cannot grow a clone of the
// garden's repositories, yields exactly its work at harvest, and is razed
// before and after. Driven through the real warden binary, in sim mode (no
// accounts; the root-only steps are covered by the warden's own refusals).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeNodePowers, makeFiles, run } from '../src/powers/node.js';
import { makeSlots, TOMBSTONES } from '../src/slots.js';
import { makeProjects } from '../src/project.js';
import { parse } from '../src/yay.js';
import { git, WARDEN } from './helpers.js';

const skip = fs.existsSync(WARDEN) ? false : 'the warden is not built (cargo build --offline in rust/)';

const setup = t => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-slots-'));
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const write = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  // A garden root with a shed commit and a plot branch.
  const root = path.join(T, 'root');
  fs.mkdirSync(root);
  git(root, 'init', '--quiet', '-b', 'shed');
  write(root, 'README.md', 'shed\n');
  write(root, 'roles/COMMON.md', 'common\n');
  write(root, 'roles/builder/AGENT.md', "the shed's stale copy of a genome role\n");
  write(root, 'roles/builder/stale.md', 'a file the plot does not have\n');
  write(root, 'scripts/x.sh', 'echo x\n');
  write(root, 'plots/genome-paths', 'roles/builder/\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  const plotDir = path.join(T, 'plot');
  fs.mkdirSync(plotDir);
  git(plotDir, 'init', '--quiet', '-b', 'plot/alder');
  write(plotDir, 'roles/builder/AGENT.md', 'alder builder\n');
  write(plotDir, 'plot.yay', 'tier: "standard"\n');
  git(plotDir, 'add', '-A'); git(plotDir, 'commit', '--quiet', '-m', 'genome');
  git(root, 'fetch', '--quiet', plotDir, 'plot/alder:plot/alder');
  // An upstream project, mirrored bare.
  const up = path.join(T, 'up');
  fs.mkdirSync(up);
  git(up, 'init', '--quiet', '-b', 'main');
  write(up, 'lib.js', 'export const one = 1;\n');
  git(up, 'add', '-A'); git(up, 'commit', '--quiet', '-m', 'init');
  const repositories = path.join(T, 'repositories');
  fs.mkdirSync(repositories);
  git(T, 'clone', '--quiet', '--bare', up, path.join(repositories, 'acme-lib.git'));
  const p = makeNodePowers();
  const gitRun = (cmd, args, opts = {}) => run(cmd, args, { ...opts, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...(opts.env ?? {}) } });
  const slots = makeSlots({ files: makeFiles, run: gitRun, warden: WARDEN, rootRepo: root, slotsRoot: path.join(T, 'slots'), repositories, stateDir: path.join(T, 'state'), clock: p.clock, count: 2, mode: 'sim' });
  fs.mkdirSync(path.join(T, 'slots'));
  return { T, root, repositories, slots, gitRun };
};
const job = { id: 'fix-lib', role: 'builder', title: 'Fix lib', projects: ['acme/lib'], body: 'Fix it.\n', claim: { generation: 3 } };

test('a home is the shed with the plot over it, tombstoned', { skip }, async t => {
  const { T, slots } = setup(t);
  assert.equal(await slots.free(), 'slot01');
  const home = await slots.prepare('slot01', job, 'alder');
  assert.equal(home, path.join(T, 'slots', 'slot01'));
  const read = f => fs.readFileSync(path.join(home, f), 'utf8');
  assert.equal(read('roles/COMMON.md'), 'common\n', 'shed files are there');
  assert.equal(read('roles/builder/AGENT.md'), 'alder builder\n', "the plot's genome replaces the shed's copy");
  assert.equal(fs.existsSync(path.join(home, 'roles/builder/stale.md')), false, 'outright: nothing of the shed remains in a genome path');
  assert.equal(parse(read('JOB.yay')).body, 'Fix it.\n');
  assert.equal(fs.existsSync(path.join(home, 'plot.yay')), true);
  for (const name of TOMBSTONES) {
    const st = fs.lstatSync(path.join(home, name));
    assert.ok(st.isFile() && (st.mode & 0o777) === 0o444, `${name} is a read-only regular file`);
  }
  assert.throws(() => fs.mkdirSync(path.join(home, 'repositories', 'x.git')), 'nothing can be cloned under a tombstone');
  assert.equal(await slots.free(), 'slot02', 'a prepared slot is busy');
  assert.deepEqual([(await slots.info('slot01')).job, (await slots.info('slot01')).plot], ['fix-lib', 'alder']);
  await assert.rejects(slots.prepare('slot02', job, 'nosuch'), { code: 'no-plot' });
  await assert.rejects(slots.prepare('../x', job, 'alder'), { code: 'invalid' });
});

test('one checkout per project, and harvest carries out exactly the work', { skip }, async t => {
  const { T, repositories, slots, gitRun } = setup(t);
  const home = await slots.prepare('slot01', job, 'alder');
  const projects = makeProjects({ files: makeFiles, run: gitRun, home, repositories });
  const wt = await projects.add('acme/lib');
  assert.equal(wt, path.join(home, 'worktrees/acme/lib'));
  assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'job/fix-lib/3', 'on a branch named for the job and the generation of its claim');
  assert.equal(fs.readFileSync(path.join(wt, 'lib.js'), 'utf8'), 'export const one = 1;\n');
  assert.equal(git(wt, 'remote'), '', 'there is no remote to push to');
  await assert.rejects(projects.add('acme/lib'), { code: 'exists' }, 'a second checkout of the same project is refused');
  await assert.rejects(projects.add('acme/other'), { code: 'no-repository' });
  await assert.rejects(projects.add('acme/lib/../../x'), { code: 'invalid' });
  assert.deepEqual(await projects.list(), ['acme/lib']);

  fs.writeFileSync(path.join(wt, 'lib.js'), 'export const one = 1;\nexport const two = 2;\n');
  git(wt, '-c', 'user.name=job', '-c', 'user.email=job@x', 'commit', '--quiet', '-am', 'add two');
  fs.writeFileSync(path.join(wt, 'unfinished.js'), '// not committed\n');
  fs.mkdirSync(path.join(wt, '.git/hooks'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.git/hooks/pre-commit'), `#!/bin/sh\ntouch ${T}/hook-ran\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(home, 'roles/builder/AGENT.md'), 'alder builder\nLesson: check the lockfile.\n');
  fs.writeFileSync(path.join(home, 'roles/COMMON.md'), 'a job may not change the shed\n');
  fs.writeFileSync(path.join(home, 'outbox/report.md'), 'Done.\n');

  const h = await slots.harvest('slot01');
  assert.deepEqual(h.projects, [{ project: 'acme/lib', branches: 2, wip: true }]);
  const bare = path.join(repositories, 'acme-lib.git');
  assert.equal(git(bare, 'log', '-1', '--format=%s', 'job/fix-lib/3'), 'add two', "the job's commits are in the garden's repository");
  assert.match(git(bare, 'log', '-1', '--format=%s', 'wip/fix-lib/3'), /^wip\(fix-lib\)/, 'uncommitted work is saved on a wip branch');
  assert.match(git(bare, 'show', '--stat', '--format=', 'wip/fix-lib/3'), /unfinished\.js/);
  assert.equal(git(bare, 'rev-parse', 'main'), git(bare, 'rev-parse', 'job/fix-lib/3~1'), 'main is untouched');
  assert.equal(fs.existsSync(path.join(T, 'hook-ran')), false, "the job's hooks never run on the garden's side");
  assert.deepEqual(h.genome_changed, ['roles/builder/AGENT.md'], 'only genome paths are harvested; a change to the shed is not');
  assert.equal(fs.readFileSync(path.join(T, 'state/harvest/fix-lib/genome/roles/builder/AGENT.md'), 'utf8').includes('Lesson'), true);
  assert.deepEqual(h.outbox, ['report.md']);

  await slots.clear('slot01');
  assert.equal(fs.existsSync(home), false, 'after the job, nothing is left');
  assert.equal(await slots.free(), 'slot01');
  await assert.rejects(slots.harvest('slot01'), { code: 'empty' });
});

test('prepare razes what the slot held, and clearAll razes every slot', { skip }, async t => {
  const { T, slots } = setup(t);
  const home = await slots.prepare('slot01', job, 'alder');
  fs.writeFileSync(path.join(home, 'scratch/leftover'), 'from the last job');
  await slots.prepare('slot01', { ...job, id: 'next' }, 'alder');
  assert.equal(fs.existsSync(path.join(home, 'scratch/leftover')), false, 'nothing of the previous job survives');
  await slots.prepare('slot02', job, 'alder');
  fs.mkdirSync(path.join(T, 'slots/slot07'));
  assert.deepEqual(await slots.clearAll(), ['slot01', 'slot02', 'slot07'], 'including a slot beyond the configured count');
  assert.deepEqual(fs.readdirSync(path.join(T, 'slots')), []);
});

test('a job runs in its home under its deadline', { skip }, async t => {
  const { T, slots } = setup(t);
  const home = await slots.prepare('slot01', job, 'alder');
  const logFile = path.join(T, 'run.log');
  const r = await slots.run('slot01', { argv: ['/bin/sh', '-c', 'pwd; echo $GARDEN_JOB_ID; sleep 30'], env: { PATH: '/usr/bin:/bin', GARDEN_JOB_ID: 'fix-lib' }, windowS: 1, killAfterS: 1, logFile });
  assert.deepEqual([r.status, r.timed_out], [124, true]);
  assert.equal(fs.readFileSync(logFile, 'utf8'), `${home}\nfix-lib\n`);
});
