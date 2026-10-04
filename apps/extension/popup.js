const $ = (selector) => document.querySelector(selector);
const status = $('#status');
let currentTab;
let page;
let activeTab = 'save';
let selectedTags = new Set();

const showStatus = (message, isError = false) => {
  status.textContent = message;
  status.style.color = isError ? '#b42318' : '';
};

const request = async (message) => {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension request failed.');
  return response;
};

const initializePage = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error('Switch to a regular website tab to capture it.');
  }
  currentTab = tab;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      url: location.href,
      selection: window.getSelection()?.toString().trim() ?? '',
      hostname: location.hostname,
    }),
  });
  page = result?.result;
  $('#page-title').textContent = page.title || tab.title || 'Current page';
  $('#page-domain').textContent = page.hostname || new URL(tab.url).hostname;
  $('#site-mark').textContent = (page.hostname || 'D').slice(0, 1).toUpperCase();
  $('#insights-title').textContent = page.title || 'Untitled page';
  $('#insights-url').textContent = page.url || tab.url;
};

const renderQueue = async () => {
  try {
    const { items } = await request({ type: 'list-captures' });
    $('#queue-count').textContent = String(items.length);
    const list = $('#queue-list');
    list.replaceChildren();
    for (const item of items) {
      const row = document.createElement('li');
      const details = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'capture-title';
      title.textContent = item.title;
      if (item.payload && /^data:image\/(png|jpeg|webp);base64,/i.test(item.payload)) {
        const preview = document.createElement('img');
        preview.className = 'queue-preview';
        preview.src = item.payload;
        preview.alt = '';
        details.className = 'queue-item-info';
        details.append(preview);
      }
      const kind = document.createElement('div');
      kind.className = 'capture-kind';
      kind.textContent = item.kind;
      details.append(title, kind);
      const actions = document.createElement('div');
      actions.className = 'queue-actions';
      const send = document.createElement('button');
      send.type = 'button';
      send.textContent = 'Open app';
      send.addEventListener('click', async () => {
        try {
          await request({ type: 'deliver-capture', id: item.id });
          showStatus('Opened Duckler. The capture remains queued so you can retry safely.');
        } catch (error) {
          showStatus(error.message, true);
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${item.title}`);
      remove.addEventListener('click', async () => {
        try {
          await request({ type: 'delete-capture', id: item.id });
          await renderQueue();
        } catch (error) {
          showStatus(error.message, true);
        }
      });
      actions.append(send, remove);
      row.append(details, actions);
      list.append(row);
    }
  } catch (error) {
    showStatus(error.message, true);
  }
};

const saveCapture = async (capture) => {
  const { item } = await request({ type: 'queue-capture', capture });
  try {
    await request({ type: 'deliver-capture', id: item.id });
    showStatus('Added to your queue and opened Duckler.');
  } catch (error) {
    showStatus(`Saved to queue. ${error.message}`, true);
  }
  await renderQueue();
};

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle('active', selected);
      if (selected) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    $('#save-panel').hidden = activeTab !== 'save';
    $('#related-panel').hidden = activeTab !== 'related';
    $('#insights-panel').hidden = activeTab !== 'insights';
  });
});

$('#collection-toggle').addEventListener('click', () => {
  const input = $('#collection-field');
  input.hidden = !input.hidden;
  $('#collection-toggle').setAttribute('aria-expanded', String(!input.hidden));
  if (!input.hidden) input.focus();
});

$('#collection-field').addEventListener('input', (event) => {
  $('#collection-label').textContent = event.currentTarget.value.trim() || 'Add to collections';
});

document.querySelectorAll('.tag-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const tag = button.dataset.tag;
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    button.setAttribute('aria-pressed', String(selectedTags.has(tag)));
  });
});

$('#save-page').addEventListener('click', async () => {
  if (!page || !currentTab) return;
  try {
    await saveCapture({
      kind: 'bookmark',
      title: page.title || currentTab.title || page.url,
      sourceUrl: page.url || currentTab.url,
      note: $('#note-text').value,
      tags: [...selectedTags],
      collectionName: $('#collection-field').value.trim() || undefined,
    });
  } catch (error) {
    showStatus(error.message, true);
  }
});

$('#save-selection').addEventListener('click', async () => {
  if (!page?.selection || !currentTab) {
    showStatus('Select some text on the page before opening this popup.', true);
    return;
  }
  try {
    await saveCapture({
      kind: 'text',
      title: page.selection.slice(0, 1000),
      note: page.selection,
      sourceUrl: page.url || currentTab.url,
      tags: [...selectedTags],
      collectionName: $('#collection-field').value.trim() || undefined,
    });
  } catch (error) {
    showStatus(error.message, true);
  }
});

$('#capture-region').addEventListener('click', async () => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ['content.js'] });
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'start-region-capture' });
    if (!response?.ok) throw new Error(response?.error || 'Could not start screenshot capture.');
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

$('#settings').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

$('#export-queue').addEventListener('click', async () => {
  try {
    const { items } = await request({ type: 'list-captures' });
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), captures: items }, null, 2)], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'duckler-capture-queue.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showStatus('Capture queue exported.');
  } catch (error) {
    showStatus(error.message, true);
  }
});

void Promise.all([initializePage(), renderQueue()]).catch((error) => {
  showStatus(error.message, true);
  $('#save-page').disabled = true;
  $('#save-selection').disabled = true;
  $('#capture-region').disabled = true;
});
