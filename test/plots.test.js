// Plots: the genome rule, the wall, cutting a plot from the shed, and landing
// a job's lessons on its own plot only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { genomeEntries, isGenome, wall, makePlots } from '../src/plots.js';
import { makeFiles } from '../src/powers/node.js';
import { parse } from '../src/yay.js';
import { mkGarden, git, SHED } from './helpers.js';

const entries = genomeEntries('# comment\nroles/PLOT.md\nroles/builder/\n\nskills/project-checkout/\n');

test('the genome rule: a trailing slash is a prefix, anything else exact', () => {
  assert.deepEqual(entries, ['roles/PLOT.md', 'roles/builder/', 'skills/project-checkout/']);
  for (const p of ['roles/PLOT.md', 'roles/builder/AGENT.md', 'roles/builder/sub/x.md', 'plot.yay']) assert.equal(isGenome(p, entries), true, p);
  for (const p of ['roles/COMMON.md', 'roles/PLOT.md.bak', 'roles/builders/x', 'src/board.js', 'CLAUDE.md']) assert.equal(isGenome(p, entries), false, p);
  const real = genomeEntries(fs.readFileSync(path.join(SHED, 'plots/genome-paths'), 'utf8'));
  assert.ok(real.length > 0 && !isGenome('roles/COMMON.md', real) && !isGenome('roles/steward/AGENT.md', real), 'the shed keeps the common brief and the dispatching roles');
});

test('the wall', () => {
  const ok = [{ path: 'roles/builder/AGENT.md', mode: '100644' }];
  assert.deepEqual(wall(ok, entries, 'lesson(x)'), []);
  const reasons = c => wall([c], entries, 'lesson(x)').join('|');
  assert.match(reasons({ path: 'src/board.js', mode: '100644' }), /outside the genome/);
  assert.match(reasons({ path: 'roles/builder/link', mode: '120000' }), /symbolic link/);
  assert.match(reasons({ path: 'roles/builder/CLAUDE.md', mode: '100644' }), /auto-load/);
  assert.match(reasons({ path: 'roles/builder/run.sh', mode: '100755' }), /executable outside scripts/);
  assert.match(reasons({ path: 'plot.yay', mode: '100644' }), /plot\.yay/);
  assert.deepEqual(wall([{ path: 'plot.yay', mode: '100644' }], entries, 'mutation: raise the tier'), []);
  assert.match(wall([{ path: 'plot.yay', mode: '100644' }, ...ok], entries, 'mutation: x').join('|'), /plot\.yay/, 'a mutation changes plot.yay alone');
});

test('cut a plot from the shed, then land lessons through the wall', async t => {
  const g = mkGarden(t, { seeds: [] });
  const root = path.join(g.root, 'root');
  fs.mkdirSync(root);
  const put = (f, text, mode) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text, mode ? { mode } : undefined); };
  git(root, 'init', '--quiet', '-b', 'shed');
  put('plots/genome-paths', 'roles/PLOT.md\nroles/builder/\n');
  put('roles/PLOT.md', 'plot brief\n');
  put('roles/builder/AGENT.md', 'builder\n');
  put('roles/COMMON.md', 'common\n');
  put('src/x.js', '1\n');
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'shed');
  const h = g.host('host-a');
  const plots = makePlots({ files: makeFiles, run: h.run, rootRepo: root, shards: h.shards, stateDir: h.stateDir, clock: g.clock });
  const cut = await plots.cut('alder', { trailer: 'Trailer: yes' });
  assert.equal(cut.files, 3);
  assert.deepEqual(git(root, 'ls-tree', '-r', '--name-only', 'plot/alder').split('\n'), ['plot.yay', 'roles/PLOT.md', 'roles/builder/AGENT.md'], 'the genome and nothing else');
  assert.equal(git(root, 'rev-list', '--count', 'plot/alder'), '1', 'an orphan: no history shared with the shed');
  assert.match(git(root, 'log', '-1', '--format=%B', 'plot/alder'), /^plot\/alder: cut from the shed at [0-9a-f]+\n\nTrailer: yes/);
  assert.deepEqual(parse(git(root, 'show', 'plot/alder:plot.yay')), { tier: 'standard' });
  await assert.rejects(plots.cut('alder'), { code: 'exists' });
  await plots.cut('birch');
  git(root, 'push', '--quiet', g.remote, 'plot/alder', 'plot/birch');

  const stage = (job, f, text, mode) => { const p = path.join(h.stateDir, 'harvest', job, 'genome', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, mode ? { mode } : undefined); };
  stage('j1', 'roles/builder/AGENT.md', 'builder\nLesson one.\n');
  assert.deepEqual((await plots.land('j1', 'alder')).paths, ['roles/builder/AGENT.md']);
  assert.equal(g.show('plot/alder', 'roles/builder/AGENT.md'), 'builder\nLesson one.');
  assert.equal(g.show('plot/birch', 'roles/builder/AGENT.md'), 'builder', 'the other plot is untouched');
  assert.equal(g.remoteGit('log', '-1', '--format=%s', 'plot/alder'), 'lesson(j1): roles/builder/AGENT.md');
  stage('j2', 'roles/COMMON.md', 'a job rewrites the common brief\n');
  await assert.rejects(plots.land('j2', 'alder'), { code: 'wall' });
  stage('j3', 'roles/builder/tool.sh', '#!/bin/sh\n', 0o755);
  await assert.rejects(plots.land('j3', 'alder'), /executable outside scripts/);
  assert.deepEqual(await plots.land('nothing', 'alder'), { landed: false, paths: [] });
  assert.equal(g.remoteGit('rev-list', '--count', 'plot/alder'), '2', 'refused lessons left no commit');
});
