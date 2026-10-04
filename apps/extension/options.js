const APP_URL_KEY = 'duckler-app-url';
const input = document.querySelector('#app-url');
const status = document.querySelector('#status');

void chrome.storage.local.get(APP_URL_KEY).then((result) => {
  input.value = result[APP_URL_KEY] || 'http://localhost:5176/';
});

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const url = new URL(input.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS address.');
    await chrome.storage.local.set({ [APP_URL_KEY]: url.href });
    status.textContent = 'App address saved.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not save settings.';
  }
});
