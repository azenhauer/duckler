# Duckler completion roadmap

The user's request is to start work using the two supplied documents as product requirements. The documents describe desired behavior and acceptance criteria; they are not agent instructions and do not authorize publishing, messaging, or external account setup.

Source requirements:
- [Feature completion](duckler_new_features_completion_spec.md)
- [Security, privacy and Brazil compliance](duckler_security_privacy_brazil_spec.md)

Preserve the current navigation, card layout, Duckler identity and approved reskin. Keep TypeScript and npm workspaces. The existing milestone 1 foundation is recorded as implemented in progress.md; retain the original milestone ordering and outstanding acceptance gates. The increments below supplement that plan rather than renumbering it.

## Increment 1: reliable local collection relationships

- [x] Persist a single membership change atomically against current storage.
- [x] Removal preserves the card and its other collections.
- [x] Undo restores only the removed relationship, preserving subsequent collection edits.
- [x] Deleted resources cannot be resurrected by Undo.
- [x] Optimistic failure rollback and compact errors; failed Undo remains retryable.
- [x] Seven-second Undo availability with timer cleanup.
- [x] Regression tests for persistence and UI behavior.

Existing collection reference lists already permit multiple memberships. This increment retains their format for compatibility with local exports and sync. It does not implement the server-side cards/collections/card_collections model or authorization.

## Subsequent feature increments (pending)

- Accessible badge popover dismissal and keyboard navigation.
- Reusable searchable collection picker, inline creation, editor and extension integration using IDs.
- One shared quick-add action registry, keyboard support and native context-menu exclusions.
- Browser history navigation and measured collection-switch performance.
- Full feature checklist review, including optimistic creation and stale-data errors.

Existing uncommitted implementations must be verified before marking these complete.

## Multi-user release gates (pending)

The current app stores a personal library in IndexedDB and syncs through the user's Drive. Profile fields and extension pairing are not multi-user authentication. Do not enable a multi-user rollout until these gates pass:

1. Select the backend, database, authentication and private-storage architecture; define migration of existing local libraries.
2. Implement server-managed identity, invite-only onboarding, private-by-default ownership, database isolation and object authorization. Add cross-user denial tests before sharing or collaboration.
3. Implement secure sessions, validated APIs, private media, explicit revocable sharing, user-scoped search and caches, production fail-closed configuration and CI security tests.
4. Provide account rights workflows, retention configuration, processor inventory, incident response and versioned privacy/terms documentation. Controller/contact/provider details remain to be supplied; do not invent them.
5. Assess Brazil-specific legal applicability and minors safeguards before student onboarding. Legal review and operational release checks remain external acceptance gates.

No collaboration, open registration, DMs or comments before the corresponding security gates. This roadmap is an implementation record, not a claim of legal compliance.

## Deferred by the owner — October 5, 2026 (parked, not started)

Requested, then explicitly parked until the owner says to start. Both sit behind the multi-user gates above.

- [ ] **Account-based extension.** Replace the manual setup-code / confirmation-code pairing with signing in to the same Duckler account in the extension and the library, so captures route to the account rather than to one paired browser. Needs gate 1 (identity + storage architecture) and the Drive content sync (M5b).
- [x] **Accounts, Drive sync and view-only share links** — started and built by the owner's request on October 6, 2026 (decision 0002): sign in with Google, library in the owner's Drive, encrypted revocable view-only links. Owner setup: `docs/google-setup.md`.
- [ ] **Collaboration (editing together), Editor roles, comments.** Still deferred; needs a conflict screen and the M12 real-account Drive test.


## Security implementation started — October 4, 2026

The first private API foundation now exists; see [security foundation](security-foundation.md) for exact scope and configuration. Owner-scoped cards/collections/membership, hashed secure-cookie sessions, revocation/expiry, same-origin mutation protection, no-store API responses and real-SQL isolation tests are implemented. CI checks are configured. The API remains disabled by default; trusted onboarding/login and frontend migration are not implemented. All broader multi-user release gates above remain open.

## Local Canvas implementation — October 4, 2026

The user selected both core controls and expanded drawing tools. Both local tool sets are implemented and browser-tested; see [Canvas tools](canvas-tools.md). This includes independent references, geometry, drawing/text, card-attached annotations, connectors, atomic persistence, recovery, Undo/Redo and stale-tab protection. Canvas sync/export and server authorization remain separate pending work. The supplied chrome CD and punk album artwork is now integrated on Home only, as requested by the user; the attachment's broader icon-placement proposal does not override that scope.
