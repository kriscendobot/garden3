// devpublish.js — publish a branch's packages as dev-* releases, when the
// steward is told to.
//
// endo-but-for-bots designs continuous publishing from `llm`
// (designs/llm-dev-publish.md, not built there). This is the same procedure
// run by hand, through the steward: clone the branch's tip, give each public
// workspace a commit-derived prerelease version, build and pack them with the
// project's own scripts, publish every tarball under the commit's date tag,
// and only when all are present move `dev-latest`. The registry is
// npm.minion.town, whose rules (packages/npm-registry-server/src/
// dev-release.js) and its operator's note are what the versions and tags
// follow: versions <x.y.z+1>-dev.<YYYYMMDDHHMMSS>.g<sha> (the next patch of
// the published version), date tags dev-YYYY-MM-DD, and only
// dev-* tags, which move forward. Design: designs/dev-publish.md.
//
// The publisher token is a key the maintainer sets (keys/registry.yay); it
// reaches npm in a 0600 .npmrc that exists only while the run publishes.

import { harden, refuse } from './harden.js';

const SHARED_TAG = 'dev-latest';
const PLAIN = /^\d+\.\d+\.\d+$/;

/** The release identifier, version suffix and date tag for one commit. */
export const devRelease = (sha, committedAt) => {
  if (!/^[0-9a-f]{40}$/.test(sha)) refuse('invalid', `not a commit id: ${sha}`);
  const stamp = new Date(committedAt).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return harden({ commit: sha, id: `dev.${stamp}.g${sha.slice(0, 7)}`, tag: `dev-${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` });
};

/** The tarball ts-node-pack writes for a package. */
export const tarball = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;

