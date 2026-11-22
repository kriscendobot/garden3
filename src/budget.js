// budget.js — the weekly envelopes, spend, and admission.
//
// Envelope budgeting, per subscription (a pool). At the start of the week a
// pool's whole planning total sits with the maintainer's discretion. A timed
// release moves it into each arc's envelope in proportion to the arc's share,
// and as the week goes on every envelope's unspent balance tapers into the
// foreman's discretion, which by the week's end holds whatever is left.
// Design: designs/budget.md.
//
//   total        = planning_ceiling × weekly_tokens            (per pool)
//   f            = fraction of the week gone, 0 to 1
//   released(f)  = min(1, f / release_until)
//   taper(f)     = clamp((f − taper_from) / (1 − taper_from))
//   credit(arc)  = total × share(arc) × released(f)
//   credit(maintainer) = total − Σ credit(arc)
//   swept(x)     = taper(f) × max(0, credit(x) − spent(x))     (x: an arc, or the maintainer)
//   available(x) = credit(x) − spent(x) − swept(x)
//   available(foreman) = Σ swept − spent(foreman)
//   billable     = input + output + cache_creation      (cache reads are free)
//
// A job draws on its arc's envelope, or on the maintainer's (arc
// `maintainer`) or the foreman's (arc `foreman`); when its own envelope has no
// room, the foreman's discretion may take it. A share is a fraction of the
// week; shares sum to at most 1, and what they leave stays with the
// maintainer until it tapers to the foreman. Arcs that carry only the older
// relative `throttle` get shares in proportion to it. A claimed job reserves
// a flat amount until it reports. The ledger is fed by cost, never by level.

import { parse, stringify } from './yay.js';
import { harden, refuse, isName } from './harden.js';

const WEEK = 604800;
const seconds = iso => Math.floor(Date.parse(iso) / 1000);

/** The anchor rolled forward in whole weeks to the start of the current week (epoch seconds). */
export const weekStart = (anchorIso, nowIso) => {
  const [a, n] = [seconds(anchorIso), seconds(nowIso)];
  return n < a ? a : a + Math.floor((n - a) / WEEK) * WEEK;
};

/** The envelopes that are not arcs. */
export const RESERVED = harden(['maintainer', 'foreman']);

const clamp = x => Math.min(1, Math.max(0, x));

/** How much of the current week has gone, 0 to 1. */
export const weekFraction = (weekStartSeconds, nowIso) => clamp((seconds(nowIso) - weekStartSeconds) / WEEK);

/** The pool a host draws on: the one that lists it, else the first. */
export const poolOf = (pools, host) => (pools.find(p => (p.hosts ?? []).includes(host)) ?? pools[0])?.pool ?? 'none';

/**
 * One pool's envelopes at fraction `f` of the week. `shares` is {arc: share}
 * for the active arcs; `spent` is {envelope: billable tokens this week}.
 * Returns {envelope: {credit, spent, swept, available}}.
 */
export const envelopes = ({ total, shares, f, spent = {}, releaseUntil = 0.5, taperFrom = 0.5 }) => {
  const released = releaseUntil > 0 ? clamp(f / releaseUntil) : 1;
  const taper = taperFrom < 1 ? clamp((f - taperFrom) / (1 - taperFrom)) : 0;
  const out = {};
  let toArcs = 0;
  let swept = 0;
  const settle = (name, credit) => {
    const used = spent[name] ?? 0;
    const sweep = Math.floor(taper * Math.max(0, credit - used));
    swept += sweep;
    out[name] = { credit: Math.floor(credit), spent: used, swept: sweep, available: Math.floor(credit - used - sweep) };
  };
  for (const [arc, share] of Object.entries(shares)) {
    toArcs += total * share * released;
    settle(arc, total * share * released);
  }
  settle('maintainer', total - toArcs);
  out.foreman = { credit: swept, spent: spent.foreman ?? 0, swept: 0, available: swept - (spent.foreman ?? 0) };
  return harden(out);
};

export const billable = r => (r.input_tokens ?? 0) + (r.output_tokens ?? 0) + (r.cache_creation_tokens ?? 0);

/** The slate: arcs ranked by throttle (ties keep file order), each with its share and cap. */
export const slate = ({ arcs = [], week_start: anchor }, { pools = [] }, ceiling, nowIso) => {
  const poolTokens = pools.reduce((s, p) => s + (p.weekly_tokens ?? 0), 0);
  const total = Math.floor(poolTokens * ceiling);
  const explicit = arcs.some(a => typeof a.share === 'number');
  const rows = arcs.map((a, order) => {
    const status = a.status ?? 'active';
    const active = status === 'active';
    return { arc: a.arc, order, status, throttle: active ? (a.throttle ?? 0) : 0, weight: active ? (explicit ? clamp(a.share ?? 0) : (a.throttle ?? 0)) : 0 };
  });
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  // Explicit shares are fractions of the week (scaled down only if they
  // overrun it); throttles are relative and fill it.
  const scale = explicit ? (sum > 1 ? 1 / sum : 1) : sum > 0 ? 1 / sum : 0;
  rows.sort((x, y) => y.weight - x.weight || x.order - y.order);
  return {
    week_start: weekStart(anchor, nowIso),
    pool_tokens: poolTokens,
    total,
    arcs: rows.map(({ order: _order, weight, ...r }, i) => ({ ...r, rank: i + 1, share: weight * scale, cap: Math.floor(total * weight * scale) })),
  };
};

