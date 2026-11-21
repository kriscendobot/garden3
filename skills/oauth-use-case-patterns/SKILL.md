---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/oauth-use-case-patterns"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# OAuth use-case patterns

Purpose: recognize when a need calls for an OAuth application credential
rather than a pasted token or a shared secret, choose the grant
(client-credentials or authorization-code), and apply it with least-privilege
scopes, a guarded durable secret and short-lived tokens.

A design-time aid for whoever proposes or reviews how something authenticates
to an external API. It stands up no credential. The worked example is
Tailscale's OAuth surface, in the library ([library-lookup](../library-lookup/SKILL.md)):
`web--tailscale-oauth-clients--*` (client-credentials, a service identity),
`web--tailscale-oauth-apps--*` (authorization-code, a user's identity), and
the concept `oauth-client-credentials-vs-authorization-code`. Read them as
data about one product; this skill keeps the transferable shape.

## Does this need an OAuth app or client?

- **A program, not a person, needs ongoing access.** Unattended automation
  needs a credential owned by the organization, not an individual, so it
  survives that person leaving. A Tailscale OAuth client belongs to the
  tailnet and keeps working after its creator loses access.
- **The access should be scoped.** When the task touches a narrow slice of an
  API and a full-power credential would over-grant, scopes express least
  privilege. A scope is a capability; the endpoints it reaches are its
  surface.
- **Short-lived bearer tokens from a durable credential.** When a leak's reach
  matters, a long-lived client mints short-lived access tokens (Tailscale: one
  hour, not extendable). A leaked token expires by itself; only the durable
  secret needs guarding and rotation.
- **The action must be attributed to a person.** When audit, quota and access
  control should apply to a consenting user rather than a service, that is
  authorization-code.

If none hold (a one-off manual call, a credential one person owns and uses
interactively), an OAuth application is probably too much; a scoped personal
token may do.

## Which grant

| Client-credentials (an OAuth client) when | Authorization-code (an OAuth app) when |
| --- | --- |
| an unattended service needs access independent of any person | a tool acts on behalf of a consenting user |
| what it creates carries a service identity (Tailscale: tag-owned) | what it creates carries the user's identity |
| no human is present at access time | a user passes a consent screen when authorizing |
| audit, quota and access control attribute to the organization | they attribute to the user |

One system can need both. A provisioner that mints tag-owned CI nodes uses
client-credentials; an internal tool that registers a device as the engineer
using it uses authorization-code.

## Standing up a client-credentials client

1. **List the capabilities the task needs**, and map each to the narrowest
   scope. The scope set is fixed when the client is created and caps every
   token it can mint. Do not take an `all` scope for convenience. Where the
   provider publishes which endpoints a scope reaches, check them.
2. **Map any identity dimension narrowly too.** Tailscale's second dimension is
   tags (which device identities a token may confer), honored only by some
   scopes. Grant the minimum, and prefer an owner or group indirection over
   long lists.
3. **Capture the secret once.** Providers often show it exactly once. It goes
   straight into the secret store; afterwards you can only rotate it.
4. **Guard the durable secret, not the token.** The client ID and secret are
   the long-lived credential. Keep them out of tracked files, logs, command
   lines and environments. Read them from the store at the moment of use,
   which is how the garden holds its own keys ([keys.md](../../designs/keys.md)).
5. **Mint and rotate access tokens.** Request one from the token endpoint, use
   it until shortly before expiry, request another. Let the provider's client
   library manage renewal rather than hand-rolling it.
6. **Retire by revoking.** The credential outlives any person, so retiring it
   means revoking the client (rotating on any suspicion of a leak), not
   deactivating someone's account.

For authorization-code, the application sends the user to the provider's
consent screen, receives an authorization, and exchanges it for a user-scoped
token. Tailscale's limits are in `web--tailscale-oauth-apps--requirements-and-limitations`:
an admin-scoped API token to create the app, one tailnet per authorization, a
consent screen that cannot be customized.

## Failure modes

- **Over-broad scopes**, the commonest defect. The scope set is the client's
  permanent ceiling; a leaked token reaches all of it. Grant the minimum; widen
  on demonstrated need.
- **A leaked client secret** is far worse than a leaked token, which expires.
  Rotate on suspicion.
- **Mishandled expiry.** Code that caches a token and never refreshes fails an
  hour in. Refresh before expiry, not after the first 401.
- **The wrong grant** gives correct-looking access with the wrong attribution
  for audit, quota and access control: a quiet, security-relevant bug. Check
  the table before building.
- **Two dimensions confused.** Where a provider has both scopes and identity
  tags, granting one and forgetting the other yields a client that
  authenticates but cannot do the work, or can do far more. Map both.

## Where it applies

- **GitHub.** The garden reaches GitHub with the bot's token, read from its key
  file at each call by the steward alone ([watcher.md](../../designs/watcher.md)).
  The nearest GitHub analog to an OAuth client is a GitHub App: installation
  tokens minted from a durable app credential, scoped to named permissions.
- **Hosts joining a private network.** A tag-scoped client that mints per-node
  auth keys for unattended enrollment is the literal Tailscale case.
- **Web surfaces** where a person consents and the tool acts as them:
  authorization-code.

When a real integration is built, the setup touches provider consoles and
secret stores outside any repository. Keys are files the maintainer sets; a
job never asks for one or prints one.

Adapted from the prior garden's `skills/oauth-use-case-patterns`.
