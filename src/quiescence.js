// quiescence.js — the garden's one coordinated-restart procedure.
//
// Phases, in order (designs/quiescence.md):
//
//   idle -> quiesce -> truncate -> rejuvenate -> verify -> idle
//
//   quiesce     no host claims; each host lets its running jobs end (their own
//               deadlines bound the wait) and acknowledges.
//   truncate    the leader consolidates append-only records and rewrites the
//               high-churn shards to fresh roots, parking the old history.
//   rejuvenate  each host fast-forwards its shed, re-resolves capabilities to
//               their pins, rebuilds its binaries, clears scratch and clones,
//               truncates its own host branch, and acknowledges.
//   verify      each host verifies and reports its shed commit and capability
//               digest; the leader resumes only when they agree.
//
// The state is one document, quiescence.yay on the board, so that a host that
// was away reads the whole story in one fetch. This module is the protocol's
// rules as pure functions, and the truncation and consolidation that the
// leader runs in the truncate phase.

import { parse, stringify } from './yay.js';
import { harden, refuse, isName } from './harden.js';
import { billable } from './budget.js';
import { loadBoard, saveBoard } from './boardService.js';
import * as rules from './board.js';

export const PHASES = ['idle', 'quiesce', 'truncate', 'rejuvenate', 'verify'];
const ACKED = { quiesce: 'quiesce', rejuvenate: 'rejuvenate', verify: 'verify' };

const live = q => (q.expected ?? []).filter(h => !(q.absent ?? []).includes(h));
const acked = (q, host, phase) => q.acks?.[host]?.[phase] !== undefined;

/** Hosts the current phase is still waiting for. */
export const waitingOn = q => (ACKED[q.phase] ? live(q).filter(h => !acked(q, h, q.phase)) : []);

/** Call a quiescence. `shed` is the commit every host is to rejuvenate to. */
export const call = (q, { id, by, hosts, shed }, now) => {
  if (q.phase !== 'idle') refuse('busy', `a quiescence is already in phase ${q.phase}`);
  if (!isName(id)) refuse('invalid', 'a quiescence needs an id');
  if (!hosts?.length) refuse('invalid', 'a quiescence names the hosts it expects');
  return { phase: 'quiesce', id, called_by: by, called_at: now, shed, expected: [...hosts].sort(), absent: [], acks: {}, ...(q.last ? { last: q.last } : {}) };
};

/** A host acknowledges the current phase, with what it has to report. */
export const ack = (q, host, report, now) => {
  if (!ACKED[q.phase]) refuse('no-ack', `phase ${q.phase} takes no acknowledgement`);
  if (!(q.expected ?? []).includes(host)) refuse('unexpected', `${host} is not one of this quiescence's hosts`);
  if ((q.absent ?? []).includes(host)) refuse('absent', `${host} was marked absent from ${q.id}; it catches up after the resume`);
  q.acks = { ...q.acks, [host]: { ...(q.acks?.[host] ?? {}), [q.phase]: { at: now, ...report } } };
  return q;
};

/**
 * Give up on a host that has not answered. It stops counting, and when the
 * fleet resumes it must catch up (rejuvenate and verify on its own) before it
 * claims again: see `duty`.
 */
export const markAbsent = (q, host) => {
  if (q.phase === 'idle') refuse('idle', 'no quiescence is in progress');
  q.absent = [...new Set([...(q.absent ?? []), host])].sort();
  return q;
};

/**
 * Move to the next phase if this one is complete. Returns {moved, reason}.
 * `claimed` is the number of jobs still claimed on the board.
 */
