// clients.js — remote control of client hosts, by orders on a branch.
//
// A client host is a machine that runs a garden on capacity someone has lent
// (the Oros Studio host is the first). Its owner opts in by writing a consent
// file on that machine; from then on the host watches the `clients` branch
// and brings its garden to the state the maintainers order there. Design:
// designs/clients.md.
//
// Authority is push access: whoever can push to the `clients` branch of the
// garden's repository controls every host that watches it (the maintainer's
// decision). So the set of people and tokens with push access is what must be
// managed, and this module does not second-guess the pusher. What it does
// check is the owner's side and plain correctness:
//   - the owner's consent file exists, says `watch: true`, and names this host;
//   - the record is well formed, names this host, and is not older than the
//     last one applied (so a stale fetch cannot roll a host back);
//   - what it asks is in the vocabulary below, so a malformed or unrecognised
//     order is refused whole rather than half-applied;
//   - the owner's limits (slots, hours) bound it.
// The vocabulary has no order that runs a command or reaches outside the
// garden's own directory and container: control is of the garden, not of the
// donor's machine.

import { parse, stringify } from './yay.js';
import { harden, isName } from './harden.js';

/** The whole vocabulary of standing orders. There is no "run". */
export const ORDERS = harden(['quiesce', 'drain', 'resume', 'restart', 'clear-scratch']);

/** Read and check a consent file. Returns {watching, consent?, reason?}. */
export const readConsent = (text, host) => {
  if (text === null || text === undefined) return harden({ watching: false, reason: 'no consent file on this host' });
  let consent;
  try {
    consent = parse(text, 'CLIENT-CONSENT.yay');
  } catch (err) {
    return harden({ watching: false, reason: `the consent file is not YAY: ${err.message}` });
  }
  if (consent.watch !== true) return harden({ watching: false, reason: 'the consent file does not say watch: true' });
  if (consent.host !== host) return harden({ watching: false, reason: `the consent file is for ${consent.host}, not ${host}` });
  if (!Number.isInteger(consent.limits?.max_slots)) return harden({ watching: false, reason: 'the consent file sets no limits.max_slots' });
  return harden({ watching: true, consent });
};

/**
 * Turn an order into actions. Pure.
 *   desired   the host's record from the clients branch
 *   consent   the owner's consent (limits, allow)
 *   current   {shed, slots, done_orders: [ids], last_serial}
 * Returns {serial, actions: [{do, ...}], refused: [reasons], notes: [...]}.
 * An order that fails a whole-order check yields no actions at all.
 */
