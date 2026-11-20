// watcher.js — the garden's GitHub watcher: maintainers steer the garden by
// issues and comments on its own repositories, and by addressing the bot in
// comments and reviews on the pull requests of the repositories it watches.
//
// Ported from the prior garden's issue-inbox-watcher.sh (and its
// handlers/issue-source-gh.sh): poll issues and comments since a cursor; drop
// anything not written by a maintainer BEFORE its text is read; turn the rest
// into work on the board; acknowledge; never let a model near the gate.
// Design: designs/watcher.md.
//
// What differs. The cursor lives on the board and moves in the SAME commit as
// the jobs an event produced, so the board's compare-and-swap is what makes
// "exactly one host acts on an event" true: of two watchers that saw the same
// comment, one push lands, and the other starts again from a board whose
// cursor is already past it. And a comment can do more than open a job: a
// small, closed set of verbs lets a maintainer release, abandon and throttle.

import * as rules from './board.js';
import { parse, stringify } from './yay.js';
import { harden, isName } from './harden.js';

/**
 * THE GATE. The one place that decides whose words the garden acts on.
 * An event whose author is not on the maintainers list comes out with its
 * title and body removed, so nothing downstream can read them even by
 * mistake. Logins compare case-insensitively. No pattern, no organisation
 * membership, no model: the list and nothing else.
 */
export const gate = (events, maintainers) => {
  const allowed = new Set(maintainers.map(m => String(m).toLowerCase()));
  return events.map(e => {
    if (allowed.has(String(e.author).toLowerCase())) return { ...e, trusted: true };
    const { title: _title, body: _body, ...rest } = e;
    return { ...rest, trusted: false };
  });
};

/** The verbs a maintainer's comment may begin with, after "@<bot> ". */
export const VERBS = harden(['release', 'abandon', 'throttle', 'retire', 'status']);

/**
 * Read a trusted comment addressed to the bot. The first line must start
 * exactly "@<bot> " (the prior garden's address gate); otherwise the comment
 * is maintainers talking to each other and nothing is done. Returns null, or
 * {verb, args, text} where verb is one of VERBS or 'ask' (anything else: a
 * request for the steward).
 */
export const address = (body, bot) => {
  const prefix = `@${bot} `;
  if (!body.startsWith(prefix)) return null;
  const text = body.slice(prefix.length).trim();
  const first = text.split('\n')[0].trim().split(/\s+/);
  const verb = VERBS.includes(first[0]) ? first[0] : 'ask';
  return { verb, args: verb === 'ask' ? [] : first.slice(1), text };
};

// What `seen` remembers an event by. Review comments and reviews are
// numbered apart from issue comments, so they are marked.
export const seenKey = e => ({ 'review-comment': `rc${e.id}`, review: `rv${e.id}` })[e.kind] ?? e.id;
const newer = (e, state) => e.created_at > (state.cursor ?? '') || (e.created_at === state.cursor && !(state.seen ?? []).includes(seenKey(e)));

/**
 * The prefix of the jobs a repository's events open: none for the garden's
 * home repository, its owner and name otherwise, so that issue 12 here and
 * issue 12 there are two jobs.
 */
export const jobPrefix = (repo, home) => (repo === home ? '' : `${repo.toLowerCase().replace('/', '-')}-`);

/**
 * Take cursors from elsewhere (the prior garden's, say) into the board's
 * record. Pure. A repository the board already has a later cursor for keeps
 * its own; an adopted cursor starts with nothing seen at its second. Returns
 * {watch, adopted}: the new record and the repositories whose cursor it set.
 */
export const adopt = (watch, cursors) => {
  const repos = { ...watch.repos };
  const adopted = [];
  for (const [repo, cursor] of Object.entries(cursors)) {
    if (repos[repo]?.cursor && repos[repo].cursor >= cursor) continue;
    repos[repo] = { cursor, seen: [] };
    adopted.push(repo);
  }
  return harden({ watch: { ...watch, repos }, adopted });
};

