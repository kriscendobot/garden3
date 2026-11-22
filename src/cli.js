// cli.js — the garden's command line: `garden <service> <method> [ value ]`.
//
// A command is a method call on a service with one data argument, written as
// SHON (src/shon.js): `garden board post [ --id fix-a --role builder --title
// 'Fix A' ]`. The result is printed as a YAY document. There are no ad hoc
// flags to parse, and the same call can later be an eventual send to a
// service in another vat (designs/data-model.md, designs/ascent.md).
//
// Exit status: 0 done, 1 refused (the reply says why), 2 the command could
// not be read.

import path from 'node:path';
import { makeNodePowers, makeFiles, run } from './powers/node.js';
import { makeShards } from './shard.js';
import { makeBoardService } from './boardService.js';
import { makeBudgetService } from './budget.js';
import { makeQuiescenceService } from './quiescence.js';
import { makeCapabilities } from './capabilities.js';
import { makeSlots } from './slots.js';
import { makeProjects } from './project.js';
import { makeJournal } from './journal.js';
import { makeBoatman } from './mail.js';
import { makePlots } from './plots.js';
import { makeKeys, scrub } from './keys.js';
import { makeHost } from './host.js';
import { makeDispatcher } from './dispatch.js';
import { makeSupervisor } from './supervisor.js';
import { makeClientWatch } from './clients.js';
import { makeGitHub, curlTransport } from './github.js';
import { makeWatcher } from './watcher.js';
import { makeSteward } from './steward.js';
import { makeHostInfo } from './hostinfo.js';
import { makeLogin } from './login.js';
import { makeProse, parseLists, SKILL } from './prose.js';
import { makeDevPublisher } from './devpublish.js';
import * as wrapup from './wrapup.js';
import { parse, stringify } from './yay.js';
import { fromArgs } from './shon.js';
import { Refusal } from './harden.js';

// Exit only once the reply is written: a pipe takes a large reply in pieces,
// and exiting at once would cut it off.
const reply = (doc, status) => {
  process.stdout.write(stringify(doc), () => process.exit(status));
};

