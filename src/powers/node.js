// powers/node.js — the garden's ambient authority, gathered in one place.
//
// This is the only module that imports Node's builtins. Everything else
// receives what it needs from here as arguments (designs/services.md), so a
// module's reach is what its maker was handed, and moving a service into a
// confined worker later means handing it different powers, not rewriting it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { harden } from '../harden.js';

/** Files, narrowed to a root directory: no path may escape it. */
export const makeFiles = root => {
  const at = rel => {
    const p = path.resolve(root, rel);
    if (p !== root && !p.startsWith(`${root}${path.sep}`)) throw new Error(`path escapes ${root}: ${rel}`);
    return p;
  };
  return harden({
    root,
    path: at,
    exists: rel => fs.existsSync(at(rel)),
    isDir: rel => fs.existsSync(at(rel)) && fs.lstatSync(at(rel)).isDirectory(),
    read: rel => fs.readFileSync(at(rel), 'utf8'),
    readIf: rel => (fs.existsSync(at(rel)) ? fs.readFileSync(at(rel), 'utf8') : null),
    write: (rel, text) => {
      const p = at(rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, p);
    },
    append: (rel, text) => {
      fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
      fs.appendFileSync(at(rel), text);
    },
    remove: rel => fs.rmSync(at(rel), { recursive: true, force: true }),
    mkdir: rel => fs.mkdirSync(at(rel), { recursive: true }),
    list: rel => (fs.existsSync(at(rel)) ? fs.readdirSync(at(rel)).sort() : []),
    /** Every file under rel, as paths relative to rel, sorted. */
    walk: rel => {
      const out = [];
      const go = (dir, prefix) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name === '.git') continue;
          if (e.isDirectory()) go(path.join(dir, e.name), `${prefix}${e.name}/`);
          else out.push(`${prefix}${e.name}`);
        }
      };
      if (fs.existsSync(at(rel))) go(at(rel), '');
      return out.sort();
    },
    copyIn: (fromAbsolute, rel) => {
      fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
      fs.copyFileSync(fromAbsolute, at(rel));
    },
    /** A symbolic link at rel pointing to an absolute target (replacing any there). */
    link: (targetAbsolute, rel) => {
      fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
      fs.rmSync(at(rel), { force: true });
      fs.symlinkSync(targetAbsolute, at(rel));
    },
    rename: (fromRel, toRel) => {
      fs.mkdirSync(path.dirname(at(toRel)), { recursive: true });
      fs.renameSync(at(fromRel), at(toRel));
    },
    writeBytes: (rel, bytes, mode) => {
      fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
      fs.writeFileSync(at(rel), bytes, mode ? { mode } : undefined);
    },
    readBytes: rel => fs.readFileSync(at(rel)),
    mode: rel => fs.statSync(at(rel)).mode & 0o777,
    chmod: (rel, mode) => fs.chmodSync(at(rel), mode),
    sub: rel => makeFiles(at(rel)),
  });
};

/**
 * Run a program. Arguments are an array and never pass through a shell.
 * Returns {status, stdout, stderr}; does not throw on a nonzero exit.
 */
export const run = (cmd, args, { cwd, env, input, timeoutMs } = {}) => {
  const r = spawnSync(cmd, args, { cwd, env, input, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error && r.error.code !== 'ETIMEDOUT') throw r.error;
  return { status: r.status ?? 124, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

export const makeNodePowers = ({ env = process.env } = {}) =>
  // Frozen at the top only: the process environment cannot be deep-frozen.
  Object.freeze({
    env,
    run,
    files: makeFiles,
    clock: { now: () => (env.GARDEN_NOW ? env.GARDEN_NOW : new Date().toISOString().replace(/\.\d+Z$/, 'Z')) },
    hostname: () => env.GARDEN_HOST ?? os.hostname().split('.')[0],
    arch: () => ({ x64: 'amd64', arm64: 'arm64' })[os.arch()] ?? os.arch(),
    /**
     * What this machine is, as cheaply as it can be told: nothing here runs a
     * program or loads a driver. A GPU is "present" if its device node is.
     */
    probe: () => ({
      arch: ({ x64: 'amd64', arm64: 'arm64' })[os.arch()] ?? os.arch(),
      os: os.platform(),
      cores: os.cpus().length,
      memory_bytes: os.totalmem(),
      devices: ['/dev/nvidia0', '/dev/kfd', '/dev/dri/renderD128'].filter(d => fs.existsSync(d)),
    }),
    sha256: text => crypto.createHash('sha256').update(text).digest('hex'),
    sha256File: file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    tmpdir: prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
    log: line => process.stderr.write(`${line}\n`),
  });
