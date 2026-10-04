# Private API security foundation

This is the first implementation increment from the supplied security/privacy specification. It is not a complete authentication system or a multi-user release. The existing browser library and Drive sync still use their existing personal local-first model; they do not call the new API. No local content is uploaded or migrated automatically.

## Runtime and database

The existing Cloudflare Pages app now has a TypeScript function at `functions/api/[[path]].ts`, backed by reusable `packages/backend` code. It uses a D1-compatible prepared-statement interface and a SQLite migration at `migrations/0001_private_library.sql`.

This selects D1 for the first backend increment without provisioning an external database. D1's documented [prepared statement API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) binds query parameters. PostgreSQL RLS does not apply to this SQLite database. Resource queries include authenticated ownership; composite foreign keys enforce matching ownership of cards and collections at the database layer. This is not database row-level read isolation: privileged direct database access remains trusted. Separate development/staging/production bindings and least-privilege operational access are required before rollout.

Schema:
- Immutable internal user IDs, unique usernames, display names, active/disabled account status and private-only profile defaults.
- Sessions with SHA-256 token hashes, expiry, last activity and revocation. Raw session tokens are not stored in the database.
- Private-only text/bookmark cards and collections with required owner references.
- Unique card/collection membership, indexed in both directions, with cascading relationship deletion. Collection deletion preserves cards.

The database only allows private visibility in this increment. Uploads, sharing, profiles for visitors, revisions, canvases, tags, exports and collaboration endpoints do not exist. Never infer they are protected by these tests before implementing them.

## Implemented HTTP surface

All routes require a valid server session. Unknown routes deny access. Foreign-owned and missing resources use the same 404 response.

| Route | Behavior |
| --- | --- |
| `GET /api/session` | Current username and display name only |
| `DELETE /api/session` | Revoke current session and clear cookie |
| `DELETE /api/sessions` | Revoke all current user's sessions and clear cookie |
| `GET /api/collections?q=...` | Owner-scoped list/search, up to 100 rows |
| `GET /api/collections/:id` | Owner-scoped read |
| `POST /api/collections` | Create private collection with `{name}` |
| `PUT /api/collections/:id` | Rename own collection with `{name}` |
| `DELETE /api/collections/:id` | Delete own collection |
| `GET /api/cards?q=...` | Owner-scoped list/search, up to 100 rows |
| `GET /api/cards/:id` | Owner-scoped read |
| `POST /api/cards` | Create text/bookmark card with `{type,title,note?,sourceUrl?}` |
| `PUT /api/cards/:id` | Replace those fields on own card |
| `DELETE /api/cards/:id` | Delete own card and relationships |
| `PUT /api/cards/:id/collections/:collectionId` | Idempotent membership addition, both resources owned by session user |
| `DELETE /api/cards/:id/collections/:collectionId` | Remove just that relationship, both resources owned by session user |

Inputs reject unrecognized fields, including owner IDs, roles, permissions, client IDs and visibility. JSON bodies are bounded to 32 KiB while streaming, independent of Content-Length. Website URLs allow only HTTP/HTTPS with no embedded credentials. Captured strings are stored as text, never executed or returned as HTML. No server-side URL fetching occurs.

## Sessions and request controls

`issueSession` is an internal server helper to call only after successful trusted authentication. It is not reachable through any API route. Test accounts and cookies are created only inside isolated tests. There is no username login, hardcoded key, dev authentication bypass or public registration endpoint.

A random 256-bit opaque token is sent in a `__Host-duckler_session` cookie with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. API authentication rejects missing, malformed, duplicate, expired, idle, revoked and disabled-account sessions. Database session lookup occurs for every request. Logout invalidates access on the next request; revoking all sessions is user-scoped.

All mutations require an exact same-origin Origin header. Cross-site requests and foreign Origin headers are denied. There is no credentialed wildcard CORS and no extension-origin allowance yet. Successful and failed responses are `private, no-store`, vary by Cookie/Origin and include restrictive API CSP, nosniff and framing protection. Production responses include HSTS. Internal errors become a generic response without SQL, stacks, tokens or paths. Service-worker navigation fallback excludes `/api` so the offline shell cannot substitute for API requests.

API CSP applies to API responses only; a full app CSP compatible with Google OAuth and existing dynamic styling remains pending. No new analytics, tracking cookies or processors are activated.

## Configuration and enabling

The API defaults to 503 until explicitly enabled with all required configuration:

- D1 binding `DUCKLER_DB` with the migration applied.
- `DUCKLER_API_ENABLED=true`.
- `DUCKLER_ENVIRONMENT=production` or `development`.
- `DUCKLER_ORIGIN`: exact origin, no path/trailing slash; production requires HTTPS. Development alone may use HTTP on localhost/loopback.
- `DUCKLER_SESSION_IDLE_SECONDS`: integer >= 60, no larger than absolute lifetime.
- `DUCKLER_SESSION_ABSOLUTE_SECONDS`: integer, up to 604800 (seven days).

`.dev.vars.example` is a disabled local configuration example. Real `.dev.vars` and `.env` files are ignored. Do not add fake database IDs, client-exposed server secrets or production credentials. No cloud database was provisioned, migration applied remotely or deployment performed in this increment. Leave the API disabled in public environments until onboarding/authentication and release gates are complete.

## Verification and remaining gates

`npm run test:security` executes real SQLite migration/foreign-key/owner-query tests with a small adapter replacing the D1 transport. It requires Node 22.13+ (Node 24 is used locally and in CI). Tests cover cross-user reads, lists, searches, writes, deletion, ID guessing, relationship attacks, session rejection/revocation/expiry, unsafe configuration, CSRF/origins, body limits, URL schemes, response cache headers and error redaction. These are not tests of deployed D1, passkeys, email delivery or a Cloudflare Worker runtime.

`.github/workflows/security.yml` runs the full suite (including isolation tests), checks, builds and a runtime dependency audit with read-only repository permissions and commit-pinned actions. Remote CI execution and repository branch protection still need to be verified after pushing.

Next required increments:
1. Trusted passkey/magic-link authentication, invite-only single-use onboarding, replay/expiry tests, rate limits, session rotation, reauthentication and security audit events.
2. Connect signed-in frontend and extension to the API; explicitly scope/migrate local data and clear private state/caches on account switches. Personal Drive/local profile fields remain unrelated to server identity.
3. Secure image uploads/private media and isolation of every remaining object type; explicit sharing/revocation with dedicated public serializers.
4. Account rights/export/deletion, operational logging/retention/backups/incident response and fail-closed deployment acceptance.
5. Versioned privacy/terms/contact documentation with real controller/provider facts and Brazil/minors legal review.

Student rollout, public registration, collaboration, DMs and comments remain gated. This foundation does not establish LGPD or Marco Civil compliance.
