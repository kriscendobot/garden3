// boardService.js — the job board as a service: each method is one landed
// change to the `board` shard (and, for completions, the `archive` shard).
//
// The rules live in board.js; this module only loads a board from a tree of
// YAY files, applies a rule, writes the tree back, and lets the shard's
// compare-and-swap decide. Methods are async and take and return plain data,
// so a caller in another process, or on another machine, can hold this same
// interface (designs/services.md).

import * as rules from './board.js';
import { parse, stringify } from './yay.js';
import { harden, Refusal } from './harden.js';

const DIRS = ['open', 'held', 'failed'];

/** Read a board tree: <where>/<id>.yay and claimed/<host>/<id>.yay. */
export const loadBoard = tree => {
  const jobs = {};
  for (const where of DIRS) {
    for (const f of tree.list(where)) {
      if (f.endsWith('.yay')) jobs[f.slice(0, -4)] = { where, job: parse(tree.read(`${where}/${f}`), f) };
    }
  }
  for (const host of tree.list('claimed')) {
    if (!tree.isDir(`claimed/${host}`)) continue;
    for (const f of tree.list(`claimed/${host}`)) {
      if (f.endsWith('.yay')) jobs[f.slice(0, -4)] = { where: 'claimed', host, job: parse(tree.read(`claimed/${host}/${f}`), f) };
    }
  }
  const q = tree.readIf('quiescence.yay');
  return { jobs, quiescence: q ? parse(q, 'quiescence.yay') : { phase: 'idle' } };
};

const pathOf = (id, e) => (e.where === 'claimed' ? `claimed/${e.host}/${id}.yay` : `${e.where}/${id}.yay`);

/** Write a board back: only files whose content changed are touched. */
export const saveBoard = (tree, board) => {
  const want = new Map(Object.entries(board.jobs).map(([id, e]) => [pathOf(id, e), stringify(e.job)]));
  const have = [...DIRS, 'claimed'].flatMap(d => tree.walk(d).map(f => `${d}/${f}`)).filter(f => f.endsWith('.yay'));
  for (const f of have) if (!want.has(f)) tree.remove(f);
  for (const [f, text] of want) if (tree.readIf(f) !== text) tree.write(f, text);
  for (const d of DIRS) if (!tree.exists(`${d}/.gitkeep`)) tree.write(`${d}/.gitkeep`, '');
};