export const advance = (q, { claimed = 0 } = {}, now) => {
  const waiting = waitingOn(q);
  const stay = reason => ({ moved: false, reason });
  switch (q.phase) {
    case 'idle':
      return stay('idle');
    case 'quiesce':
      if (waiting.length) return stay(`waiting for ${waiting.join(', ')} to quiesce`);
      if (claimed > 0) return stay(`${claimed} job(s) still claimed`);
      q.phase = 'truncate';
      return { moved: true };
    case 'truncate':
      if (!q.truncated) return stay('the leader has not truncated yet');
      q.phase = 'rejuvenate';
      return { moved: true };
    case 'rejuvenate': {
      if (waiting.length) return stay(`waiting for ${waiting.join(', ')} to rejuvenate`);
      const behind = live(q).filter(h => q.acks[h].rejuvenate.shed !== q.shed);
      if (behind.length) return stay(`${behind.join(', ')} rejuvenated to another shed than ${q.shed}`);
      q.phase = 'verify';
      return { moved: true };
    }
    case 'verify': {
      if (waiting.length) return stay(`waiting for ${waiting.join(', ')} to verify`);
      const reports = live(q).map(h => [h, q.acks[h].verify]);
      const failed = reports.filter(([, r]) => r.ok !== true).map(([h]) => h);
      if (failed.length) return stay(`${failed.join(', ')} did not verify`);
      // Hosts need not hold the same capabilities, but any two that hold one
      // must hold the same pin of it.
      const pins = {};
      for (const [h, r] of reports) {
        for (const [name, pin] of Object.entries(r.capabilities ?? {})) {
          pins[name] ??= {};
          (pins[name][pin] ??= []).push(h);
        }
      }
      const drift = Object.entries(pins).filter(([, byPin]) => Object.keys(byPin).length > 1);
      if (drift.length) return stay(`capability drift: ${drift.map(([n, byPin]) => `${n} (${Object.values(byPin).map(hs => hs.join('+')).join(' vs ')})`).join('; ')}`);
      const last = { id: q.id, shed: q.shed, at: now, absent: q.absent ?? [], truncated: q.truncated };
      for (const k of Object.keys(q)) delete q[k];
      Object.assign(q, { phase: 'idle', last });
      return { moved: true };
    }
    default:
      return refuse('invalid', `unknown phase ${q.phase}`);
  }
};

/**
 * What should this host do now? `caughtUp` is the id of the last quiescence
 * this host completed (a host-local marker).
 *   'run'        claim and work
 *   'wait'       do nothing new
 *   'quiesce' | 'rejuvenate' | 'verify'   do that phase's part, then ack
 *   'catch-up'   the fleet resumed without this host: rejuvenate and verify
 *                alone, record the marker, and only then run
 */
export const duty = (q, host, caughtUp) => {
  if (q.phase === 'idle') return q.last && q.last.id !== caughtUp ? 'catch-up' : 'run';
  if (!(q.expected ?? []).includes(host) || (q.absent ?? []).includes(host)) return 'wait';
  if (ACKED[q.phase] && !acked(q, host, q.phase)) return q.phase;
  return 'wait';
};

// --- truncation ---------------------------------------------------------------------

/**
 * Rewrite a shard to a fresh root commit holding its current tree, parking
 * the old tip under <prefix>/<branch>/epoch-<n>. Dry run unless `apply`.
 * One atomic push moves both refs, with a lease pinned to the tip that was
 * read: if anyone wrote meanwhile, nothing moves. Old history is never
 * deleted here.
 */
export const truncate = ({ shards, clock, prefix = 'refs/archive', trailer }, branch, { apply = false } = {}) => {
  const old = shards.tip(branch);
  if (!old) return { branch, ok: false, reason: 'no such branch on the remote' };
  const s = shards.shard('truncate', branch);
  s.drop();
  if (!s.sync()) return { branch, ok: false, reason: 'offline' };
  const head = s.git(['rev-parse', 'HEAD']).stdout.trim();
  if (head !== old) return { branch, ok: false, reason: 'the branch moved while it was read' };
  const epoch = s.epoch();
  const park = `${prefix}/${branch}/epoch-${epoch}`;
  if (shards.refs(park).length) return { branch, ok: false, reason: `${park} already exists` };
  s.tree.write('EPOCH', stringify({ epoch: epoch + 1, previous: old, at: clock.now() }));
  s.git(['add', '-A']);
  const tree = s.git(['write-tree']).stdout.trim();
  const message = `${branch}: epoch ${epoch + 1} (truncated; previous history at ${park})${trailer ? `\n\n${trailer}` : ''}`;
  const fresh = s.git(['commit-tree', tree, '-m', message]).stdout.trim();
  const plan = { branch, epoch, next: epoch + 1, old, park, root: fresh, files: s.git(['ls-tree', '-r', '--name-only', fresh]).stdout.split('\n').filter(Boolean).length };
  if (!apply) return { ...plan, ok: true, applied: false };
  const pushed = s.git(['push', '--quiet', '--atomic', `--force-with-lease=refs/heads/${branch}:${old}`, 'origin', `${old}:${park}`, `${fresh}:refs/heads/${branch}`], { allowFail: true });
  s.drop();
  return pushed.status === 0 ? { ...plan, ok: true, applied: true } : { ...plan, ok: false, applied: false, reason: `push refused: ${pushed.stderr.trim().split('\n').pop()}` };
};

// --- consolidation --------------------------------------------------------------------
//
// Each rule folds an append-only record into a bounded one, is keyed so a
// repeat changes nothing, and returns the lines of what it did.

