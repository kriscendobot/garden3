---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/relative-paths"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Relative paths

Purpose: links and paths in documents work wherever the document is read: in
a clone, a job's home, a tarball, GitHub's web view.

## The rule

Within one tree, every link, cross-reference and path in a document is
**relative**, never absolute:

- Markdown links: `[text](../skills/foo/SKILL.md)`, not a link that starts
  with a machine's home directory.
- Paths in prose: `` `roles/builder/AGENT.md` ``.
- Sample commands: `git -C board log`, not `git -C /home/<user>/garden/board
  log`. Where a command must name the root, write `<garden-root>` or
  `<checkout>`.

External URLs are absolute by nature and unaffected.

## Why

An absolute path bakes in one machine's layout: it is wrong everywhere else,
and it can leak a user name or a host's layout into a public repository. A
relative link also lets GitHub's renderer make it navigable instead of a 404.

## Which tree

The test: if the citing document and the cited file live in the same tree,
the path is relative to the citing file. In this garden:

- Roles, skills and designs live in one tree. A role links a skill as
  `../../skills/<name>/SKILL.md`; a skill links another as
  `../<name>/SKILL.md`; either reaches a design as `../../designs/<name>.md`.
- A job's home is a copy of that tree with its plot over it, so the same
  links resolve there. Write them so they also resolve in the shed.
- Material under `reference/` and a project checkout under `worktrees/` are
  other trees. Name them by their path from the home's root, in backticks
  (`reference/library/conventions.md`, `worktrees/<org>/<name>/`), not by a
  link that climbs out of the document's tree.
- Inside a project, follow the project's own convention for its documents.

## Writing them

Inside `<root>/<dir>/<file>.md`:

- `sibling.md` for the same directory;
- `../other-dir/foo.md` for a sibling directory;
- `../../some-package/README.md` two levels up;
- in prose rather than a link target, a path from the tree's root
  (`packages/foo/src/bar.js`) is fine. Pick one form and keep to it in a
  file.

## Pitfalls

- **Sample commands** pasted with a `cd` into the directory you ran them
  from. Rewrite as `cd <garden-root>`, or drop the `cd`.
- **Tool output** from `find`, `grep -rn` or `git status` carries absolute
  prefixes. Strip them before pasting into prose.
- **Another repository**: a relative path with `..` if the two sit side by
  side by convention; otherwise its URL.
- **A worktree's `.git` is a file**, not a directory. Name the bare
  repository's admin paths (`<bare>/info/exclude`), not a per-worktree
  `.git/info/exclude` that does not exist.

## Sweep

```sh
grep -RnE '/(home|Users)/[^ )"`<]+' --include='*.md' . | grep -v '^./reference/'
```

For each hit, ask whether a reader on another machine could follow it. If
not, rewrite it relative.

Adapted from the prior garden's `skills/relative-paths`.