/**
 * Decide what a batch of gated events means. Pure. `state` is the repo's
 * {cursor, seen}; `board` is the board as it stands. Returns
 * {actions, state, strangers}: what to do, the advanced cursor, and the
 * logins of non-maintainers who wrote (never their words).
 */
export const decide = ({ events, state = {}, board, bot, repo, prefix = '' }) => {
  const actions = [];
  const strangers = [];
  let next = { cursor: state.cursor ?? '', seen: [...(state.seen ?? [])] };
  for (const e of events) {
    if (!newer(e, state)) continue;
    next = e.created_at > next.cursor ? { cursor: e.created_at, seen: [seenKey(e)] } : { cursor: next.cursor, seen: [...next.seen, seenKey(e)] };
    if (String(e.author).toLowerCase() === bot.toLowerCase()) continue; // the garden's own voice
    if (!e.trusted) {
      strangers.push({ login: e.author, url: e.url });
      continue;
    }
    const origin = { repo, issue: e.number, url: e.url, by: e.author, ...({ comment: { comment: e.id }, 'review-comment': { review_comment: e.id }, review: { review: e.id } })[e.kind] };
    if (e.kind === 'issue') {
      if (e.state === 'closed') continue; // closed before the garden saw it: nothing is asked
      const id = `${prefix}issue-${e.number}`;
      if (board.jobs[id]) continue;
      actions.push({ do: 'post', event: e, spec: { id, role: 'steward', title: e.title || `Issue ${e.number}`, body: `${e.body || e.title}\n`, source: e.url, origin, by: e.author } });
      continue;
    }
    const said = address(e.body, bot);
    if (!said) continue;
    const [a, b] = said.args;
    const bad = why => actions.push({ do: 'reply', event: e, key: `comment:${seenKey(e)}`, text: why });
    switch (said.verb) {
      case 'release':
      case 'abandon':
        if (!isName(a ?? '')) bad(`\`${said.verb}\` needs a job id.`);
        else if (!board.jobs[a]) bad(`There is no job \`${a}\` on the board.`);
        else actions.push({ do: said.verb, event: e, id: a, by: e.author, reason: said.text.split('\n')[0].split(/\s+/).slice(2).join(' ') });
        break;
      case 'throttle':
        if (!isName(a ?? '') || !/^[0-9]+(\.[0-9]+)?$/.test(b ?? '')) bad('`throttle` needs an arc and a number, as in `throttle endo 3`.');
        else actions.push({ do: 'throttle', event: e, arc: a, throttle: Number(b), by: e.author });
        break;
      case 'retire':
        if (!isName(a ?? '')) bad('`retire` needs an arc.');
        else actions.push({ do: 'throttle', event: e, arc: a, retire: true, by: e.author });
        break;
      case 'status':
        actions.push({ do: 'status', event: e });
        break;
      default: {
        const id = `${prefix}issue-${e.number}-c${e.id}`;
        if (!board.jobs[id]) actions.push({ do: 'post', event: e, spec: { id, role: 'steward', title: said.text.split('\n')[0].slice(0, 100), body: `${said.text}\n`, source: e.url, origin, by: e.author } });
      }
    }
  }
  return harden({ actions, state: next, strangers });
};

