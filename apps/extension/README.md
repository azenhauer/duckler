# Duckler Capture extension

This is a Chromium Manifest V3 extension. It keeps captures in `chrome.storage.local` and opens the configured Duckler app with a capture link. The app imports the Card locally; Drive synchronization remains the app's responsibility.

This is an installable development MVP. Automated tests cover the queue and app handoff with mocked browser APIs; the extension has not yet been acceptance-tested in Chrome or Edge.

## Install for development

1. Start Duckler with `corepack pnpm dev`.
2. In Chrome or Edge, open the extensions page and enable **Developer mode**.
3. Choose **Load unpacked** and select this `apps/extension` folder.
4. Open the extension's **Details → Extension options** and set the app URL to the origin currently running Duckler (default `http://localhost:5176/`).
5. Pin Duckler Capture, open a normal `http://` or `https://` page, and use the extension popup.

## Capture

- **Add to my library** saves the current page, optional note, tags, and optional collection name, then opens Duckler.
- **Save selected text** is in the Insights tab.
- **Capture a region** opens a drag-to-select overlay; Escape cancels without saving. `Alt+Shift+D` starts the same flow and can be changed at `chrome://extensions/shortcuts`.
- Context menu entries save pages, links, selected text, and image links.
- Queued items remain in extension storage until removed. Retrying uses the same capture ID, so the app does not create duplicate Cards.

Screenshots are cropped from the visible tab and scaled using the screenshot-to-viewport ratio, including device-pixel-ratio differences. Browser-internal pages and restricted origins cannot be captured. Very large capture URLs are rejected rather than truncated.

The extension has no broad host permissions and does not store Google credentials. It does not yet implement automatic background delivery, collection suggestions, or Drive sync.
