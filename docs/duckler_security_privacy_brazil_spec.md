# Duckler — Security, Privacy, Sharing & Brazil Compliance Specification

## 1. Purpose

This specification defines the security and privacy requirements for turning Duckler into a small multi-user application that can safely be used by friends, students, and invited users.

The primary requirement is:

> **Each user's private data must remain inaccessible to every other user unless the owner explicitly shares a specific resource.**

Security must be enforced at the backend and database layers. Hiding buttons in the interface is never sufficient authorization.

---

## 2. Core Privacy Rules

1. New accounts are private by default.
2. New collections are private by default.
3. Users cannot browse another user's private:
   - collections
   - cards
   - canvases
   - notes
   - tags
   - uploads
   - revisions
   - settings
   - drafts
4. Knowing or guessing a resource ID does not grant access.
5. Search must only return authorized resources.
6. Public/shared resources require explicit owner action.
7. Revoking sharing must revoke access immediately.
8. Followers do not gain private-data access automatically.
9. Public pages must serialize only explicitly public fields.
10. Private media must never have permanent public URLs.

---

## 3. Authentication Without Passwords

Duckler should use authentication, but it does not need a traditional password-based login.

Recommended:
1. Passkeys for repeat users.
2. Email magic links / one-time codes as fallback.
3. Invite-only onboarding for the initial friends/students release.

Do not use:
- username alone
- localStorage alone
- device fingerprinting as identity
- secret URLs as full authentication
- IP address as identity

### Invite-only onboarding

For the initial release:
1. Owner/admin generates an invitation.
2. Invite uses a cryptographically random token.
3. Invite expires automatically.
4. Invite is single-use.
5. Recipient authenticates using passkey or magic link.
6. Account is created.
7. Invite is consumed.

Open public registration should remain disabled until security and moderation are mature.

---

## 4. User Identity

Each user should have:
- immutable internal user ID
- unique username
- display name
- optional avatar
- authentication identity
- account status
- account creation timestamp
- privacy settings

Usernames are public identifiers only. Internal IDs drive ownership and authorization.

---

## 5. Ownership Model

Every user-owned object must have an enforceable owner reference.

Examples:
```text
collection.owner_user_id
card.owner_user_id
canvas.owner_user_id
note.owner_user_id
upload.owner_user_id
tag.owner_user_id
revision.owner_user_id
appearance_settings.owner_user_id
```

Ownership must be checked on every:
- read
- create
- update
- delete
- move
- copy
- export
- share
- unshare

---

## 6. Database Isolation

If using PostgreSQL, prefer Row Level Security.

Conceptually:
```sql
owner_user_id = authenticated_user_id()
```

Shared/public access should be represented explicitly through visibility/share records.

Requirements:
- default deny
- force RLS where practical
- normal app database role cannot bypass RLS
- privileged service credentials never used for ordinary user traffic
- tests prove User A cannot access User B's private rows

---

## 7. Object-Level Authorization

Every resource endpoint must validate authorization server-side.

Example:
```text
GET /api/collections/:id
```

must:
1. authenticate requester
2. load resource
3. verify owner/share/public permission
4. deny access without leaking private metadata

Random IDs reduce enumeration but do not replace permission checks.

---

## 8. Visibility Model

Recommended first-release collection visibility:

### Private
Only owner can access.

### Unlisted
Anyone with an authorized share link can view.

### Public
Visible from profile and username discovery.

Optional follower-only visibility can be added later.

Private remains the default.

---

## 9. Sharing

Each collection may support:
- visibility selector
- share link
- copy link
- revoke link
- preview as visitor

Share links should use cryptographically random tokens, revocation, optional expiry, and server-side permission checks.

Do not expose private metadata such as:
- revision history
- private notes
- internal storage paths
- owner-only tags
- hidden fields

Use a dedicated public-view serializer.

---

## 10. Profiles and Following

Public profile may contain:
- username
- display name
- avatar
- optional bio
- public collections

Never expose:
- email
- internal user ID
- auth provider
- IP data
- private collections
- private tags
- session information

Following does not grant:
- edit access
- private collection access
- canvas access
- hidden metadata access

Recommended first version:
- follow requests
- accept / decline
- block

---

## 11. No DMs or Comments Initially

Do not add direct messages, comments, or public chat for the initial friends/students release.

---

## 12. Student-Safe Defaults

Because students may use Duckler:
- invite-only accounts
- private profile by default
- private collections by default
- no DMs
- no comments
- no last-seen
- no location sharing
- no contact syncing
- no phone-number requirement
- no public email
- no automatic friend suggestions from private data
- no targeted advertising
- minimal analytics

