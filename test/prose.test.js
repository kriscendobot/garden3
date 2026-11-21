// American English, without Botese: the lists, the check, and the shed itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLists, findings, keepCase, addedLines, makeProse, SKILL } from '../src/prose.js';
import { makeFiles, run } from '../src/powers/node.js';
import { git, SHED, tempDir } from './helpers.js';

const lists = parseLists({
  divergences: fs.readFileSync(path.join(SHED, SKILL, 'divergences.tsv'), 'utf8'),
  cliches: fs.readFileSync(path.join(SHED, SKILL, 'cliches.tsv'), 'utf8'),
});

test('a British spelling is found whole, and its replacement keeps the case', () => {
  const hits = findings('The Colour of its behaviour.\nNo colourblind, no discoloured, no ARTEFACT-free.', lists);
  assert.deepEqual(hits.map(h => [h.line, h.found, h.replacement]), [[1, 'Colour', 'Color'], [1, 'behaviour', 'behavior']], 'compounds and hyphenated words are missed, not guessed');
  assert.equal(keepCase('COLOUR', 'color'), 'COLOR');
  assert.equal(keepCase('colour', 'color'), 'color');
});

test('the always-ise words and the -re and -our false friends are never on the list', () => {
  const british = new Set(lists.spellings.map(r => r.found.toLowerCase()));
  for (const w of ['surprise', 'advertise', 'exercise', 'comprise', 'advise', 'arise', 'compromise', 'disguise', 'supervise', 'genre', 'acre', 'ogre', 'contour', 'glamour', 'devour', 'four', 'hour', 'pour', 'tour', 'your']) assert.ok(!british.has(w), w);
  assert.deepEqual(findings('Your four tours of the genre were a surprise.', lists), []);
  assert.equal(british.size, lists.spellings.length, 'each spelling once');
});

test('Botese is a phrase, and the bare words keep their ordinary senses', () => {
  assert.deepEqual(findings('This is the seam where jobs meet.', lists).map(h => h.found), ['is the seam', 'seam where']);
  assert.deepEqual(findings('Introduce a seam so the test can stub it; a load-bearing wall.', lists), []);
  assert.deepEqual(findings('the load-bearing\ninvariant', lists), [], 'a phrase split across lines is missed');
  assert.deepEqual(findings('Find the seam', lists, { surface: 'pr-metadata' }).map(h => h.found), ['seam'], 'a title may not use the bare word');
});

test('a diff yields only the lines it adds, with their new line numbers', () => {
  const diff = ['diff --git a/x.md b/x.md', '--- a/x.md', '+++ b/x.md', '@@ -3,0 +4,2 @@', '+one colour', '+two', '@@ -9 +11 @@', '-old', '+behaviour', '--- a/gone', '+++ /dev/null', '@@ -1 +0,0 @@', '-gone'].join('\n');
  assert.deepEqual(addedLines(diff), [{ path: 'x.md', line: 4, text: 'one colour' }, { path: 'x.md', line: 5, text: 'two' }, { path: 'x.md', line: 11, text: 'behaviour' }]);
});

test('garden prose: check reads files, diff reads only what a change adds', () => {
  const dir = tempDir('prose-');
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'a.md'), 'their colour\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'theirs');
  fs.appendFileSync(path.join(dir, 'a.md'), 'my behaviour\n');
  const prose = makeProse({ files: makeFiles(dir), run, lists });
  assert.deepEqual(prose.check('a.md'), ['a.md:1:7: colour -> color', 'a.md:2:4: behaviour -> behavior']);
  assert.deepEqual(prose.check(), prose.check('a.md'), 'with no path, every tracked file');
  assert.deepEqual(prose.diff('HEAD'), ['a.md:2:4: behaviour -> behavior'], 'what someone else wrote is left alone');
  assert.deepEqual(prose.metadata('Name the seam'), ['pull-request:1:10: seam -> name the boundary, interface, or extension point directly']);
  assert.throws(() => prose.check('nope.md'), /no file/);
});

// The lists name these words; the readme quotes them; the inventory records what was.
const LEAVE = new Set([`${SKILL}/divergences.tsv`, `${SKILL}/cliches.tsv`, `${SKILL}/SKILL.md`, 'test/prose.test.js']);
const QUOTED = /^(vendor|reference)\//;

test('the shed is written in American English', () => {
  const tracked = git(SHED, 'ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(f => f && !LEAVE.has(f) && !QUOTED.test(f) && fs.existsSync(path.join(SHED, f)));
  const prose = makeProse({ files: makeFiles(SHED), run, lists });
  assert.deepEqual(prose.check(...tracked), []);
});
