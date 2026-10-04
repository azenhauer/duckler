const $ = selector => document.querySelector(selector);
const errorText = error => error instanceof Error ? error.message : String(error);
const status = (text, error = false) => {
  $('#status').textContent = text;
  $('#status').classList.toggle('error', error);
  $('#status').setAttribute('role', error ? 'alert' : 'status');
};
const request = message => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('The extension did not respond. Open chrome://extensions, reload Duckler Capture, then reopen its Settings.')), 8000);
  Promise.resolve().then(() => chrome.runtime.sendMessage(message)).then(response => {
    clearTimeout(timer);
    if (!response?.ok) reject(new Error(response?.error || 'Could not connect the library.'));
    else resolve(response);
  }, error => {
    clearTimeout(timer);
    reject(new Error('Extension connection failed: ' + errorText(error) + '. Reload Duckler Capture and reopen its Settings.'));
  });
});
const display = (pairing, extensionId) => {
  $('#connection-details').hidden = false;
  $('#connected-origin').textContent = 'Connected to ' + pairing.origin;
  $('#confirmation-code').value = JSON.stringify({ ...pairing, extensionId });
};
let submitting = false;
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const raw = $('#pairing-code').value.trim();
  if (!raw) { status('Paste the library setup code from the app’s Settings → Browser extension first.', true); $('#pairing-code').focus(); return; }
  let pairing;
  try { pairing = JSON.parse(raw); } catch { status('This is not a valid setup code. Copy the complete code from the app’s Browser extension settings.', true); return; }
  submitting = true;
  const button = $('#confirm-connection');
  button.disabled = true; button.textContent = 'Connecting…';
  $('#settings-form').setAttribute('aria-busy', 'true');
  status('Connecting to your library…');
  try {
    const response = await request({ type: 'pair-library', pairing });
    display(response.pairing, response.extensionId);
    status('Connection confirmed. Copy the confirmation code below back into your library.');
    $('#confirmation-code').focus(); $('#confirmation-code').select();
  } catch (error) { status(errorText(error), true); }
  finally {
    submitting = false; button.disabled = false; button.textContent = 'Confirm library connection';
    $('#settings-form').setAttribute('aria-busy', 'false');
  }
});
$('#copy-confirmation').addEventListener('click', () => {
  void navigator.clipboard.writeText($('#confirmation-code').value).then(() => status('Confirmation copied.'), () => { $('#confirmation-code').select(); status('Select and copy the code above.'); });
});
$('#open-library').addEventListener('click', () => { void request({ type: 'open-library' }).catch(error => status(errorText(error), true)); });
void request({ type: 'pairing-status' }).then(({ pairing, extensionId }) => { if (pairing) display(pairing, extensionId); }).catch(error => status(errorText(error), true));
void request({ type: 'list-captures' }).then(({ items }) => {
  $('#queue-summary').textContent = items.length + ' pending captures on this device. Export pending captures before removing the extension or changing your browser profile.';
}).catch(error => status(errorText(error), true));
