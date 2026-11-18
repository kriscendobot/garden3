// A stand-in for the GitHub REST API, for tests. It answers the five calls
// the garden makes, in the shapes GitHub documents for them (written from the
// documented schemas, not recorded from a live repository), and records every
// write. Nothing here touches a network.
export const makeFakeGitHub = ({ repo = 'kriscendobot/garden', perPage = 100 } = {}) => {
  const issues = [];
  const comments = [];
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
    /** A person comments on an issue (or, with pull: true, on a pull request). */
    addComment: (number, login, body, at, { pull = false } = {}) => {
      const id = (nextId += 1);
      comments.push({ id, user: user(login), body, created_at: at, updated_at: at, issue_url: `${api}/issues/${number}`, html_url: `${web}/${pull ? 'pull' : 'issues'}/${number}#issuecomment-${id}` });
      return id;
    },
  };
};