const monthBefore = (nowIso, months) => {
  const d = new Date(Date.UTC(Number(nowIso.slice(0, 4)), Number(nowIso.slice(5, 7)) - 1 - months, 1));
  return d.toISOString().slice(0, 7);
};
const monthDirs = (tree, top) => tree.list(top).flatMap(y => (/^\d{4}$/.test(y) ? tree.list(`${top}/${y}`).filter(m => /^\d{2}$/.test(m)).map(m => `${y}-${m}`) : []));

/** archive: done/<YYYY>/<MM>/ older than the retention -> rollup/<YYYY>-<MM>.yay, without bodies or reports. */
export const rollupArchive = (tree, nowIso, keepMonths) => {
  const notes = [];
  for (const ym of monthDirs(tree, 'done')) {
    if (ym >= monthBefore(nowIso, keepMonths)) continue;
    const dir = `done/${ym.replace('-', '/')}`;
    const file = `rollup/${ym}.yay`;
    const jobs = Object.fromEntries((tree.exists(file) ? parse(tree.read(file)).jobs : []).map(j => [j.id, j]));
    for (const f of tree.list(dir)) {
      if (!f.endsWith('.yay')) continue;
      const { body: _body, report: _report, handoff_log: _log, ...rest } = parse(tree.read(`${dir}/${f}`), f);
      jobs[rest.id] = rest;
    }
    tree.write(file, stringify({ month: ym, jobs: Object.values(jobs).sort((a, b) => (a.id < b.id ? -1 : 1)) }));
    tree.remove(dir);
    notes.push(`archive: ${ym} rolled up (${Object.keys(jobs).length} jobs)`);
  }
  return notes;
};

/** journal: entries/<YYYY>/<MM>/ older than the retention -> one entries/<YYYY>-<MM>.md, digests in order. */
export const rollupEntries = (tree, nowIso, keepMonths) => {
  const notes = [];
  for (const ym of monthDirs(tree, 'entries')) {
    if (ym >= monthBefore(nowIso, keepMonths)) continue;
    const dir = `entries/${ym.replace('-', '/')}`;
    const parts = tree.list(dir).filter(f => f.endsWith('.md')).map(f => `<!-- ${f} -->\n\n${tree.read(`${dir}/${f}`)}`);
    tree.write(`entries/${ym}.md`, `${tree.readIf(`entries/${ym}.md`) ?? ''}${parts.join('\n')}`);
    tree.remove(dir);
    notes.push(`journal: ${ym} consolidated (${parts.length} digests)`);
  }
  return notes;
};

/**
 * usage: rows older than the current budget week, from one host's branch ->
 * journal:budget/weeks/<week-start-date>.yay, totals by arc and pool. A week
 * that already carries a host's totals is not counted again.
 */
export const rollupUsage = (tree, host, rows, weekStartSeconds) => {
  const notes = [];
  const byWeek = new Map();
  for (const r of rows) {
    const t = Math.floor(Date.parse(r.ts) / 1000);
    if (t >= weekStartSeconds) continue;
    const week = weekStartSeconds - Math.ceil((weekStartSeconds - t) / 604800) * 604800;
    byWeek.set(week, [...(byWeek.get(week) ?? []), r]);
  }
  for (const [week, list] of [...byWeek].sort((a, b) => a[0] - b[0])) {
    const date = new Date(week * 1000).toISOString().slice(0, 10);
    const file = `budget/weeks/${date}.yay`;
    const doc = tree.exists(file) ? parse(tree.read(file)) : { week_start: week, hosts: {} };
    if (doc.hosts[host]) continue;
    const sum = key => {
      const out = {};
      for (const r of list) out[r[key] ?? (key === 'arc' ? 'unallocated' : 'none')] = (out[r[key] ?? (key === 'arc' ? 'unallocated' : 'none')] ?? 0) + billable(r);
      return out;
    };
    doc.hosts[host] = { rows: list.length, billable: list.reduce((s, r) => s + billable(r), 0), by_arc: sum('arc'), by_pool: sum('pool') };
    doc.billable = Object.values(doc.hosts).reduce((s, h) => s + h.billable, 0);
    doc.by_arc = {};
    for (const h of Object.values(doc.hosts)) for (const [a, n] of Object.entries(h.by_arc)) doc.by_arc[a] = (doc.by_arc[a] ?? 0) + n;
    tree.write(file, stringify(doc));
    notes.push(`usage: host ${host} week ${date} consolidated (${list.length} rows)`);
  }
  return notes;
};

