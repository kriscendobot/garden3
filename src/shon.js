// shon.js — structured data on a command line.
//
// SHON (https://kriskowal.com/shon; the YAY edition is SHON.md in
// kriskowal/yay) writes YAY's data model as argv words: `[ --op clear --slot
// slot01 ]` is the object {op: "clear", slot: "slot01"}. The garden's command
// lines take one such value instead of ad hoc flags, so a command is already
// a method call with a data argument (designs/data-model.md), and it is the
// message format from the JavaScript services to the Rust warden, which
// parses it with upstream libyay's shon module.
//
// Upstream implements SHON only in Rust. This is the garden's own JavaScript
// reading of SHON.md, for the subset the garden uses: null, booleans,
// integers, floats, strings, arrays and objects. Bytes (-x) and the file
// readers (-b, -s) are refused rather than half-supported.

import { harden } from './harden.js';

const INTEGER = /^-?[0-9]+$/;
const FLOAT = /^-?[0-9]*\.[0-9]*([eE][+-]?[0-9]+)?$/;
const KEY = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const RESERVED = new Set(['-n', '-t', '-f', '-I', '-i', '-N', '-x', '-b', '-s', '[', ']', '--', '[--]', '[]']);

/** Data to argv words. The root must be an array or an object. */
export const toArgs = value => {
  const out = [];
  const emit = v => {
    if (v === null) out.push('-n');
    else if (v === true) out.push('-t');
    else if (v === false) out.push('-f');
    else if (typeof v === 'number') {
      if (Number.isNaN(v)) out.push('-N');
      else if (v === Infinity) out.push('-I');
      else if (v === -Infinity) out.push('-i');
      else if (Number.isInteger(v)) out.push(String(v));
      else out.push(/[.]/.test(String(v)) && !/e/.test(String(v)) ? String(v) : v.toFixed(17).replace(/0+$/, '0'));
    } else if (typeof v === 'string') {
      // A word that would read as something else is escaped with `--`.
      if (RESERVED.has(v) || INTEGER.test(v) || FLOAT.test(v) || v.startsWith('--')) out.push('--', v);
      else out.push(v);
    } else if (Array.isArray(v)) {
      out.push('[');
      v.forEach(emit);
      out.push(']');
    } else if (v && typeof v === 'object') {
      const keys = Object.keys(v).filter(k => v[k] !== undefined);
      if (keys.length === 0) out.push('[--]');
      else {
        out.push('[');
        for (const k of keys) {
          if (!KEY.test(k)) throw new Error(`'${k}' cannot be a SHON key`);
          out.push(`--${k}`);
          emit(v[k]);
        }
        out.push(']');
      }
    } else throw new Error(`cannot write a ${typeof v} as SHON`);
  };
  if (value === null || typeof value !== 'object') throw new Error('a SHON root is an array or an object');
  emit(value);
  return out;
};

/** Argv words to data. Returns {value, rest}: the words after the value. */
export const fromArgs = args => {
  let i = 0;
  const fail = m => {
    throw new Error(`SHON: ${m}`);
  };
  const value = () => {
    const tok = args[i];
    if (tok === undefined) fail('a value is missing');
    i += 1;
    switch (tok) {
      case '-n': return null;
      case '-t': return true;
      case '-f': return false;
      case '-I': return Infinity;
      case '-i': return -Infinity;
      case '-N': return NaN;
      case '-x': case '-b': case '-s': return fail(`${tok} is not supported here`);
      case '[--]': return {};
      case '[]': return [];
      case ']': return fail('unexpected ]');
      case '--':
        if (args[i] === undefined) fail('-- needs a word');
        i += 1;
        return args[i - 1];
      case '[': return compound();
      default:
        if (INTEGER.test(tok)) {
          const n = Number(tok);
          if (!Number.isSafeInteger(n)) fail(`integer ${tok} is too large`);
          return n;
        }
        if (FLOAT.test(tok) && tok !== '.' && tok !== '-.') return Number(tok);
        if (tok.startsWith('--')) fail(`unexpected key ${tok}`);
        return tok;
    }
  };
  const compound = () => {
    const isKey = t => t !== undefined && t.startsWith('--') && t.length > 2 && KEY.test(t.slice(2));
    if (isKey(args[i])) {
      const obj = {};
      while (args[i] !== ']') {
        if (!isKey(args[i])) fail(`expected a --key, found ${args[i] ?? 'the end'}`);
        const key = args[i].slice(2);
        i += 1;
        obj[key] = value();
      }
      i += 1;
      return obj;
    }
    const arr = [];
    while (args[i] !== ']') {
      if (args[i] === undefined) fail('missing ]');
      arr.push(value());
    }
    i += 1;
    return arr;
  };
  if (args[0] !== '[' && args[0] !== '[--]' && args[0] !== '[]') fail('a SHON value on a command line starts with [');
  const v = value();
  return harden({ value: v, rest: args.slice(i) });
};
