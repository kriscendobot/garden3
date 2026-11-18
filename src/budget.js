// budget.js — the weekly slate, spend, and admission.
//
// The model is the prior garden's (set-apportionment.sh, arc-spend.sh,
// usage-meter.sh), restated around one maintainer-set number per arc: its
// throttle, a relative weight of interest. Design: designs/budget.md.
//
//   total      = planning_ceiling × Σ pools[].weekly_tokens
//   cap(arc)   = floor(total × throttle(arc) / Σ throttle(active arcs))
//   spend(arc) = Σ billable tokens of usage rows for the arc since week start
//   billable   = input + output + cache_creation      (cache reads are free)
//   admit      = arc active  and  spend + reserved + reservation ≤ cap
//                and fleet spend < total
//
// `reserved` is a flat reservation for every job of the arc claimed right
// now. The ledger is fed by cost (what runs spent), never by a job's level.

import { parse, stringify } from './yay.js';
import { harden, refuse, isName } from './harden.js';

const WEEK = 604800;
const seconds = iso => Math.floor(Date.parse(iso) / 1000);

/** The anchor rolled forward in whole weeks to the start of the current week (epoch seconds). */
export const weekStart = (anchorIso, nowIso) => {
  const [a, n] = [seconds(anchorIso), seconds(nowIso)];
  return n < a ? a : a + Math.floor((n - a) / WEEK) * WEEK;
};

export const billable = r => (r.input_tokens ?? 0) + (r.output_tokens ?? 0) + (r.cache_creation_tokens ?? 0);

/** The slate: arcs ranked by throttle (ties keep file order), each with its share and cap. */
export const slate = ({ arcs = [], week_start: anchor }, { pools = [] }, ceiling, nowIso) => {
  const poolTokens = pools.reduce((s, p) => s + (p.weekly_tokens ?? 0), 0);
  const total = Math.floor(poolTokens * ceiling);
  const rows = arcs.map((a, order) => {
    const status = a.status ?? 'active';
    return { arc: a.arc, order, status, throttle: status === 'active' ? (a.throttle ?? 0) : 0 };
  });
  const sum = rows.reduce((s, r) => s + r.throttle, 0);
  rows.sort((x, y) => y.throttle - x.throttle || x.order - y.order);
  return {
    week_start: weekStart(anchor, nowIso),
    pool_tokens: poolTokens,
    total,
    arcs: rows.map(({ order: _order, ...r }, i) => ({
      ...r,
      rank: i + 1,
      share: sum > 0 ? r.throttle / sum : 0,
      cap: sum > 0 ? Math.floor((total * r.throttle) / sum) : 0,
    })),
  };
};

/** Sum usage rows at or after the week start, by arc, pool and host. */
export const spend = (rows, weekStartSeconds) => {
  const out = { rows: 0, by_arc: {}, by_pool: {}, by_host: {} };
  for (const r of rows) {
    if (seconds(r.ts) < weekStartSeconds) continue;
    const b = billable(r);
    out.rows += 1;
    for (const [dim, key] of [['by_arc', r.arc ?? 'unallocated'], ['by_pool', r.pool ?? 'none'], ['by_host', r.host ?? 'none']]) {
      out[dim][key] = (out[dim][key] ?? 0) + b;
    }
  }
  return out;
};

/** May this job start now? {admit, reason}. An unknown budget fails closed. */
export const admits = (snapshot, job, board, reservation) => {
  if (!snapshot?.slate || !snapshot?.spend) return { admit: false, reason: 'no budget snapshot on this host' };
  const arc = job.arc ?? 'unallocated';
  const row = snapshot.slate.arcs.find(a => a.arc === arc);
  if (!row) return { admit: false, reason: `arc ${arc} is not on the slate` };
  if (row.status !== 'active') return { admit: false, reason: `arc ${arc} is ${row.status}` };
  const spent = snapshot.spend.by_arc[arc] ?? 0;
  const inflight = Object.values(board?.jobs ?? {}).filter(e => e.where === 'claimed' && (e.job.arc ?? 'unallocated') === arc).length;
  const left = row.cap - spent - inflight * reservation;
  if (left < reservation) return { admit: false, reason: `arc ${arc} has ${left} of ${row.cap} left; a job reserves ${reservation}` };
  const all = Object.values(snapshot.spend.by_arc).reduce((s, x) => s + x, 0);
  if (all >= snapshot.slate.total) return { admit: false, reason: 'the fleet has spent its weekly total' };
  return { admit: true, reason: `arc ${arc}: ${left - reservation} left after` };
};

