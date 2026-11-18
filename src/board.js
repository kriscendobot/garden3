// board.js — the job board's rules, as pure functions over a board in memory.
//
// No file, no git, no clock: every function takes the board (and the time,
// where it matters) and changes it in place or answers a question about it.
// boardService.js loads a board from the `board` shard, applies one of these,
// and lands the result with a compare-and-swap push. Designs: designs/board.md,
// designs/omega.md.
//
// A board is {jobs: {<id>: {where, host?, job}}}, where `where` is one of
// open, held, claimed, failed, and `job` is the record that is written to
// <where>/[<host>/]<id>.yay.

import { Refusal, refuse, isName } from './harden.js';

export const ZERO_COST = Object.freeze({ tokens: 0, elapsed_s: 0, engagements: 0 });

export const addCost = (a = {}, b = {}) => ({
  tokens: (a.tokens ?? 0) + (b.tokens ?? 0),
  elapsed_s: (a.elapsed_s ?? 0) + (b.elapsed_s ?? 0),
  engagements: (a.engagements ?? 0) + (b.engagements ?? 0),
});

const entries = board => Object.values(board.jobs);
const present = (board, id) => Object.hasOwn(board.jobs, id);
const need = (board, id) => board.jobs[id] ?? refuse('absent', `no job ${id} on the board`);

// --- the dependency graph -----------------------------------------------------

/** Ids of jobs that sit on a dependency cycle (a job that waits on itself). */
export const cycles = board => {
  const after = id => (board.jobs[id]?.job.after ?? []).filter(d => present(board, d));
  const onCycle = [];
  for (const id of Object.keys(board.jobs)) {
    const seen = new Set();
    let frontier = after(id);
    while (frontier.length) {
      const next = [];
      for (const d of frontier) {
        if (!seen.has(d)) {
          seen.add(d);
          next.push(...after(d));
        }
      }
      frontier = next;
    }
    if (seen.has(id)) onCycle.push(id);
  }
  return onCycle.sort();
};

/**
 * Open jobs whose every dependency has left the board. A dependency is
 * satisfied by absence: a finished job is in the archive, and a failed one
 * stays in failed/ and keeps blocking.
 */
export const ready = board =>
  entries(board)
    .filter(e => e.where === 'open' && (e.job.after ?? []).every(d => !present(board, d)))
    .map(e => e.job.id);

// --- omega levels (designs/omega.md) -------------------------------------------
//
// A job's level is structural, never a counter:
//
//   level(J) = max( 0,
//                   level(s) + 1  for every step s that J handed off to,
//                   level(d)      for every other job d that J waits on )
//
// over what is underneath J now: jobs still on the board, and jobs that
// finished (remembered in J's `under` map when they left). A step that was
// abandoned is removed from J's `after`, `steps` and `under`, so a
// back-tracked branch stops contributing and the levels above it can fall.

/** {id: level} for every job on the board. Terminates on a malformed graph. */
export const levels = board => {
  const ids = Object.keys(board.jobs);
  let lv = Object.fromEntries(ids.map(id => [id, 0]));
  // Relaxation from zero: at most n+1 rounds, so a cycle cannot loop forever.
  for (let round = 0; round <= ids.length; round += 1) {
    const next = {};
    for (const id of ids) {
      const { job } = board.jobs[id];
      const steps = job.steps ?? [];
      let level = 0;
      for (const u of Object.values(job.under ?? {})) level = Math.max(level, u.level + (u.step ? 1 : 0));
      for (const d of job.after ?? []) {
        if (present(board, d)) level = Math.max(level, lv[d] + (steps.includes(d) ? 1 : 0));
      }
      next[id] = level;
    }
    const stable = ids.every(id => next[id] === lv[id]);
    lv = next;
    if (stable) break;
  }
  return lv;
};

/** Recompute every level, in either direction. Returns [{id, was, now}]. */
export const recompute = board => {
  const lv = levels(board);
  const changes = [];
  for (const [id, e] of Object.entries(board.jobs)) {
    const was = e.job.level ?? 0;
    if (was !== lv[id]) {
      e.job.level = lv[id];
      changes.push({ id, was, now: lv[id] });
    }
  }
  return changes;
};

