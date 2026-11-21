---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/api-transport-rubric"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# API transport rubric: REST or CapTP

Purpose: decide, for one feature of an object-capability system, whether it
belongs on a REST endpoint or on a CapTP session. Designers apply it when
specifying an interface; builders apply it before adding an endpoint.

Status: draft. It was derived from a few designs, not from shipped code.
Revise it as real features are scored against it.

## Inputs

The feature's caller, the authority the call needs, and whether the call
passes or returns authority.

## The default

**CapTP in general; REST only where it is absolutely necessary**
(@kriskowal, 2026-10-30). REST is necessary when the caller holds no
reference yet (login, minting the first locator, opening the session), when
the caller cannot speak CapTP (curl, a login page, static content, a
webhook), or when a platform boundary demands HTTP. The table below finds
the exceptions; it does not make REST the starting point. A feature that
scores REST only because the client "has no session yet" has a missing
prerequisite (build the session), not a REST feature.

## The question

**Is the caller exercising authority it holds, or establishing who it is?**

- **REST at the door.** HTTP covers what happens before a capability
  exists: login, account actions with CSRF checks, minting a locator,
  static content. The cookie is the only authority, so the endpoint turns
  ambient identity into a specific, revocable object.
- **CapTP inside.** Once the caller holds a reference, further authority
  flows through it. Do not re-derive it from the cookie on each call.

## Procedure

Answer each row, count the leans, then apply the overrides. A close count
usually means two features: a REST mint and a CapTP use.

| # | Question | Leans REST | Leans CapTP |
| --- | --- | --- | --- |
| 1 | What authorizes the call? | Who the user is (cookie, owner) | Holding a particular object |
| 2 | Does it pass authority to the callee? | No | Yes: attachments, endowments, callbacks, facets |
| 3 | State across calls? | No: one request, one response | Yes: a session, streaming, promise pipelining |
| 4 | Revoke, pause or attenuate it on its own? | No | Yes: one object per grant; revoking it ends the grant |
| 5 | Who calls it? | Anything: curl, a login page, an unconfined page | Only confined code or a peer handed the reference |
| 6 | Is the result a live object? | No: plain data | Yes: the result is a capability |
| 7 | Does it create the first reference? | Yes | No |

### Overrides

1. **Mint by REST, use by CapTP.** A feature whose authority is an object
   gets exactly one REST endpoint, the locator mint: account-gated,
   expiring, revocable. Every later call is CapTP.
2. **No REST endpoint takes a capability as an argument.** A string naming
   a power is a forgeable bearer name; a call that must pass one belongs on
   CapTP. A bearer token is acceptable only when it designates one specific
   object, not an identity.
3. **No ambient authority over the powerbox through REST.** If a cookie can
   reach confined code's powers directly, ask whether that code could
   trigger the call. Endpoints only the trusted outer shell calls (clone,
   destroy) pass, and still need CSRF checks and owner scoping.
4. **Secrets do not come back out.** Project every response onto an explicit
   schema of non-secret fields. A feature that must return a secret is a
   design flaw, not a transport choice.
5. **A plain-data listing is not a reason for REST.** It may stay REST while
   no session exists; say so, and plan its CapTP facet.

## Shapes that recur

- Entering a secret (a provider key): REST, nothing secret returned; revisit
  once a session exists.
- A listing for the UI: REST today only if no session exists; CapTP once it
  does.
- Reading or exercising an object's powers: CapTP (row 6).
- A streamed conversation: locator by REST, turns by CapTP (rows 2, 3, 4).
- Attaching a pet name to a message: CapTP (rows 2, 6).
- Spawning a subagent: CapTP (rows 2, 4).

## Output

A short table in the design or pull request text: one row per feature, the
transport chosen, and the rows or overrides that decided it. Flag each
feature that is REST today with a planned CapTP home.

A reviewer can check two things mechanically: a capability passed as a
string, and a cookie re-deriving authority on every call.

Adapted from the prior garden's `skills/api-transport-rubric`.
