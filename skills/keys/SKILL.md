---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Keys

Design: `shed:designs/keys.md`. Keys are files under
`.garden-state/secrets/`, set by the maintainer.

```sh
garden keys status                 # which keys exist, and their modes; never a value
garden keys set <name>             # reads the key from standard input
garden keys remove <name>
```

- Type or pipe the key; never put it on a command line, in an environment
  variable, in a file an agent reads, or in a message.
- The names and who may read each are in `shed:keys/registry.yay`.
- If `status` shows `mode_ok: false`, treat that key as leaked: replace it at
  its provider, then set the new one.
- A client host's owner places that host's keys. None is sent over a branch.