export const reconcile = ({ desired, consent, current, host, now }) => {
  const refuse = reason => harden({ serial: current.last_serial ?? 0, actions: [], refused: [reason], notes: [] });
  if (!desired || typeof desired !== 'object') return refuse('there is no order for this host');
  if (desired.host !== host) return refuse(`the order is for ${desired.host}, not ${host}`);
  if (!Number.isInteger(desired.serial)) return refuse('the order has no serial');
  const last = current.last_serial ?? 0;
  if (desired.serial < last) return refuse(`serial ${desired.serial} is older than ${last}, the last order obeyed ; a newer order was already applied`);
  if (desired.expires_at !== undefined && !(Date.parse(desired.expires_at) > Date.parse(now))) return refuse(`the order expired at ${desired.expires_at}`);

  const allow = consent.allow ?? {};
  const actions = [];
  const refused = [];
  const notes = [];

  // The owner's hours come first: outside them the garden drains, whatever is ordered.
  const hours = consent.limits.hours_utc;
  const hour = new Date(Date.parse(now)).getUTCHours();
  const inHours = !hours || (hours.from <= hours.to ? hour >= hours.from && hour < hours.to : hour >= hours.from || hour < hours.to);
  if (!inHours) {
    notes.push(`outside the owner's hours (${hours.from}-${hours.to} UTC): draining`);
    return harden({ serial: desired.serial, actions: [{ do: 'set-slots', slots: 0 }], refused, notes });
  }

  if (desired.shed !== undefined && desired.shed !== current.shed) {
    if (!/^[0-9a-f]{40}$/.test(String(desired.shed))) refused.push('shed is not a full commit id');
    else if (allow.shed !== true) refused.push('the owner does not allow the shed to be changed remotely');
    else actions.push({ do: 'rejuvenate', shed: desired.shed });
  }
  if (desired.slots !== undefined) {
    if (!Number.isInteger(desired.slots) || desired.slots < 0) refused.push('slots is not a count');
    else {
      const slots = Math.min(desired.slots, consent.limits.max_slots);
      if (slots !== desired.slots) notes.push(`slots clamped from ${desired.slots} to the owner's limit of ${slots}`);
      if (slots !== current.slots) actions.push({ do: 'set-slots', slots });
    }
  }
  for (const [key, action] of [['plots', 'set-plots'], ['capabilities', 'set-capabilities'], ['arcs', 'set-arcs']]) {
    if (desired[key] === undefined) continue;
    if (!Array.isArray(desired[key]) || !desired[key].every(isName)) refused.push(`${key} is not a list of names`);
    else if (key === 'capabilities' && allow.capabilities !== true) refused.push('the owner does not allow capabilities to be installed remotely');
    else if (key === 'capabilities') {
      // An order pins capabilities onto a host; the owner may forbid some
      // (the heavy ones) whatever is ordered.
      const forbidden = desired.capabilities.filter(c => (consent.limits.forbid_capabilities ?? []).includes(c));
      for (const c of forbidden) refused.push(`the owner forbids the capability ${c} on this host`);
      const wanted = desired.capabilities.filter(c => !forbidden.includes(c)).sort();
      if (wanted.length) actions.push({ do: action, capabilities: wanted });
    } else actions.push({ do: action, [key]: [...desired[key]].sort() });
  }
  if (desired.forbid_capabilities !== undefined) {
    // The maintainers may also exclude capabilities from a host: it will not
    // install them on demand and will not claim jobs that need them.
    if (!Array.isArray(desired.forbid_capabilities) || !desired.forbid_capabilities.every(isName)) refused.push('forbid_capabilities is not a list of names');
    else actions.push({ do: 'forbid-capabilities', capabilities: [...new Set([...desired.forbid_capabilities, ...(consent.limits.forbid_capabilities ?? [])])].sort() });
  }
  for (const order of desired.orders ?? []) {
    if (!order || !isName(order.id ?? '')) refused.push('an order has no id');
    else if (!ORDERS.includes(order.op)) refused.push(`order ${order.id}: '${order.op}' is not something a client host does`);
    else if (!(allow.orders ?? []).includes(order.op)) refused.push(`order ${order.id}: the owner does not allow '${order.op}'`);
    else if (!(current.done_orders ?? []).includes(order.id)) actions.push({ do: order.op, id: order.id });
  }
  for (const key of Object.keys(desired)) {
    if (!['host', 'serial', 'issued_at', 'expires_at', 'issued_by', 'shed', 'slots', 'plots', 'capabilities', 'forbid_capabilities', 'arcs', 'orders', 'note'].includes(key)) refused.push(`'${key}' is not something an order can say`);
  }
  return harden({ serial: desired.serial, actions, refused, notes });
};

/**
 * The watcher. `consentFile` is the owner's consent, an absolute path on the
 * host, outside anything a job can write. The branch is fetched from the one
 * repository the host is configured with, like every other shard.
 */
export const makeClientWatch = ({ shards, run, files, stateDir, host, consentFile, clock, branch = 'clients' }) => {
  const state = files(stateDir);
  const readFile = file => {
    const r = run('cat', [file]);
    return r.status === 0 ? r.stdout : null;
  };
  const current = () => {
    const text = state.readIf('client/current.yay');
    return text ? parse(text) : { last_serial: 0, done_orders: [] };
  };

  /**
   * Fetch the branch and decide what, if anything, to do. Never acts.
   * Returns {watching, plan?, reason?}.
   */
  const read = async ({ shed, slots } = {}) => {
    const c = readConsent(readFile(consentFile), host);
    if (!c.watching) return harden({ watching: false, reason: c.reason });
    const { consent } = c;
    const s = shards.shard('client', branch);
    if (!s.sync()) return harden({ watching: true, reason: 'the clients branch cannot be reached' });
    const text = s.tree.readIf(`clients/${host}.yay`);
    let desired = null;
    try {
      desired = text ? parse(text, `clients/${host}.yay`) : null;
    } catch (err) {
      return harden({ watching: true, reason: `the order is not YAY: ${err.message}` });
    }
    const plan = reconcile({ desired, consent, current: { ...current(), shed, slots }, host, now: clock.now() });
    return harden({ watching: true, plan });
  };

  return harden({
    read,
    /** Record that a plan was carried out, so its serial and orders are not obeyed twice. */
    applied: async plan => {
      const c = current();
      const done = [...new Set([...(c.done_orders ?? []), ...plan.actions.filter(a => a.id).map(a => a.id)])].sort().slice(-200);
      state.write('client/current.yay', stringify({ done_orders: done, last_serial: plan.serial }));
    },
  });
};