/** A host's own part: drop usage files whose every row a weekly statement already covers. */
export const dropConsolidatedUsage = (hostTree, journalTree, host) => {
  const weeks = journalTree.list('budget/weeks').map(f => parse(journalTree.read(`budget/weeks/${f}`))).filter(w => w.hosts?.[host]);
  const covered = ts => weeks.some(w => Math.floor(Date.parse(ts) / 1000) >= w.week_start && Math.floor(Date.parse(ts) / 1000) < w.week_start + 604800);
  const dropped = [];
  for (const f of hostTree.list('usage')) {
    if (f.endsWith('.yay') && parse(hostTree.read(`usage/${f}`)).rows.every(r => covered(r.ts))) {
      hostTree.remove(`usage/${f}`);
      dropped.push(f);
    }
  }
  return dropped;
};

// --- the service ------------------------------------------------------------------------

export const makeQuiescenceService = ({ shards, host, clock, config = {}, trailer }) => {
  const qc = config.quiescence ?? {};
  const board = shards.shard('quiescence', 'board');
  const edit = (message, fn) =>
    board.land(message, tree => {
      const q = parse(tree.read('quiescence.yay'));
      const b = loadBoard(tree);
      const result = fn(q, b, tree);
      tree.write('quiescence.yay', stringify(q));
      return { result, q };
    });
  const claimedCount = b => Object.values(b.jobs).filter(e => e.where === 'claimed').length;

  return harden({
    status: async () => {
      board.sync();
      const q = parse(board.tree.read('quiescence.yay'));
      return harden({ ...q, waiting: waitingOn(q), claimed: claimedCount(loadBoard(board.tree)) });
    },
    call: async ({ id, hosts, shed, by = host }) => (await edit(`quiescence(${id}) called by ${by}`, q => Object.assign(q, call(q, { id, by, hosts, shed }, clock.now())))).q,
    ack: async report => (await edit(`quiescence ack ${host}`, q => ack(q, host, report ?? {}, clock.now()))).q,
    /** Give up on a host: it stops counting and its claims go back to open. */
    markAbsent: async absent =>
      (await edit(`quiescence: ${absent} absent`, (q, b, tree) => {
        markAbsent(q, absent);
        for (const [id, e] of Object.entries(b.jobs)) if (e.where === 'claimed' && e.host === absent) rules.release(b, id, { by: `quiescence ${q.id}` }, clock.now());
        saveBoard(tree, b);
      })).q,
    advance: async () => (await edit('quiescence advance', (q, b) => advance(q, { claimed: claimedCount(b) }, clock.now()))).result,
    duty: async caughtUp => {
      board.sync();
      return duty(parse(board.tree.read('quiescence.yay')), host, caughtUp);
    },

    /**
     * The leader's work in the truncate phase: consolidate, then truncate
     * every high-churn shard. Dry run unless `apply`; refuses outside the
     * truncate phase, and while any job is claimed.
     */
    truncateAll: async ({ apply = false, branches = ['archive', 'journal', 'board'], rows = {} } = {}) => {
      board.sync();
      const q = parse(board.tree.read('quiescence.yay'));
      if (apply && q.phase !== 'truncate') refuse('wrong-phase', `the quiescence phase is '${q.phase}', not 'truncate'`);
      if (apply && claimedCount(loadBoard(board.tree)) > 0) refuse('claimed', 'jobs are still claimed');
      const now = clock.now();
      const notes = [];
      const fold = async (branch, rule) => {
        const s = shards.shard('consolidate', branch);
        if (apply) await s.land(`consolidate ${branch}`, tree => { const n = rule(tree); notes.push(...n); return n.length ? {} : { skip: true }; });
        else if (s.sync()) { notes.push(...rule(s.tree)); s.sync(); }
      };
      await fold('archive', tree => rollupArchive(tree, now, qc.archive_retention_months ?? 2));
      await fold('journal', tree => rollupEntries(tree, now, qc.journal_retention_months ?? 6));
      for (const [h, hostRows] of Object.entries(rows)) await fold('journal', tree => rollupUsage(tree, h, hostRows.rows, hostRows.weekStart));
      const results = branches.map(b => truncate({ shards, clock, prefix: qc.archive_ref_prefix, trailer }, b, { apply }));
      if (apply && results.every(r => r.ok)) {
        await edit('quiescence: truncated', qq => { qq.truncated = Object.fromEntries(results.map(r => [r.branch, r.next])); });
      }
      return harden({ applied: apply, notes, results });
    },
  });
};
