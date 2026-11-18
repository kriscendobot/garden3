// Wrap-it-up notes, the slow journal's press, and the boatman's carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as W from '../src/wrapup.js';
import { makeJournal } from '../src/journal.js';
import { makeBoatman } from '../src/mail.js';
import { makeNodePowers, makeFiles } from '../src/powers/node.js';
import { parseYaydown } from '../src/yay.js';
import { mkGarden } from './helpers.js';

test('wrap it up: the leads are the priors’, and each note goes once', () => {
  assert.deepEqual(W.leads(2400), { warn: 600, final: 120 }, 'a quarter of the window');
  assert.deepEqual(W.leads(7200), { warn: 900, final: 120 }, 'capped at 15 minutes and 2 minutes');
  assert.deepEqual(W.leads(400), { warn: 100, final: 50 }, 'the final note at half the warning’s lead');
  const seen = new Set();
  const flags = { has: n => seen.has(n), set: n => seen.add(n) };
  const at = left => W.note({ id: 'j1', windowS: 2400, deadlineEpoch: 10000, nowEpoch: 10000 - left, flags });
  assert.equal(at(601), null, 'nothing before the lead');
  assert.match(at(600), /^Garden deadline note: about 10 minutes are left.*Wrap up now.*hand off/);
  assert.equal(at(300), null, 'the warning goes once');
  assert.match(at(120), /^Garden deadline note, final: about 2 minutes.*Commit safe work in progress now/);
  assert.equal(at(5), null, 'the final note goes once');
  const late = new Set();
  assert.match(W.note({ id: 'j', windowS: 2400, deadlineEpoch: 10000, nowEpoch: 9990, flags: { has: n => late.has(n), set: n => late.add(n) } }), /final/, 'a long command can skip straight to the final note');
  assert.deepEqual([...late].sort(), ['final', 'warning'], 'which also spends the warning');
  assert.equal(W.note({ id: 'j', windowS: NaN, deadlineEpoch: 1, nowEpoch: 1, flags }), null, 'a run with no clock gets no note');
  assert.deepEqual(W.hookOutput('x'), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'x' } });
  assert.equal(W.hookOutput(null), null);
  assert.match(W.clockNote({ id: 'j1', windowS: 2400, deadlineIso: '2026-11-17T01:00:00Z' }), /when 10 minutes are left, and a final one at 2 minutes/);
});

test('wrap it up: what a run amounted to', () => {
  assert.equal(W.outcome({ timedOut: false, status: 0, report: 'done', handoff: null }), 'done');
  assert.equal(W.outcome({ timedOut: false, status: 0, report: 'x', handoff: { steps: [] } }), 'handoff', 'a hand-off is not a completion');
  assert.equal(W.outcome({ timedOut: true, status: 124, report: null, handoff: { steps: [] } }), 'handoff', 'even when it ran to the wall');
  assert.equal(W.outcome({ timedOut: true, status: 124, report: 'partial', handoff: null }), 'overrun', 'stopped without handing off: requeue, never done');
  assert.equal(W.outcome({ timedOut: false, status: 1, report: null, handoff: null }), 'failed');
});