// --- cost ------------------------------------------------------------------------
//
// Cost is what an engagement spent, and it never decreases. A record keeps
//   cost        what this job's own runs spent
//   cost_under  the whole cost of every step that has left the board beneath
//               it, finished or abandoned
// so an engagement's cost is cost + cost_under, plus the same for its live
// steps. Abandoning a branch takes it out of the level and leaves it here.

export const treeCost = (board, id, seen = new Set()) => {
  const e = board.jobs[id];
  if (!e || seen.has(id)) return { ...ZERO_COST };
  seen.add(id);
  let total = addCost(e.job.cost, e.job.cost_under);
  for (const s of e.job.steps ?? []) total = addCost(total, treeCost(board, s, seen));
  return total;
};

/** Add one run's cost to a job's own cost. */
export const charge = (board, id, cost = {}) => {
  const { job } = need(board, id);
  job.cost = addCost(job.cost, { ...cost, engagements: (cost.engagements ?? 0) + 1 });
};

/**
 * A job is leaving the board: tell the jobs that wait on it, then remove it.
 * Either way its whole cost moves into its parent's cost_under. `done`: each
 * dependent remembers the level it reached and stops listing it. `abandoned`:
 * each dependent forgets it and lists it under `abandoned`.
 */
export const depart = (board, id, how) => {
  const cost = treeCost(board, id);
  const level = levels(board)[id] ?? 0;
  for (const e of entries(board)) {
    const { job } = e;
    if (!(job.after ?? []).includes(id)) continue;
    const step = (job.steps ?? []).includes(id);
    job.after = job.after.filter(x => x !== id);
    if (job.steps) job.steps = job.steps.filter(x => x !== id);
    if (how === 'done') {
      job.under = { ...(job.under ?? {}), [id]: { level, step } };
    } else {
      if (job.under) delete job.under[id];
      job.abandoned = [...new Set([...(job.abandoned ?? []), id])].sort();
    }
    if (step) job.cost_under = addCost(job.cost_under, cost);
  }
  delete board.jobs[id];
};

// --- operations ------------------------------------------------------------------

const list = (xs, check, what) => {
  const out = [...new Set(xs ?? [])].sort();
  for (const x of out) if (!check(x)) refuse('invalid', `bad ${what} '${x}'`);
  return out;
};

/** Post a job. Returns false when a job with that id is already on the board. */
export const post = (board, spec, now) => {
  if (!isName(spec.id)) refuse('invalid', 'a job id matches [a-z0-9][a-z0-9._-]*');
  if (!isName(spec.role)) refuse('invalid', 'a job needs a role');
  if (!spec.title) refuse('invalid', 'a job needs a title');
  if (present(board, spec.id)) return false;
  const priority = spec.priority ?? 5;
  if (!Number.isInteger(priority) || priority < 0 || priority > 9) refuse('invalid', 'priority is 0-9');
  const job = {
    id: spec.id,
    role: spec.role,
    title: spec.title,
    after: list(spec.after, isName, 'dependency'),
    requires: list(spec.requires, r => isName(r.replace(/^host=/, '')), 'requirement'),
    projects: list(spec.projects, p => /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(p) && !p.includes('..'), 'project'),
    priority,
    level: 0,
    plans: 0,
    attempts: 0,
    posted_at: now,
    posted_by: spec.by ?? 'unknown',
    body: spec.body ?? `${spec.title}\n`,
  };
  for (const k of ['arc', 'plot']) {
    if (spec[k]) {
      if (!isName(spec[k])) refuse('invalid', `bad ${k}`);
      job[k] = spec[k];
    }
  }
  for (const k of ['source', 'origin', 'window_s', 'step_of', 'step_of_plan', 'reviews', 'plans_seen', 'cost_seen', 'planner', 'replaces']) {
    if (spec[k] !== undefined) job[k] = spec[k];
  }
  if (spec.hold) job.hold = { reason: spec.hold, at: now };
  board.jobs[job.id] = { where: spec.hold ? 'held' : 'open', job };
  const bad = cycles(board);
  if (bad.length) {
    delete board.jobs[job.id];
    refuse('cycle', `${job.id} would close a dependency cycle through: ${bad.join(' ')}`);
  }
  recompute(board);
  return true;
};

/**
 * Ready jobs in claim order: the arc's rank on the slate, then leaf-first
 * (lowest level, as the prior garden's promoter ordered), then priority (lower
 * is sooner), then age.
 */
