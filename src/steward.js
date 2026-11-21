// steward.js — the only thing in the garden that writes to GitHub.
//
// Small on purpose: acknowledge (a reaction), reply (one comment, once), and
// report a finished job back on the issue that asked for it, in whichever
// repository that was. Every comment
// carries an invisible marker naming what it is about, and before writing one
// the steward looks for that marker, so a repeat (a retry, a second host) is
// recognized instead of posted twice. Only the leader's supervisor runs it.
// Design: designs/watcher.md. Publishing branches and pull requests is not
// here yet.

import { parse, stringify } from './yay.js';
import { readWatch } from './watcher.js';
import { harden } from './harden.js';

const marker = key => `<!-- garden:${key} -->`;

/** `github` gives the client for a repository; `home` is the garden's own. */
export const makeSteward = ({ github, home, board, shards, host, shed = '', log = () => {} }) => {
  const footer = `\n\n<sub>the garden · host ${host}${shed ? ` · shed ${shed.slice(0, 12)}` : ''}</sub>`;

  /** One comment per key on an issue. Returns true if it wrote, false if it was there. */
  const reply = async (repo, number, key, text) => {
    const m = marker(key);
    const gh = github(repo);
    if ((await gh.comments(number)).some(c => c.body.includes(m))) return false;
    await gh.comment(number, `${text.trim()}${footer}\n${m}`);
    return true;
  };

  const archived = id => {
    const s = shards.shard('steward', 'archive');
    if (!s.sync()) return null;
    const file = s.tree.walk('done').find(f => f.endsWith(`/${id}.yay`));
    return file ? parse(s.tree.read(`done/${file}`), file) : null;
  };

  return harden({
    /** "I saw this": an eyes reaction on the issue or comment. */
    ack: async (repo, event) => github(repo).react(event, 'eyes'),
    reply,

    /**
     * Report back on the issues whose jobs have ended. The pending list is on
     * the board (watch.yay). A job that handed off is followed to its
     * planner; a finished one is reported once and leaves the list; a failed
     * one is reported once per failure and stays, for a maintainer.
     */
    report: async () => {
      const pending = readWatch(await board.tree()).reports ?? [];
      const did = [];
      const settle = [];
      for (const p of pending) {
        const repo = p.repo ?? home;
        const rec = archived(p.job);
        if (rec?.outcome === 'handed-off') {
          settle.push({ ...p, job: rec.handed_to, was: p.job });
          if (await reply(repo, p.issue, `handoff:${p.job}`, `\`${p.job}\` ran out of time and handed off; \`${rec.handed_to}\` is planning what remains.`)) did.push(`handed-off ${p.job}`);
        } else if (rec) {
          const text = rec.outcome === 'done' ? rec.report || `\`${p.job}\` is done.` : `\`${p.job}\` was ${rec.outcome}${rec.abandon_reason ? `: ${rec.abandon_reason}` : '.'}`;
          await reply(repo, p.issue, `job:${p.job}`, `${text.trim()}\n\nLevel ${rec.level ?? 0}; cost ${(rec.cost?.tokens ?? 0) + (rec.cost_under?.tokens ?? 0)} tokens.`);
          settle.push({ ...p, gone: true });
          did.push(`${rec.outcome} ${p.job}`);
        } else {
          const e = (await board.read()).jobs[p.job];
          // Neither on the board nor in the archive's recent months: it ended
          // long ago and was rolled up. Nothing more will be said about it.
          if (!e) settle.push({ ...p, gone: true });
          if (e?.where === 'failed' && (await reply(repo, p.issue, `failed:${p.job}:${e.job.attempts ?? 0}`, `\`${p.job}\` failed and is waiting for a maintainer: \`@… release ${p.job}\` to try again, \`@… abandon ${p.job}\` to drop it.`))) did.push(`failed ${p.job}`);
        }
      }
      if (settle.length) {
        await board.transact('watch: reports settled', (_b, tree) => {
          const watch = readWatch(tree);
          watch.reports = (watch.reports ?? []).flatMap(r => {
            const s = settle.find(x => (x.was ?? x.job) === r.job && x.issue === r.issue && x.repo === r.repo);
            if (!s) return [r];
            return s.gone ? [] : [{ job: s.job, issue: s.issue, ...(r.repo ? { repo: r.repo } : {}) }];
          });
          tree.write('watch.yay', stringify(watch));
          return true;
        });
      }
      if (did.length) log(`reported: ${did.join(', ')}`);
      return harden(did);
    },
  });
};