export const makeBudgetService = ({ shards, host, clock, config = {} }) => {
  const ceiling = config.budget?.planning_ceiling ?? 0.9;
  const reservation = config.budget?.reservation_tokens ?? 2000000;
  const journal = shards.shard('budget', 'journal');
  let cached = null;

  /** Every usage row on every host's own branch. */
  const allRows = () => {
    const rows = [];
    for (const ref of shards.refs('refs/heads/host/*')) {
      const s = shards.shard('budget', ref.replace('refs/heads/', ''));
      if (!s.sync()) continue;
      for (const f of s.tree.list('usage')) if (f.endsWith('.yay')) rows.push(...parse(s.tree.read(`usage/${f}`), f).rows);
    }
    return rows;
  };

  const self = harden({
    reservation,
    /** Recompute this host's view: the slate from the journal, spend from every host's usage. */
    refresh: async () => {
      if (!journal.sync()) throw Object.assign(new Error('journal offline'), { code: 'offline' });
      const s = slate(parse(journal.tree.read('config/arcs.yay')), parse(journal.tree.read('config/pools.yay')), ceiling, clock.now());
      cached = { slate: s, spend: spend(allRows(), s.week_start), ranks: Object.fromEntries(s.arcs.map(a => [a.arc, a.rank])), at: clock.now() };
      return cached;
    },
    snapshot: async () => cached,
    admits: (snapshot, job, board) => admits(snapshot, job, board, reservation),

    /**
     * Append one usage row for a finished run to this host's own branch, so
     * recording spend never contends with the board or with another host. A
     * capture that failed is recorded with source "none", never as zeros.
     */
    recordUsage: async row => {
      if (!row.id) refuse('invalid', 'a usage row needs the job id');
      const full = { ts: clock.now(), host, ...row };
      const file = `usage/${full.ts.slice(0, 10)}.yay`;
      await shards.shard('usage', `host/${host}`).land(`usage(${row.id})`, tree => {
        const have = tree.readIf(file);
        tree.write(file, stringify({ rows: [...(have ? parse(have).rows : []), full] }));
        return {};
      });
      return full;
    },

    /**
     * Set an arc's throttle (or retire it). `by` must be on the journal's
     * maintainers list: this is how a comment on GitHub becomes a change to
     * the slate. One commit per change.
     */
    setThrottle: async ({ by, arc, throttle, summary, retire = false }) => {
      if (!by) refuse('invalid', 'who is setting the throttle?');
      if (!isName(arc)) refuse('invalid', 'bad arc name');
      if (!retire && !(typeof throttle === 'number' && throttle >= 0 && Number.isFinite(throttle))) refuse('invalid', 'a throttle is a non-negative number');
      const s = shards.shard('throttle', 'journal');
      await s.land(`throttle(${arc}) ${retire ? 'retired' : throttle} by ${by}`, tree => {
        const allowed = parse(tree.read('config/maintainers.yay')).maintainers.map(m => m.toLowerCase());
        if (!allowed.includes(by.toLowerCase())) refuse('not-maintainer', `${by} is not on config/maintainers`);
        const doc = parse(tree.read('config/arcs.yay'));
        const stamp = { set_by: by, set_at: clock.now(), ...(summary ? { summary } : {}) };
        const i = doc.arcs.findIndex(a => a.arc === arc);
        if (i >= 0) doc.arcs[i] = { ...doc.arcs[i], ...(retire ? { status: 'retired' } : { throttle, status: 'active' }), ...stamp };
        else doc.arcs.push({ arc, throttle: retire ? 0 : throttle, status: retire ? 'retired' : 'active', summary: summary ?? '', ...stamp });
        tree.write('config/arcs.yay', stringify(doc));
        return {};
      });
      s.drop();
    },
  });
  return self;
};
