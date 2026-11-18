// mail.js — the boatman's cargo: mail between the garden and the tower.
//
// The tower is private and has no channel to the garden: what is for the
// garden, the tower drafts into its mail/garden/ directory and the maintainer
// carries by hand (the tower's designs/garden-protocol.md). On disk that carry
// has been a renaming copy between sibling directories. This module is that
// same carry, made checkable, and it keeps the valve: nothing crosses unless
// the maintainer has approved that exact file, by its sha256. It runs outside
// the box, as the maintainer, from the gate (gate:skills/boatman).
//
//   tower -> garden   <tower>/mail/garden/YYYY-MM-DD-GARDEN-<slug>.md
//                       -> <garden>/mail/inbox/YYYYMMDD-tower-<slug>.md
//                       and the original moves to
//                          <tower>/mail/garden/archive/YYYY-MM-DD-carried-GARDEN-<slug>.md
//   garden -> tower   <garden>/mail/outbox/YYYY-MM-DD-TOWER-<slug>.md
//                       -> <tower>/drop/from-garden/YYYYMMDD-garden-<slug>.md
//                       and the original moves to <garden>/mail/outbox/archive/
//
// The names are the ones found on disk in both references. Mail carries no
// authority of its own: what arrives is text the maintainer chose to carry,
// and it becomes work only when the steward posts a job for it.

import { harden, refuse } from './harden.js';

const IN = /^(\d{4})-(\d{2})-(\d{2})-GARDEN-([a-z0-9][a-z0-9._-]*)\.md$/;
const OUT = /^(\d{4})-(\d{2})-(\d{2})-TOWER-([a-z0-9][a-z0-9._-]*)\.md$/;

export const makeBoatman = ({ files, sha256File, towerDir, gardenDir, clock }) => {
  const tower = files(towerDir);
  const garden = files(gardenDir);
  const scan = (tree, dir, pattern) =>
    tree.list(dir).filter(f => pattern.test(f) && !tree.isDir(`${dir}/${f}`)).map(f => {
      const [, y, m, d, slug] = pattern.exec(f);
      return { file: f, date: `${y}-${m}-${d}`, slug, sha256: sha256File(tree.path(`${dir}/${f}`)), bytes: tree.readBytes(`${dir}/${f}`).length };
    });
  const carry = (pending, approve, move) => {
    const unknown = approve.filter(sha => !pending.some(p => p.sha256 === sha));
    if (unknown.length) refuse('not-pending', `no pending mail has sha256 ${unknown.join(', ')}; it may have changed since it was listed`);
    return pending.filter(p => approve.includes(p.sha256)).map(move);
  };
  const copyChecked = (from, fromRel, to, toRel, want) => {
    if (to.exists(toRel)) refuse('exists', `${to.path(toRel)} already exists`);
    to.writeBytes(toRel, from.readBytes(fromRel));
    if (sha256File(to.path(toRel)) !== want) {
      to.remove(toRel);
      refuse('checksum', `${fromRel} changed while it was carried`);
    }
  };

  return harden({
    /** Mail waiting on each bank: {toGarden: [...], toTower: [...]}, each with its sha256. */
    pending: async () => harden({ toGarden: scan(tower, 'mail/garden', IN), toTower: scan(garden, 'mail/outbox', OUT) }),

    /** Carry approved mail from the tower to the garden. Returns receipts. */
    carryToGarden: async ({ approve = [] } = {}) =>
      carry(scan(tower, 'mail/garden', IN), approve, p => {
        const dest = `mail/inbox/${p.date.replaceAll('-', '')}-tower-${p.slug}.md`;
        copyChecked(tower, `mail/garden/${p.file}`, garden, dest, p.sha256);
        tower.rename(`mail/garden/${p.file}`, `mail/garden/archive/${p.date}-carried-GARDEN-${p.slug}.md`);
        return { direction: 'tower-to-garden', slug: p.slug, date: p.date, sha256: p.sha256, bytes: p.bytes, carried_at: clock.now(), arrived: dest };
      }),

    /** Carry approved mail from the garden to the tower. Returns receipts. */
    carryToTower: async ({ approve = [] } = {}) =>
      carry(scan(garden, 'mail/outbox', OUT), approve, p => {
        const dest = `drop/from-garden/${p.date.replaceAll('-', '')}-garden-${p.slug}.md`;
        copyChecked(garden, `mail/outbox/${p.file}`, tower, dest, p.sha256);
        garden.rename(`mail/outbox/${p.file}`, `mail/outbox/archive/${p.file}`);
        return { direction: 'garden-to-tower', slug: p.slug, date: p.date, sha256: p.sha256, bytes: p.bytes, carried_at: clock.now(), arrived: dest };
      }),
  });
};
