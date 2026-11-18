// login.js — the ground the bot's GitHub login stands on, and a check of it.
//
// The login itself is the operator's, by hand, inside `./garden sh`:
// `gh auth login` with ssh as the git protocol, which generates a new ssh key
// in the box and uploads its public half to the account that logs in
// (main:SETUP.md, step 8). Nothing here performs it.
//
// What this module does is make sure that a plain `gh auth login` lands in the
// right places, and report afterwards who is logged in. Everything is under
// the steward's home in the state directory (0700, the steward's alone,
// ignored by git, never part of a job's home), which is $HOME in the box:
//   .config/gh/hosts.yml   gh's store: the one home of the bot's token
//   .ssh/id_ed25519        the bot's ssh key (and .pub)
//   .ssh/known_hosts       github.com's host keys, pinned from the shed
//   .ssh/config            github.com: that key, those host keys, strictly
//   .gitconfig             the identity the steward commits as, in the box
//
// Design: designs/keys.md.

import { harden } from './harden.js';

export const makeLogin = ({ run, files, home, knownHostsText, bot, identity }) => {
  const tree = files(home);
  const env = { HOME: home, GH_CONFIG_DIR: tree.path('.config/gh'), PATH: process.env.PATH ?? '/usr/bin:/bin' };
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
    /** Run by the entrypoint at every boot. Idempotent; touches no credential. */
    prepare: async () => {
      prepare();
      return harden({ home, known_hosts: tree.path('.ssh/known_hosts'), identity });
    },
    /** Read-only: who is logged in, what ssh says, and whether modes and places are right. */
    status: async () => verify(),
  });
};
