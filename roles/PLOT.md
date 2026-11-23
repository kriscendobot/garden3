---
author: "steward"
created: "2026-11-17"
updated: "2026-11-23"
---

# Plot brief

What the working roles on this plot share. This file is part of the plot's
genome: workers on this plot may improve it, and other plots have their own.

- Read the project's own contribution rules before changing it, and follow
  them over your habits.
- Reproduce a problem before fixing it; show the fix working after.
- Leave a lesson here only when it would have saved you time and will apply
  again.
- Rust on the worker box: the toolchain under `/opt/garden/cap` has only the
  musl `std` and there is no C compiler, so build scripts fail with E0463.
  Install rustup into your home with `TMPDIR` under `scratch/` (`/tmp` is
  noexec, which also breaks tests that run stubs from a temporary directory),
  and put a `zig cc` wrapper that drops `--target=` arguments on `PATH` as `cc`.
