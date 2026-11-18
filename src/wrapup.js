// wrapup.js — "wrap it up": the deadline notes a running job receives.
//
// Preserved from the priors (designs/wrap-it-up.md). The prior garden's
// deadline-nudge.sh warned a job once, at the lesser of a quarter of its
// window and 15 minutes left: "Wrap up now." The tower kept the leads and the
// wording, added a final note (the lesser of 2 minutes and half the warning's
// lead), and delivered both through Claude Code's PostToolUse hook, so a note
// reaches the agent in the turn it is working in, with nothing written to a
// branch and nothing to poll. The garden takes the tower's delivery, because a
// note that is a push to the board is exactly the churn the board no longer
// carries.
//
// What a job does on the first note is unchanged: land what is proven, save
// the rest, and either finish (if what remains fits) or hand off and say so.
// The hand-off is the planning event of designs/omega.md; the note is what
// prompts it. A job that does neither is stopped at its deadline by the
// warden, its uncommitted work is saved to wip/<id> at harvest, and it is
// requeued: an overrun, not a hand-off.

import { harden } from './harden.js';

/** Seconds left at each note: {warn, final}. */
export const leads = windowS => {
  const warn = Math.min(Math.floor(windowS / 4), 900);
  return harden({ warn, final: Math.min(Math.floor(warn / 2), 120) });
};

const human = s => (s >= 120 ? `${Math.round(s / 60)} minutes` : `${Math.max(0, Math.round(s))} seconds`);

/** The clock paragraph of a job's prompt. */
export const clockNote = ({ id, windowS, deadlineIso }) => {
  const { warn, final } = leads(windowS);
  return [
    `Your clock: this run of \`${id}\` has ${human(windowS)} of wall time, and it is stopped at ${deadlineIso} (\`date -u\` tells you the time). A deadline note reaches you after a tool call when ${human(warn)} are left, and a final one at ${human(final)}. A long command delays them, so keep each command well inside the time left.`,
    '',
    'When the first note comes, or sooner when you see the job will not fit, wrap it up:',
    '- Land what is proven: commit it on your job branch in the project checkout.',
    '- If what remains fits in the time left, finish, and write your report to `outbox/report.md`.',
    '- Otherwise hand off. Write `outbox/handoff.yay` naming the steps that remain (`reason`, and `steps`, each with an `id`, a `title` and a `body` that says what it starts from; use `after` to order them), then say in `outbox/report.md` what is done and what is left. That records a hand-off, not a finished job: your job waits on those steps and closes when they are done.',
    'At the final note, commit safe work in progress at once. If the run is stopped anyway, your uncommitted work is saved to a `wip/` branch, but do not count on it. Never report an unfinished job as complete.',
  ].join('\n');
};

/**
 * The PostToolUse hook's decision. `flags` remembers which notes this run has
 * had ({has(name), set(name)}); each note goes once. Returns the note text,
 * or null to say nothing. A hook must never stop a tool call, so anything
 * missing or malformed yields null.
 */
export const note = ({ id, windowS, deadlineEpoch, nowEpoch, flags }) => {
  if (!id || !Number.isFinite(windowS) || !Number.isFinite(deadlineEpoch) || !Number.isFinite(nowEpoch)) return null;
  const { warn, final } = leads(windowS);
  const left = deadlineEpoch - nowEpoch;
  if (left > warn) return null;
  const at = new Date(deadlineEpoch * 1000).toISOString().slice(11, 16);
  if (left <= final) {
    if (flags.has('final')) return null;
    flags.set('final');
    flags.set('warning');
    return `Garden deadline note, final: about ${human(left)} are left in this run of \`${id}\` (it is stopped at ${at}Z). Commit safe work in progress now, then write your report: hand off with \`outbox/handoff.yay\` if you parked the rest, as your prompt's clock says.`;
  }
  if (flags.has('warning')) return null;
  flags.set('warning');
  return `Garden deadline note: about ${human(left)} are left in this run of \`${id}\` (it is stopped at ${at}Z). Wrap up now, as your prompt's clock says: land what is proven, then finish if the rest fits, or hand off with \`outbox/handoff.yay\` and say what remains.`;
};

/** The hook's reply to Claude Code, or null. */
export const hookOutput = text => (text ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } } : null);

/**
 * What a run amounted to, from what it left behind. `handoff` and `report`
 * are the contents of outbox/handoff.yay and outbox/report.md (or null).
 *   handoff  it handed off (the planning event)
 *   done     it finished and said so
 *   overrun  it was stopped at its deadline having done neither: requeue
 *   failed   it exited without a report
 */
export const outcome = ({ timedOut, status, handoff, report }) => {
  if (handoff) return 'handoff';
  if (timedOut) return 'overrun';
  if (report && status === 0) return 'done';
  return 'failed';
};