export const makeBoardService = ({ shards, host, clock, config = {}, owner = 'board', capabilities, budget }) => {
  const lease = {
    windowS: config.worker?.window_seconds ?? rules.LEASE.windowS,
    killAfterS: config.worker?.kill_after_seconds ?? rules.LEASE.killAfterS,
    graceS: config.board?.expiry_grace_seconds ?? rules.LEASE.graceS,
  };
  const board = shards.shard(owner, 'board');
  const archive = shards.shard(owner, 'archive');
  const change = (message, rule) =>
    board.land(message, tree => {
      const b = loadBoard(tree);
      const result = rule(b);
      if (result === false || result === null || result === undefined) return { skip: true, result };
      saveBoard(tree, b);
      return { result };
    });
  const archiveMonth = () => `done/${clock.now().slice(0, 4)}/${clock.now().slice(5, 7)}`;
  const isArchived = id => archive.tree.walk('done').some(f => f.endsWith(`/${id}.yay`));
  const writeArchive = records =>
    archive.land(`archive(${records.map(r => r.id).join(',')})`, tree => {
      const fresh = records.filter(r => !tree.walk('done').some(f => f.endsWith(`/${r.id}.yay`)));
      if (fresh.length === 0) return { skip: true };
      for (const r of fresh) tree.write(`${archiveMonth()}/${r.id}.yay`, stringify(r));
      return {};
    });

  return harden({
    /** Post a job: {id, role, title, body?, arc?, after?, requires?, projects?, plot?, priority?, hold?, source?}. */
    post: async spec => (await change(`post(${spec.id}) ${spec.role}`, b => rules.post(b, { by: host, ...spec }, clock.now()))).result === true,

    /**
     * Claim the next job this host may run; the accepted push is the claim.
     * On a lost race the next candidate is tried, not the same one again.
     * Returns the job record, or null when there is nothing to take.
     */
    claim: async ({ worker, plot } = {}) => {
      const skip = [];
      const has = capabilities ? await capabilities.verifiedSet() : new Set();
      const slate = budget ? await budget.snapshot() : null;
      if (budget && !slate) return null; // an unknown budget fails closed
      for (let i = 0; i < 20; i += 1) {
        if (!board.sync()) throw Object.assign(new Error('board offline'), { code: 'offline' });
        const b = loadBoard(board.tree);
        if (b.quiescence.phase !== 'idle') return null;
        const id = rules.claim(
          b,
          { host, worker, plot, skip, has: t => has.has(t), arcRank: slate?.ranks, admit: slate ? (job, bd) => budget.admits(slate, job, bd).admit : null, lease },
          clock.now(),
        );
        if (!id) return null;
        saveBoard(board.tree, b);
        if (board.push(`claim(${id}) ${host}/${worker}`) === 'landed') return b.jobs[id].job;
        skip.push(id);
      }
      return null;
    },

    /**
     * Take a claimed job off the board. `done` and `withdrawn` write the
     * archive first, keyed by id, and only then leave the board: two branches
     * cannot move in one commit, so the idempotent write goes first and a
     * crash between the two is finished by the next call or the sweep.
     * `failed` keeps the job on the board, blocking its dependents.
     */
    complete: async (id, outcome, { cost, report, generation } = {}) => {
      if (outcome === 'failed') {
        return (await change(`failed(${id})`, b => rules.fail(b, id, { host, generation, cost }, clock.now()))).result;
      }
      if (!board.sync()) throw Object.assign(new Error('board offline'), { code: 'offline' });
      const b = loadBoard(board.tree);
      if (b.jobs[id]) {
        // Fenced first, at the tip: a run whose lease was re-let writes nothing.
        const record = rules.complete(b, id, outcome, { host, generation, cost }, clock.now());
        await writeArchive([report ? { ...record, report } : record]);
        // Fenced again when leaving: the lease may have run out in between.
        // (The archive record, keyed by id, then stands as the job's result,
        // and the sweep removes the successor's claim as already archived.)
        return (await change(`${outcome}(${id})`, bd => {
          if (!bd.jobs[id]) return false;
          if (outcome !== 'withdrawn') rules.complete(structuredClone(bd), id, outcome, { host, generation }, clock.now());
          bd.jobs[id].job.cost = record.cost;
          return rules.leave(bd, id, outcome);
        })).result;
      }
      return false;
    },

    handoff: async (id, plan, { cost, generation } = {}) =>
      (await change(`handoff(${id}) ${plan.steps?.length ?? 0} steps`, b => rules.handoff(b, id, plan, { host, generation, cost, reviewFrom: config.handoff?.review_from ?? 2 }, clock.now()))).result,

    release: async (id, { by = host, cost, generation } = {}) => (await change(`release(${id}) by ${by}`, b => rules.release(b, id, { by, cost, host, generation }, clock.now()))).result,

    /** A superseded run reports what it spent; its result is not accepted. */
    late: async (id, { cost, generation } = {}) => (await change(`late(${id}) generation ${generation}`, b => rules.late(b, id, { host, generation, cost }))).result,

    /** Does this host still hold this job under this generation? (For a host reaping its own zombies.) */
    holds: async (id, generation) => {
      if (!board.sync()) return true; // offline: do not reap on a guess
      const e = loadBoard(board.tree).jobs[id];
      return Boolean(e && e.where === 'claimed' && e.host === host && e.job.claim?.generation === generation);
    },

    /** Back-track a branch. The board moves first here: the records to archive are only known once the subtree is cut. */
    abandon: async (id, { by = host, reason } = {}) => {
      let records = [];
      await change(`abandon(${id}) by ${by}`, b => {
        records = rules.abandon(b, id, { by, reason }, clock.now());
        return records.length > 0;
      });
      if (records.length) await writeArchive(records);
      return records.map(r => r.id);
    },

    sweep: async () => {
      archive.sync();
      const r = await change('sweep', b => {
        const notes = rules.sweep(b, { isArchived, ttlSeconds: config.board?.claim_ttl_seconds ?? 14400, toleranceS: config.board?.clock_tolerance_seconds ?? 300 }, clock.now());
        return notes.length ? notes : false;
      });
      return r.result || [];
    },

    /** A read-only snapshot of the board at the remote tip. */
    read: async () => {
      board.sync();
      return harden(loadBoard(board.tree));
    },
    drop: () => board.drop(),
  });
};

export { Refusal };
