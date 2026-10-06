# Security review: October 6, 2026

Checked against the leaks that commonly hit fast-built apps: committed secrets, open server routes,
unauthenticated data access, injection, unsafe links, cross-site actions, over-broad tokens and
public build output. The fixes listed here were made in this pass.

## Fixed
- **Drive-by imports (cross-site).** Any website could add cards to a visitor's library: linking to
  `duckler.pages.dev/?sharedTitle=…&sharedUrl=…`, or submitting a form to `/share-target/`, saved the
  item immediately. Shared-in items now wait in an **"Add shared items?"** dialog (Add / Discard), and
  the address parameters are removed on load. Tests: `App.test.tsx` "asks before adding…" and "discards…".
- **Dead capture-by-URL path removed.** `?ducklerCapture=<json>` created cards (images included) from the
  address with no checks beyond parsing. Nothing sends it any more (the extension uses its paired
  bridge), so `lib/extensionCapture.ts` and the App code were deleted.
- **Frozen AI routes are off.** `/api/embed` and `/api/embed/token` now always answer 404, so no
  configuration can spend Workers AI quota. The code stays in `packages/backend/src/embed.ts`.
- **Dev server no longer on the network.** `npm run dev` binds to localhost (the dev-tool advisories in
  `npm audit` concern a network-reachable dev server). `npm run dev:lan` opts in for phone testing.
- **HSTS** added to `_headers`.
- **Share links disclose what they show:** the dialog says the sharer's name, picture and card are visible.
- **Profile images are validated** when read back from storage (raster data URLs only) before being used
  in `src` or a CSS `url()`.

## Verified (no change needed)
- **No secrets in the repository or its history** (scanned for Google, OpenAI, GitHub, Slack, AWS and
  private-key patterns, OAuth client secrets and `.env` files). `.env*` files are git-ignored.
- **No HTML injection sinks** (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) in the
  shipped app or extension code. All user and shared text is rendered as text by React.
- **Links:** the only data-driven `href` (a shared card's source) is limited to http(s) by the share
  parser, and opens with `rel="noopener noreferrer nofollow"`.
- **Share links:** AES-GCM encrypted. The key is only in the URL `#fragment` (never sent anywhere), and
  `Referrer-Policy: no-referrer` is set. The viewer validates everything with a strict schema: raster
  data-URL images only, no SVG, http(s) links, hex colours, size limits, unknown fields rejected.
  Stopping sharing deletes the Drive file.
- **Google access:** scope `drive.file` (Duckler only sees files it created). The token stays in memory,
  never in storage, and is revoked on sign-out. Only the account's display name and email are kept, to
  offer "Continue as…".
- **Browser API key:** public by design; the setup guide restricts it to the site's address and the
  Drive API. Client ID: public by design.
- **Server routes:** `/api/*` (D1 foundation) is fail-closed (503) unless explicitly enabled with all
  required configuration; it has cross-user denial tests. `/share-target` only redirects (now behind
  the confirmation).
- **Extension:** `externally_connectable` limited to the library origin; the bridge requires pairing;
  runtime messages are accepted only from the extension itself; crop requests only from a page's top
  frame; PDF downloads only from the current site's origin.
- **Headers:** CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`, `object-src 'none'`),
  `X-Frame-Options: DENY`, `nosniff`, COOP, Permissions-Policy.
- **Build output:** no source maps, source files, tests or env files are published.
- **Production dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities.

## Open (owner decisions or larger work)
- **Dev-only advisories:** fixed October 7, 2026 (vite 7, vitest 4, esbuild 0.28, typescript-eslint 8, @vitejs/plugin-react 5); `npm audit` reports 0 vulnerabilities.
- **Google app verification:** until published, only test users can sign in (by design for now).
- **Google values are Cloudflare secrets** (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`), served at runtime by
  `/api/config` (format-checked, nothing else returned). They are not in `wrangler.jsonc` or the repository.
