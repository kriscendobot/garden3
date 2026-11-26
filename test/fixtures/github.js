// A stand-in for the GitHub REST API, for tests. It answers the calls the
// garden makes, in the shapes GitHub documents for them (written from the
// documented schemas, not recorded from a live repository), and records every
// write. Nothing here touches a network.
export const makeFakeGitHub = ({ repo = 'kriscendobot/garden', perPage = 100, issuesOff = false } = {}) => {
  const issues = [];
  const comments = [];
  const pulls = [];
  const inline = [];
  const reviews = [];
  const writes = [];
  let nextId = 9000;
  let failWith = null;
  const user = login => ({ login, id: login.length, type: 'User' });
  const api = `https://api.github.com/repos/${repo}`;
  const web = `https://github.com/${repo}`;
  const page = (list, q) => list.slice(((q.page ?? 1) - 1) * (q.per_page ?? perPage), (q.page ?? 1) * (q.per_page ?? perPage));
  const request = async ({ method = 'GET', path, query = {}, body }) => {
    if (failWith) return { status: failWith, json: { message: 'API rate limit exceeded' } };
    const rel = path.replace(`/repos/${repo}`, '');
    let m;
    // A fork with Issues off: its issue feeds are gone for good.
    if (issuesOff && method === 'GET' && (rel === '/issues' || rel === '/issues/comments')) return { status: 410, json: { message: 'Issues are disabled for this repo' } };
    if (method === 'GET' && rel === '/pulls') return { status: 200, json: page([...pulls].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)), query) };
    if (method === 'GET' && rel === '/pulls/comments') return { status: 200, json: page(inline.filter(c => c.updated_at >= (query.since ?? '')), query) };
    if (method === 'GET' && (m = /^\/pulls\/(\d+)$/.exec(rel))) { const p = pulls.find(x => x.number === Number(m[1])); return p ? { status: 200, json: p } : { status: 404, json: { message: 'Not Found' } }; }
    if (method === 'GET' && (m = /^\/pulls\/(\d+)\/reviews$/.exec(rel)))return { status: 200, json: page(reviews.filter(r => r.pull === Number(m[1])), query) };
    if (method === 'POST' && (m = /^\/pulls\/comments\/(\d+)\/reactions$/.exec(rel))) { writes.push({ react: 'review-comment', id: Number(m[1]), content: body.content }); return { status: 201, json: { id: (nextId += 1), content: body.content } }; }
    if (method === 'GET' && rel === '/issues') return { status: 200, json: page(issues.filter(i => i.updated_at >= (query.since ?? '')), query) };
    if (method === 'GET' && rel === '/issues/comments') return { status: 200, json: page(comments.filter(c => c.updated_at >= (query.since ?? '')), query) };
    if (method === 'GET' && (m = /^\/issues\/(\d+)\/comments$/.exec(rel))) return { status: 200, json: page(comments.filter(c => c.issue_url.endsWith(`/${m[1]}`)), query) };
    if (method === 'POST' && (m = /^\/issues\/(\d+)\/comments$/.exec(rel))) {
      const c = { id: (nextId += 1), user: user('kriscendobot'), body: body.body, created_at: '2026-11-17T23:59:59Z', updated_at: '2026-11-17T23:59:59Z', issue_url: `${api}/issues/${m[1]}`, html_url: `${web}/issues/${m[1]}#issuecomment-${nextId}` };
      comments.push(c);
      writes.push({ comment: Number(m[1]), body: body.body });
      return { status: 201, json: c };
    }
    if (method === 'POST' && (m = /^\/issues\/(\d+)\/reactions$/.exec(rel))) { writes.push({ react: 'issue', number: Number(m[1]), content: body.content }); return { status: 201, json: { id: (nextId += 1), content: body.content } }; }
    if (method === 'POST' && (m = /^\/issues\/comments\/(\d+)\/reactions$/.exec(rel))) { writes.push({ react: 'comment', id: Number(m[1]), content: body.content }); return { status: 201, json: { id: (nextId += 1), content: body.content } }; }
    return { status: 404, json: { message: 'Not Found' } };
  };
  return {
    request,
    writes,
    fail: status => { failWith = status; },
    /** A person opens an issue. */
    openIssue: (number, login, title, body, at, extra = {}) => {
      issues.push({ id: 1000 + number, number, title, body, state: 'open', user: user(login), created_at: at, updated_at: at, html_url: `${web}/issues/${number}`, ...extra });
    },
    /** A pull request, touched at `at`; `head` is {ref, sha}, in this repository. */
    openPull: (number, login, at, { head = { ref: `topic-${number}`, sha: '0'.repeat(40) }, base = 'main' } = {}) => {
      const p = pulls.find(x => x.number === number);
      if (p) p.updated_at = at;
      else pulls.push({ id: 5000 + number, number, user: user(login), state: 'open', created_at: at, updated_at: at, html_url: `${web}/pull/${number}`, head: { ref: head.ref, sha: head.sha, repo: { full_name: repo } }, base: { ref: base } });
    },
    /** Someone else pushes to a pull request's head. */
    movePull: (number, sha) => { pulls.find(x => x.number === number).head.sha = sha; },
    /** An inline comment on a pull request's diff; it touches the pull request. */
    addReviewComment: (number, login, body, at) => {
      const id = (nextId += 1);
      inline.push({ id, user: user(login), body, created_at: at, updated_at: at, pull_request_url: `${api}/pulls/${number}`, html_url: `${web}/pull/${number}#discussion_r${id}` });
      pulls.find(x => x.number === number).updated_at = at;
      return id;
    },
    /** A submitted review; it touches the pull request. */
    addReview: (number, login, body, at, state = 'COMMENTED') => {
      const id = (nextId += 1);
      reviews.push({ id, pull: number, user: user(login), body, state, submitted_at: at, html_url: `${web}/pull/${number}#pullrequestreview-${id}` });
      pulls.find(x => x.number === number).updated_at = at;
      return id;
    },
    /** A person comments on an issue (or, with pull: true, on a pull request). */
    addComment: (number, login, body, at, { pull = false } = {}) => {
      const id = (nextId += 1);
      comments.push({ id, user: user(login), body, created_at: at, updated_at: at, issue_url: `${api}/issues/${number}`, html_url: `${web}/${pull ? 'pull' : 'issues'}/${number}#issuecomment-${id}` });
      return id;
    },
  };
};
