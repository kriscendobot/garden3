// login.js — the bot's GitHub login on a host that publishes.
//
// The operator runs `./garden login` in their own terminal. It enters the box
// as the steward and runs gh's own interactive login for github.com, with ssh
// as the git protocol, so that gh generates a new ssh key inside the box and
// uploads its public half to the account that logs in. Then it checks, and
// prints, who that was. Design: designs/keys.md.
//
// Where things land, all under the steward's home in the state directory
// (0700, the steward's alone, ignored by git, never part of a job's home):
//   .config/gh/hosts.yml   gh's store: the one home of the bot's token
//   .ssh/id_ed25519        the bot's ssh key (and .pub)
//   .ssh/known_hosts       github.com's host keys, pinned from the shed
//   .gitconfig             the identity the steward commits as, in the box
//
// Nothing here prints the token, puts it in an argument or an environment
// variable, or copies it anywhere. Safe to run again: a host already logged in
// as the bot is only checked.

import { harden } from './harden.js';

export const makeLogin = ({ run, interactive, files, home, knownHostsText, bot, identity, say = () => {} }) => {
  const tree = files(home);
  const env = { HOME: home, PATH: process.env.PATH ?? '/usr/bin:/bin', TERM: process.env.TERM ?? 'dumb' };
  const gh = args => run('gh', args, { env });
  const whoami = () => {
    const r = gh(['api', 'user', '--jq', '.login']);
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const isBot = login => typeof login === 'string' && login.toLowerCase() === bot.toLowerCase();

  /** Lay down what must be there before any connection: modes, pinned host keys, the box's git identity. */
  const prepare = () => {
    tree.mkdir('.');
    tree.chmod('.', 0o700);
    tree.mkdir('.ssh');
    tree.chmod('.ssh', 0o700);
    // Only the pinned keys: nothing is trusted on first use.
    tree.writeBytes('.ssh/known_hosts', knownHostsText.split('\n').filter(l => l && !l.startsWith('#')).join('\n') + '\n', 0o644);
    tree.writeBytes('.ssh/config', 'Host github.com\n  User git\n  IdentityFile ~/.ssh/id_ed25519\n  IdentitiesOnly yes\n  StrictHostKeyChecking yes\n  UserKnownHostsFile ~/.ssh/known_hosts\n', 0o600);
    tree.writeBytes('.gitconfig', `[user]\n\tname = ${identity.name}\n\temail = ${identity.email}\n[init]\n\tdefaultBranch = shed\n`, 0o644);
  };

  /** Check the login without changing it. {ok, login, ssh, fingerprint, problems}. */
  const verify = () => {
    const problems = [];
    const login = whoami();
    if (!login) problems.push('gh is not logged in to github.com');
    else if (!isBot(login)) problems.push(`gh is logged in as ${login}, not ${bot}`);
    let ssh = null;
    let fingerprint = null;
    if (!tree.exists('.ssh/id_ed25519')) problems.push('there is no ssh key at ~/.ssh/id_ed25519');
    else {
      if (tree.mode('.ssh/id_ed25519') !== 0o600) problems.push('the ssh key is readable by others');
      const f = run('ssh-keygen', ['-lf', tree.path('.ssh/id_ed25519.pub')], { env });
      fingerprint = f.status === 0 ? f.stdout.trim().split(' ')[1] : null;
      // GitHub answers with a greeting and exit status 1: that is success.
      const t = run('ssh', ['-T', '-F', tree.path('.ssh/config'), '-o', 'BatchMode=yes', 'git@github.com'], { env, timeoutMs: 30000 });
      ssh = /Hi ([^!]+)!/.exec(`${t.stdout}${t.stderr}`)?.[1] ?? null;
      if (!ssh) problems.push('ssh to github.com did not greet any account (is the key on the account?)');
      else if (!isBot(ssh)) problems.push(`ssh to github.com greets ${ssh}, not ${bot}`);
    }
    if (tree.exists('.config/gh/hosts.yml') && tree.mode('.config/gh/hosts.yml') !== 0o600) problems.push("gh's store is readable by others");
    return harden({ ok: problems.length === 0, login, ssh, fingerprint, problems });
  };

  return harden({
    prepare,
    verify,
    /**
     * The whole of `./garden login`. Returns true when the host ends logged in
     * as the bot, false otherwise (having said why).
     */
    login: async () => {
      prepare();
      const before = whoami();
      if (isBot(before)) say(`Already logged in to github.com as ${before}; checking.`);
      else {
        if (before) {
          say(`gh is logged in as ${before}, which is not ${bot}. Logging that account out of this box first.`);
          gh(['auth', 'logout', '--hostname', 'github.com', '--user', before]);
        }
        say(`Log in as ${bot}. gh will show a one-time code and a URL: open the URL in a browser where you are signed in to GitHub AS ${bot}, and enter the code.`);
        say('When gh asks, let it generate a new SSH key (no passphrase: the steward uses it unattended) and upload it.');
        const status = interactive('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'ssh', '--web', '--scopes', 'admin:public_key'], { env });
        if (status !== 0) {
          say('gh did not complete the login. Nothing else was changed; run ./garden login again.');
          return false;
        }
      }
      const after = whoami();
      if (!isBot(after)) {
        // The wrong account must not stay logged in: the steward would act as it.
        if (after) gh(['auth', 'logout', '--hostname', 'github.com', '--user', after]);
        say('');
        say(`REFUSED: that login was ${after ?? 'nobody'}, not ${bot}.`);
        say(`It has been logged out of this box. If gh uploaded an ssh key, it is on ${after ?? 'that'} account: remove it there (Settings, SSH and GPG keys).`);
        say(`Sign in to GitHub as ${bot} in the browser and run ./garden login again.`);
        return false;
      }
      const v = verify();
      say('');
      say(`github.com account:  ${v.login}`);
      say(`ssh greets:          ${v.ssh ?? '(nobody)'}`);
      say(`ssh key fingerprint: ${v.fingerprint ?? '(none)'}`);
      say(`commits in the box:  ${identity.name} <${identity.email}>`);
      for (const p of v.problems) say(`PROBLEM: ${p}`);
      say(v.ok ? `Logged in as ${bot}. The token is in gh's store and the key in ~/.ssh, both under the steward's home in the state directory.` : 'The login is not complete; see above.');
      return v.ok;
    },
  });
};
