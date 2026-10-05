# Duckler Capture

Chromium Manifest V3 extension built from TypeScript. Captures stay in extension-owned IndexedDB until the paired app commits the card and its receipt. Capturing does not open a new app tab or put payloads/secrets into navigation URLs.

## Load against localhost

1. Run `npm install`, `npm run dev`, and `npm run build:extension:dev` from the repository root.
2. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select `apps/extension/dist/development`, not this source folder. Its generated `manifest.json` is ready to load.
4. In the app, click the profile avatar → **Settings → Browser extension** and copy the library setup code.
5. Click **Settings** at the top right of the extension popup (or **Connect library** in its footer), paste that code, and confirm. Chrome's **Details → Extension options** opens the same page.
6. Paste the extension's confirmation code back into the app and choose **Connect extension**.

After changes, rebuild and click **Reload** on the extension card. Reload previously opened capture pages as well.

The development build allows localhost/127.0.0.1; pairing and each transfer bind to the exact origin and port. The production build (`npm run build:extension`) is restricted to `https://duckler.pages.dev`.

## Capture

- **Link**, **Highlight**, and **Note** save through the popup. Highlight needs selected text on a supported page.
- **PDF** saves the actual downloaded file into the selected collections. Choose a detected PDF link or paste a direct download URL, then click **Save PDF**. Direct `.pdf` pages select this mode automatically. The app creates a PDF card with its first-page thumbnail, page count and searchable embedded text.
- PDF downloads must be on the current website's origin, accessible to the browser, and at most 11 MiB (within the capture transfer budget). Open a cross-origin PDF on its own website first. Redirects, login pages, unavailable downloads and invalid PDFs are not saved as successful captures. Download larger or password-protected files separately and use the app's PDF upload flow. Queued files remain on the device until the library accepts them.
- **Capture region** opens a drag selector; `Alt+Shift+D` starts the same flow. After capture, review the screenshot on the current website, add an optional note, then choose **Save screenshot** or **Discard**. Nothing enters the delivery queue until Save. Escape cancels; unsaved drafts are lost when the page closes or reloads.
- Scrolling, zooming, resizing, switching tabs or navigating cancels unstable region captures. Cropping uses actual screenshot-to-viewport dimensions.
- Context-menu actions save pages, links, selected text and accessible same-origin images. For blocked/cross-origin images, use region capture.
- **Pending** supports reviewing, exporting and removing queued items. Export before uninstalling or deleting the browser profile.
- **Open library** explicitly opens or reuses the paired app. While the app is open, the authenticated chunked bridge delivers queued captures.

Browser-internal and restricted pages cannot be captured. Captures survive worker restarts and unavailable app sessions. Duplicate deliveries do not overwrite edits, trash state or deleted cards. Queue/capture limits are enforced. No broad host permissions or Google credentials are used.

## Verification

`npm test` covers queue durability, origin/protocol checks, crop geometry, atomic imports, retries and note-save rollback. `npm run test:ui` checks the running app at phone, tablet, desktop and landscape sizes, including scrolling search and reduced-motion preferences.

`npm run test:extension:browser` verifies pairing, connection feedback, popup width, worker note delivery and actual PDF downloading, parsing, collection placement and persistence in a separate Chromium profile. The headless test grants only its loopback PDF fixture access in a temporary extension copy because it cannot click the toolbar to grant `activeTab`; shipping permissions are unchanged. Real toolbar/context-menu/screenshot acceptance in Chrome/Edge remains a manual release gate. Unit and headless tests are not proof of every website's capture path.