test('the journal takes one commit per host per pressed batch', async t => {
  const g = mkGarden(t);
  const h = g.host('host-a');
  const j = makeJournal({ files: makeFiles, shards: h.shards, stateDir: h.stateDir, host: 'host-a', clock: g.clock });
  const before = Number(g.remoteGit('rev-list', '--count', 'journal'));
  g.clock.set('2026-11-15T10:00:00Z');
  await j.note('steward', 'Posted three jobs for endo.');
  await j.note('builder', 'Finished fix-a.');
  g.clock.set('2026-11-16T09:00:00Z');
  await j.note('steward', 'Quiet day.');
  assert.equal(Number(g.remoteGit('rev-list', '--count', 'journal')), before, 'notes are not commits');
  g.clock.set('2026-11-17T08:00:00Z');
  await j.note('steward', 'Today is not finished.');
  assert.deepEqual(await j.press(), ['2026-11-15', '2026-11-16']);
  assert.equal(Number(g.remoteGit('rev-list', '--count', 'journal')), before + 1, 'two days, one commit');
  const entry = parseYaydown(g.show('journal', 'entries/2026/11/2026-11-15-host-a.md') + '\n');
  assert.deepEqual(entry.front, { author: 'host-a', created: '2026-11-15', kind: 'digest' });
  assert.match(entry.body, /## 10:00Z steward\n\nPosted three jobs for endo\.\n\n## 10:00Z builder/);
  assert.deepEqual(await j.pending(), ['2026-11-17']);
  assert.deepEqual(await j.press(), [], 'today waits');
  assert.deepEqual(await j.press({ includeToday: true }), ['2026-11-17'], 'unless a quiescence asks for everything');
});

test('the boatman carries only what the maintainer approved, by hash', async t => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-mail-'));
  t.after(() => fs.rmSync(T, { recursive: true, force: true }));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(T, rel)), { recursive: true }); fs.writeFileSync(path.join(T, rel), text); };
  put('tower/mail/garden/2026-11-15-GARDEN-endo-mail.md', 'Please build X.\n');
  put('tower/mail/garden/2026-11-16-GARDEN-second.md', 'And Y.\n');
  put('tower/mail/garden/notes.txt', 'not mail');
  put('tower/mail/garden/archive/2026-11-01-carried-GARDEN-old.md', 'old');
  put('garden/mail/outbox/2026-11-17-TOWER-report.md', 'X is built.\n');
  const p = makeNodePowers();
  const b = makeBoatman({ files: makeFiles, sha256File: p.sha256File, towerDir: path.join(T, 'tower'), gardenDir: path.join(T, 'garden'), clock: p.clock });
  const pending = await b.pending();
  assert.deepEqual(pending.toGarden.map(m => m.slug), ['endo-mail', 'second'], 'only well-named mail, not the archive');
  assert.deepEqual(pending.toTower.map(m => m.slug), ['report']);
  assert.deepEqual(await b.carryToGarden(), [], 'nothing crosses unapproved');
  await assert.rejects(b.carryToGarden({ approve: ['0'.repeat(64)] }), { code: 'not-pending' });

  // The maintainer read endo-mail and approved it; then it is edited before the carry.
  const approved = pending.toGarden[0].sha256;
  fs.appendFileSync(path.join(T, 'tower/mail/garden/2026-11-15-GARDEN-endo-mail.md'), 'An addition nobody approved.\n');
  await assert.rejects(b.carryToGarden({ approve: [approved] }), { code: 'not-pending' }, 'an approval is for exact bytes');
  put('tower/mail/garden/2026-11-15-GARDEN-endo-mail.md', 'Please build X.\n');

  const [receipt] = await b.carryToGarden({ approve: [approved] });
  assert.deepEqual([receipt.direction, receipt.slug, receipt.sha256, receipt.arrived], ['tower-to-garden', 'endo-mail', approved, 'mail/inbox/20261115-tower-endo-mail.md']);
  assert.equal(fs.readFileSync(path.join(T, 'garden/mail/inbox/20261115-tower-endo-mail.md'), 'utf8'), 'Please build X.\n');
  assert.equal(fs.existsSync(path.join(T, 'tower/mail/garden/2026-11-15-GARDEN-endo-mail.md')), false);
  assert.equal(fs.readFileSync(path.join(T, 'tower/mail/garden/archive/2026-11-15-carried-GARDEN-endo-mail.md'), 'utf8'), 'Please build X.\n', 'the original is archived as carried');
  assert.equal(fs.existsSync(path.join(T, 'tower/mail/garden/2026-11-16-GARDEN-second.md')), true, 'unapproved mail stays');
  assert.equal(JSON.stringify(receipt).includes('Please build'), false, 'a receipt holds no content');

  const [out] = await b.carryToTower({ approve: [pending.toTower[0].sha256] });
  assert.equal(out.arrived, 'drop/from-garden/20261117-garden-report.md');
  assert.equal(fs.readFileSync(path.join(T, 'tower/drop/from-garden/20261117-garden-report.md'), 'utf8'), 'X is built.\n');
  assert.equal(fs.existsSync(path.join(T, 'garden/mail/outbox/archive/2026-11-17-TOWER-report.md')), true);
  assert.deepEqual(await b.pending().then(x => [x.toGarden.length, x.toTower.length]), [1, 0]);
});

test('the hand-off example in the wrap-it-up skill is YAY a worker could write', async () => {
  const { parse } = await import('../src/yay.js');
  const text = fs.readFileSync(path.join(import.meta.dirname, '../skills/wrap-it-up/SKILL.md'), 'utf8');
  const example = /```yay\n([\s\S]*?)```/.exec(text)[1].replace(/^ {3}/gm, '');
  const doc = parse(example);
  assert.deepEqual(doc.steps.map(s => s.id).sort(), ['fix-a-migrate', 'fix-a-schema']);
});
