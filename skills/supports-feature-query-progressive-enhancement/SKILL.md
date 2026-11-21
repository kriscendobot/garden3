---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/supports-feature-query-progressive-enhancement"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# `@supports` and progressive enhancement

Purpose: use a modern CSS feature behind an `@supports` feature query with a
deliberate fallback, so the page works on every engine in scope and is
better where the feature exists.

This turns the norm "prefer progressive enhancement, asset-free and
build-free" into a procedure. A designer specifies the gate; a builder
writes it.

## When to use

- A design depends on a CSS feature not in every in-scope browser:
  `calc-size()`, `max-block-size: stretch`, anchor positioning
  (`position-try-order`, anchored container queries), `:has()`, container
  queries, `field-sizing`.
- The fallback must be usable, not merely not broken.
- You are tempted to sniff the user-agent string, or to ship the feature
  unguarded and let old engines cope. Gate on capability instead.

## The gate

Use a positive and a negative query over a baseline, so the two paths never
both apply:

```css
.box {
  /* 1. The baseline every engine applies. */
  min-block-size: 12em;

  /* 2. The modern path, only where the feature is understood. */
  @supports (min-block-size: calc-size(fit-content, min(size, 1px))) {
    min-block-size: calc-size(fit-content, min(size, var(--min-size)));
  }

  /* 3. The fallback, only where it is not. */
  @supports not (min-block-size: calc-size(fit-content, min(size, 1px))) {
    /* approximate the modern behaviour with what the engine has */
  }
}
```

- **Probe the exact construct** you depend on, with a throwaway value that
  is valid syntax (`1px` here). Not a proxy feature.
- **Baseline first.** Style only inside `@supports (…)` and engines without
  it get nothing.
- **The `not` block only when the fallback must differ** from the baseline.
  If "nothing extra" is acceptable, drop it.

## Structural fallbacks

When the feature computes something from content that old engines cannot,
approximate it with selectors. Without `calc-size()` a picker cannot drop
its minimum height for a short list, so detect "short" structurally:

```css
@supports not (min-block-size: calc-size(fit-content, min(size, 1px))) {
  .picker:not(
    :has(:where(option:nth-of-type(4))),
    :has(:where(optgroup:nth-of-type(2)))
  ) {
    min-block-size: 0;
    max-block-size: fit-content;
  }
}
```

Fewer than four options and fewer than two groups stands in for "short".
It is an approximation, and the design says so. It also needs `:has()`;
where that is missing too, the baseline is the floor.

## Gate and document

The same discipline applies to any styling with deliberate exceptions. In a
themed design every colour outside `:root` becomes a `var(--*)`, and the
few that stay literal (white text on a saturated accent) carry a comment
saying they are intentional, so a later audit can grep for literals and
treat each survivor as a regression or a recorded exception. Wherever you
diverge from the default, record why at that point.

## Procedure

1. Name the feature and the in-scope engines. If all have it, no gate.
2. Write the baseline.
3. Add `@supports (<feature>)` with the enhanced treatment.
4. Add `@supports not (<feature>)` only if the fallback must differ, and say
   what it approximates.
5. Comment every divergence where it happens.
6. Verify, as below.

## Verify

- An engine with the feature: the enhanced block matches, the fallback does
  not.
- An engine without it: the page is usable and as close to the intent as
  the primitives allow.
- No engine applies both blocks.
- Misspell the probed feature on purpose: the engine must fall to the
  fallback. A probe that always passes tests nothing.

If you cannot run a browser in your slot, say which of these you could not
check.

## Limits (state them in the design)

- `@supports` tests parsing, not correctness. An engine can accept a
  property and render it a little differently.
- A structural fallback is a proxy, wrong in some cases. Say when.
- A fallback can depend on a modern feature itself. Chain the assumptions so
  the baseline is always reachable.

## Output

The gated CSS, divergences commented, and a design note: the feature, the
engines, what the fallback approximates and what the modern path delivers.

Grounded in Jake Archibald's essay on customizable `<select>` heights,
which gates `calc-size()`, `max-block-size: stretch` and anchored container
queries this way, and in a chat colour-scheme design's "scheme-aware tokens
with intentional exceptions". The library may hold both; look them up
([library-lookup](../library-lookup/SKILL.md)).

Adapted from the prior garden's `skills/supports-feature-query-progressive-enhancement`.