export const order = (board, arcRank = {}) => {
  const key = j => [arcRank[j.arc ?? 'unallocated'] ?? 9999, j.level ?? 0, j.priority ?? 5, j.posted_at ?? '', j.id];
  const cmp = (a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  };
  return ready(board)
    .map(id => board.jobs[id].job)
    .sort(cmp)
    .map(j => j.id);
};

/**
 * Choose and claim the next job a host may run, skipping `skip` (candidates
 * already lost to another host this tick). `has(token)` says whether the host
 * satisfies a requirement; `admit(job, board)` is the budget's verdict.
 * Returns the id, or null when there is nothing this host may take.
 */
export const LEASE = Object.freeze({ windowS: 2400, killAfterS: 30, graceS: 600 });

export const claim = (board, { host, worker, plot, has, admit, arcRank, skip = [], lease = LEASE }, now) => {
  for (const id of order(board, arcRank)) {
    if (skip.includes(id)) continue;
    const e = board.jobs[id];
    const { job } = e;
    if (!(job.requires ?? []).every(t => (t.startsWith('host=') ? t.slice(5) === host : has(t)))) continue;
    if (plot && job.plot && job.plot !== plot) continue;
    if (admit && !admit(job, board)) continue;
    e.where = 'claimed';
    e.host = host;
    // Every claim is a lease with a generation. The generation rises with
    // each claim of the job, and everything the run writes back names it, so
    // a run whose lease was expired and re-let cannot overwrite its
    // successor (designs/deadlines.md). The lease runs to the hard deadline
    // the claimant enforces on itself (window + kill) plus a grace.
    job.generation = (job.generation ?? 0) + 1;
    const windowS = job.window_s ?? lease.windowS;
    const expires = new Date(Date.parse(now) + (windowS + lease.killAfterS + lease.graceS) * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    job.claim = { host, worker, plot: plot ?? job.plot ?? '', at: now, generation: job.generation, window_s: windowS, expires_at: expires };
    job.attempts = (job.attempts ?? 0) + 1;
    return id;
  }
  return null;
};

/**
 * Does this host hold this job under this generation? When `generation` is
 * not given (a caller that predates leases, or a maintainer's tool) only the
 * host is checked.
 */
const holds = (board, id, host, generation) => {
  const e = board.jobs[id];
  return Boolean(e && e.where === 'claimed' && e.host === host && (generation === undefined || e.job.claim?.generation === generation));
};

/** Refuse a write from a run that does not hold the claim it was made under. */
const fence = (board, id, host, generation) => {
  if (holds(board, id, host, generation)) return;
  const e = board.jobs[id];
  if (e && generation !== undefined && (e.job.generation ?? 0) > generation) {
    refuse('superseded', `${id} was re-let as generation ${e.job.generation}; this run held generation ${generation}`);
  }
  refuse('not-held', `${host} does not hold ${id}`);
};

/**
 * A run that was superseded reports what it spent. Its result is not
 * accepted, but its time was really spent: the cost is charged to the job if
 * it is still on the board, and the late run is counted. Returns false when
 * the job has left the board (the usage ledger still has the row).
 */
export const late = (board, id, { host, generation, cost }) => {
  const e = board.jobs[id];
  if (!e) return false;
  charge(board, id, cost);
  e.job.late_runs = [...(e.job.late_runs ?? []), { host, generation }].slice(-5);
  return true;
};

/**
 * Expire every claim whose lease has run out, whoever holds it. The watcher
 * judges by its own clock against the lease written on the board, allowing
 * `toleranceS` for the claimant's clock having been ahead or behind. It does
 * not wait to learn whether the old run is dead: the claim is released, the
 * expiry is counted on the job, and the generation fences whatever the old
 * run may still write. Idempotent; two watchers at once are settled by the
 * push. Returns [{id, host, generation}].
 */
export const expire = (board, { toleranceS = 300, fallbackTtlS = 14400 }, now) => {
  const nowMs = Date.parse(now);
  const expired = [];
  for (const [id, e] of Object.entries(board.jobs)) {
    if (e.where !== 'claimed' || !e.job.claim?.at) continue;
    const { claim: c } = e.job;
    const until = c.expires_at ? Date.parse(c.expires_at) : Date.parse(c.at) + fallbackTtlS * 1000;
    if (!(nowMs > until + toleranceS * 1000)) continue;
    const record = { host: e.host, generation: c.generation ?? null, claimed_at: c.at, expired_at: now };
    e.job.expiries = (e.job.expiries ?? 0) + 1;
    e.job.expired_claims = [...(e.job.expired_claims ?? []), record].slice(-5);
    delete e.job.claim;
    e.where = 'open';
    delete e.host;
    expired.push({ id, host: record.host, generation: record.generation });
  }
  return expired;
};

/** How many expired claims each host has on the jobs now on the board: unreliability, surfaced. */
export const expiriesByHost = board => {
  const out = {};
  for (const e of Object.values(board.jobs)) for (const x of e.job.expired_claims ?? []) out[x.host] = (out[x.host] ?? 0) + 1;
  return out;
};

/**
 * A claimed job, running out of time, hands off. This is the planning event,
 * and it has one shape (designs/omega.md): the job does not name a successor.
 * A **planner** is posted as its parent, to plan the steps that remain all the
 * way to completion and dispatch them as its own children (`plan`).
 *
 *   - The job leaves the board, archived with outcome `handed-off`. Its work
 *     is on its branch; its whole cost moves into the planner's `cost_under`.
 *   - The planner takes the job's place: everything that waited on the job
 *     now waits on the planner, and if the job was a step, the planner is
 *     that step.
 *   - The job is the planner's first underlying tree (`under`), so the
 *     planner's level is the job's plus one at once, and everything above it
 *     is recomputed.
 *
 * So a long run of sequential steps is one planner over a flat set of
 * children, level 1 however many there are; a chain of single successors,
 * each one level deeper than the last, cannot be written.
 *
 * `note` is {reason, done, remaining, steps?}: what the job says of its own
 * state. Returns {planner, record, changes}, or false when this hand-off
 * already landed.
 */
export const handoff = (board, id, note, { host, generation, cost }, now) => {
  const plannerId = `${id}-plan`;
  if (!present(board, id) && board.jobs[plannerId]?.job.replaces === id) return false;
  const e = need(board, id);
  const { job } = e;
  fence(board, id, host, generation);
  if (job.planner) refuse('is-planner', `${id} is a planner: it dispatches steps (plan), or is requeued; it does not hand off`);
  if (present(board, plannerId)) refuse('duplicate', `${plannerId} is already on the board`);
  charge(board, id, cost);
  const level = levels(board)[id] ?? 0;
  const spent = treeCost(board, id);
  const record = archived(job, 'handed-off', now, { handed_to: plannerId, handoff: { reason: note.reason ?? '', elapsed_s: note.elapsed_s ?? null, window_s: note.window_s ?? null } });
  const suggested = Array.isArray(note.steps) && note.steps.length ? `\nThe job suggested these steps:\n${note.steps.map(s => `- ${s.id ?? ''} ${s.title ?? ''}`.trimEnd()).join('\n')}\n` : '';
  post(
    board,
    {
      id: plannerId,
      role: 'planner',
      title: `Plan the rest of: ${job.title}`,
      body:
        `\`${id}\` ran out of time and handed off. Plan the steps that remain, all the way to\n` +
        'completion, and dispatch them as your children. Do not do the work yourself.\n\n' +
        `What was asked:\n\n${job.body ?? job.title}\n` +
        `What it says is done: ${note.done ?? '(not stated)'}\n` +
        `What it says remains: ${note.remaining ?? note.reason ?? '(not stated)'}\n` +
        `Its work is on the branch job/${id}/${job.claim?.generation ?? 0} of each project it checked out.\n${suggested}`,
      projects: job.projects,
      priority: job.priority,
      arc: job.arc,
      source: job.source,
      origin: job.origin,
      step_of: job.step_of,
      step_of_plan: job.step_of_plan,
      by: id,
      planner: true,
      replaces: id,
    },
    now,
  );
  const planner = board.jobs[plannerId].job;
  planner.under = { [id]: { level, step: true } };
  planner.cost_under = spent;
  // The planner takes the job's place in the graph.
  for (const other of entries(board)) {
    const o = other.job;
    if (o.id === plannerId || !(o.after ?? []).includes(id)) continue;
    o.after = [...new Set(o.after.map(x => (x === id ? plannerId : x)))].sort();
    if ((o.steps ?? []).includes(id)) o.steps = [...new Set(o.steps.map(x => (x === id ? plannerId : x)))].sort();
  }
  delete board.jobs[id];
  return { planner: plannerId, record, changes: recompute(board) };
};

/**
 * A planner dispatches the steps it has planned, as its own children. Returns
 * false when this plan already landed (a replay); otherwise {n, changes,
 * review} where review is the id of the accountant's review job posted for a
 * re-plan, if any.
 */
export const plan = (board, id, plan, { host, generation, cost, reviewFrom = 2 }, now) => {
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) refuse('empty', 'a plan needs at least one step');
  const stepIds = plan.steps.map(s => s.id);
  for (const s of stepIds) if (!isName(s)) refuse('invalid', `bad step id '${s}'`);
  const e = need(board, id);
  const { job } = e;
  const landed = (job.plan_log ?? []).flatMap(h => h.steps);
  if (stepIds.every(s => landed.includes(s))) return false;
  fence(board, id, host, generation);
  if (!job.planner) refuse('not-planner', `${id} is not a planner; a job that runs out of time hands off, and a planner is posted to plan the rest`);
  for (const s of stepIds) if (present(board, s)) refuse('duplicate', `step ${s} is already on the board`);
  const before = structuredClone(board.jobs);
  try {
    return planUnchecked(board, id, plan, { cost, reviewFrom }, now);
  } catch (err) {
    board.jobs = before; // a refused plan leaves the board as it was
    throw err;
  }
};