/** Assemble the services of this host from its environment. Nothing is contacted until a method runs. */
export const assemble = (powers = makeNodePowers()) => {
  const { env } = powers;
  const rootRepo = env.GARDEN_ROOT ?? path.resolve(import.meta.dirname, '..');
  const stateDir = env.GARDEN_STATE ?? path.join(rootRepo, '.garden-state');
  const host = powers.hostname();
  const root = makeFiles(rootRepo);
  const config = parse(root.read('config/garden.yay'));
  const clock = powers.clock;
  const lazy = make => {
    let made;
    return new Proxy(
      {},
      {
        get: (_, method) => (...args) => {
          made ??= make();
          if (typeof made[method] !== 'function') throw new Refusal('usage', `there is no method '${String(method)}'; this service has: ${Object.keys(made).join(', ')}`);
          return made[method](...args);
        },
      },
    );
  };
  const shards = lazy(() => {
    makeFiles(stateDir).mkdir('.');
    const remote = env.GARDEN_REMOTE ?? run('git', ['-C', rootRepo, 'remote', 'get-url', 'origin']).stdout.trim();
    if (!remote) throw new Refusal('no-remote', 'no GARDEN_REMOTE, and the root checkout has no origin');
    const who = key => run('git', ['-C', rootRepo, 'config', key]).stdout.trim();
    return makeShards({ run, files: makeFiles, remote, stateDir, identity: { name: who('user.name') || 'garden', email: who('user.email') || 'garden@garden.invalid' }, log: powers.log });
  });
  const shardRead = async (branch, file) => {
    const s = shards.shard('read', branch);
    return s.sync() ? s.tree.readIf(file) : null;
  };
  const capRoot = env.GARDEN_CAP_ROOT ?? '/opt/garden/cap';
  const capabilities = lazy(() => makeCapabilities({ files: makeFiles, run, sha256File: powers.sha256File, sha256: powers.sha256, clock, arch: powers.arch(), root: capRoot, manifestsDir: path.join(rootRepo, 'capabilities'), stateDir, base: config.capabilities?.base ?? [], env, log: powers.log }));
  const budget = lazy(() => makeBudgetService({ shards, host, clock, config }));
  const board = lazy(() => makeBoardService({ shards, host, clock, config, capabilities, budget: env.GARDEN_BUDGET === 'off' ? undefined : budget }));
  const slots = lazy(() => makeSlots({ files: makeFiles, run, warden: env.GARDEN_WARDEN ?? path.join(capRoot, 'bin/warden'), rootRepo, slotsRoot: env.GARDEN_SLOTS ?? path.join(rootRepo, 'slots'), repositories: env.GARDEN_REPOSITORIES ?? path.join(rootRepo, 'repositories'), stateDir, upstream: path.join(stateDir, 'upstream/garden.git'), clock, count: config.slots.count, uidBase: config.slots.uid_base, mode: env.GARDEN_SLOT_MODE ?? 'users', log: powers.log }));
  /**
   * Build the warden from this shed's source, for this host's architecture,
   * with the pinned Rust toolchain capability, and put it where the
   * entrypoint installs it from. The lockfile pins every crate by checksum.
   */
  const build = async () => {
    // For musl, linked by the linker inside the toolchain: no C compiler, no
    // system linker and no registry are needed (rust/.cargo/config.toml).
    const target = `${{ amd64: 'x86_64', arm64: 'aarch64' }[powers.arch()] ?? powers.arch()}-unknown-linux-musl`;
    const cargoEnv = { PATH: `${path.join(capRoot, 'bin')}:/usr/bin:/bin`, HOME: stateDir, CARGO_HOME: path.join(stateDir, 'cargo-home'), CARGO_TARGET_DIR: path.join(stateDir, 'rust-target') };
    let r;
    try {
      r = run('cargo', ['build', '--release', '--locked', '--offline', '--target', target, '--manifest-path', path.join(rootRepo, 'rust/Cargo.toml')], { env: cargoEnv, cwd: path.join(rootRepo, 'rust') });
    } catch (err) {
      throw new Refusal('build', `cargo could not be run (is the rust capability installed?): ${err.code ?? err.message}`);
    }
    if (r.status !== 0) throw new Refusal('build', `the warden did not build: ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`);
    const caps = makeFiles(capRoot);
    caps.writeBytes('warden/warden.new', makeFiles(stateDir).readBytes(`rust-target/${target}/release/warden`), 0o755);
    caps.rename('warden/warden.new', 'warden/warden');
    return { warden: powers.sha256File(caps.path('warden/warden')), arch: powers.arch() };
  };
  // GitHub is reached only from here, the steward's side, with the bot's key
  // read from its file at the moment of each call. With no key, reads are
  // anonymous and writes fail, which the watcher reports as unacknowledged.
  // The steward's own home: gh's store, the ssh key, its git identity. Under
  // the state directory, never in the checkout (designs/keys.md).
  const stewardHome = path.join(stateDir, 'steward');
  const stewardEnv = { HOME: stewardHome, GH_CONFIG_DIR: path.join(stewardHome, '.config/gh'), PATH: `${path.join(capRoot, 'bin')}:/usr/bin:/bin` };
  const keys = lazy(() => makeKeys({ files: makeFiles, stateDir, registryText: root.read('keys/registry.yay'), run, env: stewardEnv }));
  const login = lazy(() => makeLogin({ run, files: makeFiles, home: stewardHome, knownHostsText: root.read('config/github-known-hosts'), bot: config.github.bot, identity: config.github.identity }));
  // One client per repository, all over the one transport.
  let transport;
  const request = (...a) => (transport ??= curlTransport({ run, token: () => keys.read('github-bot', 'steward').catch(() => null) }))(...a);
  const clients = new Map();
  const github = repo => {
    if (!clients.has(repo)) clients.set(repo, makeGitHub({ repo, request }));
    return clients.get(repo);
  };
  // What the watcher polls: config/garden.yay's github.watch, or, without
  // one, the home repository's issues alone.
  const watches = config.github.watch ?? [{ repo: config.github.repo, issues: true }];
  const journal = lazy(() => makeJournal({ files: makeFiles, shards, stateDir, host, clock }));
  const steward = lazy(() => makeSteward({ github, home: config.github.repo, board, shards, host, shed: run('git', ['-C', rootRepo, 'rev-parse', 'HEAD']).stdout.trim(), log: powers.log }));
  const watcher = lazy(() => makeWatcher({ github, watches, home: config.github.repo, board, budget, steward, journal, hostinfo, shards, clock, bot: config.github.bot, overlapSeconds: config.github.overlap_seconds, pollSeconds: config.github.poll_seconds, log: powers.log }));
  const hostinfo = lazy(() => makeHostInfo({ shards, host, clock, probe: powers.probe, capabilities, slots: config.slots.count, shed: () => run('git', ['-C', rootRepo, 'rev-parse', 'HEAD']).stdout.trim(), client: () => root.exists('CLIENT-CONSENT.yay') }));
  return {
    bot: login,
    hostinfo,
    watcher,
    steward,
    supervisor: lazy(() => {
      const services = assemble(powers);
      const dispatcher = makeDispatcher({
        board, slots, budget, plots: services.plots, journal: services.journal, capabilities, hostinfo, files: makeFiles, clock, config, log: powers.log,
        // The worker command is the harness capability's; until it is pinned a host names its own.
        worker: { argv: env.GARDEN_WORKER ? env.GARDEN_WORKER.split(' ') : ['claude', '-p', '--settings', '.claude-worker.json', 'Read PROMPT.md in this directory, and do what it says.'], lend: () => keys.lend('claude-login'), env: { PATH: `${path.join(capRoot, 'bin')}:/usr/bin:/bin` }, repositories: env.GARDEN_REPOSITORIES ?? path.join(rootRepo, 'repositories'), logFile: id => path.join(stateDir, 'runs', `${id}.log`), killAfterS: config.worker.kill_after_seconds, tiers: config.worker.tiers },
      });
      const isLeader = async () => parse((await shardRead('journal', 'config/hosts.yay')) ?? 'leader: null\n').leader === host;
      const sup = makeSupervisor({ host, isLeader, quiescence: services.quiescence, hostService: services.host, board, budget, dispatcher, journal: services.journal, capabilities, hostinfo, watcher, steward, clock, log: powers.log });
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      /**
       * Tick forever. A host that cannot take part yet (no repository to talk
       * to) idles and says so once, rather than failing every minute; the
       * same failure repeated is logged once until it changes.
       */
      const runForever = async ({ intervalMs = 60000 } = {}) => {
        let last = '';
        const note = line => {
          if (line !== last) powers.log(line);
          last = line;
        };
        for (;;) {
          const remote = env.GARDEN_REMOTE ?? run('git', ['-C', rootRepo, 'remote', 'get-url', 'origin']).stdout.trim();
          if (!remote) note('idle: this checkout has no origin yet, so there is no board to work from. Waiting.');
          else {
            try {
              const did = await sup.tick();
              if (did.length) powers.log(did.join('; '));
              last = '';
            } catch (err) {
              note(`waiting: ${err.code ?? 'error'}: ${err.message}`);
            }
          }
          await sleep(intervalMs);
        }
      };
      return { tick: sup.tick, run: runForever };
    }),
    board,
    budget,
    // `garden watcher preview` looks without acting; `garden watcher adopt
    // <record>` takes a YAY record's `cursors` ([{repo, cursor}]) onto the board.
    watcher: lazy(() => ({ preview: () => watcher.preview(), adopt: file => watcher.adopt(Object.fromEntries(parse(root.read(file), file).cursors.map(c => [c.repo, c.cursor])), `cursors from ${file}`) })),
    capabilities,
    slots,
    quiescence: lazy(() => makeQuiescenceService({ shards, host, clock, config })),
    journal,
    plots: lazy(() => makePlots({ files: makeFiles, run, rootRepo, shards, stateDir, upstream: config.upstream ?? {}, clock })),
    keys,
    host: lazy(() => makeHost({ files: makeFiles, run, rootRepo, stateDir, host, clock, shards, capabilities, slots, log: powers.log, build })),
    project: lazy(() => makeProjects({ files: makeFiles, run, home: env.GARDEN_JOB_HOME ?? env.HOME, repositories: env.GARDEN_REPOSITORIES })),
    clients: lazy(() => makeClientWatch({ shards, run, files: makeFiles, stateDir, host, consentFile: env.GARDEN_CLIENT_CONSENT ?? path.join(rootRepo, 'CLIENT-CONSENT.yay'), clock })),
    // `garden devpublish plan|publish [ --by <login> ]`: the steward publishing a branch's dev-* releases.
    devpublish: lazy(() => makeDevPublisher({ files: makeFiles, run, env: scrub(env), keys, journal, clock, work: config.dev_publish.work, config: config.dev_publish, log: powers.log })),
    // `garden prose check|diff|metadata`, against the lists on this shed, in the working directory.
    prose: lazy(() => makeProse({ files: makeFiles(path.resolve('.')), run, lists: parseLists({ divergences: root.read(`${SKILL}/divergences.tsv`), cliches: root.read(`${SKILL}/cliches.tsv`) }) })),
    mail: lazy(() => makeBoatman({ files: makeFiles, sha256File: powers.sha256File, towerDir: env.GARDEN_TOWER ?? path.resolve(rootRepo, '../tower'), gardenDir: stateDir, clock })),
  };
};

