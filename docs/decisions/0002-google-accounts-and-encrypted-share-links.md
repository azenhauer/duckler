# 0002 — Google accounts, Drive sync and encrypted view-only share links

Date: 2026-10-06 · Status: accepted (owner decision) · Amends 0001

## Context
0001 chose Drive-first with no public links. The owner has now asked for Drive sync, account creation
and sharing collections by link, and chose (when asked): **sign in with Google** as the account, and
**view-only** links. Open-source references were checked first (owner rule): Vync (Obsidian ↔ Google
Drive sync, MIT) uses the same model of last-writer-wins plus deletion tombstones with a grace period;
Excalidraw's share links (MIT) encrypt in the browser and keep the key in the URL #fragment.

## Decision
- **Account = Google account.** No Duckler user database. Token flow (Google Identity Services), with
  the token in memory only and scope `drive.file`.
- **Sync** to `Duckler/` in the owner's Drive: `library.json` (cards without image data, collections,
  tombstones, share keys) plus one file per image. Records merge by newest `updatedAt`, a deletion wins
  over older versions, and tombstones are kept 180 days. A write is redone if `library.json` changed
  since it was read.
- **Share links** are view-only snapshots in the owner's Drive, shared "anyone with the link, viewer",
  encrypted with AES-GCM. The key lives only in `#fragment` of `duckler.pages.dev/s/<file>#<key>`.
  Stopping sharing deletes the file. Viewers read it with a referrer-restricted browser API key and
  render it as untrusted plain text.
- The D1 API foundation stays disabled. Collaboration (editing together), comments and follows are
  still deferred.

## Consequences
- The owner must create a Google Cloud project, OAuth client and API key (`docs/google-setup.md`).
- Until the app is published and brand-verified, only test users (up to 100) can sign in.
- Last-writer-wins can drop one side of a simultaneous edit to the same card; a "keep both" conflict
  screen (as in Vync) is the follow-up if this happens in practice.
- Canvases are not synced yet; they remain local (export a backup).
