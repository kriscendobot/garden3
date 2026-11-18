---
author: "maintainer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The gate

The root of the maintainer's own account on a host, outside the box. What
needs the maintainer's privileges lives here and nowhere inside the
container: carrying mail across to the tower, placing keys, giving orders to
client hosts, and the cutover to the fresh repository.

An agent working here works **as the maintainer**, with the maintainer's
access to this machine and to GitHub. It does only what the maintainer asks,
says what it will do first, and never brings anything from here into the box.

| Here | For |
| --- | --- |
| [roles/boatman](roles/boatman/AGENT.md), [skills/boatman](skills/boatman/SKILL.md) | mail between the garden and the tower |
| [skills/keys](skills/keys/SKILL.md) | placing and checking keys |
| [skills/client-orders](skills/client-orders/SKILL.md) | orders for client hosts |
| [cutover/](cutover/RUNBOOK.md) | moving the prior repository aside and publishing this one |

The code these use is the shed's (`garden mail`, `garden keys`), run from the
root checkout. This branch holds the procedures and the one script that must
run before the garden exists anywhere: `cutover/cutover.sh`.