const planUnchecked = (board, id, plan, { cost, reviewFrom }, now) => {
  const e = board.jobs[id];
  const { job } = e;
  const stepIds = plan.steps.map(s => s.id);
  const n = (job.plans ?? 0) + 1;
  for (const s of plan.steps) {
    post(
      board,
      {
        id: s.id,
        role: s.role ?? job.role,
        title: s.title ?? s.id,
        body: s.body,
        after: s.after,
        requires: s.requires,
        projects: s.projects ?? job.projects,
        priority: job.priority,
        arc: job.arc,
        source: job.source,
        by: job.id,
        step_of: job.id,
        step_of_plan: n,
      },
      now,
    );
  }
  charge(board, id, cost);
  job.plans = n;
  job.steps = [...new Set([...(job.steps ?? []), ...stepIds])].sort();
  job.after = [...new Set([...(job.after ?? []), ...stepIds])].sort();
  job.plan_log = [
    ...(job.plan_log ?? []),
    { n, at: now, reason: plan.reason ?? '', elapsed_s: plan.elapsed_s ?? null, window_s: plan.window_s ?? null, steps: stepIds },
  ];
  job.hold = { reason: 'plan', at: now };
  delete job.claim;
  e.where = 'held';
  delete e.host;
  const bad = cycles(board);
  if (bad.length) {
    refuse('cycle', `the plan closes a dependency cycle through: ${bad.join(' ')}`);
  }
  // Re-planning is surfaced, never blocked: from the second plan on, the
  // accountant is asked whether the scope is growing or the engagement is
  // merely not ending (roles/accountant/AGENT.md).
  let review = null;
  if (n >= reviewFrom && !present(board, `review-${id}-p${n}`)) {
    const total = treeCost(board, id);
    review = `review-${id}-p${n}`;
    post(
      board,
      {
        id: review,
        role: 'accountant',
        title: `Review engagement ${id}: plan ${n}`,
        priority: 3,
        arc: job.arc,
        by: 'plan',
        reviews: id,
        plans_seen: n,
        cost_seen: total,
        body:
          `Planner \`${id}\` has dispatched steps ${n} times. The engagement has cost ${total.tokens} tokens ` +
          `over ${total.elapsed_s} s in ${total.engagements} runs so far.\n\n` +
          'Read its record and plan log on the board, weigh the criteria in\n' +
          'roles/accountant/AGENT.md (Re-planning), and report one of: continue,\n' +
          're-scope, or back-track (naming the branch to abandon).\n',
      },
      now,
    );
  }
  return { n, changes: recompute(board), review };
};