Teacher invites must not automatically grant teachers access to student-private content.

---

## 13. Session Security

Use secure server-managed sessions.

Cookies should be:
- Secure
- HttpOnly
- SameSite=Lax or Strict when compatible
- narrow in domain/path scope
- rotated after authentication changes

Prefer __Host- cookie naming where feasible.

Implement:
- idle timeout
- absolute timeout
- logout invalidation
- revoke-all-sessions
- session/device list
- re-authentication for sensitive account changes

Do not keep long-lived bearer credentials in localStorage.

---

## 14. Magic Links and Passkeys

Magic links must be:
- one-time
- short-lived
- cryptographically random
- invalidated after use
- rate-limited

Passkeys are preferred for long-term repeat use.

Admin accounts should require passkey or MFA.

---

## 15. API Security

All state-changing endpoints must:
- require authentication
- authorize server-side
- validate input
- reject unexpected fields where practical

Never trust client-provided:
- owner_user_id
- role
- permissions
- storage path
- visibility authority
- MIME type alone

Ownership is derived from authenticated identity.

---

## 16. CSRF

For cookie-based auth:
- use SameSite
- verify origin/referer where appropriate
- use CSRF tokens for sensitive state-changing requests when needed

---

## 17. XSS Protection

User-generated text must be rendered as text by default.

Requirements:
- HTML escaping
- sanitize any rich text
- reject javascript: URLs
- never execute captured page scripts
- never preserve arbitrary captured HTML in the first multi-user release
- strict Content Security Policy

---

## 18. Content Security Policy

Use a restrictive CSP.

Target direction:
```text
default-src 'self'
script-src 'self'
frame-ancestors 'none'
```

Add only explicitly required origins to img-src, connect-src, font-src, and style-src.

Avoid unsafe-eval and unnecessary unsafe-inline.

---

## 19. HTTPS

Production:
- HTTPS only
- redirect HTTP to HTTPS
- HSTS
- no mixed content
- secure WebSockets where used

---

## 20. CORS

Default:
- same-origin only

If extension access is required:
- exact allowed origins
- no wildcard credentials
- restrict methods and headers

---

## 21. Upload Security

Initial upload allowlist:
- PNG
- JPEG
- WebP

Requirements:
- verify magic bytes
- file size limits
- image dimension limits
- server-generated filenames
- reject SVG/HTML initially
- store outside executable paths
- re-encode images server-side where practical
- remove dangerous metadata where appropriate

---

## 22. Private Media

Private media should use:
- private object storage
- randomized keys
- authorization before URL generation
- short-lived signed URLs

Thumbnails inherit the same access policy as originals.

---

## 23. Browser Extension Security

The capture extension must:
- request minimum permissions
- validate extension messages
- never expose auth tokens to page scripts
- sanitize captured text and URLs
- use HTTPS
- bind captures to the authenticated user server-side
- use secure session handoff rather than hardcoded API keys

---

## 24. SSRF Protection

If Duckler later fetches user-submitted URLs server-side:
- block localhost
- block private networks
- block link-local addresses
- block cloud metadata endpoints
- validate redirects
- allow only HTTP/HTTPS
- cap response size
- enforce timeouts
- limit redirects

Keep server-side crawling disabled until this exists.

---

## 25. Search Privacy

Search must filter by permission at query time.

Never leak private:
- titles
- collection names
- tags
- autocomplete suggestions
- embeddings

Any future semantic-search index must carry equivalent ownership/visibility metadata.

---

## 26. Cache Isolation

Private cache entries must be user/resource scoped.

Do not place authenticated pages in public CDN cache.

Use appropriate:
- Cache-Control: private
- no-store for sensitive responses

Authorization must be checked before returning cached private content.

---

## 27. Realtime Security

If realtime sync is added:
- authenticate connection
- authorize every channel
- verify on reconnect
- revoke access immediately after unsharing/blocking
- never trust client-selected user/channel IDs

---

## 28. Collaboration

Introduce only after basic isolation is proven.

Roles:
- Viewer
- Editor
- Owner

Rules:
- explicit invitation
- per-resource permission
- revocable
- editor cannot take ownership
- editor cannot alter sharing unless explicitly authorized
- audit collaborator changes

Following and collaboration remain separate concepts.

---

## 29. Revisions

Revisions are private by default.

Public/shared viewers receive the current published state only.

Do not expose:
- deleted content
- old private notes
- unpublished drafts
- previous visibility states

