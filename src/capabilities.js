// capabilities.js — software a skill brings into the box on demand.
//
// A capability is capabilities/<name>/capability.yay on the shed: a pinned
// manifest. Nothing it installs is in the image. It is unpacked under
//   <root>/<name>/<version>/     the prefix
//   <root>/bin/<command>         links to the prefix's commands
// and recorded per host in <state>/capabilities/installed.yay, which is what
// a claim consults for a job's `requires`. Design: designs/capabilities.md.
//
// Reproducibility: every source carries a sha256 and is refused without one;
// verification is a list of commands with the output each must print; and the
// record keeps the hash of the manifest a capability was installed from, so a
// host that is behind a pin, or whose install was changed, is detected.

import { parse, stringify } from './yay.js';
import { harden, refuse, isName } from './harden.js';

/** Is this manifest installable on this architecture? Returns a reason, or null. */
export const manifestProblem = (m, name, arch) => {
  if (!m || m.name !== name) return 'the manifest does not name itself';
  if ((m.status ?? 'pinned') !== 'pinned') return `it is marked ${m.status}`;
  if (typeof m.version !== 'string' || !m.version) return 'it has no version';
  const sources = m.sources?.[arch];
  if (!Array.isArray(sources)) return `it has no sources for ${arch}`;
  for (const s of sources) {
    if (typeof s.url !== 'string') return 'a source has no url';
    if (typeof s.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.sha256)) return `the source ${s.url} has no sha256 pin`;
  }
  if (!Array.isArray(m.verify) || m.verify.length === 0) return 'it has no verify step';
  return null;
};

