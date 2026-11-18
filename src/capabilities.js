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

/** The policy a host is under when it has written none: install what jobs need, forget what it has not used in a month. */
export const DEFAULT_POLICY = Object.freeze({ install_on_demand: true, forbid: [], unused_days: 30, retry_failed_after_seconds: 3600 });

export const makeCapabilities = ({ files, run, sha256File, sha256, clock, arch, root, manifestsDir, stateDir, base = [], log = () => {}, env = {} }) => {
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
      return r.status === 0 && (!step.expect || new RegExp(step.expect, 'm').test(`${r.stdout}${r.stderr}`));
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
  const sync = async ({ verifyOnly = false, names: asked = [] } = {}) => {
    const wantedText = state.readIf('capabilities/wanted.yay');
    const wanted = wantedText ? parse(wantedText).wanted : [];
    // This host's own set: what it has, what it has declared, the base every
    // host needs, and anything asked for now. Never the fleet's.
    const all = [...new Set([...Object.keys(record()), ...wanted, ...base, ...asked])].sort();
    const drift = [];
    for (const name of all) {
      const m = manifest(name);
      let rec = record();
      // An install that failed and was never completed is not something this
      // host has; `provide` retries it when a job next needs it.
      if (rec[name]?.failed_at && !rec[name].installed_at && !asked.includes(name)) continue;
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

  const policy = () => {
    const text = state.readIf('capabilities/policy.yay');
    return { ...DEFAULT_POLICY, ...(text ? parse(text) : {}) };
  };
  const names = () => manifests.list('.').filter(n => manifests.exists(`${n}/capability.yay`));
  const seconds = iso => Math.floor(Date.parse(iso) / 1000);

  /**
   * What this host could install, on its own architecture, under its own
   * policy: {name: 'installed' | 'available' | <the reason it is not>}. A
   * capability with no pinned artefact for this architecture is not
   * available here, whatever other hosts can do; one whose install failed
   * recently is not offered again until the retry time has passed.
   */
  const availability = () => {
    const pol = policy();
    const rec = record();
    const now = seconds(clock.now());
    return Object.fromEntries(names().map(name => {
      if (rec[name]?.verified) return [name, 'installed'];
      if (pol.forbid.includes(name)) return [name, "forbidden by this host's policy"];
      if (!pol.install_on_demand && !base.includes(name)) return [name, 'this host installs nothing on demand'];
      const problem = manifestProblem(manifest(name), name, arch);
      if (problem) return [name, problem];
      const failed = rec[name]?.failed_at;
      if (failed && now - seconds(failed) < pol.retry_failed_after_seconds) return [name, `its install failed at ${failed}`];
      return [name, 'available'];
    }));
  };

  return harden({
    install,
    sync,
    /**
     * Record a capability that is already unpacked at its pinned version and
     * verifies, without fetching it again. For the one capability that must
     * exist before this code can run: the entrypoint fetches node itself,
     * against the same pin, and then tells the record so.
     */
    adopt: async name => {
      const m = manifest(name) ?? refuse('not-installable', `there is no manifest for ${name}`);
      const problem = manifestProblem(m, name, arch);
      if (problem) refuse('not-installable', `${name}: ${problem}`);
      if (!verifies(name, m)) refuse('unverified', `${name} ${m.version} is not unpacked here, or does not verify`);
      for (const b of m.bin ?? []) caps.link(caps.path(`${name}/${m.version}/${b}`), `bin/${b.split('/').pop()}`);
      const now = clock.now();
      const rec = record();
      writeRecord({ ...rec, [name]: { installed_at: now, ...(rec[name] ?? {}), version: m.version, manifest_sha256: manifestSha(name), verified: true, verified_at: now } });
      return harden({ name, version: m.version });
    },
    policy: async () => harden(policy()),
    availability: async () => harden(availability()),
    /** Names this host has verified, and names it could install now. */
    offer: async () => {
      const a = availability();
      return harden({ installed: Object.keys(a).filter(n => a[n] === 'installed').sort(), available: Object.keys(a).filter(n => a[n] === 'available').sort() });
    },
    /**
     * Install what a job needs, before the job is claimed. Returns
     * {ok, installed: [...], failed?: {name, reason}}. A failure is recorded
     * (so the host stops offering that capability for a while) and is the
     * host's, not the job's: nothing was claimed, so nothing is released.
     */
    provide: async needed => {
      const installed = [];
      for (const name of needed) {
        const a = availability()[name];
        if (a === 'installed') continue;
        if (a !== 'available') return harden({ ok: false, installed, failed: { name, reason: a ?? 'there is no such capability' } });
        try {
          await install(name);
          installed.push(name);
        } catch (err) {
          const rec = record();
          writeRecord({ ...rec, [name]: { ...(rec[name] ?? { version: manifest(name).version, manifest_sha256: manifestSha(name), verified: false }), verified: false, failed_at: clock.now() } });
          return harden({ ok: false, installed, failed: { name, reason: err.message } });
        }
      }
      return harden({ ok: true, installed });
    },
    /** Note that a job used these capabilities now (for `prune`). */
    used: async list => {
      const rec = record();
      const now = clock.now();
      let changed = false;
      for (const name of list) if (rec[name]) { rec[name] = { ...rec[name], used_at: now }; changed = true; }
      if (changed) writeRecord(rec);
    },
    /**
     * Drop what this host has not used within its policy's `unused_days`.
     * Never the base set (what every host needs to take part), never the
     * host's standing set. Returns the names dropped.
     */
    prune: async () => {
      const pol = policy();
      const wantedText = state.readIf('capabilities/wanted.yay');
      const keep = new Set([...base, ...(wantedText ? parse(wantedText).wanted : [])]);
      const rec = record();
      const cutoff = seconds(clock.now()) - pol.unused_days * 86400;
      const dropped = [];
      for (const [name, r] of Object.entries(rec)) {
        if (keep.has(name) || seconds(r.used_at ?? r.installed_at ?? clock.now()) >= cutoff) continue;
        // Something still installed may require it.
        if (Object.keys(rec).some(o => o !== name && !dropped.includes(o) && (manifest(o)?.requires ?? []).includes(name))) continue;
        caps.remove(name);
        delete rec[name];
        dropped.push(name);
      }
      if (dropped.length) writeRecord(rec);
      return harden(dropped);
    },
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