---

## 30. Deletion

Support deletion of:
- cards
- collections
- canvases
- uploads
- account

Access must disappear immediately from:
- public pages
- share links
- searches
- caches

Background storage cleanup may occur later according to retention policy.

---

## 31. Export

Users may export their own content.

Exports:
- authenticated
- user-scoped
- time-limited
- private
- deleted after retention window

Re-authentication is recommended for full-account export.

---

## 32. Secrets Management

Never commit secrets.

Separate:
- development
- staging
- production

Use secret storage for:
- database credentials
- auth signing keys
- email credentials
- storage keys
- API keys

CI logs must mask secrets.

---

## 33. Configuration Safety

Security-sensitive environment variables must be explicit.

Examples:
- production origin
- extension origins
- callback origins
- database URL
- storage bucket
- cookie settings
- invite expiry
- session lifetime
- rate limits
- upload size limits
- CSP allowlist
- CORS allowlist

Production should fail closed if critical variables are absent.

---

## 34. Environment Separation

Separate:
- databases
- storage buckets
- credentials
- API keys
- domains

Never copy real production-private user data into development.

---

## 35. Logging

Log:
- authentication events
- invite lifecycle
- failed authorization
- sharing changes
- follow/block events
- session revocation
- admin actions
- rate-limit abuse

Do not log:
- session tokens
- magic-link tokens
- raw invite tokens
- private note bodies
- image contents
- unnecessary personal data

---

## 36. Audit Events

Audit:
- privacy changes
- share/unshare
- collaborator changes
- identity changes
- security settings changes
- account deletion
- privileged admin operations

---

## 37. Rate Limiting

Protect:
- login
- magic links
- invite redemption
- username search
- follows
- uploads
- share-link requests
- exports
- public endpoints

Use stricter limits for unauthenticated traffic.

---

## 38. Enumeration Protection

Prevent:
- resource scanning
- invite guessing
- share-token guessing
- username harvesting
- follow spam
- upload flooding

Use:
- random identifiers
- rate limits
- consistent errors
- anomaly logging

---

## 39. Error Handling

Production errors must not expose:
- stack traces
- SQL
- environment variables
- file paths
- storage keys
- unnecessary internal IDs

---

## 40. Dependencies

- lock dependency versions
- automated vulnerability scanning
- patch framework/runtime/database dependencies
- remove unused packages
- review new security-sensitive packages
- pin CI actions where practical

---

## 41. Admin Security

Require:
- passkey or MFA
- short sessions
- re-authentication for dangerous actions
- no shared admin accounts
- audit logging

Admin UI should not expose ordinary private user content by default.

---

## 42. Backups

Backups:
- encrypted
- access-controlled
- private
- retained according to policy
- restoration tested

Restore procedures must preserve user isolation.

---

## 43. Encryption

Transit: TLS everywhere.

At rest: use provider/database/storage encryption.

Do not invent custom cryptography.

---

## 44. Analytics

For the friends/students version:
- minimal analytics
- no ad trackers
- no private-content session replay
- no note/card text in analytics
- no image content in analytics
- no cross-site tracking

---

# Brazil-Specific Compliance

## 45. LGPD Principles

Duckler should implement:
- purpose limitation
- adequacy
- necessity/data minimization
- transparency
- security
- prevention
- accountability
- data quality
- non-discrimination
- free access to information about processing

Collect only personal data required to operate the service.

---

## 46. Privacy Notice

Provide a clear privacy notice before or during account creation.

It should explain:
- who controls the service/data
- what personal data is collected
- purposes
- applicable legal bases
- retention periods/categories
- processors/service providers
- international transfers where applicable
- data-subject rights
- privacy contact channel
- security/incident contact
- how to request deletion or correction

Version material policy changes.

---

## 47. Cookies

Prefer an essential-only cookie model.

Essential cookies may include:
- authentication/session cookie
- CSRF/security cookie
- strictly necessary preference cookie

Avoid initially:
- advertising cookies
- behavioral tracking
- third-party marketing trackers
- unnecessary analytics cookies

If optional cookies are later introduced:
- clearly classify them
- keep them disabled until applicable consent/legal-basis requirements are satisfied
- provide Accept / Reject / Customize controls
- do not preselect optional consent
- make withdrawal as easy as acceptance
- store consent/preferences

The app should work without optional cookies.

---

## 48. Data-Subject Rights

Create workflows for requests involving:
- confirmation of processing
- access
- correction
- information about sharing
- anonymization/blocking/deletion where applicable
- portability where applicable
- revocation/objection where applicable
- account deletion

