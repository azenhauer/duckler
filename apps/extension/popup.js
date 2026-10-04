const $ = selector => document.querySelector(selector);
let page, currentTab, mode = 'bookmark', saving = false;
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
  popover.append(search, list, createRow); label.append(toggle, chips, popover);
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = collectionOptions.filter(item => item.name.toLocaleLowerCase().startsWith(query) || item.name.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    if (!visible.length) { const empty = document.createElement('span'); empty.className = 'collection-empty'; empty.textContent = collectionOptions.length ? 'No matching collections' : 'No collections yet'; list.append(empty); }
    for (const item of visible) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'collection-option'; button.setAttribute('role', 'option'); const selected = selectedCollectionIds.includes(item.id) || selectedCollectionNames.includes(item.name); button.setAttribute('aria-selected', String(selected)); button.innerHTML = `<span class="collection-checkmark">${selected ? '✓' : ''}</span><span>${item.name}</span>${item.cardCount ? `<small>${item.cardCount}</small>` : ''}`;
      button.addEventListener('click', () => { if (selectedCollectionIds.includes(item.id)) selectedCollectionIds = selectedCollectionIds.filter(id => id !== item.id); else selectedCollectionIds.push(item.id); selectedCollectionNames = selectedCollectionIds.map(id => collectionOptions.find(option => option.id === id)?.name).filter(Boolean); render(); }); list.append(button);
    }
    chips.replaceChildren();
    for (const name of selectedCollectionNames) { const chip = document.createElement('span'); chip.className = 'collection-chip'; chip.textContent = name; chips.append(chip); }
    toggle.textContent = selectedCollectionNames.length ? `${selectedCollectionNames.length} selected` : 'Choose collections';
  };
  toggle.addEventListener('click', () => { popover.hidden = !popover.hidden; toggle.setAttribute('aria-expanded', String(!popover.hidden)); if (!popover.hidden) search.focus(); });
  search.addEventListener('input', render);
  createButton.addEventListener('click', () => { const name = createInput.value.trim(); if (!name) return; const existing = collectionOptions.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()); const item = existing || { id: `local-${crypto.randomUUID()}`, name, cardCount: 0 }; if (!existing) collectionOptions = [...collectionOptions, item]; if (!selectedCollectionIds.includes(item.id)) selectedCollectionIds.push(item.id); selectedCollectionNames = [...new Set([...selectedCollectionNames, item.name])]; createInput.value = ''; render(); });
  document.addEventListener('click', event => { if (!label.contains(event.target)) { popover.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });
  render();
  return render;
}
async function initialize() {
  setupCollectionPicker();
  void request({ type: 'list-collections' }).then(response => { if (Array.isArray(response.collections)) { collectionOptions = response.collections; $('#collection-search')?.dispatchEvent(new Event('input')); } }).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a website to save a link or screenshot. You can still write a note.');
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, url: location.href, selection: window.getSelection()?.toString().trim() || '' }) });
  page = result.result;
  $('#capture-title').value = page.title || tab.title || '';
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
  if (note) { if ($('#capture-title').value === page?.title) $('#capture-title').value = ''; $('#note-text').focus(); }
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
      collectionIds: selectedCollectionIds.filter(id => !id.startsWith('local-')),
      collectionNames: selectedCollectionNames,
      collectionName: selectedCollectionNames[0] || '',
      title: $('#capture-title').value.trim() || (mode === 'note' ? note.slice(0, 160) : mode === 'text' ? page.selection.slice(0, 1000) : page.title || page.url),
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
  $('#page-title').textContent = 'Keep a thought'; $('#page-domain').textContent = 'QUICK NOTE'; $('#mode-page').disabled = true; $('#mode-selection').disabled = true; $('#capture-region').disabled = true; setMode('note'); showStatus('This page only supports notes.');
});
void renderQueue().catch(error => showStatus(error.message, true));
void request({ type: 'pairing-status' }).then(({ pairing }) => { $('#connection-status').textContent = pairing ? 'Library connected' : 'Connect library'; }).catch(error => showStatus(error.message, true));

