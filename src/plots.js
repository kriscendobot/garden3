// plots.js — plots: competing variants of the working roles.
//
// The shed is the part of the garden that is the same everywhere and changes
// only through the steward, never by a job. A plot is a branch, plot/<name>,
// holding one variant of the genome: the working roles and skills that jobs
// improve as they learn. A job runs on one plot, reads its genome there, and
// may change only that. This is the tower's vestibule and parapets
// (roles/PARAPET.md, scripts/vestibule/), in the garden's words. Design: designs/plots.md.
//
// The tower enforces the wall with a pre-receive hook on its local hub.
// GitHub runs no such hook, so the garden enforces it where the push is made:
// jobs hold no credential, and `land` is the only code that writes a plot.

import { stringify } from './yay.js';
import { harden, refuse, isName } from './harden.js';

/** Parse plots/genome-paths. */
export const genomeEntries = text => text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

export const isGenome = (path, entries) => path === 'plot.yay' || entries.some(e => (e.endsWith('/') ? path.startsWith(e) : path === e));

/**
 * The wall. `changes` is [{path, mode, deleted?}] for one commit; `subject`
 * its first line. Returns the reasons it may not land (none: it may).
 * Ported from the tower's scripts/vestibule/pre-receive.
 */
export const wall = (changes, entries, subject = '') => {
  const problems = [];
  for (const c of changes) {
    const base = c.path.split('/').pop();
    if (!isGenome(c.path, entries)) problems.push(`${c.path}: outside the genome`);
    if (c.mode === '120000') problems.push(`${c.path}: a symbolic link`);
    if (base === 'CLAUDE.md' || base === 'AGENTS.md') problems.push(`${c.path}: an orientation file a harness would auto-load`);
    if (c.mode === '100755' && !c.path.startsWith('scripts/')) problems.push(`${c.path}: executable outside scripts/`);
    if (c.path === 'plot.yay' && !(changes.length === 1 && subject.startsWith('mutation:'))) problems.push('plot.yay: changed other than alone in a commit titled "mutation: ..."');
  }
  return problems;
};

/**
 * `upstream` is config/garden.yay's `upstream`: for `garden`, the prior
 * garden's {url, ref, commit}. The commit is the pin (`ref` says where it
 * was read); moving it is a reviewed change to the config.
 */
export const makePlots = ({ files, run, rootRepo, shards, stateDir, upstream = {}, clock }) => {
  const root = files(rootRepo);
  const state = files(stateDir);
  const git = (args, opts = {}) => {
    const r = run('git', ['-C', rootRepo, ...args], opts);
    if (r.status !== 0 && !opts.allowFail) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const entries = () => genomeEntries(root.read('plots/genome-paths'));

  return harden({
    /**
     * Hold the prior garden at its pinned commit, as refs/upstream/garden in
     * <state>/upstream/garden.git, where a slot's home reads its roles and
     * skills from (designs/upstream.md). Only that commit is fetched, at
     * depth one. Does nothing if it is already held. Returns {commit, fetched}.
     */
    fetchUpstream: async () => {
      const u = upstream.garden ?? refuse('unset', 'config/garden.yay names no upstream.garden');
      if (!/^[0-9a-f]{40}$/.test(u.commit ?? '')) refuse('invalid', 'upstream.garden.commit is a full commit id');
      const bare = state.path('upstream/garden.git');
      const g = (args, opts = {}) => {
        const r = run('git', ['-C', bare, '-c', 'core.hooksPath=/dev/null', ...args], opts);
        if (r.status !== 0 && !opts.allowFail) throw Object.assign(new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`), { code: 'offline' });
        return r.stdout.trim();
      };
      if (!state.exists('upstream/garden.git/HEAD')) {
        state.mkdir('upstream/garden.git');
        g(['init', '--quiet', '--bare']);
      }
      if (g(['rev-parse', '--verify', '--quiet', 'refs/upstream/garden^{commit}'], { allowFail: true }) === u.commit) return harden({ commit: u.commit, fetched: false });
      g(['fetch', '--quiet', '--no-tags', '--depth=1', u.url, u.commit]);
      if (g(['rev-parse', 'FETCH_HEAD^{commit}']) !== u.commit) refuse('not-found', `${u.url} did not give ${u.commit}`);
      g(['update-ref', 'refs/upstream/garden', u.commit]);
      return harden({ commit: u.commit, fetched: true });
    },

    /**
     * Cut a plot: a parentless commit of the shed's genome at `from` plus
     * plot.yay, as the local branch plot/<name>. Refuses to move an existing
     * plot. Returns {plot, commit, files}.
     */
    cut: async (name, { from = 'HEAD', settings = { tier: 'standard' }, trailer } = {}) => {
      if (!isName(name)) refuse('invalid', 'bad plot name');
      if (git(['rev-parse', '--verify', '--quiet', `refs/heads/plot/${name}`], { allowFail: true })) refuse('exists', `plot/${name} already exists`);
      const es = entries();
      const lines = git(['ls-tree', '-r', from]).split('\n').filter(l => l && isGenome(l.split('\t')[1], es) && l.split('\t')[1] !== 'plot.yay');
      const blob = run('git', ['-C', rootRepo, 'hash-object', '-w', '--stdin'], { input: stringify(settings) }).stdout.trim();
      const index = state.path(`tmp/cut-index-${name}`);
      state.mkdir('tmp');
      state.remove(`tmp/cut-index-${name}`);
      const env = { ...process.env, GIT_INDEX_FILE: index };
      git(['update-index', '--index-info'], { env, input: `${[...lines, `100644 blob ${blob}\tplot.yay`].join('\n')}\n` });
      const tree = git(['write-tree'], { env });
      state.remove(`tmp/cut-index-${name}`);
      const commit = git(['commit-tree', tree, '-m', `plot/${name}: cut from the shed at ${git(['rev-parse', '--short', from])}${trailer ? `\n\n${trailer}` : ''}`]);
      git(['update-ref', `refs/heads/plot/${name}`, commit, '']);
      return harden({ plot: name, commit, files: lines.length + 1 });
    },

    /**
     * Land a job's lessons on its plot: the genome files a harvest collected
     * (<state>/harvest/<job>/genome/) become one commit on plot/<name>, if
     * they pass the wall. Returns {landed, paths} or throws a Refusal naming
     * what the wall refused.
     */
    land: async (job, plot) => {
      const dir = `harvest/${job}/genome`;
      const paths = state.walk(dir);
      if (paths.length === 0) return harden({ landed: false, paths: [] });
      const changes = paths.map(p => ({ path: p, mode: state.mode(`${dir}/${p}`) & 0o111 ? '100755' : '100644' }));
      const problems = wall(changes, entries(), `lesson(${job})`);
      if (problems.length) refuse('wall', `plot/${plot} refuses the lessons of ${job}: ${problems.join('; ')}`);
      await shards.shard('plots', `plot/${plot}`).land(`lesson(${job}): ${paths.join(', ')}`, tree => {
        for (const p of paths) tree.write(p, state.read(`${dir}/${p}`));
        return {};
      });
      return harden({ landed: true, paths, at: clock.now() });
    },
  });
};
