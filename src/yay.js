// yay.js — read and write the garden's documents.
//
// Everything the garden records is YAY (https://kriskowal.com/yay), as in the
// tower: data files are `.yay`, and Markdown documents carry strict YAY front
// matter ("Yaydown": `---`, YAY, `---`, exactly one blank line, the body).
// Parsing is the upstream parser, vendored unchanged (vendor/libyay). The
// writer here emits the block form the tower's records use, and checks every
// document it writes by parsing it back: a value that would not round-trip is
// an error, never a silently different file.
//
// YAY tells integers from floats; the parser gives integers as BigInt. The
// garden's records are easier to compute with as numbers, so on read a BigInt
// that fits a safe integer becomes a number, and on write an integral number
// is written as an integer and any other number as a float.

import { parseYay } from '../vendor/libyay/yay.js';
import { harden } from './harden.js';

const toPlain = v => {
  if (typeof v === 'bigint') {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`integer ${v} is too large for the garden's records`);
    }
    return Number(v);
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  }
  return v;
};

/** Parse a YAY document to plain data. */
export const parse = (text, filename) => toPlain(parseYay(text, filename));

const escapeString = s => {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp < 0xa0)) {
      out += `\\u{${cp.toString(16).toUpperCase().padStart(4, '0')}}`;
    } else out += ch;
  }
  return `${out}"`;
};

const emitKey = k => (/^[A-Za-z0-9_-]+$/.test(k) ? k : escapeString(k));

const emitScalar = v => {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'nan';
    if (v === Infinity) return 'infinity';
    if (v === -Infinity) return '-infinity';
    if (Number.isInteger(v)) return String(v);
    const s = String(v);
    return /[.e]/.test(s) ? s : `${s}.0`;
  }
  if (typeof v === 'string') return escapeString(v);
  if (Array.isArray(v) && v.length === 0) return '[]';
  if (v && typeof v === 'object' && Object.keys(v).length === 0) return '{}';
  throw new Error(`cannot write a ${typeof v} as a YAY scalar`);
};

const isScalar = v =>
  v === null ||
  typeof v !== 'object' ||
  (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

// A multi-line string is written as a block (a backtick, then the lines
// indented) when that is exact: it ends with one newline, has no trailing
// spaces, tabs or carriage returns, and does not begin or end with a blank
// line. Anything else is written quoted, with escapes.
const blockable = s =>
  s.includes('\n') &&
  s.endsWith('\n') &&
  !s.endsWith('\n\n') &&
  !s.startsWith('\n') &&
  !/[\t\r]/.test(s) &&
  !/ \n/.test(s) &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(s);

const emitLines = (v, ind, out, blocks = true) => {
  if (Array.isArray(v)) {
    for (const item of v) {
      if (isScalar(item)) out.push(`${ind}- ${emitScalar(item)}`);
      else {
        const sub = [];
        // Inside a list item every string is quoted: the parser does not take
        // a block string there.
        emitLines(item, `${ind}  `, sub, false);
        // The first line of a nested value shares the bullet's line.
        out.push(`${ind}- ${sub[0].slice(ind.length + 2)}`, ...sub.slice(1));
      }
    }
    return;
  }
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined) continue;
    const key = emitKey(k);
    if (blocks && typeof x === 'string' && blockable(x)) {
      out.push(`${ind}${key}: \``);
      for (const line of x.slice(0, -1).split('\n')) out.push(line === '' ? '' : `${ind}  ${line}`);
      out.push(''); // the canonical form has a blank line after a block string
    } else if (isScalar(x)) out.push(`${ind}${key}: ${emitScalar(x)}`);
    else {
      out.push(`${ind}${key}:`);
      emitLines(x, `${ind}  `, out, blocks);
    }
  }
};

const same = (a, b) => {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(k => a[k] !== undefined);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => same(a[k], b[k]));
};

/**
 * Write plain data as a YAY document. The root must be a non-empty object.
 * Keys are written in sorted order, so that two writers produce the same
 * bytes for the same record and diffs stay small.
 */
export const stringify = value => {
  const sort = v => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .filter(k => v[k] !== undefined)
          .sort()
          .map(k => [k, sort(v[k])]),
      );
    }
    return v;
  };
  const sorted = sort(value);
  if (!sorted || typeof sorted !== 'object' || Array.isArray(sorted) || Object.keys(sorted).length === 0) {
    throw new Error('a YAY document written by the garden is a non-empty object');
  }
  const attempt = blocks => {
    const out = [];
    emitLines(sorted, '', out, blocks);
    while (out[out.length - 1] === '') out.pop();
    const text = `${out.join('\n')}\n`;
    try {
      return same(sorted, parse(text)) ? text : null;
    } catch {
      return null;
    }
  };
  // With block strings where they are exact; failing that, all strings quoted.
  const text = attempt(true) ?? attempt(false);
  if (text === null) throw new Error('refusing to write a YAY document that does not read back as written');
  return text;
};

/** Split a Yaydown document into {front, body}. Strict: see the file header. */
export const parseYaydown = (text, filename) => {
  const m = /^---\n([\s\S]*?\n)---\n\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${filename ?? 'document'}: not Yaydown (---, YAY, ---, one blank line, body)`);
  if (m[2].startsWith('\n')) throw new Error(`${filename ?? 'document'}: more than one blank line after the front matter`);
  return harden({ front: parse(m[1], filename), body: m[2] });
};

export const stringifyYaydown = (front, body) => `---\n${stringify(front)}---\n\n${body.replace(/^\n+/, '')}`;

harden(parse);
harden(stringify);