/** The record that goes to the archive when a job leaves the board. */
const archived = (job, outcome, now, extra = {}) => {
  const { claim: _claim, hold: _hold, ...rest } = job;
  return { ...rest, outcome, completed_at: now, ...extra };
};

/**
 * Stamp a job's completion and return its archive record, without removing
 * it: the archive is written first, then `leave` takes it off the board.
 * `done` is a worker's to report, and only for a job its own host still
 * holds; `withdrawn` is a maintainer's act and applies in any state.
 */
export const complete = (board, id, outcome, { host, generation, cost }, now) => {
  const e = need(board, id);
  if (outcome !== 'withdrawn') fence(board, id, host, generation);
  if (cost) charge(board, id, cost);
  return archived(e.job, outcome, now);
};

/** Take a completed job off the board. Returns false if it is already gone. */
export const leave = (board, id, outcome) => {
  if (!present(board, id)) return false;
  depart(board, id, outcome === 'withdrawn' ? 'abandoned' : 'done');
  recompute(board);
  return true;
};

/** A run failed terminally: the job stays, in failed/, blocking its dependents. */
export const fail = (board, id, { host, generation, cost }, now) => {
  const e = need(board, id);
  if (e.where === 'failed') return false;
  fence(board, id, host, generation);
  charge(board, id, cost);
  e.job.outcome = 'failed';
  e.job.failed_at = now;
  delete e.job.claim;
  e.where = 'failed';
  delete e.host;
  return true;
};

