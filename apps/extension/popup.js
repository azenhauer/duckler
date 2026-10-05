const $ = selector => document.querySelector(selector);
let page, currentTab, mode = 'bookmark', saving = false, shooting = false;
let selectionPort, contextVersion = 0, modeVersion = 0, ready = Promise.resolve();
const drafts = new Map();
let collectionPage = 0, queuePage = 0;
let collectionOptions = [], selectedCollectionIds = [], selectedCollectionNames = [];
// Fields the person has typed in are never overwritten by autofill or new highlights.
const edited = new Set();
// Card colour chosen in the panel (same tints as the library editor); null keeps the default card style.
const CARD_TINTS = ['#3cc8ff', '#2a2ca6', '#f2d33d', '#3ddc84', '#ff4b4b', '#ff7ad9', '#9aa6ff', '#e6f6ff'];
let cardColour = null;
function renderColours() {
  const box = $('#card-colours'); if (!box) return;
  box.replaceChildren();
  for (const colour of [null, ...CARD_TINTS]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'card-colour' + (colour ? '' : ' is-default');
    if (colour) button.style.background = colour;
    button.setAttribute('aria-label', colour ? `Card colour ${colour}` : 'Default card colour'); button.title = colour || 'Default';
    button.setAttribute('aria-pressed', String(cardColour === colour));
    button.addEventListener('click', () => { cardColour = colour; renderColours(); });
    box.append(button);
  }
}
renderColours();
// Optional browser APIs: each feature quietly switches off where the API is missing.
const store = { get: async key => (await chrome.storage?.local?.get(key)) ?? {}, set: async value => { await chrome.storage?.local?.set(value); } };
let lastAutoNote = '', screenshot = null;
for (const id of ['capture-title', 'note-text', 'caption-text', 'tags', 'pdf-url']) document.getElementById(id)?.addEventListener('input', () => edited.add(id));
const fill = (id, value) => { if (edited.has(id) || typeof value !== 'string') return false; $('#' + id).value = value; return true; };
const cleanTags = list => [...new Set(list.flatMap(item => String(item).split(',')).map(tag => tag.trim().toLocaleLowerCase()).filter(tag => tag && tag.length <= 24))].slice(0, 5);
// A highlight fills an untouched note; manual drafts stay intact.
const applyHighlight = text => {
  const note = $('#note-text');
  if (!edited.has('note-text') || !note.value.trim() || note.value === lastAutoNote) { note.value = text; lastAutoNote = text; edited.delete('note-text'); }
  // A manually edited note is a draft, not an autofill destination.
};
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
  if (page && currentTab) drafts.set(`${currentTab.id}:${page.url}`, { mode, title: $('#capture-title').value, note: $('#note-text').value, caption: $('#caption-text').value, tags: $('#tags').value, pdfUrl: $('#pdf-url').value, ids: [...selectedCollectionIds], names: [...selectedCollectionNames], edited: [...edited], lastAutoNote, screenshot, cardColour });
  selectionPort?.disconnect(); selectionPort = undefined;
  void request({ type: 'list-collections' }).then(response => { if (version === contextVersion && Array.isArray(response.collections)) { collectionOptions = [...response.collections, ...collectionOptions.filter(item => item.id.startsWith('local-'))]; $('#collection-search')?.dispatchEvent(new Event('input')); } }).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (version !== contextVersion) return;
  currentTab = tab;
  page = undefined;
  for (const id of ['capture-title', 'note-text', 'caption-text', 'tags', 'pdf-url']) $('#' + id).value = '';
  edited.clear(); lastAutoNote = ''; screenshot = null; cardColour = null; renderColours(); $('#shot-preview').hidden = true;
  selectedCollectionIds = []; selectedCollectionNames = []; $('#collection-search')?.dispatchEvent(new Event('input'));
  for (const id of ['mode-page', 'mode-selection', 'mode-pdf', 'mode-shot', 'capture-region']) $('#' + id).disabled = false;
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a website to save a link or screenshot. You can still write a note.');
  page = { title: tab.title || '', url: tab.url, selection: '', pdfLinks: [] };
  const draft = drafts.get(`${tab.id}:${page.url}`);
  if (draft) {
    $('#capture-title').value = draft.title; $('#note-text').value = draft.note; $('#caption-text').value = draft.caption; $('#tags').value = draft.tags; $('#pdf-url').value = draft.pdfUrl;
    selectedCollectionIds = draft.ids; selectedCollectionNames = draft.names;
    for (const id of draft.edited || []) edited.add(id);
    lastAutoNote = draft.lastAutoNote || ''; screenshot = draft.screenshot || null; cardColour = draft.cardColour || null;
    if (screenshot) $('#shot-preview').src = screenshot.payload;
    renderColours(); $('#collection-search')?.dispatchEvent(new Event('input'));
  }
  setMode(draft?.mode || 'bookmark', false);
  const initialModeVersion = modeVersion;
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, url: location.href, selection: window.getSelection()?.toString().trim() || '',
      meta: (() => {
        const read = name => [...document.querySelectorAll(`meta[property="${name}"],meta[name="${name}"]`)].map(tag => (tag.getAttribute('content') || '').replace(/\s+/g, ' ').trim()).find(Boolean)?.slice(0, 600) || '';
        return { ogTitle: read('og:title') || read('twitter:title'), siteName: read('og:site_name') || read('application-name'), description: read('og:description') || read('description') || read('twitter:description'),
          keywords: read('keywords'), tags: [...document.querySelectorAll('meta[property="article:tag"]')].map(tag => tag.getAttribute('content') || '').slice(0, 10), h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
      })(),
      pdfLinks: [...document.querySelectorAll('a[href]')].filter(link => /\.pdf(?:$|[?#])/i.test(link.href) || link.type === 'application/pdf' || /\.pdf$/i.test(link.download)).slice(0, 100).map(link => ({ url: link.href, title: link.textContent.trim() })) }) });
    if (version !== contextVersion) return;
    if (result?.result) page = result.result;
  } catch { /* Some pages (the web store, PDFs) refuse scripts: keep the tab's own title. */ }
  if (version !== contextVersion) return;
  const pdfOptions = $('#pdf-links');
  pdfOptions.replaceChildren();
  for (const link of page.pdfLinks || []) { const option = document.createElement('option'); option.value = link.url; option.label = link.title; pdfOptions.append(option); }
  if (!draft) fill('pdf-url', /\.pdf(?:$|[?#])/i.test(page.url) ? page.url : page.pdfLinks?.[0]?.url || '');
  if (!draft) fill('capture-title', page.title || tab.title || '');
  try {
    const host = new URL(page.url).hostname;
    const { title } = await request({ type: 'suggest-title', hint: { pageTitle: page.title, ogTitle: page.meta?.ogTitle, siteName: page.meta?.siteName, host }, fallback: tab.title || '' });
    if (version !== contextVersion) return;
    if (!draft && title) fill('capture-title', title);
  } catch { /* Keep the page title. */ }
  if (version !== contextVersion) return;
  if (!draft && page.meta?.description && fill('note-text', page.meta.description.slice(0, 280))) lastAutoNote = $('#note-text').value;
  if (!draft) fill('tags', cleanTags([...(page.meta?.tags || []), page.meta?.keywords || '']).join(', '));
  try {
    const { ['duckler-last-collections']: last } = await store.get('duckler-last-collections');
    if (version === contextVersion && !draft && last && !selectedCollectionIds.length) { selectedCollectionIds = (last.ids || []).filter(id => !String(id).startsWith('local-')); selectedCollectionNames = last.names || []; $('#collection-search')?.dispatchEvent(new Event('input')); }
  } catch { /* Start with no collections. */ }
  if (version !== contextVersion) return;
  $('#page-title').textContent = page.title || tab.title || 'Untitled page';
  $('#page-domain').textContent = new URL(page.url).hostname.replace(/^www\./, '');
  if (!draft && modeVersion === initialModeVersion) {
    if (page.selection) { applyHighlight(page.selection); setMode('text'); }
    else if (/\.pdf(?:$|[?#])/i.test(page.url)) setMode('pdf');
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection.js'] });
    if (version !== contextVersion) return;
    // Also listen in same-site frames (articles and editors often live in iframes); others are skipped.
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['selection.js'] }); } catch { /* Main frame is enough. */ }
    if (version !== contextVersion || !chrome.tabs.connect) return;
    selectionPort = chrome.tabs.connect(tab.id, { name: 'duckler-selection-v1' });
    selectionPort.onMessage.addListener(message => {
      if (version !== contextVersion) return;
      // Sites that change URL without reloading still send highlights; follow the new address.
      if (message.type === 'selection' && page && typeof message.text === 'string' && message.text.trim() && message.text.slice(0, 100000) !== page.selection) {
        if (message.top && typeof message.url === 'string' && /^https?:/.test(message.url)) page.url = message.url;
        page.selection = message.text.slice(0, 100000); applyHighlight(page.selection); if (mode !== 'screenshot') setMode('text');
      }
      if (message.type === 'save-and-send') void saveCapture(true);
    });
    selectionPort.onDisconnect.addListener(() => { void chrome.runtime.lastError; });
  } catch { /* Restricted pages can still save a link or a manually written note. */ }
}
function setMode(next, resetNote = true) {
  mode = next;
  modeVersion++;
  const note = next === 'note';
  $('#pdf-field').hidden = next !== 'pdf';
  $('#shot-preview').hidden = !(next === 'screenshot' && screenshot);
  $('.instant-shot').hidden = next !== 'screenshot';
  $('#mode-shot').classList.toggle('active', next === 'screenshot'); $('#mode-shot').setAttribute('aria-pressed', String(next === 'screenshot'));
  $('#mode-pdf').classList.toggle('active', next === 'pdf'); $('#mode-pdf').setAttribute('aria-pressed', String(next === 'pdf'));
  $('#selection-preview').hidden = true;
  $('#selection-preview').textContent = page?.selection || '';
  $('#preview-kind').textContent = note ? 'Note' : next === 'text' ? 'Highlight' : 'Link';
  $('#save-page').textContent = 'Save ' + (note ? 'note' : next === 'pdf' ? 'PDF' : next === 'text' ? 'highlight' : next === 'screenshot' ? 'screenshot' : 'link');
  $('#save-page').disabled = saving || (!note && !page) || (next === 'screenshot' && !screenshot);
  $('#note-text').placeholder = note ? 'Write something worth keeping…' : 'What caught your eye? (optional)';
  $('#note-label').textContent = note || next === 'text' ? 'Note' : next === 'screenshot' ? 'Note (optional)' : 'Caption';
  if (next === 'screenshot') $('#note-text').placeholder = screenshot ? 'Add a note if you like — or just save' : 'Drag over the page to take a screenshot…';
  $('#caption-field').hidden = !(note || next === 'text');
  if (next === 'text') $('#note-text').placeholder = 'Highlight text on the page, or type your note here…';
  for (const [id, selected] of [['mode-page', next === 'bookmark'], ['mode-selection', next === 'text'], ['mode-note', note]]) {
    $('#' + id).classList.toggle('active', selected); $('#' + id).setAttribute('aria-pressed', String(selected));
  }
  if (note && resetNote) {
    if ($('#capture-title').value === page?.title) $('#capture-title').value = '';
    // A written note starts empty rather than with the page description.
    if (!edited.has('note-text') && $('#note-text').value === lastAutoNote) { $('#note-text').value = ''; lastAutoNote = ''; }
    $('#note-text').focus();
  }
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
// Screenshot: the panel puts a picker on the page, waits for the drag, and shows the crop here with the usual fields.
async function startShot() {
  await ready;
  if (shooting) return;
  if (!currentTab?.id || !page) { showStatus('Open a website to take a screenshot.', true); return; }
  shooting = true;
  const version = contextVersion, tabId = currentTab.id;
  setMode('screenshot');
  if (!edited.has('note-text') && $('#note-text').value === lastAutoNote) { $('#note-text').value = ''; lastAutoNote = ''; }
  showStatus('Drag over the page to capture · Esc cancels');
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tabId, { type: 'start-region-capture' });
    if (version !== contextVersion) return;
    if (result?.ok && result.capture?.payload) receiveScreenshot(result.capture);
    else showStatus(result?.cancelled ? 'Screenshot cancelled.' : result?.error || 'Could not take this screenshot.', !result?.cancelled);
  } catch {
    if (version === contextVersion) showStatus('This page does not allow screenshots. Try another tab, or upload an image in the library.', true);
  } finally { shooting = false; }
}
$('#mode-shot').addEventListener('click', () => { void startShot(); });
function receiveScreenshot(capture) {
  screenshot = capture; $('#shot-preview').src = capture.payload;
  if (!edited.has('note-text') && $('#note-text').value === lastAutoNote) { $('#note-text').value = ''; lastAutoNote = ''; }
  fill('capture-title', capture.title); setMode('screenshot'); showStatus('Screenshot ready · Ctrl+Enter saves');
  if ($('#instant-shot').checked) void saveCapture(true);
  else $('#save-page').focus();
}
void store.get('duckler-instant-shot').then(stored => { $('#instant-shot').checked = !!stored['duckler-instant-shot']; }).catch(() => {});
$('#instant-shot').addEventListener('change', event => { void store.set({ 'duckler-instant-shot': event.target.checked }).catch(() => {}); });
// The shortcuts reach this panel through a port: Alt+Shift+S closes it, Alt+Shift+D starts a screenshot.
function connectPanel() {
  try {
    if (!chrome.runtime.connect || !chrome.windows?.getCurrent) return;
    const port = chrome.runtime.connect({ name: 'duckler-panel' });
    void chrome.windows.getCurrent().then(win => {
      port.postMessage({ type: 'hello', windowId: win.id });
      // Opened by Alt+Shift+D: the worker left the request for this window.
      return chrome.storage?.session?.get('duckler-start-shot').then(stored => {
        const request = stored?.['duckler-start-shot'];
        if (request?.windowId !== win.id || Date.now() - request.at > 10000) return;
        void chrome.storage.session.remove('duckler-start-shot');
        void startShot();
      });
    }).catch(() => {});
    port.onMessage.addListener(message => {
      if (message?.type === 'close') window.close();
      if (message?.type === 'start-shot') void startShot();
    });
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; setTimeout(connectPanel, 500); });
  } catch { /* The panel still works without the shortcuts. */ }
}
async function saveCapture(send = false) {
  if (saving) return;
  const note = $('#note-text').value.trim();
  if ((mode === 'note' || mode === 'text') && !note) { showStatus('Write or highlight a note before saving.', true); return; }
  if (mode !== 'note' && !page) return;
  if (mode === 'pdf' && !$('#pdf-url').value.trim()) { showStatus('Choose or paste a PDF download URL.', true); return; }
  if (mode === 'screenshot' && !screenshot) { showStatus('Drag over the page to take a screenshot first.', true); return; }
  saving = true; $('#save-page').disabled = true; $('#save-page').textContent = 'Saving…';
  try {
    await request({ type: mode === 'pdf' ? 'capture-pdf' : 'queue-capture', tabId: currentTab?.id, url: $('#pdf-url').value.trim(), capture: { kind: mode === 'note' ? 'text' : mode,
      collectionIds: selectedCollectionIds.filter(id => !id.startsWith('local-')),
      collectionNames: selectedCollectionNames,
      collectionName: selectedCollectionNames[0] || '',
      title: $('#capture-title').value.trim() || (mode === 'note' || mode === 'text' ? note.slice(0, 160) : mode === 'screenshot' ? screenshot.title : page.title || page.url),
      sourceUrl: mode === 'screenshot' ? screenshot.sourceUrl || page?.url || '' : page?.url || '', note,
      ...(cardColour ? { color: cardColour } : {}),
      ...(mode === 'screenshot' ? { payload: screenshot.payload } : {}), caption: mode === 'text' || mode === 'note' ? $('#caption-text').value.trim() : '',
      tags: $('#tags').value.split(',').map(tag => tag.trim()).filter(Boolean) } });
    showStatus('Queued on this device. Ready for your library.');
    if (send) {
      try { await request({ type: 'deliver-capture' }); showStatus('Saved · sending to your library.'); }
      catch { showStatus('Saved locally. Open your library to finish sending.', true); }
    }
    $('#save-page').textContent = 'Saved ✓'; await renderQueue();
    void store.set({ 'duckler-last-collections': { ids: selectedCollectionIds.filter(id => !id.startsWith('local-')), names: selectedCollectionNames } }).catch(() => {});
    // Sent: the panel gets out of the way.
    if (send) setTimeout(() => window.close(), 650);
  } catch (error) { showStatus(error.message, true); }
  finally {
    saving = false; $('#save-page').disabled = false;
    // A failed save puts the button label back (it used to stay on "Saving…").
    if ($('#save-page').textContent === 'Saving…') setMode(mode);
  }
}
$('#save-page').addEventListener('click', () => { void saveCapture(true); });
const saveShortcut = event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat) { event.preventDefault(); void saveCapture(true); }
  if (event.key === 'Escape' && !event.repeat) {
    const picker = $('#collection-picker-popover');
    if (picker && !picker.hidden) { picker.hidden = true; $('#collection-picker-toggle')?.setAttribute('aria-expanded', 'false'); return; }
    event.preventDefault(); window.close();
  }
};
document.addEventListener('keydown', saveShortcut);
$('#queue-previous').addEventListener('click', () => { queuePage--; void renderQueue().catch(error => showStatus(error.message, true)); });
$('#queue-next').addEventListener('click', () => { queuePage++; void renderQueue().catch(error => showStatus(error.message, true)); });
$('#capture-region').addEventListener('click', () => { void startShot(); });
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
  $('#page-title').textContent = 'Keep a thought'; $('#page-domain').textContent = 'QUICK NOTE'; $('#mode-page').disabled = true; $('#mode-selection').disabled = true; $('#mode-shot').disabled = true; $('#capture-region').disabled = true; setMode('note'); showStatus('This page only supports notes.');
});
setupCollectionPicker();
ready = initializeSafely();
connectPanel();
chrome.tabs.onActivated?.addListener(() => { if (!saving) ready = initializeSafely(); });
chrome.tabs.onUpdated?.addListener((tabId, change) => { if (tabId === currentTab?.id && change.status === 'complete' && !saving && !shooting) ready = initializeSafely(); });
window.addEventListener('pagehide', () => { selectionPort?.disconnect(); document.removeEventListener('keydown', saveShortcut); });
void renderQueue().catch(error => showStatus(error.message, true));
void request({ type: 'pairing-status' }).then(({ pairing }) => { $('#connection-status').textContent = pairing ? 'Library connected' : 'Connect library'; }).catch(error => showStatus(error.message, true));