export const makeCapabilities = ({ files, run, sha256File, sha256, clock, arch, root, manifestsDir, stateDir, log = () => {}, env = {} }) => {
  const caps = files(root);
  const manifests = files(manifestsDir);
  const state = files(stateDir);
  const RECORD = 'capabilities/installed.yay';

  const manifest = name => {
    const text = manifests.readIf(`${name}/capability.yay`);
    return text === null ? null : parse(text, `${name}/capability.yay`);
  };
  const manifestSha = name => sha256(manifests.read(`${name}/capability.yay`));
  const record = () => {
    const text = state.readIf(RECORD);
    return text ? parse(text).capabilities : {};
  };
  const pinOf = r => `${r.version}@${r.manifest_sha256.slice(0, 16)}`;
  const writeRecord = capabilities => {
    const verified = Object.entries(capabilities).filter(([, r]) => r.verified).sort(([a], [b]) => (a < b ? -1 : 1));
    const digest = sha256(verified.map(([n, r]) => `${n} ${pinOf(r)}\n`).join(''));
    state.write(RECORD, stringify({ capabilities, digest }));
  };
  const withPath = () => ({ ...env, PATH: `${caps.path('bin')}:${env.PATH ?? '/usr/bin:/bin'}` });
  const subst = (word, prefix) => word.replaceAll('{prefix}', prefix).replaceAll('{root}', caps.root);

  /** Run a manifest's verify steps: each is {run: [argv], expect?: regex over its output}. */
  const verifies = (name, m) => {
    const prefix = caps.path(`${name}/${m.version}`);
    if (!caps.isDir(`${name}/${m.version}`)) return false;
    return m.verify.every(step => {
      const [cmd, ...args] = step.run.map(w => subst(w, prefix));
      let r;
      try {
        r = run(cmd, args, { cwd: prefix, env: withPath(), timeoutMs: 60000 });
      } catch {
        return false;
      }
      return r.status === 0 && (!step.expect || new RegExp(step.expect).test(`${r.stdout}${r.stderr}`));
    });
  };

  const install = async name => {
    if (!isName(name)) refuse('invalid', 'bad capability name');
    const m = manifest(name);
    const problem = m ? manifestProblem(m, name, arch) : 'there is no manifest for it on the shed';
    if (problem) refuse('not-installable', `${name} cannot be installed on ${arch}: ${problem}`);
    const rec = record();
    const msha = manifestSha(name);
    if (rec[name]?.manifest_sha256 === msha && verifies(name, m)) return { name, version: m.version, changed: false };
    for (const dep of m.requires ?? []) await install(dep);

    const stage = `${name}/.stage-${m.version}`;
    caps.remove(stage);
    caps.mkdir(stage);
    const downloads = `${name}/.downloads`;
    caps.remove(downloads);
    caps.mkdir(downloads);
    try {
      m.sources[arch].forEach((src, i) => {
        const file = caps.path(`${downloads}/source-${i}`);
        if (run('curl', ['-fsSL', '--retry', '3', '-o', file, src.url]).status !== 0) refuse('fetch', `cannot fetch ${src.url}`);
        const got = sha256File(file);
        if (got !== src.sha256) refuse('checksum', `${name}: sha256 of ${src.url} is ${got}, the manifest pins ${src.sha256}`);
        if ((src.kind ?? 'tar') === 'tar') {
          const into = caps.path(`${stage}/${src.into ?? ''}`);
          caps.mkdir(`${stage}/${src.into ?? ''}`);
          if (run('tar', ['-xf', file, '-C', into, '--no-same-owner', `--strip-components=${src.strip ?? 0}`]).status !== 0) refuse('unpack', `cannot unpack ${src.url}`);
        } else if (src.kind === 'file') {
          caps.writeBytes(`${stage}/${src.dest}`, caps.readBytes(`${downloads}/source-${i}`), 0o755);
        } else refuse('invalid', `${name}: unknown source kind ${src.kind}`);
      });
      // What a tarball cannot express: commands run in the staging prefix,
      // with files from the manifest's directory copied in first.
      for (const step of m.install ?? []) {
        for (const f of step.files ?? []) caps.write(`${stage}/${f}`, manifests.read(`${name}/${f}`));
        const [cmd, ...args] = step.run.map(w => subst(w, caps.path(stage)));
        if (run(cmd, args, { cwd: caps.path(stage), env: withPath() }).status !== 0) refuse('install', `${name}: install step ${cmd} failed`);
      }
      for (const b of m.bin ?? []) if (!caps.exists(`${stage}/${b}`)) refuse('install', `${name}: the manifest lists bin ${b}, which the install did not provide`);
      caps.remove(`${name}/${m.version}`);
      caps.rename(stage, `${name}/${m.version}`);
    } finally {
      caps.remove(stage);
      caps.remove(downloads);
    }
    for (const b of m.bin ?? []) caps.link(caps.path(`${name}/${m.version}/${b}`), `bin/${b.split('/').pop()}`);
    const verified = verifies(name, m);
    const now = clock.now();
    writeRecord({ ...record(), [name]: { version: m.version, manifest_sha256: msha, installed_at: now, verified, verified_at: now } });
    if (!verified) refuse('unverified', `${name} ${m.version} installed but did not verify; it satisfies no job`);
    for (const v of caps.list(name)) if (v !== m.version) caps.remove(`${name}/${v}`);
    log(`installed ${name} ${m.version}`);
    return { name, version: m.version, changed: true };
  };

  /**
   * Bring this host's capabilities to what the shed pins: everything
   * installed, plus the host's standing set (<state>/capabilities/wanted.yay)
   * and any names given. A moved pin is followed, a broken install repaired,
   * a capability that left the shed removed. With verifyOnly nothing is
   * repaired: drift is only reported (the verify phase of a quiescence).
   * Returns {ok, drift: [..], digest, pins}.
   */
  const sync = async ({ verifyOnly = false, names = [] } = {}) => {
    const wantedText = state.readIf('capabilities/wanted.yay');
    const wanted = wantedText ? parse(wantedText).wanted : [];
    const all = [...new Set([...Object.keys(record()), ...wanted, ...names])].sort();
    const drift = [];
    for (const name of all) {
      const m = manifest(name);
      let rec = record();
      if (!m) {
        if (verifyOnly) drift.push(`${name}: installed, but no longer on the shed`);
        else {
          caps.remove(name);
          const { [name]: _gone, ...rest } = rec;
          writeRecord(rest);
        }
        continue;
      }
      const behind = rec[name]?.manifest_sha256 !== manifestSha(name);
      const good = !behind && verifies(name, m);
      if (good) {
        writeRecord({ ...rec, [name]: { ...rec[name], verified: true, verified_at: clock.now() } });
        continue;
      }
      if (verifyOnly) {
        drift.push(`${name}: ${behind ? 'not installed from the manifest the shed pins' : 'does not verify'}`);
        if (rec[name]) writeRecord({ ...rec, [name]: { ...rec[name], verified: false } });
        continue;
      }
      try {
        if (!behind) caps.remove(name);
        await install(name);
      } catch (err) {
        drift.push(`${name}: ${err.message}`);
      }
      rec = record();
    }
    writeRecord(record());
    const rec = record();
    return harden({
      ok: drift.length === 0,
      drift,
      digest: parse(state.read(RECORD)).digest,
      pins: Object.fromEntries(Object.entries(rec).filter(([, r]) => r.verified).map(([n, r]) => [n, pinOf(r)])),
    });
  };

  return harden({
    install,
    sync,
    /** The capabilities this host has installed and verified. */
    verifiedSet: async () => new Set(Object.entries(record()).filter(([, r]) => r.verified).map(([n]) => n)),
    record: async () => harden(record()),
    /** What do open jobs require that this host lacks? [{name, state}], state installable|unpinned|unknown. */
    demand: async board => {
      const have = new Set(Object.entries(record()).filter(([, r]) => r.verified).map(([n]) => n));
      const need = new Set(Object.values(board.jobs).filter(e => e.where === 'open').flatMap(e => e.job.requires ?? []).filter(r => !r.startsWith('host=')));
      return [...need].filter(n => !have.has(n)).sort().map(name => {
        const m = manifest(name);
        return { name, state: !m ? 'unknown' : manifestProblem(m, name, arch) ? 'unpinned' : 'installable' };
      });
    },
    /** Fill in the sha256 of a manifest's sources by downloading them. The diff is the thing to review. */
    pin: async (name, forArch = arch) => {
      const m = manifest(name);
      if (!m) refuse('invalid', `no manifest for ${name}`);
      const tmp = `${name}/.pin`;
      const out = [];
      for (const src of m.sources[forArch] ?? []) {
        caps.mkdir(name);
        if (run('curl', ['-fsSL', '--retry', '3', '-o', caps.path(tmp), src.url]).status !== 0) refuse('fetch', `cannot fetch ${src.url}`);
        src.sha256 = sha256File(caps.path(tmp));
        out.push(`${src.sha256}  ${src.url}`);
      }
      caps.remove(tmp);
      manifests.write(`${name}/capability.yay`, stringify(m));
      return out;
    },
  });
};
