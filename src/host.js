// host.js — what one host does to itself at a quiescence: rejuvenate, verify.
//
// Rejuvenation is how the garden upgrades without a new base image
// (designs/image.md, designs/quiescence.md). The image holds no garden code
// and no tool the garden pins; all of that is refreshed in place here:
//
//   1. the shed: the host's root checkout is fast-forwarded to the commit the
//      quiescence names (never merged, never reset: a checkout that cannot
//      fast-forward is a drift to report, not to paper over);
//   2. capabilities: this host's own set re-resolved to the pins on the new
//      shed, and what it has not used within its policy dropped;
//   3. binaries: the warden is rebuilt from the new shed's source with the
//      pinned Rust toolchain capability, for this host's own architecture;
//   4. scratch: every slot razed, every shard clone dropped (they are
//      re-cloned shallow on first use, on the new epochs);
//   5. the host's own branch: consolidated usage dropped, history truncated.

import { harden, refuse } from './harden.js';
import { truncate, dropConsolidatedUsage } from './quiescence.js';

export const makeHost = ({ files, run, rootRepo, stateDir, host, clock, shards, capabilities, slots, build, log = () => {} }) => {
  const state = files(stateDir);
  const git = (args, allowFail = false) => {
    const r = run('git', ['-C', rootRepo, ...args]);
    if (r.status !== 0 && !allowFail) refuse('git', `git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.status === 0 ? r.stdout.trim() : null;
  };
  /** Fast-forward the root checkout to `commit`. Returns the commit it is now at. */
  const refreshShed = async commit => {
    if (git(['status', '--porcelain', '--untracked-files=no'])) refuse('dirty', 'the root checkout has local changes; rejuvenation will not overwrite them');
    if (git(['symbolic-ref', '--short', 'HEAD'], true) !== 'shed') refuse('not-shed', 'the root checkout is not on the shed branch');
    if (git(['cat-file', '-e', `${commit}^{commit}`], true) === null) {
      if (git(['fetch', '--quiet', 'origin', 'shed'], true) === null) refuse('offline', 'cannot fetch the shed');
    }
    if (git(['merge-base', '--is-ancestor', 'HEAD', commit], true) === null) refuse('diverged', `the root checkout is not an ancestor of ${commit}`);
    git(['merge', '--quiet', '--ff-only', commit]);
    return git(['rev-parse', 'HEAD']);
  };

  return harden({
    refreshShed,
    /** Build this host's binaries (the warden) from the shed, for this host. */
    build: async () => (build ? build() : refuse('no-build', 'this host was assembled with nothing to build')),
    /** The whole of a host's rejuvenation. Returns what to acknowledge with. */
    rejuvenate: async ({ shed, applyTruncation = true } = {}) => {
      const at = await refreshShed(shed);
      // Only this host's own set is refreshed: what it has installed, what it
      // has declared, and the base. Then what it has not used in a while goes.
      const caps = capabilities ? await capabilities.sync() : { ok: true, drift: [] };
      const pruned = capabilities ? await capabilities.prune() : [];
      const built = build ? await build() : null;
      const cleared = slots ? await slots.clearAll() : [];
      state.remove('clones');
      let dropped = [];
      if (shards && shards.tip(`host/${host}`)) {
        const journal = shards.shard('host', 'journal');
        journal.sync();
        await shards.shard('host', `host/${host}`).land('reset: drop consolidated usage', tree => {
          dropped = dropConsolidatedUsage(tree, journal.tree, host);
          return dropped.length ? {} : { skip: true };
        });
        truncate({ shards, clock }, `host/${host}`, { apply: applyTruncation });
      }
      log(`rejuvenated to ${at.slice(0, 12)}: ${cleared.length} slots cleared, ${dropped.length} usage files dropped`);
      return harden({ shed: at, capabilities_ok: caps.ok, drift: caps.drift, pruned, built, cleared, dropped });
    },
    /** The verify phase: nothing is repaired, only reported. */
    verify: async () => {
      const caps = capabilities ? await capabilities.sync({ verifyOnly: true }) : { ok: true, drift: [], pins: {}, digest: '' };
      return harden({ ok: caps.ok, drift: caps.drift, capabilities: caps.pins, digest: caps.digest, shed: git(['rev-parse', 'HEAD']) });
    },
    /** The id of the last quiescence this host completed (a host-local marker). */
    caughtUp: async () => state.readIf('quiescence-caught-up')?.trim() || undefined,
    markCaughtUp: async id => state.write('quiescence-caught-up', `${id}\n`),
  });
};
