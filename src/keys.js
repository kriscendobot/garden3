// keys.js — keys are files, never environment variables.
//
// The prior garden handed six provider keys to every worker through the
// container's environment. The garden takes the tower's way instead
// (scripts/jobs/set-api-key.sh, worker-auth.py): a key is one file under
// <state>/secrets/, mode 0600 in a 0700 directory, owned by the steward and
// unreadable by any job's account. It is written from a terminal or a pipe,
// never from argv; it is read only by the code that needs it, at the moment
// it needs it; and it reaches exactly one child process, on that child's
// stdin or through a helper it runs, never through the environment every
// process inherits. Design: designs/keys.md.

import { parse } from './yay.js';
import { harden, refuse, isName } from './harden.js';

/** Every variable that may carry a provider key: stripped from a worker's environment. */
export const KEY_VARIABLES = harden([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY',
  'FIREWORKS_API_KEY', 'MOONSHOT_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_CLOUD_API_KEY', 'TYPESAFE_API_KEY',
  'GH_TOKEN', 'GITHUB_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
]);

/** An environment with every key variable removed. */
export const scrub = env => Object.fromEntries(Object.entries(env).filter(([k]) => !KEY_VARIABLES.includes(k) && !/_(API_KEY|TOKEN|SECRET)$/.test(k)));

/**
 * A subscription login, made lendable to a job: the harness's credentials
 * with the refresh token removed. A job holding this can make model requests
 * until the access token expires, and cannot refresh it, so it can never
 * rotate the steward's own login out from under the steward or another job.
 * Returns {text, expires_at, secret}: what to write, when it stops working,
 * and the value harvest must refuse to carry out.
 */
export const accessOnly = text => {
  let login;
  try {
    login = JSON.parse(text).claudeAiOauth;
  } catch {
    login = null;
  }
  if (!login?.accessToken || typeof login.expiresAt !== 'number') refuse('no-key', 'the login holds no access token');
  const { refreshToken: _refresh, refreshTokenExpiresAt: _refreshExpiry, ...access } = login;
  return harden({ text: `${JSON.stringify({ claudeAiOauth: access })}\n`, expires_at: new Date(login.expiresAt).toISOString().replace(/\.\d+Z$/, 'Z'), secret: login.accessToken });
};

export const makeKeys = ({ files, stateDir, registryText, run, env = {} }) => {
  const state = files(stateDir);
  const registry = registryText ? parse(registryText).keys : {};
  // A key is a file under secrets/ unless the registry says where else it
  // lives (`file`, relative to the state directory). A key with a `provider`
  // has exactly one home, that provider's own store, and is read through it:
  // there is no second copy to drift.
  const fileOf = name => registry[name]?.file ?? `secrets/${name}`;
  // The token stays in gh's store; gh prints it to a pipe only we read.
  const ghToken = () => {
    const r = run('gh', ['auth', 'token', '--hostname', 'github.com'], { env });
    const token = r.stdout.trim();
    if (r.status !== 0 || !token) refuse('no-key', 'gh has no token for github.com on this host');
    return token;
  };
  const known = name => {
    if (!isName(name)) refuse('invalid', 'bad key name');
    return registry[name] ?? refuse('unknown-key', `${name} is not in the key registry (keys/registry.yay)`);
  };
  return harden({
    /** Store a key. The value must be one line with no whitespace, and match the registry's pattern. */
    set: async (name, value) => {
      const spec = known(name);
      if (spec.provider || spec.file) refuse('not-settable', `${name} is not set by hand: ${spec.provider === 'gh' ? "it is written by the bot's login (./garden login)" : 'it is made where it lives'}`);
      const v = String(value).replace(/\n$/, '');
      if (!v || /\s/.test(v)) refuse('invalid', 'a key is one line with no whitespace');
      if (spec.pattern && !new RegExp(spec.pattern).test(v)) refuse('invalid', `that does not look like a ${name} key`);
      state.mkdir('secrets');
      state.chmod('secrets', 0o700);
      state.writeBytes(`${fileOf(name)}.new`, `${v}\n`, 0o600);
      state.chmod(`${fileOf(name)}.new`, 0o600);
      state.rename(`${fileOf(name)}.new`, fileOf(name));
    },
    remove: async name => {
      const spec = known(name);
      if (spec.provider || spec.file) refuse('not-settable', `${name} is not removed here; log the bot out instead`);
      state.remove(fileOf(name));
    },
    /** {name: {present, mode_ok, purpose}} for every registered key. Never a value. */
    status: async () =>
      harden(Object.fromEntries(Object.entries(registry).map(([name, spec]) => {
        const present = state.exists(fileOf(name));
        return [name, { present, mode_ok: present ? state.mode(fileOf(name)) === 0o600 : null, purpose: spec.purpose }];
      }))),
    /**
     * Read a key, for the one consumer the registry names. Refused unless the
     * file's mode is exactly 0600: a key anyone else could read is treated as
     * no key at all.
     */
    /**
     * Lend a key to a job, as the registry allows: {file, text, expires_at,
     * secret}, `file` being where in the job's home it goes (`lend_as`), and
     * `secret` what harvest must refuse to carry out. The steward's copy is
     * untouched. `lend` says how:
     * - `access-only`: a subscription login without its refresh token;
     * - `gh`: gh's store as it stands, which holds the token;
     * - `whole`: the file as it is (an ssh key).
     */
    lend: async name => {
      const spec = known(name);
      if (!['access-only', 'gh', 'whole'].includes(spec.lend) || !spec.lend_as) refuse('not-lendable', `${name} is not lent to jobs`);
      if (!state.exists(fileOf(name))) refuse('no-key', `no ${name} on this host${spec.lend === 'access-only' ? ': log in with ./garden (the claude session)' : ''}`);
      if (state.mode(fileOf(name)) !== 0o600) refuse('bad-mode', `${name} is readable by others; treat it as leaked and replace it`);
      const text = state.read(fileOf(name));
      if (spec.lend === 'access-only') return harden({ file: spec.lend_as, ...accessOnly(text) });
      if (spec.lend === 'gh') {
        const token = ghToken();
        if (!text.includes(token)) refuse('not-lendable', 'gh keeps its token outside its store (in a keyring), so the store cannot be lent');
        return harden({ file: spec.lend_as, text, expires_at: null, secret: token });
      }
      // An ssh key's longest line is the one no other text would hold.
      const secret = text.split('\n').reduce((a, l) => (l.trim().length > a.length ? l.trim() : a), '');
      return harden({ file: spec.lend_as, text, expires_at: null, secret });
    },
    read: async (name, consumer) => {
      const spec = known(name);
      if (spec.consumer !== consumer) refuse('wrong-consumer', `${name} is for ${spec.consumer}, not ${consumer}`);
      if (!state.exists(fileOf(name))) refuse('no-key', `no ${name} key on this host`);
      if (state.mode(fileOf(name)) !== 0o600) refuse('bad-mode', `${name} is readable by others; treat it as leaked and replace it`);
      if (spec.provider === 'gh') return ghToken();
      return state.read(fileOf(name)).replace(/\n$/, '');
    },
  });
};
