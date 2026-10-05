# 0001 — Drive-first privacy architecture

Date: 2026-10-04 · Status: accepted (owner decision)

## Context
The V2 specification (`docs/specs/duckler-v2-specification.md`) keeps each person's library in their own Google Drive. It uses the narrow `drive.file` scope, has no content backend and no public links. The security/Brazil specification (`docs/duckler_security_privacy_brazil_spec.md`) assumes a server: passkey/magic-link sessions, database isolation, and public/unlisted links and follows. A disabled Cloudflare D1 API foundation already exists (`docs/security-foundation.md`).

## Decision
Use **Drive-first**. The V2 specification governs data, sync, sharing and collaboration. The D1 API stays disabled and is kept for possible later use. Public/unlisted links, follows and server accounts are deferred.

The security specification still applies as *principles* to the static app: default deny, isolation tests, plain-text rendering, a strict CSP, no tokens in persistent storage, minimal logging and analytics, and the LGPD documentation items.

## Consequences
- Collaboration follows V2 M12–M15, gated on the real three-account Drive feasibility test.
- Server-only items from the security spec (sessions, RLS, magic links, rate limits) are not implemented unless this decision is revisited.
- Revisiting requires a new decision record.
