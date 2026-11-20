// slots.js — job slots: one account and one home per running job.
//
// A slot is one unix account and one home directory that runs one job at a
// time. Slots are a fixed pool (slot01..slotNN, made by the entrypoint), so
// "an account per job" costs no account churn: dispatch takes a free slot,
// builds its home from nothing, runs the job as that account, carries the
// job's work out, and razes the home before the slot is used again. Design:
// designs/slots.md.
//
// Everything that needs root (killing the account's processes, razing and
// re-owning the home, running as the account under a deadline) is done by the
// warden, a small Rust program this module calls with a SHON request and
// reads a YAY reply from. In `sim` mode no account is involved and the same
// steps run unprivileged, which is how the tests and a rootless host run.

import { parse, stringify } from './yay.js';
import { genomeEntries } from './plots.js';
import { toArgs } from './shon.js';
import { harden, refuse, Refusal, isName } from './harden.js';

// What a job's home must never grow. Each is planted as a read-only regular
// file, so mkdir, git clone and git worktree add at that path fail at once.
export const TOMBSTONES = ['repositories', 'board', 'archive', 'journal', 'library', 'gate', 'plots', 'slots', '.garden-state', '.git'];
const WORKDIRS = ['worktrees', 'scratch', 'outbox'];
// What a job may read and not change: the other plots' genomes and the
// upstream garden's roles and skills, at the commits the steward holds. It
// is not genome, so nothing written there is carried out.
export const REFERENCE = 'reference';
const UPSTREAM_PATHS = ['roles', 'skills'];
const slotName = i => `slot${String(i).padStart(2, '0')}`;
const isSlot = s => /^slot[0-9]{2}$/.test(s);

/**
 * `upstream` is the bare repository holding the prior garden at the commit
 * the steward pinned (`plots.fetchUpstream`), as refs/upstream/garden.
 */