/**
 * Put a job back in open/: a claimed job whose run ended without a result
 * (its cost charged), or a held or failed job a maintainer has cleared.
 */
export const release = (board, id, { by, cost, host, generation }, now) => {
  const e = need(board, id);
  // A worker requeueing its own run names its generation and is fenced like
  // any other write; a maintainer's release names none.
  if (generation !== undefined) fence(board, id, host, generation);
  if (e.where === 'open') return false;
  if (cost) charge(board, id, cost);
  const { job } = e;
  if (job.hold) {
    job.go_ahead = { by, at: now, cleared: job.hold };
    delete job.hold;
  }
  delete job.claim;
  delete job.outcome;
  delete job.failed_at;
  e.where = 'open';
  delete e.host;
  return true;
};

/**
 * Back-track: abandon a job and everything it handed off to. Returns the
 * archive records, steps before the jobs that spawned them. Each one's cost
 * moves into its parent's cost_under; levels above the branch can fall.
 */
export const abandon = (board, id, { by, reason }, now) => {
  if (!present(board, id)) return [];
  const postOrder = [];
  const walk = (i, seen) => {
    if (!present(board, i) || seen.has(i)) return;
    seen.add(i);
    for (const s of board.jobs[i].job.steps ?? []) walk(s, seen);
    postOrder.push(i);
  };
  walk(id, new Set());
  const records = [];
  for (const j of postOrder) {
    const extra = { abandoned_by: by, abandoned_with: id, ...(reason ? { abandon_reason: reason } : {}) };
    records.push(archived(board.jobs[j].job, 'abandoned', now, extra));
    depart(board, j, 'abandoned');
  }
  recompute(board);
  return records;
};

/**
 * The board's deterministic upkeep. A held job whose hand-off's steps have
 * all left reopens for its closing run; a claim the archive already has is
 * dropped (a completion that crashed between its two pushes); and every
 * claim whose lease has run out is expired (`expire`). Safe to run on every
 * host at once.
 */
export const sweep = (board, { isArchived, ttlSeconds = 14400, toleranceS = 300 }, now) => {
  const notes = [];
  for (const [id, e] of Object.entries(board.jobs)) {
    const { job } = e;
    if (e.where === 'held' && job.hold?.reason === 'plan' && (job.after ?? []).every(d => !present(board, d))) {
      delete job.hold;
      e.where = 'open';
      notes.push(`${id}: steps done; reopened for its closing run`);
    } else if (e.where === 'claimed' && isArchived(id)) {
      depart(board, id, 'done');
      notes.push(`${id}: already archived; stale claim removed`);
    }
  }
  // The deadline watch. It runs during a quiescence too: a host that never
  // acknowledges must not hold the fleet (the leader may also mark it absent).
  for (const x of expire(board, { toleranceS, fallbackTtlS: ttlSeconds }, now)) {
    notes.push(`${x.id}: lease held by ${x.host} (generation ${x.generation}) ran out; released without waiting for the run to stop`);
  }
  if (notes.length) recompute(board);
  return notes;
};

export { Refusal };
