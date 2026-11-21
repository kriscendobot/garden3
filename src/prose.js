// prose.js — the garden writes American English, without Botese.
//
// Two curated lists beside skills/american-english-normalization/SKILL.md:
// divergences.tsv (British spellings and their American replacements) and
// cliches.tsv (Botese phrases and what to write instead). Each is an
// allow-list of literal entries, matched whole and ignoring case, so a search
// over them is exhaustive and never rewrites a real word. Prefer a miss to a
// false positive: a row the list lacks is proposed, never guessed.

import { harden, refuse } from './harden.js';

export const SKILL = 'skills/american-english-normalization';

/** Rows of a list: tab-separated, '#' lines and blank lines ignored. */
const rows = text =>
  text
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('\t'));

/** Parse both lists into the shape `findings` takes. */
export const parseLists = ({ divergences, cliches }) => ({
  spellings: rows(divergences).map(([category, british, american]) => ({ category, found: british, replacement: american })),
  phrases: rows(cliches).map(([category, phrase, suggestion, , scope]) => ({ category, found: phrase, replacement: suggestion, scope: scope || undefined })),
});

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole words: no letter, digit, apostrophe or hyphen may touch either end.
const whole = s => new RegExp(`(?<![\\p{L}\\p{N}'’-])${escape(s).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}'’-])`, 'giu');

/** Keep a replacement in the case of the word it replaces: capitalized, upper or lower. */
export const keepCase = (found, replacement) => {
  if (found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase();
  if (found[0] === found[0].toUpperCase() && found[0] !== found[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
};

/**
 * The findings in one text, as [{line, found, replacement, kind, category}],
 * in order. `surface` is 'pr-metadata' for a pull request's title and
 * description, where the rows scoped to it apply too.
 */
export const findings = (text, lists, { surface } = {}) => {
  const out = [];
  const lines = text.split('\n');
  const rules = [
    ...lists.spellings.map(r => ({ ...r, kind: 'spelling', re: whole(r.found) })),
    ...lists.phrases.filter(r => !r.scope || r.scope === surface).map(r => ({ ...r, kind: 'botese', re: whole(r.found) })),
  ];
  lines.forEach((line, i) => {
    for (const r of rules) {
      for (const m of line.matchAll(r.re)) {
        out.push({ line: i + 1, column: m.index + 1, found: m[0], replacement: r.kind === 'spelling' ? keepCase(m[0], r.replacement) : r.replacement, kind: r.kind, category: r.category });
      }
    }
  });
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
};

/** The added lines of a unified diff (-U0 or not), by file and new line number. */
export const addedLines = diff => {
  const out = [];
  let file = null;
  let line = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) file = l === '+++ /dev/null' ? null : l.slice(4).replace(/^b\//, '');
    else if (l.startsWith('@@')) line = Number(/\+(\d+)/.exec(l)?.[1] ?? 0);
    else if (l.startsWith('+') && file) out.push({ path: file, line: line++, text: l.slice(1) });
    else if (l.startsWith(' ')) line += 1;
  }
  return out;
};

/**
 * `garden prose`. `files` is the working directory, `lists` the shed's
 * copies of both lists. `check` reads whole files; `diff` reads only the lines
 * a change adds, so that text someone else wrote is left to its own rules.
 */
export const makeProse = ({ files, run, lists }) => {
  const at = (path, hits) => hits.map(h => `${path}:${h.line}:${h.column}: ${h.found} -> ${h.replacement}`);
  return harden({
    /** Every finding in the named files, or in every tracked file if none is named. */
    check: (...paths) => {
      const named = paths.length ? paths : run('git', ['-C', files.root, 'ls-files', '-z']).stdout.split('\0').filter(Boolean);
      return named.flatMap(p => {
        if (!files.exists(p)) refuse('missing', `no file ${p}`);
        const text = files.read(p);
        return text.includes('\0') ? [] : at(p, findings(text, lists));
      });
    },
    /** Every finding in the lines added since `base`. */
    diff: (base = 'HEAD') =>
      addedLines(run('git', ['-C', files.root, 'diff', '-U0', '--no-color', base, '--']).stdout).flatMap(a =>
        findings(a.text, lists).map(h => `${a.path}:${a.line}:${h.column}: ${h.found} -> ${h.replacement}`),
      ),
    /** Findings in a pull request's title and description, given as text. */
    metadata: text => at('pull-request', findings(String(text), lists, { surface: 'pr-metadata' })),
  });
};
