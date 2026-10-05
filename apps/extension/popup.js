const $ = selector => document.querySelector(selector);
let page, currentTab, mode = 'bookmark', saving = false;
let selectionPort, contextVersion = 0;
const drafts = new Map();
let collectionPage = 0, queuePage = 0;
let collectionOptions = [], selectedCollectionIds = [], selectedCollectionNames = [];
const showStatus = (text, error = false) => { $('#status').textContent = text; $('#status').classList.toggle('error', error); $('#status').setAttribute('role', error ? 'alert' : 'status'); };
const request = async message => {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension request failed.');
  return response;
};
function setupCollectionPicker() {
  const input = $('#capture-collection');
  if (!input) return;
  input.hidden = true;
  const label = input.closest('label');
  if (!label) return;
  label.classList.add('collection-picker'); label.firstChild.textContent = 'Collections';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'collection-picker-toggle'; toggle.className = 'collection-picker-toggle'; toggle.textContent = 'Choose collections'; toggle.setAttribute('aria-expanded', 'false');
  const chips = document.createElement('div'); chips.id = 'collection-chips'; chips.className = 'collection-chips'; chips.setAttribute('aria-live', 'polite');
  const popover = document.createElement('div'); popover.id = 'collection-picker-popover'; popover.className = 'collection-picker-popover'; popover.hidden = true;
  const search = document.createElement('input'); search.id = 'collection-search'; search.type = 'search'; search.placeholder = 'Search collections'; search.setAttribute('aria-label', 'Search collections');
  const list = document.createElement('div'); list.id = 'collection-list'; list.className = 'collection-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Collections');
  const createRow = document.createElement('div'); createRow.className = 'collection-create';
  const createInput = document.createElement('input'); createInput.id = 'new-collection-name'; createInput.maxLength = 200; createInput.placeholder = 'New collection name';
  const createButton = document.createElement('button'); createButton.id = 'create-collection'; createButton.type = 'button'; createButton.textContent = '+ Create new collection'; createRow.append(createInput, createButton);
  const navigation = document.createElement('div'); navigation.className = 'list-navigation';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = 'Previous';
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next';
  navigation.append(previous, next);
  popover.append(search, list, navigation, createRow); label.append(toggle, chips, popover);
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = collectionOptions.filter(item => item.name.toLocaleLowerCase().startsWith(query) || item.name.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    if (!visible.length) { const empty = document.createElement('span'); empty.className = 'collection-empty'; empty.textContent = collectionOptions.length ? 'No matching collections' : 'No collections yet'; list.append(empty); }
    collectionPage = Math.min(collectionPage, Math.max(0, Math.ceil(visible.length / 3) - 1));
    navigation.hidden = visible.length <= 3; previous.disabled = collectionPage === 0; next.disabled = (collectionPage + 1) * 3 >= visible.length;
    for (const item of visible.slice(collectionPage * 3, collectionPage * 3 + 3)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'collection-option'; button.setAttribute('role', 'option'); const selected = selectedCollectionIds.includes(item.id) || selectedCollectionNames.includes(item.name); button.setAttribute('aria-selected', String(selected)); const check = document.createElement('span'); check.className = 'collection-checkmark'; check.textContent = selected ? '✓' : ''; const name = document.createElement('span'); name.textContent = String(item.name ?? ''); button.append(check, name); if (item.cardCount) { const count = document.createElement('small'); count.textContent = String(item.cardCount); button.append(count); } // Collection names are user text: never parse them as HTML.
      button.addEventListener('click', () => { if (selectedCollectionIds.includes(item.id)) selectedCollectionIds = selectedCollectionIds.filter(id => id !== item.id); else selectedCollectionIds.push(item.id); selectedCollectionNames = selectedCollectionIds.map(id => collectionOptions.find(option => option.id === id)?.name).filter(Boolean); render(); }); list.append(button);
    }
    chips.replaceChildren();
    if (selectedCollectionNames.length) { const chip = document.createElement('span'); chip.className = 'collection-chip'; chip.textContent = selectedCollectionNames.join(', '); chip.title = chip.textContent; chips.append(chip); }
    toggle.textContent = selectedCollectionNames.length ? `${selectedCollectionNames.length} selected` : 'Choose collections';
  };
  toggle.addEventListener('click', () => { popover.hidden = !popover.hidden; toggle.setAttribute('aria-expanded', String(!popover.hidden)); if (!popover.hidden) search.focus(); });
  search.addEventListener('input', render);
  previous.addEventListener('click', () => { collectionPage--; render(); }); next.addEventListener('click', () => { collectionPage++; render(); });
  createButton.addEventListener('click', () => { const name = createInput.value.trim(); if (!name) return; const existing = collectionOptions.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()); const item = existing || { id: `local-${crypto.randomUUID()}`, name, cardCount: 0 }; if (!existing) collectionOptions = [...collectionOptions, item]; if (!selectedCollectionIds.includes(item.id)) selectedCollectionIds.push(item.id); selectedCollectionNames = [...new Set([...selectedCollectionNames, item.name])]; createInput.value = ''; render(); });
  document.addEventListener('click', event => { if (!label.contains(event.target)) { popover.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });
  render();
  return render;
}
async function initialize() {
  const version = ++contextVersion;
  if (page && currentTab) drafts.set(`${currentTab.id}:${page.url}`, { mode, title: $('#capture-title').value, note: $('#note-text').value, caption: $('#caption-text').value, tags: $('#tags').value, pdfUrl: $('#pdf-url').value, ids: [...selectedCollectionIds], names: [...selectedCollectionNames] });
  selectionPort?.disconnect(); selectionPort = undefined;
  void request({ type: 'list-collections' }).then(response => { if (Array.isArray(response.collections)) { collectionOptions = response.collections; $('#collection-search')?.dispatchEvent(new Event('input')); } }).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (version !== contextVersion) return;
  currentTab = tab;
  page = undefined;
  for (const id of ['capture-title', 'note-text', 'caption-text', 'tags', 'pdf-url']) $('#' + id).value = '';
  selectedCollectionIds = []; selectedCollectionNames = []; $('#collection-search')?.dispatchEvent(new Event('input'));
  for (const id of ['mode-page', 'mode-selection', 'mode-pdf', 'capture-region']) $('#' + id).disabled = false;
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a website to save a link or screenshot. You can still write a note.');
  page = { title: tab.title || '', url: tab.url, selection: '', pdfLinks: [] };
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, url: location.href, selection: window.getSelection()?.toString().trim() || '',
      pdfLinks: [...document.querySelectorAll('a[href]')].filter(link => /\.pdf(?:$|[?#])/i.test(link.href) || link.type === 'application/pdf' || /\.pdf$/i.test(link.download)).slice(0, 100).map(link => ({ url: link.href, title: link.textContent.trim() })) }) });
    if (version !== contextVersion) return;
    if (result?.result) page = result.result;
  } catch { /* Browser PDF viewers may not allow page scripts; use the tab URL. */ }
  if (version !== contextVersion) return;
  const pdfOptions = $('#pdf-links');
  pdfOptions.replaceChildren();
  for (const link of page.pdfLinks || []) { const option = document.createElement('option'); option.value = link.url; option.label = link.title; pdfOptions.append(option); }
  $('#pdf-url').value = /\.pdf(?:$|[?#])/i.test(page.url) ? page.url : page.pdfLinks?.[0]?.url || '';
  $('#capture-title').value = page.title || tab.title || '';
  $('#page-title').textContent = page.title || tab.title || 'Untitled page';
  $('#page-domain').textContent = new URL(page.url).hostname.replace(/^www\./, '');
  setMode('bookmark');
  if (page.selection) { $('#note-text').value = page.selection; setMode('text'); }
  else if (/\.pdf(?:$|[?#])/i.test(page.url)) setMode('pdf');
  const draft = drafts.get(`${tab.id}:${page.url}`);
  if (draft) {
    $('#capture-title').value = draft.title; $('#note-text').value = draft.note; $('#caption-text').value = draft.caption; $('#tags').value = draft.tags; $('#pdf-url').value = draft.pdfUrl;
    selectedCollectionIds = draft.ids; selectedCollectionNames = draft.names; setMode(draft.mode); $('#collection-search')?.dispatchEvent(new Event('input'));
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection.js'] });
    if (version !== contextVersion || !chrome.tabs.connect) return;
    selectionPort = chrome.tabs.connect(tab.id, { name: 'duckler-selection-v1' });
    selectionPort.onMessage.addListener(message => {
      if (version !== contextVersion) return;
      if (message.type === 'selection' && message.url === page?.url && typeof message.text === 'string' && message.text.trim() && message.text.slice(0, 100000) !== page.selection) {
        page.selection = message.text.slice(0, 100000); $('#note-text').value = page.selection; setMode('text');
      }
      if (message.type === 'save-and-send') void saveCapture(true);
    });
    selectionPort.onDisconnect.addListener(() => { void chrome.runtime.lastError; });
  } catch { /* Restricted pages can still save a link or a manually written note. */ }
}
function setMode(next) {
  mode = next;
  const note = next === 'note';
  $('#pdf-field').hidden = next !== 'pdf';
  $('#mode-pdf').classList.toggle('active', next === 'pdf'); $('#mode-pdf').setAttribute('aria-pressed', String(next === 'pdf'));
  $('#selection-preview').hidden = true;
  $('#selection-preview').textContent = page?.selection || '';
  $('#preview-kind').textContent = note ? 'Note' : next === 'text' ? 'Highlight' : 'Link';
  $('#save-page').textContent = 'Save ' + (note ? 'note' : next === 'pdf' ? 'PDF' : next === 'text' ? 'highlight' : 'link');
  $('#save-page').disabled = saving || (!note && !page);
  $('#note-text').placeholder = note ? 'Write something worth keeping…' : 'What caught your eye? (optional)';
  $('#note-label').textContent = note || next === 'text' ? 'Note' : 'Caption';
  $('#caption-field').hidden = !(note || next === 'text');
  if (next === 'text') $('#note-text').placeholder = 'Highlight text on the page, or type your note here…';
  for (const [id, selected] of [['mode-page', next === 'bookmark'], ['mode-selection', next === 'text'], ['mode-note', note]]) {
    $('#' + id).classList.toggle('active', selected); $('#' + id).setAttribute('aria-pressed', String(selected));
  }
  if (note) { if ($('#capture-title').value === page?.title) $('#capture-title').value = ''; $('#note-text').focus(); }
}
async function renderQueue() {
  const { items, budget } = await request({ type: 'list-captures' });
  $('#queue-count').textContent = items.length;
  const megabytes = items.reduce((sum, item) => sum + item.byteLength, 0) / (1024 * 1024);
  $('#queue-summary').textContent = items.length ? items.length + ' pending · ' + megabytes.toFixed(1) + ' / ' + (budget / (1024 * 1024)).toFixed(0) + ' MiB. Open your library to receive them.' : 'All caught up. New captures will appear here until your library receives them.';
  const list = $('#queue-list'); list.replaceChildren();
  queuePage = Math.min(queuePage, Math.max(0, Math.ceil(items.length / 3) - 1));
  $('#queue-navigation').hidden = items.length <= 3; $('#queue-previous').disabled = queuePage === 0; $('#queue-next').disabled = (queuePage + 1) * 3 >= items.length;
  for (const item of items.slice(queuePage * 3, queuePage * 3 + 3)) {
    const row = document.createElement('li'), details = document.createElement('div'), title = document.createElement('strong'), meta = document.createElement('small');
    title.textContent = item.title; meta.textContent = (item.kind === 'text' ? 'Highlight' : item.kind) + ' · ' + new Date(item.createdAt).toLocaleDateString();
    if (item.payload && item.kind !== 'pdf') { const image = document.createElement('img'); image.src = item.payload; image.alt = ''; row.append(image); }
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
$('#mode-pdf').addEventListener('click', () => setMode('pdf'));
async function saveCapture(send = false) {
  if (saving) return;
  const note = $('#note-text').value.trim();
  if ((mode === 'note' || mode === 'text') && !note) { showStatus('Write or highlight a note before saving.', true); return; }
  if (mode !== 'note' && !page) return;
  if (mode === 'pdf' && !$('#pdf-url').value.trim()) { showStatus('Choose or paste a PDF download URL.', true); return; }
  saving = true; $('#save-page').disabled = true; $('#save-page').textContent = 'Saving…';
  try {
    await request({ type: mode === 'pdf' ? 'capture-pdf' : 'queue-capture', tabId: currentTab?.id, url: $('#pdf-url').value.trim(), capture: { kind: mode === 'note' ? 'text' : mode,
      collectionIds: selectedCollectionIds.filter(id => !id.startsWith('local-')),
      collectionNames: selectedCollectionNames,
      collectionName: selectedCollectionNames[0] || '',
      title: $('#capture-title').value.trim() || (mode === 'note' || mode === 'text' ? note.slice(0, 160) : page.title || page.url),
      sourceUrl: page?.url || '', note, caption: mode === 'text' || mode === 'note' ? $('#caption-text').value.trim() : '',
      tags: $('#tags').value.split(',').map(tag => tag.trim()).filter(Boolean) } });
    showStatus('Queued on this device. Ready for your library.');
    if (send) {
      try { await request({ type: 'deliver-capture' }); showStatus('Saved · sending to your library.'); }
      catch { showStatus('Saved locally. Open your library to finish sending.', true); }
    }
    $('#save-page').textContent = 'Saved ✓'; await renderQueue();
  } catch (error) { showStatus(error.message, true); }
  finally { saving = false; $('#save-page').disabled = false; }
}
$('#save-page').addEventListener('click', () => { void saveCapture(true); });
const saveShortcut = event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat) { event.preventDefault(); void saveCapture(true); }
};
document.addEventListener('keydown', saveShortcut);
$('#queue-previous').addEventListener('click', () => { queuePage--; void renderQueue().catch(error => showStatus(error.message, true)); });
$('#queue-next').addEventListener('click', () => { queuePage++; void renderQueue().catch(error => showStatus(error.message, true)); });
$('#capture-region').addEventListener('click', async () => {
  try { await request({ type: 'start-region', tabId: currentTab.id }); } catch (error) { showStatus(error.message, true); }
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
const initializeSafely = () => initialize().catch(() => {
  $('#page-title').textContent = 'Keep a thought'; $('#page-domain').textContent = 'QUICK NOTE'; $('#mode-page').disabled = true; $('#mode-selection').disabled = true; $('#capture-region').disabled = true; setMode('note'); showStatus('This page only supports notes.');
});
setupCollectionPicker();
void initializeSafely();
chrome.tabs.onActivated?.addListener(() => { if (!saving) void initializeSafely(); });
chrome.tabs.onUpdated?.addListener((tabId, change) => { if (tabId === currentTab?.id && change.status === 'complete' && !saving) void initializeSafely(); });
window.addEventListener('pagehide', () => { selectionPort?.disconnect(); document.removeEventListener('keydown', saveShortcut); });
void renderQueue().catch(error => showStatus(error.message, true));
void request({ type: 'pairing-status' }).then(({ pairing }) => { $('#connection-status').textContent = pairing ? 'Library connected' : 'Connect library'; }).catch(error => showStatus(error.message, true));

