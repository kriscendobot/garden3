// The bot's login, offline: a fake gh and a fake ssh stand in. Where things
// land and with what modes; the account check; and that running it again is
// safe. The real login is the operator's and is not attempted here.
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

// A world in which `account` is who answers the browser step.
const world = (t, { account, already = null, sshAccount } = {}) => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'garden-login-')), 'state/steward');
  t.after(() => fs.rmSync(path.dirname(path.dirname(home)), { recursive: true, force: true }));
  const state = { loggedIn: already, calls: [], said: [] };
  const run = (cmd, args, opts) => {
    state.calls.push({ cmd, args, env: opts?.env });
    const ok = stdout => ({ status: 0, stdout, stderr: '' });
    if (cmd === 'gh' && args[0] === 'api') return state.loggedIn ? ok(`${state.loggedIn}\n`) : { status: 1, stdout: '', stderr: 'not logged in' };
    if (cmd === 'gh' && args[1] === 'logout') { state.loggedIn = null; return ok(''); }
    if (cmd === 'ssh-keygen') return ok('256 SHA256:TESTFINGERPRINT kriscendobot@box (ED25519)\n');
    if (cmd === 'ssh') return { status: 1, stdout: '', stderr: `Hi ${sshAccount ?? state.loggedIn}! You've successfully authenticated, but GitHub does not provide shell access.\n` };
    return { status: 127, stdout: '', stderr: 'no such command' };
  };
  const interactive = (cmd, args, opts) => {
    state.calls.push({ cmd, args, env: opts?.env, interactive: true });
    if (!account) return 1;
    state.loggedIn = account;
    // What gh's own login leaves behind.
    fs.mkdirSync(path.join(home, '.config/gh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config/gh/hosts.yml'), 'github.com:\n  oauth_token: gho_NEVERPRINTED\n', { mode: 0o600 });
    fs.writeFileSync(path.join(home, '.ssh/id_ed25519'), 'PRIVATE', { mode: 0o600 });
    fs.writeFileSync(path.join(home, '.ssh/id_ed25519.pub'), 'ssh-ed25519 AAAA kriscendobot@box\n');
    return 0;
  };
  const login = makeLogin({ run, interactive, files: makeFiles, home, knownHostsText: KNOWN, bot: 'kriscendobot', identity, say: l => state.said.push(l) });
  return { home, state, login, mode: f => fs.statSync(path.join(home, f)).mode & 0o777, text: () => state.said.join('\n') };
};

test('logging in as the bot: where things land, and what is printed', async t => {
  const w = world(t, { account: 'kriscendobot' });
  assert.equal(await w.login.login(), true);
  assert.deepEqual([w.mode('.'), w.mode('.ssh'), w.mode('.ssh/id_ed25519'), w.mode('.config/gh/hosts.yml'), w.mode('.ssh/config')], [0o700, 0o700, 0o600, 0o600, 0o600]);
  const known = fs.readFileSync(path.join(w.home, '.ssh/known_hosts'), 'utf8').trim().split('\n');
  assert.deepEqual(known.map(l => l.split(' ').slice(0, 2).join(' ')), ['github.com ssh-ed25519', 'github.com ecdsa-sha2-nistp256', 'github.com ssh-rsa'], "github.com's three published keys, and nothing else");
  assert.match(fs.readFileSync(path.join(w.home, '.ssh/config'), 'utf8'), /StrictHostKeyChecking yes/);
  assert.match(fs.readFileSync(path.join(w.home, '.gitconfig'), 'utf8'), /name = Kriscendo Bot\n\temail = 279080640\+kriscendobot@users\.noreply\.github\.com/);
  const gh = w.state.calls.find(c => c.interactive);
  assert.deepEqual(gh.args, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'ssh', '--web', '--scopes', 'admin:public_key']);
  assert.match(w.text(), /github\.com account: {2}kriscendobot\nssh greets: {10}kriscendobot\nssh key fingerprint: SHA256:TESTFINGERPRINT\ncommits in the box: {2}Kriscendo Bot </);
  assert.match(w.text(), /Logged in as kriscendobot\./);
  assert.ok(!w.text().includes('gho_') && !JSON.stringify(w.state.calls).includes('gho_'), 'the token is never printed or passed');
  for (const c of w.state.calls) assert.deepEqual(Object.keys(c.env).sort(), ['HOME', 'PATH', 'TERM'], 'every command gets the same small environment');
  assert.ok(!w.state.calls.some(c => c.cmd === 'gh' && c.args.includes('token')), 'it never asks gh for the token');
  assert.ok(!w.home.includes(SHED), 'nothing lands in the checkout');
});

test('running it again only checks', async t => {
  const w = world(t, { account: 'kriscendobot' });
  await w.login.login();
  const key = fs.statSync(path.join(w.home, '.ssh/id_ed25519')).mtimeMs;
  w.state.calls.length = 0;
  w.state.said.length = 0;
  assert.equal(await w.login.login(), true);
  assert.ok(!w.state.calls.some(c => c.interactive), 'no second login');
  assert.equal(fs.statSync(path.join(w.home, '.ssh/id_ed25519')).mtimeMs, key, 'the key is not regenerated');
  assert.match(w.text(), /Already logged in to github\.com as kriscendobot; checking\./);
});

test('any account but the bot is refused, logged out, and said so', async t => {
  const w = world(t, { account: 'kriskowal' });
  assert.equal(await w.login.login(), false);
  assert.equal(w.state.loggedIn, null, 'the wrong account does not stay logged in');
  assert.match(w.text(), /REFUSED: that login was kriskowal, not kriscendobot\./);
  assert.match(w.text(), /remove it there/);
  assert.ok(!/Logged in as kriscendobot\./.test(w.text()));

  const stale = world(t, { account: 'kriscendobot', already: 'kriskowal' });
  assert.equal(await stale.login.login(), true, 'a box holding another account is logged out of it first');
  assert.match(stale.text(), /gh is logged in as kriskowal, which is not kriscendobot\. Logging that account out/);

  const quit = world(t, { account: null });
  assert.equal(await quit.login.login(), false);
  assert.match(quit.text(), /gh did not complete the login/);

  const split = world(t, { account: 'kriscendobot', sshAccount: 'kriskowal' });
  assert.equal(await split.login.login(), false, 'the token and the ssh key must be the same account');
  assert.match(split.text(), /PROBLEM: ssh to github\.com greets kriskowal, not kriscendobot/);
});

test('verify reports loose modes and a missing key without changing anything', async t => {
  const w = world(t, { account: 'kriscendobot' });
  w.login.prepare();
  assert.deepEqual(w.login.verify().problems, ['gh is not logged in to github.com', 'there is no ssh key at ~/.ssh/id_ed25519']);
  await w.login.login();
  fs.chmodSync(path.join(w.home, '.ssh/id_ed25519'), 0o644);
  fs.chmodSync(path.join(w.home, '.config/gh/hosts.yml'), 0o644);
  assert.deepEqual(w.login.verify().problems, ['the ssh key is readable by others', "gh's store is readable by others"]);
});