/** The deadline hook: reads the tool call on stdin (ignored), prints a note or nothing. Never fails. */
const hook = powers => {
  try {
    const { env } = powers;
    const stateDir = env.GARDEN_HOOK_STATE;
    if (!stateDir) return;
    const flags = makeFiles(stateDir);
    const text = wrapup.note({
      id: env.GARDEN_JOB_ID,
      windowS: Number(env.GARDEN_WINDOW_S),
      deadlineEpoch: Number(env.GARDEN_DEADLINE_EPOCH),
      nowEpoch: Math.floor(Date.parse(powers.clock.now()) / 1000),
      flags: { has: n => flags.exists(`deadline-${n}`), set: n => flags.write(`deadline-${n}`, '') },
    });
    const out = wrapup.hookOutput(text);
    if (out) process.stdout.write(`${JSON.stringify(out)}\n`); // the harness's hook protocol is JSON
  } catch {
    // A hook must never stop a tool call.
  }
};

export const main = async argv => {
  const powers = makeNodePowers();
  const [service, method, ...rest] = argv;
  if (service === 'hook') return hook(powers);
  let services;
  let args;
  try {
    services = assemble(powers);
    if (!Object.hasOwn(services, service ?? '')) throw new Error(`unknown service '${service ?? ''}'; one of: ${Object.keys(services).join(', ')}, hook`);
    if (!method) throw new Error(`name a method of ${service}`);
    // Leading bare words are positional arguments; one SHON value may follow.
    const i = rest.findIndex(w => w === '[' || w === '[--]' || w === '[]');
    args = i < 0 ? rest : [...rest.slice(0, i), fromArgs(rest.slice(i)).value];
  } catch (err) {
    return reply({ ok: false, code: 'usage', error: err.message }, 2);
  }
  try {
    if (service === 'keys' && method === 'set') {
      // A key is never an argument: it would sit in argv and in shell history.
      if (args.length !== 1) return reply({ ok: false, code: 'usage', error: 'garden keys set <name>, with the key on standard input' }, 2);
      let value = '';
      for await (const chunk of process.stdin) value += chunk;
      args.push(value);
    }
    const result = await services[service][method](...args);
    const value = result instanceof Set ? [...result].sort() : result;
    return reply({ ok: true, ...(value === undefined ? {} : { result: value ?? null }) }, 0);
  } catch (err) {
    if (err instanceof Refusal || err.code) return reply({ ok: false, code: String(err.code), error: err.message }, 1);
    throw err;
  }
};
