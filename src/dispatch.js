// dispatch.js — one job, from claim to cleared slot.
//
// This is the composition the rest of the garden exists for:
//
//   claim -> prepare a slot -> run the worker under its clock -> harvest
//         -> record what it cost -> settle the job on the board
//         -> land its lessons on its plot -> clear the slot
//
// The slot is cleared before the run (by prepare) and after it (here), on
// every path out, so scratch never accumulates. What a run amounted to is
// read from what it left in its outbox (wrapup.js): a report, a hand-off, or
// neither. Design: designs/slots.md, designs/wrap-it-up.md.

import { parse } from './yay.js';
import { clockNote, outcome as classify } from './wrapup.js';
import { scrub } from './keys.js';
import { harden, refuse } from './harden.js';

/**
 * The worker command for a job's tier. A tier names a model (config
 * worker.tiers: {<tier>: {model}}); the model goes in before the command's
 * last word, its prompt. A job with no tier runs on the harness's default.
 * An unknown tier is refused: a job asked to run at the top never runs lower.
 */
export const argvFor = (argv, tiers, tier) => {
  if (!tier) return argv;
  const spec = tiers?.[tier];
  if (!spec?.model) refuse('unknown-tier', `no tier ${tier} in config worker.tiers`);
  return [...argv.slice(0, -1), '--model', spec.model, argv.at(-1)];
};

