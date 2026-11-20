#!/usr/bin/env node
// A stand-in for the warden, for tests on a host whose real warden is bound
// to its own slots directory. It does, unprivileged, what the warden's sim
// mode does for the steps a test needs: clear, plant, release. Nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fromArgs } from '../../src/shon.js';
import { stringify } from '../../src/yay.js';

const r = fromArgs(process.argv.slice(2)).value;
const home = path.join(r.root, r.slot ?? '');
if (r.op === 'clear') fs.rmSync(home, { recursive: true, force: true });
else if (r.op === 'plant') {
  for (const t of r.tombstones) {
    fs.rmSync(path.join(home, t), { recursive: true, force: true });
    fs.writeFileSync(path.join(home, t), 'nothing here for you\n', { mode: 0o444 });
  }
  for (const d of r.dirs) fs.mkdirSync(path.join(home, d), { recursive: true });
} else if (r.op !== 'release') {
  process.stdout.write(stringify({ ok: false, code: 'unsupported', error: `the test warden does not do ${r.op}` }));
  process.exit(0);
}
process.stdout.write(stringify({ ok: true }));
