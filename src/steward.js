// steward.js — the only thing in the garden that writes to GitHub.
//
// Small on purpose: acknowledge (a reaction), reply (one comment, once), and
// report a finished job back on the issue that asked for it, in whichever
// repository that was. Every comment
// carries an invisible marker naming what it is about, and before writing one
// the steward looks for that marker, so a repeat (a retry, a second host) is
// recognized instead of posted twice. Only the leader's supervisor runs it.
// Design: designs/watcher.md. A finished job's branch is pushed to the pull
// request it answers before the report is posted (designs/pull-requests.md,
// "After a settled run: publish"); opening a pull request is not here yet.

import { parse, parseYaydown, stringify } from './yay.js';
import { readWatch } from './watcher.js';
import { harden, refuse } from './harden.js';

const marker = key => `<!-- garden:${key} -->`;

/**
 * What a comment says, without front matter. A job's report is a document,
 * with YAY front matter for the garden; a comment on GitHub is only its body.
 */
export const bodyOf = text => {
  if (!text.startsWith('---\n')) return text;
  try {
    return parseYaydown(text).body;
  } catch {
    return text.replace(/^---\n[\s\S]*?\n---\n+/, '');
  }
};
const short = sha => `\`${sha.slice(0, 9)}\``;
const isRepo = s => /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s) && !s.includes('..');
const isBranch = s => /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(s) && !s.includes('..') && !s.endsWith('.lock');

/**
 * The steward's hands on the project mirrors (`<repositories>/<org>-<name>.git`,
 * which the harvest fills): read a commit, keep one under a name, and push a
 * branch. `remote` names where a repository is pushed: GitHub over SSH, since
 * a change to `.github/workflows/` needs a token with the workflow scope, and
 * the bot's key needs none.
 */
export const makeMirrors = ({ run, repositories, remote = repo => `git@github.com:${repo}.git` }) => {
  const git = (project, args, opts = {}) => {
    if (!isRepo(project)) refuse('invalid', `bad project ${project}`);
    return run('git', ['-C', `${repositories}/${project.replace('/', '-')}.git`, ...args], opts);
  };
  return harden({
    tip: (project, ref) => {
      const r = git(project, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return r.status === 0 ? r.stdout.trim() : null;
    },
    contains: (project, ancestor, ref) => git(project, ['merge-base', '--is-ancestor', ancestor, ref]).status === 0,
    keep: (project, ref, sha) => {
      const r = git(project, ['update-ref', ref, sha]);
      if (r.status !== 0) throw new Error(`could not keep ${sha} as ${ref}: ${r.stderr.trim()}`);
    },
    /** Push `ref` to `branch` of `to`, only if it is still at `lease`. Null, or why not. */
    push: (project, { ref, to, branch, lease }) => {
      if (!isRepo(to) || !isBranch(branch)) refuse('invalid', `bad push target ${to} ${branch}`);
      const r = git(project, ['push', '--quiet', `--force-with-lease=refs/heads/${branch}:${lease}`, remote(to), `${ref}:refs/heads/${branch}`], { timeoutMs: 600000 });
      return r.status === 0 ? null : r.stderr.trim() || `git push answered ${r.status}`;
    },
  });
};

/**
 * `github` gives the client for a repository; `home` is the garden's own.
 * With `mirrors`, a finished job's branch is published to its pull request.
 */
export const makeSteward = ({ github, home, board, shards, host, shed = '', mirrors = null, log = () => {} }) => {
  const footer = `\n\n<sub>the garden · host ${host}${shed ? ` · shed ${shed.slice(0, 12)}` : ''}</sub>`;

  /**
   * Push a finished job's branch, `job/<id>/<generation>` in the mirror, to
   * the head of the pull request it answers. A head the garden has not seen
   * (someone pushed while the job ran) is never overwritten: the lease is the
   * head as the mirror holds it, or the job must already contain it. The head
   * it replaces is kept in the mirror under refs/garden/superseded/. Returns a
   * line for the report, or '' when there is nothing to publish.
   */
  const publish = async (repo, number, rec) => {
    if (!mirrors) return '';
    const pr = await github(repo).pull(number);
    if (!pr || pr.state !== 'open') return '';
    const ref = `refs/heads/job/${rec.id}/${rec.generation}`;
    const tip = mirrors.tip(repo, ref);
    if (!tip) return '';
    const branch = `\`${pr.head.ref}\``;
    if (pr.head.sha === tip) return `The job's branch is on ${branch} at ${short(tip)}.`;
    if (!pr.head.repo) return `Not pushed: the pull request's head repository is gone. The job's branch is \`${ref.slice(11)}\` in the garden.`;
    const seen = pr.head.repo === repo ? mirrors.tip(repo, `refs/heads/${pr.head.ref}`) : null;
    if (seen !== pr.head.sha && !mirrors.contains(repo, pr.head.sha, ref)) {
      return `Not pushed: ${branch} is at ${short(pr.head.sha)}, which the garden had not seen when the job ran. The job's branch is \`${ref.slice(11)}\` in the garden.`;
    }
    const kept = `refs/garden/superseded/pr-${number}/${rec.id}`;
    mirrors.keep(repo, kept, pr.head.sha);
    const why = mirrors.push(repo, { ref, to: pr.head.repo, branch: pr.head.ref, lease: pr.head.sha });
    if (why) {
      log(`${rec.id}: not pushed to ${pr.head.repo} ${pr.head.ref}: ${why}`);
      return `Not pushed to ${branch}: ${why.split('\n')[0]}. The job's branch is \`${ref.slice(11)}\` in the garden.`;
    }
    log(`${rec.id}: pushed ${tip.slice(0, 9)} to ${pr.head.repo} ${pr.head.ref}`);
    return `Pushed to ${branch}: ${short(pr.head.sha)} → ${short(tip)}. The head it replaced is kept in the garden as \`${kept}\`.`;
  };

  /** One comment per key on an issue. Returns true if it wrote, false if it was there. */
  const reply = async (repo, number, key, text) => {
    const m = marker(key);
    const gh = github(repo);
    if ((await gh.comments(number)).some(c => c.body.includes(m))) return false;
    await gh.comment(number, `${bodyOf(text).trim()}${footer}\n${m}`);
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
          const pushed = rec.outcome === 'done' ? await publish(repo, p.issue, rec) : '';
          await reply(repo, p.issue, `job:${p.job}`, `${text.trim()}${pushed ? `\n\n${pushed}` : ''}\n\nLevel ${rec.level ?? 0}; cost ${(rec.cost?.tokens ?? 0) + (rec.cost_under?.tokens ?? 0)} tokens.`);
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
