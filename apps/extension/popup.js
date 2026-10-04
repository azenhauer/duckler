const $ = selector => document.querySelector(selector);
let page, currentTab, mode = 'bookmark', saving = false;
const showStatus = (text, error = false) => { $('#status').textContent = text; $('#status').classList.toggle('error', error); $('#status').setAttribute('role', error ? 'alert' : 'status'); };
const request = async message => {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension request failed.');
  return response;
};
async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a website to save a link or screenshot. You can still write a note.');
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, url: location.href, selection: window.getSelection()?.toString().trim() || '' }) });
  page = result.result;
  $('#page-title').textContent = page.title || tab.title || 'Untitled page';
  $('#page-domain').textContent = new URL(page.url).hostname.replace(/^www\./, '');
  $('#mode-selection').disabled = !page.selection;
  if (page.selection) setMode('text');
}
function setMode(next) {
  mode = next;
  const note = next === 'note';
  $('#selection-preview').hidden = next !== 'text';
  $('#selection-preview').textContent = page?.selection || '';
  $('#preview-kind').textContent = note ? 'Note' : next === 'text' ? 'Highlight' : 'Link';
  $('#save-page').textContent = 'Save ' + (note ? 'note' : next === 'text' ? 'highlight' : 'link');
  $('#save-page').disabled = saving || (!note && !page);
  $('#note-text').placeholder = note ? 'Write something worth keeping…' : 'What caught your eye? (optional)';
  for (const [id, selected] of [['mode-page', next === 'bookmark'], ['mode-selection', next === 'text'], ['mode-note', note]]) {
    $('#' + id).classList.toggle('active', selected); $('#' + id).setAttribute('aria-pressed', String(selected));
  }
  if (note) $('#note-text').focus();
}
async function renderQueue() {
  const { items, budget } = await request({ type: 'list-captures' });
  $('#queue-count').textContent = items.length;
  const megabytes = items.reduce((sum, item) => sum + item.byteLength, 0) / (1024 * 1024);
  $('#queue-summary').textContent = items.length ? items.length + ' pending · ' + megabytes.toFixed(1) + ' / ' + (budget / (1024 * 1024)).toFixed(0) + ' MiB. Open your library to receive them.' : 'All caught up. New captures will appear here until your library receives them.';
  const list = $('#queue-list'); list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li'), details = document.createElement('div'), title = document.createElement('strong'), meta = document.createElement('small');
    title.textContent = item.title; meta.textContent = (item.kind === 'text' ? 'Highlight' : item.kind) + ' · ' + new Date(item.createdAt).toLocaleDateString();
    if (item.payload) { const image = document.createElement('img'); image.src = item.payload; image.alt = ''; row.append(image); }
    details.append(title, meta);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove ' + item.title);
    remove.addEventListener('click', async () => { try { await request({ type: 'delete-capture', id: item.id }); await renderQueue(); } catch (error) { showStatus(error.message, true); } });
    row.append(details, remove); list.append(row);
  }
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  const save = button.dataset.tab === 'save';
  $('#save-panel').hidden = !save; $('#queue-panel').hidden = save;
  document.querySelectorAll('.tab').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); });
  if (!save) void renderQueue().catch(error => showStatus(error.message, true));
}));
$('#mode-page').addEventListener('click', () => setMode('bookmark'));
$('#mode-selection').addEventListener('click', () => setMode('text'));
$('#mode-note').addEventListener('click', () => setMode('note'));
$('#save-page').addEventListener('click', async () => {
  if (saving) return;
  const note = $('#note-text').value.trim();
  if (mode === 'note' && !note) { showStatus('Write a note before saving.', true); return; }
  saving = true; $('#save-page').disabled = true; $('#save-page').textContent = 'Saving…';
  try {
    await request({ type: 'queue-capture', capture: { kind: mode === 'note' ? 'text' : mode,
      title: mode === 'note' ? note.slice(0, 160) : mode === 'text' ? page.selection.slice(0, 1000) : page.title || page.url,
      sourceUrl: page?.url || '', note: mode === 'text' ? page.selection + (note ? '\n\n' + note : '') : note,
      tags: $('#tags').value.split(',').map(tag => tag.trim()).filter(Boolean) } });
    showStatus('Queued on this device. Ready for your library.');
    $('#save-page').textContent = 'Saved ✓'; await renderQueue();
  } catch (error) { showStatus(error.message, true); }
  finally { saving = false; $('#save-page').disabled = false; }
});
$('#capture-region').addEventListener('click', async () => {
  try { await request({ type: 'start-region', tabId: currentTab.id }); window.close(); } catch (error) { showStatus(error.message, true); }
});
let openingSettings = false;
async function openSettings() {
  if (openingSettings) return;
  openingSettings = true;
  $('#settings').disabled = true;
  try {
    try { await chrome.runtime.openOptionsPage(); }
    catch { await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); }
  } catch {
    showStatus('Could not open Settings. In Chrome Extensions, open Duckler Capture → Details → Extension options.', true);
  } finally {
    openingSettings = false;
    $('#settings').disabled = false;
  }
}
$('#settings').addEventListener('click', () => { void openSettings(); });
$('#connection-status').addEventListener('click', () => { void openSettings(); });
$('#open-library').addEventListener('click', () => { void request({ type: 'open-library' }).catch(error => showStatus(error.message, true)); });
$('#export-queue').addEventListener('click', async () => {
  try {
    const { items } = await request({ type: 'list-captures' });
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), captures: items }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'duckler-captures.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showStatus('Pending captures exported.');
  } catch (error) { showStatus(error.message, true); }
});
void initialize().catch(error => {
  $('#page-title').textContent = 'Keep a thought'; $('#page-domain').textContent = 'QUICK NOTE'; $('#mode-page').disabled = true; $('#mode-selection').disabled = true; $('#capture-region').disabled = true; setMode('note'); showStatus(error.message);
});
void renderQueue().catch(error => showStatus(error.message, true));
void request({ type: 'pairing-status' }).then(({ pairing }) => { $('#connection-status').textContent = pairing ? 'Library connected' : 'Connect library'; }).catch(error => showStatus(error.message, true));