/**
 * Sum usage rows at or after the week start: by arc, pool, host and
 * envelope, and by envelope within each pool. A row names its envelope when
 * it was drawn from another than its arc's; a row with no pool is the pool
 * its host draws on.
 */
export const spend = (rows, weekStartSeconds, pools = []) => {
  const out = { rows: 0, by_arc: {}, by_pool: {}, by_host: {}, by_envelope: {}, by_pool_envelope: {} };
  for (const r of rows) {
    if (seconds(r.ts) < weekStartSeconds) continue;
    const b = billable(r);
    const pool = r.pool ?? (pools.length ? poolOf(pools, r.host) : 'none');
    const envelope = r.envelope ?? r.arc ?? 'unallocated';
    out.rows += 1;
    for (const [dim, key] of [['by_arc', r.arc ?? 'unallocated'], ['by_pool', pool], ['by_host', r.host ?? 'none'], ['by_envelope', envelope]]) {
      out[dim][key] = (out[dim][key] ?? 0) + b;
    }
    const pe = (out.by_pool_envelope[pool] ??= {});
    pe[envelope] = (pe[envelope] ?? 0) + b;
  }
  return out;
};

/**
 * May this job start now, and from which envelope? {admit, envelope, reason}.
 * Its own envelope first (its arc, or `maintainer` or `foreman`), then the
 * foreman's discretion. An unknown budget fails closed.
 */
export const admits = (snapshot, job, board, reservation) => {
  if (!snapshot?.slate || !snapshot?.pools) return { admit: false, reason: 'no budget snapshot on this host' };
  const pool = snapshot.pools.find(p => p.pool === snapshot.pool);
  if (!pool) return { admit: false, reason: 'this host draws on no pool' };
  const want = job.arc ?? 'unallocated';
  if (!RESERVED.includes(want)) {
    const row = snapshot.slate.arcs.find(a => a.arc === want);
    if (!row) return { admit: false, reason: `arc ${want} is not on the slate` };
    if (row.status !== 'active') return { admit: false, reason: `arc ${want} is ${row.status}` };
  }
  const spentAll = Object.values(pool.envelopes).reduce((s, e) => s + e.spent, 0);
  if (spentAll >= pool.total) return { admit: false, reason: `pool ${pool.pool} has spent its weekly total` };
  const inflight = name => Object.values(board?.jobs ?? {}).filter(e => e.where === 'claimed' && (e.job.envelope ?? e.job.arc ?? 'unallocated') === name).length;
  const room = name => (pool.envelopes[name]?.available ?? 0) - inflight(name) * reservation;
  if (room(want) >= reservation) return { admit: true, envelope: want, reason: `${want}: ${room(want) - reservation} left after` };
  if (want !== 'foreman' && room('foreman') >= reservation) return { admit: true, envelope: 'foreman', reason: `${want} has ${room(want)} left; the foreman's discretion takes it, ${room('foreman') - reservation} left after` };
  return { admit: false, reason: `${want} has ${room(want)} left and the foreman ${room('foreman')}; a job reserves ${reservation}` };
};

