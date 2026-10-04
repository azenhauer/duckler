# Personal Visual Library

This repository is a TypeScript monorepo for the Personal Visual Library described in [Visual-Library-Codex-Specification.md](./Visual-Library-Codex-Specification.md).

## Repository structure

- `apps/web`: static React + Vite app for the local-first visual library
- `apps/extension`: unpacked Chromium extension for page, text, link, and screenshot capture
- `packages/shared`: shared schemas, types, and validation helpers
- `docs/`: project documentation and progress notes

## Setup

```bash
npm install
```

## Common commands

```bash
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
npm run build:extension:dev
npm run test:ui
```

## Deploy to Cloudflare Pages

The Pages project is configured to build the static PWA from the monorepo root. The Cloudflare Pages build settings are:

- **Root directory:** `/`
- **Build command:** `npm ci && npm run build --workspace @visual-library/web`
- **Build output directory:** `apps/web/dist`
- **Build environment variable:** `NODE_VERSION=20`
- **Production build variable (optional):** `VITE_GOOGLE_CLIENT_ID`

Create a Pages project connected to this repository and add `VITE_GOOGLE_CLIENT_ID` in **Settings → Environment variables** if Google Drive OAuth should be enabled. Add the deployed `*.pages.dev` hostname and any custom domain to the OAuth web client's **Authorized JavaScript origins**, then redeploy after changing build variables. Without the variable, the deployed app works in local-only mode.

Cloudflare Pages serves the PWA and its service worker, applies the static response headers in `apps/web/public/_headers`, and routes share-target POST requests through `functions/share-target/`. The fallback safely redirects supported URL/text shares to the app; shared image files should be added through the app's Upload action. The service worker normally stores share metadata in the offline inbox; the Pages Function covers the case where the app does not yet control the page.

For command-line publishing, authenticate once with `npx wrangler login`, build with `npm run build --workspace @visual-library/web`, then run `npm run pages:deploy`. `npm run pages:preview` serves the built site locally with Pages Functions enabled.

`wrangler.jsonc` points Wrangler at `apps/web/dist`. Git-connected Pages deployments use the build settings above; no Cloudflare account or credentials are stored in this repository.

Use npm for both dependency installation and the Pages build command. This repository keeps only `package-lock.json`; do not add a pnpm lockfile or configure a pnpm build command. If a Pages log says this project is configured to use npm, check the dashboard's build command and replace any old pnpm command with the npm command above, then retry the deployment. Wrangler's `vars` configure the Functions runtime; Vite's `VITE_*` values must also be supplied as build environment variables in Pages when needed.

## Environment configuration

To enable the real Google Drive OAuth path for M5b, set a local environment value before starting the web app:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

Without this value, the app remains in local-only mode and surfaces the exact configuration gap in the sync panel.

## Current status

This workspace includes the local-first library and the implemented M1–M7 milestone features: card schemas, local persistence, search, collections, capture queue processing, canvas references, Google Drive sync, recovery controls, and a one-way Obsidian archive export.

The centered refs workspace defaults to dark mode and uses bundled Inter. Home always shows search and animated Collections/Canvas entry points, with the same shortcuts available in the bottom dock. Clicking the bottom avatar opens Settings; hovering it is read-only. The identity card has a customizable glass accent, without applying that texture to the whole popup. Empty libraries do not insert sample data.

Canvas opens a collection gallery; each collection has its own cards, saved arrangement and viewport. Profile details and canvas layouts stay in the current browser and are not synced to Google Drive. Canvas layouts are not currently part of JSON/Obsidian exports. `npm run test:ui` and `npm run test:canvas:ui` verify the running app in isolated browser profiles.

The remaining M7 release gate is external/manual: open an exported archive in an actual Obsidian vault and connect live sync conflict state to the conflict report. The exporter reports conflict status as unknown when no conflict snapshot is supplied.

## Browser extension

For local unpacked installation and capture workflow instructions, see [apps/extension/README.md](./apps/extension/README.md). The extension is a development MVP; real Chrome/Edge acceptance testing is still pending.
