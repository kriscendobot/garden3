// github.js — the garden's whole view of GitHub, kept narrow.
//
// Everything the garden reads from or writes to GitHub goes through the few
// methods here, over one injected `request`. Tests hand in recorded
// responses; the real transport is `curlTransport`, which gives the token to
// curl on standard input (the tower's way: designs/keys.md), so it is in no
// argument list and no environment. Only the steward's side of the garden
// ever constructs this with a token; no job can.

import { harden, refuse } from './harden.js';

/**
 * The real transport. `token` is an async function returning the bot's token
 * or null (reads of a public repository work without one).
 */
export const curlTransport = ({ run, token, api = 'https://api.github.com' }) =>
  async ({ method = 'GET', path, query = {}, body }) => {
    const qs = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const secret = await token();
    // A curl config on stdin: nothing secret is in argv.
    const config = [
      `url = "${api}${path}${qs ? `?${qs}` : ''}"`,
      `request = "${method}"`,
      'header = "Accept: application/vnd.github+json"',
      'header = "X-GitHub-Api-Version: 2022-11-28"',
      'header = "User-Agent: garden"',
      ...(secret ? [`header = "Authorization: Bearer ${secret}"`] : []),
      ...(body === undefined ? [] : ['header = "Content-Type: application/json"', `data = ${JSON.stringify(JSON.stringify(body))}`]),
      'silent',
      'show-error',
      'write-out = "\\n%{http_code}"',
    ].join('\n');
    const r = run('curl', ['-K', '-'], { input: `${config}\n`, timeoutMs: 60000 });
    if (r.status !== 0) throw Object.assign(new Error(`cannot reach GitHub: ${r.stderr.trim()}`), { code: 'offline' });
    const cut = r.stdout.lastIndexOf('\n');
    const status = Number(r.stdout.slice(cut + 1));
    const text = r.stdout.slice(0, cut);
    return { status, json: text ? JSON.parse(text) : null };
  };

export const makeGitHub = ({ request, repo, perPage = 100 }) => {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) refuse('invalid', 'a repository is <owner>/<name>');
  const call = async (method, path, { query, body, ok = [200] } = {}) => {
    const r = await request({ method, path, query, body });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error(`GitHub is rate-limiting or forbidding ${method} ${path}`), { code: 'rate-limited' });
    if (!ok.includes(r.status)) throw Object.assign(new Error(`GitHub answered ${r.status} to ${method} ${path}`), { code: 'github', status: r.status });
    return r.json;
  };
  const pages = async (path, query) => {
    const all = [];
    for (let page = 1; page <= 50; page += 1) {
      const batch = await call('GET', path, { query: { ...query, per_page: perPage, page } });
      all.push(...batch);
      if (batch.length < perPage) break;
    }
    return all;
  };
  const numberOf = url => Number(String(url).split('/').pop());

  return harden({
    repo,
    /**
     * Issues opened, and comments made, at or after `since`, oldest first, as
     * plain events: {kind, id, number, author, created_at, url, title?, body,
     * pull, state}. Pull requests themselves are not issues here; comments on
     * them are events like any other comment.
     */
    events: async since => {
      const issues = await pages(`/repos/${repo}/issues`, { state: 'all', since, sort: 'created', direction: 'asc' });
      const comments = await pages(`/repos/${repo}/issues/comments`, { since, sort: 'created', direction: 'asc' });
      const events = [
        ...issues.filter(i => !i.pull_request && i.created_at >= since).map(i => ({ kind: 'issue', id: i.id, number: i.number, author: i.user?.login ?? '', created_at: i.created_at, url: i.html_url, title: i.title ?? '', body: i.body ?? '', pull: false, state: i.state })),
        ...comments.filter(c => c.created_at >= since).map(c => ({ kind: 'comment', id: c.id, number: numberOf(c.issue_url), author: c.user?.login ?? '', created_at: c.created_at, url: c.html_url, body: c.body ?? '', pull: String(c.html_url).includes('/pull/') })),
      ];
      return events.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
    },
    /** Add a reaction to an issue or a comment. Adding one that is there is not an error. */
    react: async ({ kind, id, number }, content = 'eyes') =>
      call('POST', kind === 'issue' ? `/repos/${repo}/issues/${number}/reactions` : `/repos/${repo}/issues/comments/${id}/reactions`, { body: { content }, ok: [200, 201] }),
    comments: async number => (await pages(`/repos/${repo}/issues/${number}/comments`, {})).map(c => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '' })),
    comment: async (number, body) => call('POST', `/repos/${repo}/issues/${number}/comments`, { body: { body }, ok: [201] }),
  });
};
