// shard.js — one git branch with one purpose, written by compare-and-swap.
//
// Everything the garden records lives on a shard (designs/shards.md). A
// writer never commits in a root worktree. It works in its own shallow,
// single-branch clone under <state>/clones/<owner>/<branch>, and lands by a
// plain push: the remote accepting a fast-forward is the compare-and-swap.
//
// Every clone and fetch is shallow (depth 1 by default), the fetch is forced,
// and nothing here reads history, so a shard that was rewritten to a fresh
// root at a quiescence is adopted like any other move.
//
// Ported from the tower's scripts/jobs/common.sh (ensure_clone, sync_clone,
// commit_and_push, retry_land) and the prior garden's shallow seeding.

import { harden, isName } from './harden.js';

export const makeShards = ({ run, files, remote, stateDir, identity, depth = 1, tries = 30, log = () => {}, sleep }) => {
  const url = remote.startsWith('/') ? `file://${remote}` : remote; // git ignores --depth on a bare path
  const state = files(stateDir);
  const git = (cwd, args, opts = {}) => {
    const r = run('git', args, { cwd, ...opts });
    if (r.status !== 0 && !opts.allowFail) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r;
  };

  const shard = (owner, branch) => {
    if (!isName(owner)) throw new Error(`bad clone owner ${owner}`);
    const rel = `clones/${owner}/${branch.replaceAll('/', '--')}`;
    const dir = state.path(rel);
    const tree = files(dir);

    const ensure = () => {
      if (state.exists(`${rel}/.git`)) return;
      state.remove(rel);
      state.mkdir(`clones/${owner}`);
      git(stateDir, ['clone', '--quiet', '--single-branch', '--no-tags', '--depth', String(depth), '--branch', branch, url, dir]);
      git(dir, ['config', 'user.name', identity.name]);
      git(dir, ['config', 'user.email', identity.email]);
      git(dir, ['config', 'gc.auto', '0']);
      git(dir, ['config', 'commit.gpgsign', 'false']);
    };
    const epoch = () => {
      const text = tree.readIf('EPOCH');
      const m = text && /^epoch: (\d+)$/m.exec(text);
      return m ? Number(m[1]) : 0;
    };
    /** Make the clone exactly the remote tip. Returns false when offline. */
    const sync = () => {
      ensure();
      const before = epoch();
      const ref = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
      if (git(dir, ['fetch', '--quiet', '--no-tags', '--depth', String(depth), 'origin', ref], { allowFail: true }).status !== 0) return false;
      git(dir, ['checkout', '--quiet', '--force', '-B', branch, `origin/${branch}`]);
      git(dir, ['reset', '--quiet', '--hard', `origin/${branch}`]);
      git(dir, ['clean', '--quiet', '-fdx']);
      if (epoch() !== before) {
        log(`shard ${branch} moved from epoch ${before} to ${epoch()}; dropping superseded objects`);
        git(dir, ['reflog', 'expire', '--expire=now', '--all'], { allowFail: true });
        git(dir, ['gc', '--quiet', '--prune=now'], { allowFail: true });
      }
      return true;
    };
    /** Commit whatever changed and push. 'landed' | 'lost' | 'nothing'. */
    const push = message => {
      git(dir, ['add', '-A']);
      if (git(dir, ['diff', '--cached', '--quiet'], { allowFail: true }).status === 0) return 'nothing';
      git(dir, ['commit', '--quiet', '-m', message]);
      return git(dir, ['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`], { allowFail: true }).status === 0 ? 'landed' : 'lost';
    };
    /**
     * Sync, run the mutation against the fresh tree, commit and push; on a
     * lost race start over from the new tip. The mutation must re-derive
     * everything from the tree it is given. It may return {skip: true} to
     * change nothing; whatever it returns is the result of a landed attempt.
     * A thrown Refusal aborts and propagates.
     */
    const land = async (message, mutate) => {
      for (let attempt = 0; attempt < tries; attempt += 1) {
        if (!sync()) throw Object.assign(new Error(`cannot reach the remote for ${branch}`), { code: 'offline' });
        const result = await mutate(tree);
        if (result && result.skip) return result;
        const outcome = push(typeof message === 'function' ? message(result) : message);
        if (outcome !== 'lost') return result;
        if (sleep) await sleep(Math.random() * Math.min(2000, 50 * 2 ** attempt));
      }
      throw Object.assign(new Error(`could not land on ${branch} after ${tries} tries`), { code: 'contended' });
    };
    return harden({ branch, dir, tree, sync, push, land, epoch, drop: () => state.remove(`clones/${owner}`), git: (args, opts) => git(dir, args, opts) });
  };

  return harden({
    shard,
    url,
    /** The tip of a branch on the remote, or null. */
    tip: branch => git(stateDir, ['ls-remote', url, `refs/heads/${branch}`]).stdout.split('\t')[0] || null,
    refs: pattern =>
      git(stateDir, ['ls-remote', url, pattern])
        .stdout.split('\n')
        .filter(Boolean)
        .map(l => l.split('\t')[1]),
  });
};