export const makeDispatcher = ({ board, slots, budget, plots, journal, capabilities, hostinfo, files, clock, config = {}, worker, log = () => {} }) => {
  const defaultWindow = config.worker?.window_seconds ?? 2400;
  const pickPlot = job => job.plot || (config.plots ?? ['alder'])[Math.abs([...job.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % (config.plots ?? ['alder']).length];

  /**
   * Run at most one job. Returns null when there is nothing to claim or no
   * free slot, else {id, outcome, slot, plot, cost}.
   */
  const once = async ({ workerId = 'w1' } = {}) => {
    const slot = await slots.free();
    if (!slot) return null;
    // Install before claiming. If the next job this host would take needs a
    // capability it lacks and could install, install it now, while no lease
    // is running. A failed install is the host's failure, not the job's:
    // nothing was claimed, the job stays open with no attempt counted, and
    // this host stops offering that capability for a while.
    if (capabilities && board.nextNeeds) {
      const next = await board.nextNeeds({});
      if (next && next.missing.length) {
        const got = await capabilities.provide(next.missing);
        if (!got.ok) log(`could not install ${got.failed.name} for ${next.id}: ${got.failed.reason}; the job stays open`);
        else log(`installed ${got.installed.join(', ')} for ${next.id}`);
        if (hostinfo) await hostinfo.publish().catch(() => {});
      }
    }
    // The harness's login, lent access-only (keys.lend). Without one there is
    // nothing to run a job with, so none is claimed.
    let lent = null;
    if (worker.lend) {
      try {
        lent = await worker.lend();
      } catch (err) {
        log(`no login to lend a job (${err.code ?? ''} ${err.message}); not claiming`);
        return null;
      }
    }
    const job = await board.claim({ worker: workerId });
    if (!job) return null;
    if (capabilities) await capabilities.used((job.requires ?? []).filter(t => !t.startsWith('host=')));
    const plot = pickPlot(job);
    const { generation } = job.claim;
    const windowS = job.window_s ?? defaultWindow;
    const started = Date.parse(clock.now());
    // A lent login cannot be refreshed by the job: it must outlast the whole
    // window, or the job would lose it part way. Give the job back and wait
    // for the steward's login to be refreshed (the operator's session does).
    if (lent && Date.parse(lent.expires_at) < started + (windowS + (worker.killAfterS ?? 30) + 60) * 1000) {
      log(`${job.id}: the login expires at ${lent.expires_at}, inside this job's ${windowS}s window; given back until it is refreshed`);
      await board.release(job.id, { generation }).catch(() => {});
      return null;
    }
    let result = { status: 1, timed_out: false, elapsed_s: 0 };
    let home;
    try {
      const deadlineEpoch = Math.floor(started / 1000) + windowS;
      const deadlineIso = new Date(deadlineEpoch * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
      // The prompt and the hook's state are laid by prepare: once the home
      // is the slot account's, the steward cannot write into it.
      const prompt = `Read roles/COMMON.md, then roles/PLOT.md and roles/${job.role}/AGENT.md, then do the job in JOB.yay.\n\n${clockNote({ id: job.id, windowS, deadlineIso, planner: Boolean(job.planner) })}\n`;
      home = await slots.prepare(slot, job, plot, undefined, lent ? [lent] : [], { files: [{ file: 'PROMPT.md', text: prompt }], dirs: ['.hook-state'] });
      const tree = files(home);
      // The worker's environment is built from nothing: its clock, where
      // things are, and no key (keys.js). The harness gets its credential
      // through the worker command's own helper.
      const env = {
        ...scrub(worker.env ?? {}),
        HOME: home,
        GARDEN_JOB_HOME: home,
        GARDEN_JOB_ID: job.id,
        GARDEN_PLOT: plot,
        GARDEN_REPOSITORIES: worker.repositories,
        GARDEN_WINDOW_S: String(windowS),
        GARDEN_DEADLINE_EPOCH: String(deadlineEpoch),
        GARDEN_HOOK_STATE: tree.path('.hook-state'),
      };
      result = await slots.run(slot, { argv: argvFor(worker.argv, worker.tiers, job.tier), env, windowS, killAfterS: worker.killAfterS ?? 30, logFile: worker.logFile(job.id) });
    } catch (err) {
      log(`${job.id}: could not run: ${err.message}`);
    }

    // Whatever happened, carry the work out, then settle.
    let harvest = { projects: [], genome_changed: [], outbox: [] };
    let handoff = null;
    let report = null;
    if (home && (await slots.info(slot))) {
      const tree = files(home);
      try {
        const text = tree.readIf('outbox/handoff.yay');
        handoff = text ? parse(text, 'outbox/handoff.yay') : null;
      } catch (err) {
        log(`${job.id}: its hand-off is not YAY (${err.message}); treated as none`);
      }
      report = tree.readIf('outbox/report.md');
      harvest = await slots.harvest(slot, { secrets: lent ? [lent.secret] : [] });
      if (harvest.refused?.length) {
        log(`${job.id}: refused to carry out what holds its lent login: ${harvest.refused.join(', ')}`);
        if (journal) await journal.note('dispatch', `\`${job.id}\` left its lent login in ${harvest.refused.length} thing(s) it made; they were not carried out.`);
      }
    }
    const kind = classify({ timedOut: result.timed_out, status: result.status, handoff, report });
    const usage = worker.usage ? await worker.usage(job.id) : { source: 'none' };
    const cost = { tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_tokens ?? 0), elapsed_s: result.elapsed_s ?? 0 };
    if (budget) await budget.recordUsage({ id: job.id, arc: job.arc, ...(job.envelope && job.envelope !== (job.arc ?? 'unallocated') ? { envelope: job.envelope } : {}), role: job.role, level: job.level, outcome: kind, elapsed_s: cost.elapsed_s, ...usage });

    // Every write back names the generation this run was claimed under. If
    // the lease ran out and the job was re-let, the board refuses them all:
    // the result stays where harvest put it (branches named for the
    // generation), nothing of the successor's is touched, and only the cost
    // is recorded (designs/deadlines.md).
    let superseded = false;
    try {
      if (kind === 'done') await board.complete(job.id, 'done', { cost, report, generation });
      else if (kind === 'handoff' && job.planner) await board.plan(job.id, { elapsed_s: cost.elapsed_s, window_s: windowS, ...handoff }, { cost, generation });
      else if (kind === 'handoff') await board.handoff(job.id, { elapsed_s: cost.elapsed_s, window_s: windowS, ...handoff }, { cost, generation });
      else if (kind === 'overrun') await board.release(job.id, { cost, generation });
      else await board.complete(job.id, 'failed', { cost, generation });
    } catch (err) {
      if (err.code === 'superseded' || err.code === 'not-held' || err.code === 'absent') {
        superseded = true;
        log(`${job.id}: this run (generation ${generation}) was superseded; its result is set aside, not applied`);
        await board.late(job.id, { cost, generation }).catch(() => {});
      } else {
        // A refused hand-off (a cycle, a duplicate step): the work is saved
        // in wip/ and the job is requeued rather than lost.
        log(`${job.id}: could not settle as ${kind} (${err.code ?? err.message}); requeued`);
        await board.release(job.id, { cost, generation }).catch(() => {});
      }
    }
    let lessons = { landed: false, paths: [] };
    if (plots && harvest.genome_changed.length && !superseded) {
      lessons = await plots.land(job.id, plot).catch(err => {
        log(`${job.id}: lessons not landed: ${err.message}`);
        return { landed: false, paths: [], refused: err.message };
      });
    }
    if (journal && kind !== 'done') await journal.note('dispatch', `\`${job.id}\` ended as ${kind} after ${cost.elapsed_s}s on plot ${plot}.`);
    await slots.clear(slot);
    return harden({ id: job.id, outcome: superseded ? 'superseded' : kind, slot, plot, cost, harvest, lessons });
  };

  /**
   * Reap this host's own zombies: a slot still holding a job whose claim this
   * host no longer has (it crashed, slept or lost the network, and the lease
   * was expired meanwhile) is cleared, processes and all. Run at start-up and
   * on every tick; prepare clears a slot before use in any case.
   */
  const reap = async () => {
    const reaped = [];
    for (const slot of await slots.occupied()) {
      const info = await slots.info(slot);
      if (info && !(await board.holds(info.job, info.generation))) {
        await slots.clear(slot);
        reaped.push(`${slot} (${info.job}, generation ${info.generation})`);
      }
    }
    return reaped;
  };

  return harden({ once, reap });
};
