// supervisor.js — the one long-lived process of a host: a loop of ticks.
//
// The prior garden ran some sixty systemd timers, each a script that woke,
// cloned, did one thing and exited. Here one process holds the services and
// each tick asks, in order: is the fleet quiescing, and what is this host's
// part? is the budget fresh? is there upkeep? is there a job and a free slot?
// Leader-only duties (advancing and truncating a quiescence) are gated on the
// journal's hosts.yay; there is no election, as before (designs/hosts.md).

import { harden } from './harden.js';

export const makeSupervisor = ({ host, isLeader, quiescence, hostService, board, budget, dispatcher, journal, capabilities, hostinfo, watcher, steward, clock, log = () => {} }) => {
  let lastPress = '';
  let described = false;
  const shownUnplaceable = new Set();
  /** One tick. Returns what it did, as a short list of words. */
  const tick = async () => {
    const did = [];
    const duty = await quiescence.duty(await hostService.caughtUp());
    if (duty === 'quiesce') {
      // Running jobs end at their own deadlines (wrap-it-up bounds the wait);
      // a host with none acknowledges at once.
      const q = await quiescence.status();
      const mine = Object.values((await board.read()).jobs).filter(e => e.where === 'claimed' && e.host === host).length;
      if (mine === 0) {
        if (journal) await journal.press({ includeToday: true });
        await quiescence.ack({});
        did.push(`quiesced for ${q.id}`);
      } else did.push(`quiescing: ${mine} job(s) still running`);
    } else if (duty === 'rejuvenate') {
      const q = await quiescence.status();
      const r = await hostService.rejuvenate({ shed: q.shed });
      await quiescence.ack({ shed: r.shed });
      described = false;
      did.push(`rejuvenated to ${r.shed.slice(0, 12)}`);
    } else if (duty === 'verify') {
      const v = await hostService.verify();
      await quiescence.ack({ ok: v.ok, capabilities: v.capabilities, drift: v.drift });
      did.push(v.ok ? 'verified' : `drift: ${v.drift.join('; ')}`);
    } else if (duty === 'catch-up') {
      // The fleet resumed without this host. Rejuvenate and verify alone, and
      // only then run: a stale host never claims on an old shed.
      const q = await quiescence.status();
      await hostService.rejuvenate({ shed: q.last.shed });
      const v = await hostService.verify();
      if (v.ok) {
        await hostService.markCaughtUp(q.last.id);
        did.push(`caught up with ${q.last.id}`);
      } else did.push(`cannot catch up: ${v.drift.join('; ')}`);
    }
    if (await isLeader()) {
      const q = await quiescence.status();
      if (q.phase !== 'idle' && q.phase !== 'truncate') {
        const r = await quiescence.advance();
        if (r.moved) did.push('advanced the quiescence');
      } else if (q.phase === 'truncate') {
        const t = await quiescence.truncateAll({ apply: true });
        if (t.results.every(x => x.ok)) await quiescence.advance();
        did.push(`truncated: ${t.results.map(x => `${x.branch}${x.ok ? '' : ' FAILED'}`).join(', ')}`);
      }
    }
    // The deadline watch and the board's upkeep run on every host, whatever
    // the phase and whoever leads: every claim is watched by all, and two
    // sweeps at once are settled by the push (designs/deadlines.md).
    const notes = await board.sweep();
    if (notes.length) did.push(`swept ${notes.length}`);
    if (dispatcher.reap) {
      const reaped = await dispatcher.reap();
      if (reaped.length) did.push(`reaped ${reaped.join(', ')}`);
    }
    if (duty !== 'run') return harden(did);
    // Hearing the maintainers and answering them is the leader's: one host
    // polls GitHub and one host writes there. (Were two to poll, the board's
    // compare-and-swap would still let only one act on each event.)
    if (watcher && (await isLeader())) {
      try {
        for (const x of await watcher.tick()) did.push(`heard: ${x}`);
        for (const x of await steward.report()) did.push(`reported: ${x}`);
      } catch (err) {
        log(`GitHub: ${err.code ?? ''} ${err.message}; the cursor holds and the next tick tries again`);
      }
    }
    await budget.refresh();
    // Say what this host is, once per start and whenever a rejuvenation or an
    // install changed it (publish writes only on a change).
    if (hostinfo && !described) {
      await hostinfo.publish();
      described = true;
    }
    // A job no live host can run is shown, once, rather than left to sit.
    if (hostinfo && (await isLeader())) {
      for (const u of await board.unplaceable(await hostinfo.fleet())) {
        if (shownUnplaceable.has(u.id)) continue;
        shownUnplaceable.add(u.id);
        did.push(`unplaceable ${u.id}`);
        if (journal) await journal.note('supervisor', `\`${u.id}\` cannot be placed: ${u.reason}.`);
      }
    }
    for (;;) {
      const r = await dispatcher.once({ workerId: `${host}-w` });
      if (!r) break;
      did.push(`${r.id}: ${r.outcome}`);
    }
    const today = clock.now().slice(0, 10);
    if (journal && today !== lastPress) {
      const days = await journal.press();
      lastPress = today;
      if (days.length) did.push(`pressed ${days.length} day(s)`);
    }
    return harden(did);
  };

  return harden({
    tick,
    /** Tick forever. A failed tick is logged and the loop goes on. */
    run: async ({ intervalMs = 60000, sleep }) => {
      for (;;) {
        try {
          const did = await tick();
          if (did.length) log(did.join('; '));
        } catch (err) {
          log(`tick failed: ${err.code ?? ''} ${err.message}`);
        }
        await sleep(intervalMs);
      }
    },
  });
};
