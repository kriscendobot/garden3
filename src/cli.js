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
import { makeKeys } from './keys.js';
import { makeHost } from './host.js';
import { makeDispatcher } from './dispatch.js';
import { makeSupervisor } from './supervisor.js';
import { makeClientWatch } from './clients.js';
import { makeGitHub, curlTransport } from './github.js';
import { makeWatcher } from './watcher.js';
import { makeSteward } from './steward.js';
import * as wrapup from './wrapup.js';
import { parse, stringify } from './yay.js';
import { fromArgs } from './shon.js';
import { Refusal } from './harden.js';

const reply = (doc, status) => {
  process.stdout.write(stringify(doc));
  process.exit(status);
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
    return new Proxy({}, { get: (_, method) => (...args) => (made ??= make())[method](...args) });
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
  const capabilities = lazy(() => makeCapabilities({ files: makeFiles, run, sha256File: powers.sha256File, sha256: powers.sha256, clock, arch: powers.arch(), root: capRoot, manifestsDir: path.join(rootRepo, 'capabilities'), stateDir, env, log: powers.log }));
  const budget = lazy(() => makeBudgetService({ shards, host, clock, config }));
  const board = lazy(() => makeBoardService({ shards, host, clock, config, capabilities, budget: env.GARDEN_BUDGET === 'off' ? undefined : budget }));
  const slots = lazy(() => makeSlots({ files: makeFiles, run, warden: env.GARDEN_WARDEN ?? path.join(capRoot, 'bin/warden'), rootRepo, slotsRoot: env.GARDEN_SLOTS ?? path.join(rootRepo, 'slots'), repositories: env.GARDEN_REPOSITORIES ?? path.join(rootRepo, 'repositories'), stateDir, clock, count: config.slots.count, uidBase: config.slots.uid_base, mode: env.GARDEN_SLOT_MODE ?? 'users', log: powers.log }));
  /**
   * Build the warden from this shed's source, for this host's architecture,
   * with the pinned Rust toolchain capability, and put it where the
   * entrypoint installs it from. The lockfile pins every crate by checksum.
   */
  const build = async () => {
    const cargoEnv = { ...env, PATH: `${path.join(capRoot, 'bin')}:${env.PATH ?? ''}`, CARGO_TARGET_DIR: path.join(stateDir, 'rust-target') };
    const r = run('cargo', ['build', '--release', '--locked', '--manifest-path', path.join(rootRepo, 'rust/Cargo.toml')], { env: cargoEnv });
    if (r.status !== 0) throw new Refusal('build', `the warden did not build: ${r.stderr.trim().split('\n').pop()}`);
    const caps = makeFiles(capRoot);
    caps.writeBytes('warden/warden.new', makeFiles(stateDir).readBytes('rust-target/release/warden'), 0o755);
    caps.rename('warden/warden.new', 'warden/warden');
    return { warden: powers.sha256File(caps.path('warden/warden')), arch: powers.arch() };
  };
  // GitHub is reached only from here, the steward's side, with the bot's key
  // read from its file at the moment of each call. With no key, reads are
  // anonymous and writes fail, which the watcher reports as unacknowledged.
  const keys = lazy(() => makeKeys({ files: makeFiles, stateDir, registryText: root.read('keys/registry.yay') }));
  const github = lazy(() => makeGitHub({ repo: config.github.repo, request: curlTransport({ run, token: () => keys.read('github-bot', 'steward').catch(() => null) }) }));
  const journal = lazy(() => makeJournal({ files: makeFiles, shards, stateDir, host, clock }));
  const steward = lazy(() => makeSteward({ github, board, shards, host, shed: run('git', ['-C', rootRepo, 'rev-parse', 'HEAD']).stdout.trim(), log: powers.log }));
  const watcher = lazy(() => makeWatcher({ github: { repo: config.github.repo, events: (...a) => github.events(...a) }, board, budget, steward, journal, shards, clock, bot: config.github.bot, overlapSeconds: config.github.overlap_seconds, log: powers.log }));
  return {
    watcher,
    steward,
    supervisor: lazy(() => {
      const services = assemble(powers);
      const dispatcher = makeDispatcher({
        board, slots, budget, plots: services.plots, journal: services.journal, files: makeFiles, clock, config, log: powers.log,
        // The worker command is the harness capability's; until it is pinned a host names its own.
        worker: { argv: (env.GARDEN_WORKER ?? 'claude -p --settings .claude-worker.json').split(' '), env: { PATH: `${path.join(capRoot, 'bin')}:/usr/bin:/bin` }, repositories: env.GARDEN_REPOSITORIES ?? path.join(rootRepo, 'repositories'), logFile: id => path.join(stateDir, 'runs', `${id}.log`), killAfterS: config.worker.kill_after_seconds },
      });
      const isLeader = async () => parse((await shardRead('journal', 'config/hosts.yay')) ?? 'leader: null\n').leader === host;
      const sup = makeSupervisor({ host, isLeader, quiescence: services.quiescence, hostService: services.host, board, budget, dispatcher, journal: services.journal, capabilities, watcher, steward, clock, log: powers.log });
      return { tick: sup.tick, run: () => sup.run({ sleep: ms => new Promise(r => setTimeout(r, ms)) }) };
    }),
    board,
    budget,
    capabilities,
    slots,
    quiescence: lazy(() => makeQuiescenceService({ shards, host, clock, config })),
    journal,
    plots: lazy(() => makePlots({ files: makeFiles, run, rootRepo, shards, stateDir, clock })),
    keys,
    host: lazy(() => makeHost({ files: makeFiles, run, rootRepo, stateDir, host, clock, shards, capabilities, slots, log: powers.log, build })),
    project: lazy(() => makeProjects({ files: makeFiles, run, home: env.GARDEN_JOB_HOME ?? env.HOME, repositories: env.GARDEN_REPOSITORIES })),
    clients: lazy(() => makeClientWatch({ shards, run, files: makeFiles, stateDir, host, consentFile: env.GARDEN_CLIENT_CONSENT ?? path.join(rootRepo, 'CLIENT-CONSENT.yay'), clock })),
    mail: lazy(() => makeBoatman({ files: makeFiles, sha256File: powers.sha256File, towerDir: env.GARDEN_TOWER ?? path.resolve(rootRepo, '../tower'), gardenDir: rootRepo, clock })),
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
