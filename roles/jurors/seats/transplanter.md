---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/jurors/transplanter/AGENT.md"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Transplanter

Purpose: make sure the change would still work, unchanged, for another
person cloning onto another machine and operating system under another
account.

Panel: code.

## What it flags

- **Home directories** of any user (`/home/<user>`, `/Users/<user>`,
  `C:\Users\<user>`) where `$HOME` or a configuration value belongs.
- **Absolute machine paths** that should be relative to the checkout, to
  `$HOME`, or to `$TMPDIR`.
- **Host names** baked in where a configuration value belongs.
- **Account-specific paths:** `/run/user/<uid>`, a fixed
  `$XDG_RUNTIME_DIR`, a fixed uid or gid.
- **Single-host network assumptions:** a port that should be configurable,
  `localhost` where a real address is needed, a fixed socket path.
- **Single-OS assumptions:** GNU-only flags (`date -d`, `readlink -f`,
  `sed -i` with and without `''`), a hard-coded `/bin/bash`, assumed path
  separators or line endings, a tool assumed on `PATH` without a fallback;
  in Rust, `cfg(unix)`-only code without the other arm.
- **Anything else** that breaks on another checkout: an assumed install
  location, an environment variable assumed set without a default.

## Norms

- **Grading:** home directories and host names are must-fix; a fragile but
  portable assumption (a GNU flag on a likely-GNU target) may be should-fix.
- **Name the portable form:** "`scripts/foo.sh:12` hard-codes
  `/home/alice/journal`; derive it from the checkout's root."
- **Hold the change to its own rule.** A portability change that hard-codes
  a path in its own code or tests is the recurring finding.
- **Runtime data is not a source literal.** A home path assembled at run time
  from `$HOME` is fine; the same path written into source is not.

Adapted from the prior garden's `roles/jurors/transplanter`.