export const makeBudgetService = ({ shards, host, clock, config = {} }) => {
  const ceiling = config.budget?.planning_ceiling ?? 0.9;
  const releaseUntil = config.budget?.release_until ?? 0.5;
  const taperFrom = config.budget?.taper_from ?? 0.5;
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

  /** One commit to the journal's config, refused unless `by` is a maintainer. */
  const maintained = async (subject, by, edit) => {
    const s = shards.shard('budget-config', 'journal');
    await s.land(subject, tree => {
      const allowed = parse(tree.read('config/maintainers.yay')).maintainers.map(m => m.toLowerCase());
      if (!allowed.includes(by.toLowerCase())) refuse('not-maintainer', `${by} is not on config/maintainers`);
      edit(tree);
      return {};
    });
    s.drop();
  };

  const self = harden({
    reservation,
    /** Recompute this host's view: the slate from the journal, spend from every host's usage. */
    refresh: async () => {
      if (!journal.sync()) throw Object.assign(new Error('journal offline'), { code: 'offline' });
      const now = clock.now();
      const poolsDoc = parse(journal.tree.read('config/pools.yay'));
      const pools = poolsDoc.pools ?? [];
      const s = slate(parse(journal.tree.read('config/arcs.yay')), poolsDoc, ceiling, now);
      const sp = spend(allRows(), s.week_start, pools);
      const f = weekFraction(s.week_start, now);
      const shares = Object.fromEntries(s.arcs.filter(a => a.status === 'active').map(a => [a.arc, a.share]));
      cached = {
        slate: s,
        spend: sp,
        ranks: Object.fromEntries(s.arcs.map(a => [a.arc, a.rank])),
        week_fraction: f,
        pool: poolOf(pools, host),
        pools: pools.map(p => {
          const total = Math.floor((p.weekly_tokens ?? 0) * ceiling);
          return { pool: p.pool, hosts: p.hosts ?? [], weekly_tokens: p.weekly_tokens ?? 0, total, envelopes: envelopes({ total, shares, f, spent: sp.by_pool_envelope[p.pool] ?? {}, releaseUntil, taperFrom }) };
        }),
        at: now,
      };
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
      const full = { ts: clock.now(), host, ...(cached?.pool && !row.pool ? { pool: cached.pool } : {}), ...row };
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

    /**
     * Set an arc's share of the week, a fraction from 0 to 1. Shares sum to
     * at most 1; the rest stays with the maintainer's discretion until it
     * tapers to the foreman's. Only maintainers set shares.
     */
    setShare: async ({ by, arc, share, summary }) => {
      if (!by) refuse('invalid', 'who is setting the share?');
      if (!isName(arc) || RESERVED.includes(arc)) refuse('invalid', `${arc} cannot be an arc`);
      if (!(typeof share === 'number' && share >= 0 && share <= 1)) refuse('invalid', 'a share is a fraction from 0 to 1');
      await maintained(`share(${arc}) ${share} by ${by}`, by, tree => {
        const doc = parse(tree.read('config/arcs.yay'));
        const stamp = { set_by: by, set_at: clock.now(), ...(summary ? { summary } : {}) };
        const i = doc.arcs.findIndex(a => a.arc === arc);
        if (i >= 0) doc.arcs[i] = { ...doc.arcs[i], share, status: 'active', ...stamp };
        else doc.arcs.push({ arc, share, status: 'active', summary: summary ?? '', ...stamp });
        const sum = doc.arcs.filter(a => (a.status ?? 'active') === 'active').reduce((s, a) => s + (a.share ?? 0), 0);
        if (sum > 1 + 1e-9) refuse('over', `shares would sum to ${sum}; they may not pass 1`);
        tree.write('config/arcs.yay', stringify(doc));
      });
    },

    /** Set a subscription's weekly tokens, and the hosts that draw on it. Only maintainers set pools. */
    setPool: async ({ by, pool, weekly_tokens: weekly, hosts, note }) => {
      if (!by) refuse('invalid', 'who is setting the pool?');
      if (!isName(pool)) refuse('invalid', 'bad pool name');
      if (!(Number.isInteger(weekly) && weekly >= 0)) refuse('invalid', 'weekly_tokens is a whole number');
      await maintained(`pool(${pool}) ${weekly} by ${by}`, by, tree => {
        const doc = parse(tree.read('config/pools.yay'));
        doc.pools ??= [];
        const row = { pool, weekly_tokens: weekly, ...(hosts ? { hosts } : {}), ...(note ? { note } : {}), set_by: by, set_at: clock.now() };
        const i = doc.pools.findIndex(p => p.pool === pool);
        if (i >= 0) doc.pools[i] = { ...doc.pools[i], ...row };
        else doc.pools.push(row);
        tree.write('config/pools.yay', stringify(doc));
      });
    },

    /**
     * Record today's envelopes on the journal, once a day:
     * budget/days/<date>.yay, each pool's credit, spend, sweep and balance by
     * envelope as of now. What is spent is the week's to date; a day's
     * spending is the difference between two days. Kept for publishing.
     */
    recordDay: async () => {
      const snap = cached ?? (await self.refresh());
      const date = snap.at.slice(0, 10);
      const file = `budget/days/${date}.yay`;
      const r = await journal.land(`budget day ${date}`, tree => {
        if (tree.exists(file)) return { skip: true };
        tree.write(file, stringify({
          date,
          at: snap.at,
          week_start: new Date(snap.slate.week_start * 1000).toISOString().replace(/\.\d+Z$/, 'Z'),
          week_fraction: Math.round(snap.week_fraction * 10000) / 10000,
          arcs: snap.slate.arcs.map(a => ({ arc: a.arc, share: a.share, status: a.status })),
          pools: snap.pools.map(p => ({ pool: p.pool, weekly_tokens: p.weekly_tokens, total: p.total, envelopes: p.envelopes })),
        }));
        return {};
      });
      return r?.skip ? null : file;
    },
  });
  return self;
};