export const makeSlots = ({ files, run, warden, rootRepo, slotsRoot, repositories, stateDir, upstream = null, clock, count = 4, uidBase = 2000, mode = 'users', log = () => {} }) => {
  const slots = files(slotsRoot);
  const state = files(stateDir);
  const git = (args, opts = {}) => {
    const r = run('git', ['-c', 'safe.directory=*', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=always', ...args], opts);
    if (r.status !== 0 && !opts.allowFail) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const ask = request => {
    const r = run(warden, toArgs(request));
    const reply = parse(r.stdout || 'ok: false\ncode: "silent"\nerror: "the warden said nothing"\n');
    if (!reply.ok) throw new Refusal(reply.code, `warden ${request.op}: ${reply.error}`);
    return reply;
  };
  const account = slot => (mode === 'users' ? { uid: uidBase + Number(slot.slice(4)), gid: uidBase + Number(slot.slice(4)) } : {});
  const check = slot => (isSlot(slot) ? slot : refuse('invalid', `bad slot name ${slot}`));
  // What a slot holds is recorded in the steward's state, not in the slot's
  // home: once the home is the job's (0700, the slot account's), the steward
  // cannot read into it until the warden releases it.
  const info = slot => {
    const text = state.readIf(`slots/${check(slot)}.yay`);
    return text ? parse(text) : null;
  };

  const clear = async slot => {
    const r = ask({ op: 'clear', root: slots.root, slot: check(slot), ...(mode === 'users' ? { uid: account(slot).uid } : {}) });
    state.remove(`slots/${slot}.yay`);
    return r;
  };

  /**
   * Unpack one commit's tree into a directory: files only, no .git. With
   * `prefix`, under that path; with `paths`, only those.
   */
  const exportTree = (commit, dir, { repo = rootRepo, prefix, paths = [] } = {}) => {
    const tar = state.path(`tmp/export-${commit.slice(0, 12)}.tar`);
    state.mkdir('tmp');
    git(['-C', repo, 'archive', '--format=tar', '-o', tar, ...(prefix ? [`--prefix=${prefix}`] : []), commit, ...paths]);
    const r = run('tar', ['-xf', tar, '-C', dir]);
    state.remove(`tmp/export-${commit.slice(0, 12)}.tar`);
    if (r.status !== 0) throw new Error(`cannot unpack ${commit}: ${r.stderr}`);
  };

  return harden({
    mode,
    /** The first slot with no job in it, or null. */
    free: async () => {
      for (let i = 1; i <= count; i += 1) if (!info(slotName(i))) return slotName(i);
      return null;
    },
    info: async slot => info(slot),
    /** Slots that hold a job, by what is on disk. */
    occupied: async () => state.list('slots').filter(f => f.endsWith('.yay')).map(f => f.slice(0, -4)).filter(s => isSlot(s) && info(s)),

    /**
     * Build a slot's home for one job, from nothing:
     *  1. clear whatever the slot held;
     *  2. export the shed at `shed` (default: the root's HEAD): files only,
     *     so the job cannot reach the garden's object store through its home;
     *  3. lay the plot's genome over it, replacing the shed's copy of each
     *     genome path outright;
     *  4. plant the tombstones and make worktrees/, scratch/ and outbox/;
     *  5. place the job's record as JOB.yay and record what was laid down in
     *     .slot.yay, which harvest needs to tell the job's changes apart;
     *  6. in users mode, give the home to the slot's account, mode 0700.
     */
    prepare: async (slot, job, plot, shed) => {
      check(slot);
      if (!isName(plot)) refuse('invalid', 'bad plot name');
      if (!isName(job.id)) refuse('invalid', 'bad job id');
      const shedCommit = shed ?? git(['-C', rootRepo, 'rev-parse', 'HEAD']);
      const plotCommit = git(['-C', rootRepo, 'rev-parse', '--verify', '--quiet', `refs/heads/plot/${plot}^{commit}`], { allowFail: true });
      if (!plotCommit) refuse('no-plot', `no plot/${plot} in the root repository`);
      await clear(slot);
      slots.mkdir(slot);
      const home = slots.sub(slot);
      exportTree(shedCommit, home.root);
      const genome = git(['-C', rootRepo, 'ls-tree', '-r', '--name-only', plotCommit]).split('\n').filter(f => f && f !== 'plot.yay');
      for (const top of new Set(genome.map(f => f.split('/').slice(0, 2).join('/')))) home.remove(top);
      exportTree(plotCommit, home.root);
      const reference = { plots: [], upstream: null };
      for (const line of git(['-C', rootRepo, 'for-each-ref', '--format=%(refname:strip=3) %(objectname)', 'refs/heads/plot/']).split('\n').filter(Boolean)) {
        const [name, commit] = line.split(' ');
        if (name === plot || !isName(name)) continue;
        exportTree(commit, home.root, { prefix: `${REFERENCE}/plots/${name}/` });
        reference.plots.push({ plot: name, commit });
      }
      const up = upstream && git(['-C', upstream, 'rev-parse', '--verify', '--quiet', 'refs/upstream/garden^{commit}'], { allowFail: true });
      if (up) {
        const paths = UPSTREAM_PATHS.filter(p => git(['-C', upstream, 'ls-tree', '--name-only', up, p]));
        exportTree(up, home.root, { repo: upstream, prefix: `${REFERENCE}/upstream/garden/`, paths });
        reference.upstream = { commit: up };
      }
      home.write(`${REFERENCE}/reference.yay`, stringify(reference));
      ask({ op: 'plant', root: slots.root, slot, tombstones: TOMBSTONES, dirs: WORKDIRS });
      home.write('JOB.yay', stringify(job));
      state.write(`slots/${slot}.yay`, stringify({ slot, job: job.id, generation: job.claim?.generation ?? 0, plot, shed_commit: shedCommit, plot_commit: plotCommit, prepared_at: clock.now() }));
      if (mode === 'users') ask({ op: 'own', root: slots.root, slot, ...account(slot) });
      log(`prepared ${slot} for ${job.id} on plot ${plot}`);
      return home.root;
    },

    /** Run the job's command in its slot, as its account, until its deadline. */
    run: async (slot, { argv, env = {}, windowS, killAfterS = 30, logFile }) =>
      ask({ op: 'run', root: slots.root, slot: check(slot), argv, env, window_s: windowS, kill_after_s: killAfterS, log: logFile, ...account(slot) }),

    /**
     * Carry a finished job's work out of its slot, before the slot is cleared.
     *
     * Projects: for each checkout under worktrees/<org>/<name>/, uncommitted
     * work is first saved as one commit on wip/<id>/<generation> (the priors'
     * "<base>-wip" save; the job's own branch is not touched). Then
     * job/<id>/<generation> and that wip branch are fetched into the garden's
     * bare repository. The checkout is treated as untrusted: no hooks run, no
     * submodules recurse, and only those two refs are taken, so a job cannot
     * write another job's branch or the project's own. Naming the branches for
     * the claim's generation means a run that was superseded leaves its work
     * beside its successor's, never over it.
     *
     * Genome: files of the plot's genome that differ from what prepare laid
     * down are copied to <state>/harvest/<id>/genome/ for the plot's landing.
     * Outbox: plain files the job left in outbox/ are copied alongside.
     */
    harvest: async slot => {
      const rec = info(slot) ?? refuse('empty', `${slot} holds no job`);
      // The job has ended: whatever its account still runs is killed, and its
      // home comes back to the steward, who can now read it and carry out.
      ask({ op: 'release', root: slots.root, slot, ...(mode === 'users' ? { uid: account(slot).uid } : {}) });
      const home = slots.sub(slot);
      const id = rec.job;
      const gen = rec.generation ?? 0;
      const out = `harvest/${id}`;
      state.remove(out);
      state.mkdir(`${out}/genome`);
      state.mkdir(`${out}/outbox`);
      const projects = [];
      for (const org of home.list('worktrees')) {
        for (const name of home.isDir(`worktrees/${org}`) ? home.list(`worktrees/${org}`) : []) {
          const wt = home.path(`worktrees/${org}/${name}`);
          if (!home.exists(`worktrees/${org}/${name}/.git`)) continue;
          const bare = `${repositories}/${org}-${name}.git`;
          let wip = false;
          if (git(['-C', wt, 'status', '--porcelain'], { allowFail: true })) {
            const index = state.path(`tmp/wip-index-${id}`);
            state.mkdir('tmp');
            state.remove(`tmp/wip-index-${id}`);
            const env = { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'garden', GIT_AUTHOR_EMAIL: 'garden@garden.invalid', GIT_COMMITTER_NAME: 'garden', GIT_COMMITTER_EMAIL: 'garden@garden.invalid' };
            const base = git(['-C', wt, 'rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
            git(['-C', wt, 'add', '-A'], { env });
            const tree = git(['-C', wt, 'write-tree'], { env });
            const commit = git(['-C', wt, 'commit-tree', tree, ...(base ? ['-p', base] : []), '-m', `wip(${id}): uncommitted work saved when the run ended`], { env });
            git(['-C', wt, 'update-ref', `refs/heads/wip/${id}/${gen}`, commit]);
            state.remove(`tmp/wip-index-${id}`);
            wip = true;
          }
          const refs = git(['-C', wt, 'for-each-ref', '--format=%(refname)', `refs/heads/job/${id}/${gen}`, `refs/heads/wip/${id}/${gen}`]).split('\n').filter(Boolean);
          let fetched = 0;
          for (const ref of refs) {
            if (git(['-C', bare, 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', wt, `+${ref}:${ref}`], { allowFail: true }) !== null) fetched += 1;
          }
          projects.push({ project: `${org}/${name}`, branches: fetched, wip });
        }
      }
      // The home is the job's: a symbolic link anywhere on a genome path
      // could point the steward at a file of its own, so such a path is
      // never read, only reported as changed (and so dropped at landing).
      const linked = file => file.split('/').some((_, i, parts) => home.isLink(parts.slice(0, i + 1).join('/')));
      const plain = file => !linked(file) && home.exists(file) && !home.isDir(file);
      const changed = [];
      const planted = git(['-C', rootRepo, 'ls-tree', '-r', '--name-only', rec.plot_commit]).split('\n').filter(f => f && f !== 'plot.yay');
      for (const file of planted) {
        const want = git(['-C', rootRepo, 'rev-parse', `${rec.plot_commit}:${file}`]);
        const have = plain(file) ? git(['hash-object', home.path(file)]) : null;
        if (have === want) continue;
        changed.push(file);
        if (have) state.copyIn(home.path(file), `${out}/genome/${file}`);
      }
      // New files under a genome prefix: a skill the job adopted, say. Not
      // what the plot had, and not the shed's own copy left in place.
      const known = new Set(planted);
      const prefixes = genomeEntries(git(['-C', rootRepo, 'show', `${rec.shed_commit}:plots/genome-paths`])).filter(e => e.endsWith('/'));
      for (const prefix of prefixes) {
        if (linked(prefix.slice(0, -1))) continue;
        for (const rel of home.walk(prefix)) {
          const file = `${prefix}${rel}`;
          if (known.has(file) || !plain(file)) continue;
          const shedBlob = git(['-C', rootRepo, 'rev-parse', '--verify', '--quiet', `${rec.shed_commit}:${file}`], { allowFail: true });
          if (shedBlob && shedBlob === git(['hash-object', home.path(file)])) continue;
          changed.push(file);
          state.copyIn(home.path(file), `${out}/genome/${file}`);
        }
      }
      const outbox = home.list('outbox').filter(f => !home.isDir(`outbox/${f}`));
      for (const f of outbox) state.copyIn(home.path(`outbox/${f}`), `${out}/outbox/${f}`);
      const summary = { job: id, plot: rec.plot, projects, genome_changed: changed, outbox };
      state.write(`${out}/harvest.yay`, stringify(summary));
      return harden(summary);
    },

    clear,
    /** Raze every slot: at boot, and at each quiescence. */
    clearAll: async () => {
      const names = new Set([...Array.from({ length: count }, (_, i) => slotName(i + 1)), ...slots.list('.').filter(isSlot), ...state.list('slots').filter(f => f.endsWith('.yay')).map(f => f.slice(0, -4)).filter(isSlot)]);
      for (const s of names) await clear(s);
      return [...names].sort();
    },
  });
};
