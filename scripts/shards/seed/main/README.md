---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# The garden

A fleet of coding agents that works its maintainers' GitHub repositories, and
is steered through GitHub. Several maintainers operate it together; several
hosts run it, some of them on capacity that has been lent.

This branch is the front door. It holds this page and a wizard that sets up a
host. Everything else lives on other branches.

## Start

Clone this branch, open a coding agent in it with the person who operates the
machine beside you, and have the agent read [AGENTS.md](AGENTS.md). Or read
[SETUP.md](SETUP.md) yourself. To see what would happen without doing any of
it:

```sh
./wizard            # describes the steps; changes nothing
./wizard check      # looks for what the host needs; changes nothing
```

## Where things live

| Branch | Holds |
| --- | --- |
| `main` | this page and the wizard |
| `shed` | the garden itself: designs, roles, skills, services |
| `board` | the job board |
| `archive` | jobs that have left the board |
| `journal` | the slow record, and the maintainers' steering |
| `library` | what the garden has learned about the projects it works on |
| `plot/<name>` | one variant of the working roles |
| `host/<name>` | one host's own records |
| `clients` | orders for client hosts |
| `gate` | what runs as the maintainer, outside the box |

The designs on `shed` are working designs: what was built and what is still
to decide. A fuller explanation of how the garden works is meant to come with
an update to the garden book, which is not yet planned.

## Lineage

This repository begins without history. Its immediate ancestor is the prior
garden, kept whole in the repository it was moved aside to; mechanisms were
carried from it and from the tower that grew out of it, and history is
borrowed only where it is needed. The record is `ANCESTRY.md` on `shed`.
