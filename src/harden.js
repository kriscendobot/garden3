// harden.js — deep-freeze a value, so no holder of an object can change it
// under another holder.
//
// The garden's modules are written in the object-capability style of Hardened
// JavaScript (Endo), which is where its workers are meant to end up
// (designs/ascent.md): a module exports `make*` functions that take the powers
// they need as arguments, reach for no ambient authority, and return hardened
// objects whose methods are async. Under SES `harden` is a global; here a
// plain deep freeze stands in for it, so the same source runs in both.

const freezeDeep = (value, seen = new WeakSet()) => {
  if (Object(value) !== value || seen.has(value)) return value;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (desc && 'value' in desc) freezeDeep(desc.value, seen);
  }
  return value;
};

export const harden = globalThis.harden ?? freezeDeep;

/** A refusal is an expected "no", with a stable code a caller can branch on. */
export class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Refusal';
    this.code = code;
  }
}
harden(Refusal);

export const refuse = (code, message) => {
  throw new Refusal(code, message);
};

/** Names of jobs, hosts, arcs, plots and capabilities share one safe shape. */
export const isName = s =>
  typeof s === 'string' &&
  /^[a-z0-9][a-z0-9._-]{0,99}$/.test(s) &&
  !s.includes('..') &&
  !s.endsWith('.lock');
