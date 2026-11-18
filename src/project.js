// project.js — a job's one way to get a project checkout.
//
// `garden-project add <org>/<name> [<ref>]` makes worktrees/<org>/<name>/ in
// the job's home: a checkout that borrows the garden's bare repository for its
// objects (git alternates, read-only) and keeps everything the job writes in
// the home, on a new branch job/<job-id>/<generation>. A job gets one checkout per
// project. Nothing is pushed from here: the job holds no credential for the
// project's remote; its branches are carried out when it ends (slots.js).
//
// This is the tower's "one worktree per job per project", made to work when
// the job is a different account from the owner of the bare repository: a
// linked `git worktree` would need write access to the shared repository, so
// the checkout is its own small repository with the shared one as alternate.

import { parse } from './yay.js';
import { harden, refuse } from './harden.js';

const PROJECT = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const makeProjects = ({ files, run, home, repositories }) => {
  const tree = files(home);
  const git = (args, allowFail = false) => {
    const r = run('git', ['-c', 'safe.directory=*', '-c', 'protocol.file.allow=always', '-c', 'advice.detachedHead=false', ...args]);
    if (r.status !== 0 && !allowFail) refuse('git', `git ${args[0] === '-C' ? args[2] : args[0]} failed: ${r.stderr.trim()}`);
    return r.status === 0 ? r.stdout.trim() : null;
  };
  /** The branch this run's work goes on: job/<id>/<generation of its claim>. */
  const jobBranch = () => {
    const text = tree.readIf('JOB.yay') ?? refuse('not-a-job', `no JOB.yay in ${home}; this is not a job's home`);
    const job = parse(text);
    return `job/${job.id}/${job.claim?.generation ?? 0}`;
  };
  const check = p => (PROJECT.test(p) && !p.includes('..') ? p : refuse('invalid', 'name a project as <org>/<name>'));
  return harden({
    add: async (project, ref) => {
      check(project);
      const branch = jobBranch();
      const bare = `${repositories}/${project.replace('/', '-')}.git`;
      const dest = `worktrees/${project}`;
      if (git(['-C', bare, 'rev-parse', '--git-dir'], true) === null) refuse('no-repository', `the garden holds no repository for ${project}; name it in the job's projects, or ask the steward`);
      if (tree.exists(dest)) refuse('exists', `this job already has its checkout of ${project} at ${tree.path(dest)}`);
      tree.mkdir(`worktrees/${project.split('/')[0]}`);
      git(['clone', '--quiet', '--shared', '--no-checkout', '--no-tags', bare, tree.path(dest)]);
      git(['-C', tree.path(dest), 'remote', 'remove', 'origin']);
      const want = ref ?? git(['-C', bare, 'symbolic-ref', '--short', 'HEAD'], true) ?? 'main';
      const start = git(['-C', bare, 'rev-parse', '--verify', '--quiet', `${want}^{commit}`], true);
      if (!start) {
        tree.remove(dest);
        refuse('no-ref', `no ref ${want} in ${project}`);
      }
      git(['-C', tree.path(dest), 'checkout', '--quiet', '-b', branch, start]);
      return tree.path(dest);
    },
    remove: async project => {
      check(project);
      if (!tree.exists(`worktrees/${project}/.git`)) refuse('absent', `no checkout of ${project}`);
      tree.remove(`worktrees/${project}`);
    },
    list: async () => tree.list('worktrees').flatMap(org => (tree.isDir(`worktrees/${org}`) ? tree.list(`worktrees/${org}`).map(n => `${org}/${n}`) : [])),
  });
};