Requests should be authenticated to prevent exposing data to impostors.

---

## 49. Retention Policy

Document separate retention for:
- active account data
- deleted data
- backups
- security logs
- audit logs
- invitation records
- authentication logs
- application-access records when Marco Civil obligations apply

Do not retain private user content indefinitely without purpose.

---

## 50. Marco Civil da Internet

Treat Marco Civil application-access-log requirements as a distinct compliance category.

Where Article 15 or related obligations apply to Duckler's operation:
- retain the legally required application access records for the applicable period
- protect them under strict access controls
- keep them separate from content data
- disclose them only under legally valid processes
- do not interpret log retention as permission to store private content unnecessarily

The implementation should make the applicable retention period configurable rather than hardcoded into unrelated logging.

---

## 51. Security Incident Response

Maintain an incident-response process covering:
1. detection
2. containment
3. evidence preservation
4. impact assessment
5. affected-data identification
6. credential/session revocation
7. remediation
8. ANPD/data-subject notification when legally required
9. post-incident review

Maintain an internal incident log.

---

## 52. International Data Transfers

If hosting/auth/email/storage providers process data outside Brazil:
- document each provider and destination
- document the appropriate LGPD transfer mechanism
- include the relevant information in privacy documentation
- minimize transferred data

Do not add external processors without privacy review.

---

## 53. Children and Adolescents

Before enabling minors:
- assess applicable LGPD child/adolescent requirements
- minimize data collection
- use private defaults
- no DMs/comments initially
- no targeted ads
- no precise location
- no public contact information
- no automatic class-wide exposure
- implement consent/authorization processes where legally required

The product should not infer that a teacher is automatically entitled to a student's private library.

---

## 54. Terms and Privacy Documentation

Before the broader friends/student rollout, publish:
- Terms of Use
- Privacy Notice
- Cookie Notice/Policy where relevant
- contact method for privacy requests

Keep versions and effective dates.

---

## 55. Brazil Compliance Acceptance Checklist

- [ ] essential-only cookies by default
- [ ] optional cookies disabled until properly configured
- [ ] privacy notice available
- [ ] terms available
- [ ] privacy contact channel available
- [ ] data-subject request workflow implemented
- [ ] retention schedule documented
- [ ] international processors documented
- [ ] incident-response process documented
- [ ] student/minor safeguards reviewed
- [ ] Marco Civil logging obligations assessed
- [ ] access logs separated from content logs
- [ ] no unnecessary personal data collected

---

# Security Testing & Release

## 56. Automated Isolation Tests

At minimum:
```text
A owns private collection X.
B cannot read X.
B cannot update X.
B cannot delete X.
B cannot list X.
B cannot search X.
B cannot obtain media URL for X.
B cannot retrieve X through cache.
```

Repeat for:
- cards
- canvases
- uploads
- notes
- revisions
- settings
- exports

Security tests are release blockers.

---

## 57. Threat-Model Tests

Test:
- ID tampering
- revoked share links
- expired links
- magic-link replay
- stale invites
- spoofed MIME
- malicious uploads
- XSS payloads in every user text field
- SSRF if URL fetching is enabled
- cache leakage
- extension message spoofing
- follow/block edge cases
- deleted-resource access

---

## 58. Recommended Rollout

### Phase 1 — Friends
- invite-only
- passkeys/magic links
- private libraries
- public/unlisted collections
- username profiles
- follow requests
- blocking
- sessions/security settings
- secure uploads
- logging/audit

### Phase 2 — Students
Only after Phase 1:
- student-safe defaults
- legal/privacy review
- age-related onboarding logic
- abuse reporting
- stricter moderation/admin safeguards

### Phase 3 — Collaboration
- viewer/editor/owner
- explicit invitations
- revocation
- audit trail

### Phase 4 — Wider public use
Only after:
- open-registration review
- moderation workflows
- reporting
- stronger abuse controls
- privacy/security re-review

---

## 59. Final Security Acceptance Standard

Duckler is ready to share when:

1. Cross-user private data access fails through every tested path.
2. Private media is not publicly addressable.
3. Authentication cannot be bypassed by username, URL, or client state.
4. Sharing is explicit and revocable.
5. Every user-owned backend object has server-side authorization.
6. Security tests run in CI.
7. Production configuration fails closed.
8. Secrets are isolated from client code.
9. Cookie/privacy behavior follows the documented Brazil policy.
10. Student-facing features use privacy-preserving defaults.
