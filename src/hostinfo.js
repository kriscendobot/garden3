// hostinfo.js — what a host is, as the host itself reports it.
//
// Nothing in the garden assumes what a host is. Each host looks at itself at
// every start (and at each quiescence), and publishes one record, host.yay,
// on its own host/<name> branch: its architecture, its size, and which
// capabilities it has installed or could install. Other hosts and the
// maintainers read it to see where work can go (designs/hosts.md). The record
// is rewritten only when it changes, so it adds no churn.

import { parse, stringify } from './yay.js';
import { harden } from './harden.js';

/** Build a host's self-description. Pure: `probe` and `offer` are handed in. */
export const describe = ({ host, probe, offer, slots, shed, client = false }) =>
  harden({
    host,
    arch: probe.arch,
    os: probe.os,
    cores: probe.cores,
    memory_gb: Math.round((probe.memory_bytes / 2 ** 30) * 10) / 10,
    gpu: probe.devices.length > 0,
    devices: [...probe.devices].sort(),
    client,
    slots,
    shed,
    capabilities: { installed: [...offer.installed].sort(), available: [...offer.available].sort() },
  });

export const makeHostInfo = ({ shards, host, clock, probe, capabilities, slots, shed, client = () => false }) => {
  const current = async () => describe({ host, probe: probe(), offer: await capabilities.offer(), slots, shed: shed(), client: client() });
  return harden({
    describe: current,
    /** Publish this host's record if it differs from what is there. Returns true if it wrote. */
    publish: async () => {
      const mine = await current();
      let wrote = false;
      await shards.shard('hostinfo', `host/${host}`).land(`host: ${mine.arch}, ${mine.capabilities.installed.length} capabilities`, tree => {
        const have = tree.readIf('host.yay');
        const { updated_at: _at, ...was } = have ? parse(have) : {};
        if (have && stringify(was) === stringify(mine)) return { skip: true };
        tree.write('host.yay', stringify({ ...mine, updated_at: clock.now() }));
        wrote = true;
        return {};
      });
      return wrote;
    },
    /** Every host's record, from the host branches. A host with none yet is absent. */
    fleet: async () => {
      const out = [];
      for (const ref of shards.refs('refs/heads/host/*')) {
        const s = shards.shard('hostinfo', ref.replace('refs/heads/', ''));
        if (!s.sync()) continue;
        const text = s.tree.readIf('host.yay');
        if (text) out.push(parse(text, ref));
      }
      return harden(out);
    },
  });
};
