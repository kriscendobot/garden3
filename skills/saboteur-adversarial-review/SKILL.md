---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/saboteur-adversarial-review"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Saboteur adversarial review

Purpose: a catalog of attack classes that ordinary review covers poorly,
checked first whenever a review takes the adversary's seat. A type reviewer
sees "takes a string, returns a string"; the saboteur asks what happens when
the string is `..`, or holds a newline or a `:`, or names a symlink, or comes
from a namespace the code did not expect.

The `saboteur` seat of the code panel reads this catalog first, then
brainstorms the rest with [adversarial-tests](../adversarial-tests/SKILL.md)
([panel](../panel/SKILL.md)). A reviewer asked "what would an attacker do
here?" about one module uses it the same way.

## Environment derived from a root filesystem

Whenever a sandbox or container driver derives an environment variable
(`PATH`, `LD_LIBRARY_PATH`, `XDG_*`, `NODE_PATH`) from a filesystem layout (by
probing for bin directories, mining the ambient environment, or reading an
image's `Config.Env`), check six things string-shape tests will not catch:

1. **Symlinks past a prefix check.** `startsWith('/tmp/')` does not see
   through a link: an operator's `/opt/eve -> /tmp/attacker` survives and
   becomes a writable `PATH` entry. Resolve survivors with
   `fs.realpathSync` and check the resolved value again.
2. **Delimiter injection.** Joining entries with `:` (or `;`, or `\0`)
   without checking them lets a caller add entries by embedding the delimiter
   in a path they supply; a newline corrupts the spawn argument list. Drop any
   entry that contains the delimiter or a control character.
3. **Relative paths probed against the working directory.** A non-absolute
   `hostPath` (`srv/foo`, `..`) makes `existsSync(`${hostPath}/usr/bin`)` probe
   the daemon's own directory. Fail closed early: no leading `/`, no entries.
4. **An empty probe falling back to host defaults.** Falling back to a fixed
   `/usr/local/bin:/usr/bin:/bin` that does not exist in the image makes
   commands fail with `ENOENT` for no visible reason. Fall back to empty, or
   document the guarantee.
5. **Time of check and time of use.** Is the value fixed when the object is
   made, or derived again at each spawn? Either is defensible; an undocumented
   choice is a finding.
6. **Precedence over the caller's entries.** Whether derived entries come
   before or after the caller's decides whether a hostile mount can shadow
   `/usr/bin`. Root-filesystem defaults first, caller mounts last; flag it if
   inverted or undocumented.

Run these on any change to a path-deriving driver, or any new code that mines
`process.env`, inspects an image or probes mounts and ends in a spawn's
arguments. Unit tests for such helpers rarely exercise symlinks, control
characters or relative probes, because each needs a real filesystem probe:
they need adversarial cases, not shape tests.

## Catch-all error swallowing

A `catch` that absorbs every error (`catch {}`, `catch { return undefined }`,
`catch (e) { return false }`) with no narrowing on `instanceof`, `.code` or
`.name`, and no rethrow or log. Ask which errors this catch is entitled to
eat, and what the caller does with the falsy result. In a confinement,
permission or validation path, a swallowed exception silently becomes "allow"
or "not found": **fail-open**. Narrow to the expected class and rethrow the
rest, or at least log before going on.

Check the breadth of the error classes caught, not only the width of the
`try` body (the prior saboteur missed this by looking only at the latter).
Also check the callback form (`.catch(cb)`), catches around code the change
did not touch, and catches that log but still fail open.

## Reporting

Each check is its own finding: one line with the `file:line` it targets, a
verdict (real concern, mitigated, or out of scope) and a one-line reason.
Real concerns that would let an attacker in are must-fix
([panel-review](../panel-review/SKILL.md)).

## Growing the catalog

When an attack class recurs in reviews, add it here: what it looks like, the
checks, the mitigation, and where to run them. Keep a class only when it
has caught something real.

Not built yet: a deterministic check, before review, for an added catch block
that neither narrows nor rethrows nor logs. The prior garden had one; here the
saboteur checks by hand.

Adapted from the prior garden's `skills/saboteur-adversarial-review`.