/** A few lines on the state of the board, for `status`. */
export const summary = (board, unplaceable = []) => {
  const count = where => Object.values(board.jobs).filter(e => e.where === where).length;
  const held = Object.values(board.jobs).filter(e => e.where === 'held' || e.where === 'failed').map(e => `\`${e.job.id}\` (${e.where === 'failed' ? 'failed' : e.job.hold?.reason ?? 'held'})`);
  return [`Open ${count('open')}, claimed ${count('claimed')}, held ${count('held')}, failed ${count('failed')}.`, ...(held.length ? [`Waiting on something: ${held.slice(0, 20).join(', ')}.`] : []), ...(unplaceable.length ? [`No live host can run: ${unplaceable.slice(0, 20).map(u => `\`${u.id}\` (${u.reason})`).join(', ')}.`] : []), `Quiescence: ${board.quiescence?.phase ?? 'idle'}.`].join('\n');
};

const WATCH = 'watch.yay';
export const readWatch = tree => {
  const text = tree.readIf(WATCH);
  return text ? parse(text, WATCH) : { repos: {}, strangers: [], reports: [] };
};

/**
 * `github` gives the client for a repository. `watches` is the list to
 * poll: {repo, issues, poll_seconds}. With `issues`, a maintainer opening an
 * issue asks for work (the garden's own repositories); without, only a
 * comment or review addressed to the bot does. Each repository is polled at
 * most once in its `poll_seconds`, and has its own cursor and commit.
 */
export const makeWatcher = ({ github, watches, home, board, budget, steward, journal, hostinfo, shards, clock, bot, overlapSeconds = 120, pollSeconds = 0, log = () => {} }) => {
  const polled = new Map();
  const maintainers = () => {
    const s = shards.shard('watcher', 'journal');
    if (!s.sync()) throw Object.assign(new Error('journal offline'), { code: 'offline' });
    return parse(s.tree.read('config/maintainers.yay')).maintainers;
  };
  // Ask from a little before the cursor: GitHub's `since` is by update time
  // and clocks are not ours. The cursor and `seen` discard the overlap.
  const sinceOf = cursor => (cursor ? new Date(Date.parse(cursor) - overlapSeconds * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : clock.now());
  const read = async (w, cursor, allowed) => gate(await github(w.repo).events(sinceOf(cursor), { issues: w.issues === true }), allowed);

  /** Poll one repository. Returns what landed, as short strings. */
  const poll = async (w, allowed) => {
    const { repo } = w;
    const prefix = jobPrefix(repo, home);
    const before = readWatch(await board.tree());
    const cursor = before.repos[repo]?.cursor;
    const since = sinceOf(cursor);
    const events = await read(w, cursor, allowed);

    // Slate changes are idempotent, so they are made before the cursor moves:
    // two hosts setting the same throttle is one throttle.
    let landed = null;
    await board.transact(`watch(${repo})`, (b, tree) => {
      const watch = readWatch(tree);
      const d = decide({ events, state: watch.repos[repo], board: b, bot, repo, prefix });
      if (d.state.cursor === (watch.repos[repo]?.cursor ?? '') && d.state.seen.length === (watch.repos[repo]?.seen ?? []).length) {
        landed = { actions: [], strangers: [], records: [] };
        if (!watch.repos[repo]) {
          watch.repos[repo] = { cursor: since, seen: [] };
          tree.write(WATCH, stringify(watch));
          return true;
        }
        return false;
      }
      const records = [];
      const done = [];
      for (const a of d.actions) {
        try {
          if (a.do === 'post') {
            if (rules.post(b, a.spec, clock.now())) watch.reports = [...(watch.reports ?? []), { job: a.spec.id, issue: a.event.number, ...(repo === home ? {} : { repo }) }];
          } else if (a.do === 'release') rules.release(b, a.id, { by: a.by }, clock.now());
          else if (a.do === 'abandon') records.push(...rules.abandon(b, a.id, { by: a.by, reason: a.reason || undefined }, clock.now()));
          done.push(a);
        } catch (err) {
          done.push({ do: 'reply', event: a.event, key: `comment:${seenKey(a.event)}`, text: `That was refused: ${err.message}` });
        }
      }
      const known = new Set(watch.strangers ?? []);
      const fresh = d.strangers.filter(s => !known.has(s.login.toLowerCase()));
      watch.strangers = [...(watch.strangers ?? []), ...new Set(fresh.map(s => s.login.toLowerCase()))].slice(-50);
      watch.repos[repo] = d.state;
      tree.write(WATCH, stringify(watch));
      landed = { actions: done, strangers: fresh, records };
      return true;
    });
    if (!landed) return [];

    // Only the host whose commit landed gets here with actions: it alone
    // archives, changes the slate, acknowledges and replies.
    const did = [];
    if (landed.records.length) await board.archive(landed.records);
    for (const a of landed.actions) {
      try {
        if (a.do === 'throttle') await budget.setThrottle({ by: a.by, arc: a.arc, throttle: a.throttle, retire: a.retire });
        if (a.do === 'status') await steward.reply(repo, a.event.number, `comment:${seenKey(a.event)}`, summary(await board.read(), hostinfo ? await board.unplaceable(await hostinfo.fleet()) : []));
        else if (a.do === 'reply') await steward.reply(repo, a.event.number, a.key, a.text);
        else await steward.ack(repo, a.event);
        did.push(`${a.do} ${a.spec?.id ?? a.id ?? a.arc ?? ''}`.trim());
      } catch (err) {
        log(`${a.do} for ${a.event.url} landed but could not be acknowledged: ${err.message}`);
        did.push(`${a.do} (unacknowledged)`);
      }
    }
    for (const s of landed.strangers) {
      if (journal) await journal.note('watcher', `\`${s.login}\`, who is not a maintainer, wrote at ${s.url}. It was not read.`);
      did.push(`stranger ${s.login}`);
    }
    return did;
  };

  /**
   * One round: every repository that is due. If GitHub cannot be reached, or
   * is limiting the bot, the round stops and no cursor moves past what was
   * not read. Any other refusal (a repository gone or private) is logged and
   * the others are polled; that one is tried again when next due.
   */
  const tick = async () => {
    const allowed = maintainers();
    if (allowed.length === 0) return harden(['inert: no maintainers are listed']);
    const now = Date.parse(clock.now());
    const did = [];
    for (const w of watches) {
      if (now - (polled.get(w.repo) ?? -Infinity) < (w.poll_seconds ?? pollSeconds) * 1000) continue;
      try {
        did.push(...(await poll(w, allowed)).map(x => (w.repo === home ? x : `${w.repo}: ${x}`)));
        polled.set(w.repo, now);
      } catch (err) {
        if (err.code === 'rate-limited' || err.code === 'offline') throw err;
        polled.set(w.repo, now);
        log(`${w.repo}: ${err.code ?? ''} ${err.message}; its cursor holds`);
      }
    }
    return harden(did);
  };

  /**
   * What the next poll of each watched repository would do, from its cursor
   * on the board, without polling's effects: nothing is written to the board
   * or to GitHub. For looking before resuming a watch whose cursor is old.
   */
  const preview = async () => {
    const allowed = maintainers();
    const watch = readWatch(await board.tree());
    const b = await board.read();
    const out = [];
    for (const w of watches) {
      const state = watch.repos[w.repo];
      if (!state) {
        out.push({ repo: w.repo, cursor: null, note: 'no cursor: its first poll starts from that moment' });
        continue;
      }
      const events = await read(w, state.cursor, allowed);
      const d = decide({ events, state, board: b, bot, repo: w.repo, prefix: jobPrefix(w.repo, home) });
      out.push({ repo: w.repo, cursor: state.cursor, events: events.filter(e => newer(e, state)).length, actions: d.actions.map(a => `${a.do} ${a.spec?.id ?? a.id ?? a.arc ?? ''} ${a.event.url}`.trim()), strangers: [...new Set(d.strangers.map(x => x.login))] });
    }
    return harden(out);
  };

  /** Adopt cursors, {repo: cursor}, into the board's record, in one commit. */
  const adoptCursors = async (cursors, why = 'adopted') => {
    let adopted = [];
    await board.transact(`watch: ${why}`, (_b, tree) => {
      const r = adopt(readWatch(tree), cursors);
      adopted = r.adopted;
      if (!adopted.length) return false;
      tree.write(WATCH, stringify(r.watch));
      return true;
    });
    return harden(adopted);
  };

  return harden({ tick, preview, adopt: adoptCursors });
};