const RUNTIME = ['dependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * Stamp a monorepo's workspaces. `workspaces` is [{location, pkg}]. A public
 * workspace gets the next patch of its version with the release's suffix
 * (2.1.0 becomes 2.1.1-<id>, which sorts above the published 2.1.0), and its
 * workspace: dependencies the stamped versions. One is excluded, with every public workspace that
 * depends on it, when its version is not plain x.y.z or it depends at run
 * time on a private workspace: npm would resolve that to nothing.
 * Returns {manifests, packages, excluded}; manifests are the rewritten
 * package.json objects of the included workspaces, by location.
 */
export const stampWorkspaces = (workspaces, id) => {
  const byName = new Map(workspaces.map(w => [w.pkg.name, w]));
  const isPrivate = name => Boolean(byName.get(name)?.pkg.private);
  const excluded = new Map();
  const internal = (pkg, fields) => fields.flatMap(f => Object.entries(pkg[f] ?? {}).filter(([, spec]) => String(spec).startsWith('workspace:')).map(([dep]) => dep));
  const publics = workspaces.filter(w => !w.pkg.private);
  for (const w of publics) {
    if (!PLAIN.test(w.pkg.version ?? '')) excluded.set(w.pkg.name, `version ${w.pkg.version ?? '(none)'} is not plain x.y.z`);
    else {
      const hidden = internal(w.pkg, RUNTIME).filter(isPrivate);
      if (hidden.length) excluded.set(w.pkg.name, `depends on private ${hidden.join(', ')}`);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const w of publics) {
      if (excluded.has(w.pkg.name)) continue;
      const on = internal(w.pkg, RUNTIME).filter(d => excluded.has(d));
      if (on.length) {
        excluded.set(w.pkg.name, `depends on excluded ${on.join(', ')}`);
        grew = true;
      }
    }
  }
  const included = publics.filter(w => !excluded.has(w.pkg.name));
  const nextPatch = v => v.replace(/^(\d+)\.(\d+)\.(\d+)$/, (_, x, y, z) => `${x}.${y}.${Number(z) + 1}`);
  const version = new Map(included.map(w => [w.pkg.name, `${nextPatch(w.pkg.version)}-${id}`]));
  const manifests = included.map(w => {
    const pkg = structuredClone(w.pkg);
    pkg.version = version.get(pkg.name);
    for (const f of [...RUNTIME, 'devDependencies']) {
      for (const [dep, spec] of Object.entries(pkg[f] ?? {})) {
        if (!String(spec).startsWith('workspace:')) continue;
        if (version.has(dep)) pkg[f][dep] = version.get(dep);
        else delete pkg[f][dep]; // a dev dependency on a private or excluded workspace: not the consumer's
      }
    }
    return { location: w.location, pkg };
  });
  return harden({
    manifests,
    packages: included.map(w => ({ name: w.pkg.name, source_version: w.pkg.version, version: version.get(w.pkg.name) })),
    excluded: [...excluded].map(([name, reason]) => ({ name, reason })).sort((a, b) => a.name.localeCompare(b.name)),
  });
};

/** A build script that does something: not missing, and not a placeholder `exit 0`. */
const builds = pkg => Boolean(pkg.scripts?.build) && !/^\s*(exit 0|true)\s*$/.test(pkg.scripts.build);

/**
 * `garden devpublish`. `files` is makeFiles; `work` a directory outside any
 * checkout (a package.json above it would change how yarn's own code loads)
 * on the same filesystem as its caches. `config` is garden.yay's dev_publish.
 */
export const makeDevPublisher = ({ files, run, env, keys, journal, clock, work, config, log = () => {} }) => {
  const url = config.url ?? `https://github.com/${config.repository}.git`;
  const registry = config.registry.replace(/\/$/, '');
  const root = files(work);
  const bin = root.path('bin');
  const toolEnv = {
    ...env,
    PATH: `${bin}:${env.PATH ?? ''}`,
    COREPACK_HOME: root.path('corepack'),
    YARN_GLOBAL_FOLDER: root.path('yarn-global'),
    YARN_ENABLE_SCRIPTS: 'false',
    npm_config_ignore_scripts: 'true',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };
  const step = (what, cmd, args, opts = {}) => {
    log(`devpublish: ${what}`);
    const r = run(cmd, args, { env: toolEnv, timeoutMs: 30 * 60 * 1000, ...opts });
    if (r.status !== 0) refuse('step-failed', `${what} failed (${cmd} exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-5).join(' | ')}`);
    return r.stdout.trim();
  };

  /** Clone, stamp, build and pack. Leaves the run's directory for publish, or for a look after a failure. */
  const prepare = (ref = config.ref) => {
    root.mkdir('.');
    root.chmod('.', 0o700);
    const runDir = `runs/${clock.now().replace(/[-:.]/g, '')}`;
    const dir = root.path(runDir);
    step(`clone ${config.repository} ${ref}`, 'git', ['clone', '--quiet', '--depth', '1', '--branch', ref, url, dir]);
    const [sha, committedAt] = step('read the commit', 'git', ['-C', dir, 'log', '-1', '--format=%H %cI']).split(' ');
    const release = devRelease(sha, committedAt);
    const tree = root.sub(runDir);
    const patterns = JSON.parse(tree.read('package.json')).workspaces ?? [];
    const locations = (Array.isArray(patterns) ? patterns : patterns.packages ?? []).flatMap(p =>
      p.endsWith('/*') ? tree.list(p.slice(0, -2)).map(d => `${p.slice(0, -2)}/${d}`) : [p],
    ).filter(l => tree.exists(`${l}/package.json`));
    const stamped = stampWorkspaces(locations.map(location => ({ location, pkg: JSON.parse(tree.read(`${location}/package.json`)) })), release.id);
    if (!stamped.packages.length) refuse('nothing', `no public workspace of ${config.repository} at ${sha} can be published`);
    root.mkdir('bin');
    step('put yarn on the path', 'corepack', ['enable', '--install-directory', bin, 'yarn'], { cwd: dir });
    step('install', 'corepack', ['yarn', 'install', '--immutable', '--mode=skip-build'], { cwd: dir });
    for (const m of stamped.manifests) tree.write(`${m.location}/package.json`, `${JSON.stringify(m.pkg, null, 2)}\n`);
    for (const m of stamped.manifests.filter(x => builds(x.pkg))) step(`build ${m.pkg.name}`, 'corepack', ['yarn', 'workspace', m.pkg.name, 'run', 'build'], { cwd: dir });
    step('pack', 'node', ['scripts/pack-all.mjs'], { cwd: dir });
    const missing = stamped.packages.filter(p => !tree.exists(`dist/${tarball(p.name, p.version)}`));
    if (missing.length) refuse('pack-incomplete', `no tarball for ${missing.map(p => p.name).join(', ')}`);
    return { runDir, dir, release, ...stamped };
  };

  /** Run npm with the token in a 0600 .npmrc that lives only for the call. */
  const withToken = async (dirRel, fn) => {
    const token = await keys.read(config.key, 'steward');
    const npmrc = `${dirRel}/.npmrc`;
    root.writeBytes(npmrc, `${registry.replace(/^https?:/, '')}/:_authToken=${token}\n`, 0o600);
    try {
      return await fn(args => run('npm', [...args, '--userconfig', root.path(npmrc), '--registry', registry], { env: toolEnv, cwd: root.path(dirRel), timeoutMs: 5 * 60 * 1000 }));
    } finally {
      root.remove(npmrc);
    }
  };

  const summary = (p, extra = {}) =>
    harden({ repository: config.repository, ref: config.ref, commit: p.release.commit, version_suffix: p.release.id, tag: p.release.tag, packages: p.packages.length, excluded: p.excluded, ...extra });

  return harden({
    /** Who the registry takes the key for. Checks the key and the registry without publishing. */
    whoami: async () => {
      root.mkdir('check');
      root.chmod('.', 0o700);
      return withToken('check', npm => {
        const r = npm(['whoami']);
        if (r.status !== 0) refuse('whoami-failed', `${registry}: ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')}`);
        return r.stdout.trim();
      });
    },

    /** Everything short of publishing: what would go, under which versions and tag, and what is left out and why. */
    plan: async ({ ref } = {}) => {
      const p = prepare(ref);
      root.remove(p.runDir);
      return summary(p, { names: p.packages.map(x => `${x.name}@${x.version}`) });
    },

    /**
     * Publish the branch's tip. Every package goes under the date tag first;
     * a version already there is skipped, so a rerun finishes what a failed
     * run left. `dev-latest` moves only once every package is present.
     */
    publish: async ({ ref, by } = {}) => {
      await keys.read(config.key, 'steward'); // no key, no clone
      const p = prepare(ref);
      const published = [];
      const skipped = [];
      await withToken(p.runDir, async npm => {
        const present = x => npm(['view', `${x.name}@${x.version}`, 'version']).stdout.trim() === x.version;
        for (const x of p.packages) {
          if (present(x)) {
            skipped.push(x.name);
            continue;
          }
          const r = npm(['publish', `./dist/${tarball(x.name, x.version)}`, '--tag', p.release.tag, '--ignore-scripts']);
          if (r.status !== 0) refuse('publish-failed', `${x.name}@${x.version}: ${(r.stderr || r.stdout).trim().split('\n').filter(l => /error/i.test(l)).slice(0, 3).join(' | ')}; rerun to finish (${published.length} published so far)`);
          published.push(x.name);
        }
        const absent = p.packages.filter(x => !present(x));
        if (absent.length) refuse('not-visible', `published but not served: ${absent.map(x => x.name).join(', ')}; ${SHARED_TAG} not moved`);
        for (const x of p.packages) {
          const r = npm(['dist-tag', 'add', `${x.name}@${x.version}`, SHARED_TAG]);
          if (r.status !== 0) refuse('tag-failed', `${SHARED_TAG} for ${x.name}@${x.version}: ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')}`);
        }
      });
      root.remove(p.runDir);
      const result = summary(p, { published: published.length, skipped: skipped.length, [SHARED_TAG]: p.packages.length, by: by ?? null });
      await journal?.note('steward', `dev-publish: ${config.repository} ${config.ref} at ${p.release.commit.slice(0, 12)} to ${registry} as ${p.release.tag} and ${SHARED_TAG}: ${published.length} published, ${skipped.length} already there, ${p.excluded.length} excluded${by ? `; asked by ${by}` : ''}.`);
      return result;
    },
  });
};
