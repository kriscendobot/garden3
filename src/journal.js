// journal.js — the slow journal.
//
// The prior garden's journal took about 1,900 commits a day, most of them
// telemetry. This one takes at most one commit per host per day: a digest.
// During the day a service or a worker adds a note to a host-local spool (no
// git, no push). Once a day the press writes each finished day's notes as one
// entry, entries/<YYYY>/<MM>/<date>-<host>.md, in one commit, and empties the
// spool. Heartbeats, cursors, usage rows and decision logs are never notes:
// they have their own homes (designs/journal.md).

import { stringifyYaydown } from './yay.js';
import { harden } from './harden.js';

export const makeJournal = ({ files, shards, stateDir, host, clock }) => {
  const spool = files(stateDir).sub('journal-spool');
  return harden({
    /** Add a note to today's spool. `who` is the role or service speaking. */
    note: async (who, text) => {
      const now = clock.now();
      spool.append(`${now.slice(0, 10)}.md`, `## ${now.slice(11, 16)}Z ${who}\n\n${text.trim()}\n\n`);
    },
    /** Days waiting in the spool. */
    pending: async () => spool.list('.').filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).map(f => f.slice(0, 10)),
    /**
     * Write every finished day (with `includeToday`, today as well: used at a
     * quiescence) as one entry each, in a single commit. Returns the days pressed.
     */
    press: async ({ includeToday = false } = {}) => {
      const today = clock.now().slice(0, 10);
      const days = spool.list('.').filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).map(f => f.slice(0, 10)).filter(d => includeToday || d < today);
      if (days.length === 0) return [];
      await shards.shard('journal', 'journal').land(`journal: ${host} ${days[0]}${days.length > 1 ? `..${days[days.length - 1]}` : ''}`, tree => {
        for (const d of days) {
          const file = `entries/${d.slice(0, 4)}/${d.slice(5, 7)}/${d}-${host}.md`;
          const body = spool.read(`${d}.md`);
          const have = tree.readIf(file);
          // A second press of the same day (after a mid-day quiescence) appends.
          tree.write(file, have ? `${have}${body}` : stringifyYaydown({ author: host, created: d, kind: 'digest' }, `# ${d} on ${host}\n\n${body}`));
        }
        return {};
      });
      for (const d of days) spool.remove(`${d}.md`);
      return days;
    },
  });
};
