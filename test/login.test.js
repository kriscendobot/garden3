// The ground the bot's login stands on, offline. The login itself is the
// operator's, by hand in `./garden sh`, and nothing here performs or imitates
// it: these check what the entrypoint lays down beforehand, and the read-only
// report afterwards, with a fake gh and a fake ssh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeLogin } from '../src/login.js';
import { makeFiles } from '../src/powers/node.js';
import { parse } from '../src/yay.js';
import { SHED } from './helpers.js';

const KNOWN = fs.readFileSync(path.join(SHED, 'config/github-known-hosts'), 'utf8');
const identity = parse(fs.readFileSync(path.join(SHED, 'config/garden.yay'), 'utf8')).github.identity;

const world = (t, { gh = null, ssh = null } = {}) => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'garden-login-')), 'state/steward');
  t.after(() => fs.rmSync(path.dirname(path.dirname(home)), { recursive: true, force: true }));
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, env: opts?.env });
    if (cmd === 'gh' && args[0] === 'api') return gh ? { status: 0, stdout: `${gh}\n`, stderr: '' } : { status: 1, stdout: '', stderr: 'not logged in' };
    if (cmd === 'ssh-keygen') return { status: 0, stdout: '256 SHA256:TESTFINGERPRINT kriscendobot@box (ED25519)\n', stderr: '' };
    if (cmd === 'ssh') return { status: 1, stdout: '', stderr: ssh ? `Hi ${ssh}! You've successfully authenticated, but GitHub does not provide shell access.\n` : 'git@github.com: Permission denied (publickey).\n' };
    return { status: 127, stdout: '', stderr: '' };
  };
  // What a plain `gh auth login` in the box leaves behind.
  const afterLogin = () => {
    fs.mkdirSync(path.join(home, '.config/gh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config/gh/hosts.yml'), 'github.com:\n  oauth_token: gho_NEVERPRINTED\n', { mode: 0o600 });
    fs.writeFileSync(path.join(home, '.ssh/id_ed25519'), 'PRIVATE', { mode: 0o600 });
    fs.writeFileSync(path.join(home, '.ssh/id_ed25519.pub'), 'ssh-ed25519 AAAA kriscendobot@box\n');
  };
  const login = makeLogin({ run, files: makeFiles, home, knownHostsText: KNOWN, bot: 'kriscendobot', identity });
  return { home, calls, login, afterLogin, mode: f => fs.statSync(path.join(home, f)).mode & 0o777 };
};

test('prepare lays down pinned host keys, a strict ssh config and the box\'s identity', async t => {
  const w = world(t);
  await w.login.prepare();
  assert.deepEqual([w.mode('.'), w.mode('.ssh'), w.mode('.ssh/config')], [0o700, 0o700, 0o600]);
  const known = fs.readFileSync(path.join(w.home, '.ssh/known_hosts'), 'utf8').trim().split('\n');
  assert.deepEqual(known.map(l => l.split(' ').slice(0, 2).join(' ')), ['github.com ssh-ed25519', 'github.com ecdsa-sha2-nistp256', 'github.com ssh-rsa'], "github.com's three published keys, and nothing else");
  const cfg = fs.readFileSync(path.join(w.home, '.ssh/config'), 'utf8');
  assert.match(cfg, /Host github\.com\n {2}User git\n {2}IdentityFile ~\/\.ssh\/id_ed25519\n {2}IdentitiesOnly yes\n {2}StrictHostKeyChecking yes\n {2}UserKnownHostsFile ~\/\.ssh\/known_hosts/);
  assert.match(fs.readFileSync(path.join(w.home, '.gitconfig'), 'utf8'), /name = Kriscendo Bot\n\temail = 279080640\+kriscendobot@users\.noreply\.github\.com/);
  assert.equal(w.calls.length, 0, 'it runs nothing and contacts nothing');
  assert.ok(!w.home.startsWith(SHED), 'nothing lands in the checkout');
  // Again, after a login: the key and gh's store are left alone.
  w.afterLogin();
  const before = fs.statSync(path.join(w.home, '.ssh/id_ed25519')).mtimeMs;
  await w.login.prepare();
  assert.equal(fs.statSync(path.join(w.home, '.ssh/id_ed25519')).mtimeMs, before);
  assert.equal(fs.readFileSync(path.join(w.home, '.config/gh/hosts.yml'), 'utf8').includes('gho_'), true);
});

test('status: read-only, and says exactly what is wrong', async t => {
  const none = world(t);
  await none.login.prepare();
  assert.deepEqual(await none.login.status(), { ok: false, login: null, ssh: null, fingerprint: null, problems: ['gh is not logged in to github.com', 'there is no ssh key at ~/.ssh/id_ed25519'] });

  const good = world(t, { gh: 'kriscendobot', ssh: 'kriscendobot' });
  await good.login.prepare();
  good.afterLogin();
  assert.deepEqual(await good.login.status(), { ok: true, login: 'kriscendobot', ssh: 'kriscendobot', fingerprint: 'SHA256:TESTFINGERPRINT', problems: [] });
  assert.ok(!JSON.stringify(await good.login.status()).includes('gho_') && !JSON.stringify(good.calls).includes('gho_'), 'the token is never read or shown');
  assert.ok(!good.calls.some(c => c.args.includes('login') || c.args.includes('token') || c.args.includes('logout')), 'it never logs in, logs out, or asks for the token');
  for (const c of good.calls) assert.deepEqual(Object.keys(c.env).sort(), ['GH_CONFIG_DIR', 'HOME', 'PATH']);

  const wrong = world(t, { gh: 'kriskowal', ssh: 'kriskowal' });
  await wrong.login.prepare();
  wrong.afterLogin();
  assert.deepEqual((await wrong.login.status()).problems, ['gh is logged in as kriskowal, not kriscendobot', 'ssh to github.com greets kriskowal, not kriscendobot']);

  const split = world(t, { gh: 'KrisCendoBot', ssh: null });
  await split.login.prepare();
  split.afterLogin();
  fs.chmodSync(path.join(split.home, '.ssh/id_ed25519'), 0o644);
  fs.chmodSync(path.join(split.home, '.config/gh/hosts.yml'), 0o644);
  assert.deepEqual((await split.login.status()).problems, ['the ssh key is readable by others', 'ssh to github.com did not greet any account (is the key on the account?)', "gh's store is readable by others"], 'the login name compares without case');
});
