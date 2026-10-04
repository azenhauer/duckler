# Personal Visual Library

This repository is a TypeScript monorepo for the Personal Visual Library described in [Visual-Library-Codex-Specification.md](./Visual-Library-Codex-Specification.md).

## Repository structure

- `apps/web`: static React + Vite app for the local-first visual library
- `apps/extension`: unpacked Chromium extension for page, text, link, and screenshot capture
- `packages/shared`: shared schemas, types, and validation helpers
- `docs/`: project documentation and progress notes

## Setup

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
```

## Common commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
```

## Deploy to Cloudflare Pages

The Pages project is configured to build the static PWA from the monorepo root. The Cloudflare Pages build settings are:

- **Root directory:** `/`
- **Build command:** `corepack pnpm install --frozen-lockfile && corepack pnpm --dir apps/web build`
- **Build output directory:** `apps/web/dist`
- **Build environment variable:** `NODE_VERSION=20`
- **Production build variable (optional):** `VITE_GOOGLE_CLIENT_ID`

Create a Pages project connected to this repository and add `VITE_GOOGLE_CLIENT_ID` in **Settings → Environment variables** if Google Drive OAuth should be enabled. Add the deployed `*.pages.dev` hostname and any custom domain to the OAuth web client's **Authorized JavaScript origins**, then redeploy after changing build variables. Without the variable, the deployed app works in local-only mode.

Cloudflare Pages serves the PWA and its service worker, applies the static response headers in `apps/web/public/_headers`, and routes share-target POST requests through `functions/share-target/`. The fallback safely redirects supported URL/text shares to the app; shared image files should be added through the app's Upload action. The service worker normally stores share metadata in the offline inbox; the Pages Function covers the case where the app does not yet control the page.

For command-line publishing, authenticate once with `corepack pnpm dlx wrangler login`, build with `corepack pnpm --dir apps/web build`, then run `corepack pnpm pages:deploy`. `corepack pnpm pages:preview` serves the built site locally with Pages Functions enabled.

`wrangler.jsonc` points Wrangler at `apps/web/dist`. Git-connected Pages deployments use the build settings above; no Cloudflare account or credentials are stored in this repository.

## Environment configuration

To enable the real Google Drive OAuth path for M5b, set a local environment value before starting the web app:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

Without this value, the app remains in local-only mode and surfaces the exact configuration gap in the sync panel.

## Current status

This workspace includes the local-first library and the implemented M1–M7 milestone features: card schemas, local persistence, search, collections, capture queue processing, canvas references, Google Drive sync, recovery controls, and a one-way Obsidian archive export.

The library includes a local profile area for a display name, user tag, and photo (JPEG/PNG/WebP, up to 1 MiB). These profile details are stored in the current browser only and are not synced to Google Drive.

The remaining M7 release gate is external/manual: open an exported archive in an actual Obsidian vault and connect live sync conflict state to the conflict report. The exporter reports conflict status as unknown when no conflict snapshot is supplied.

## Browser extension

For local unpacked installation and capture workflow instructions, see [apps/extension/README.md](./apps/extension/README.md). The extension is a development MVP; real Chrome/Edge acceptance testing is still pending.
