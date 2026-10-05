(() => {
  if (window.__ducklerSelectionInstalled) return;
  window.__ducklerSelectionInstalled = true;
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'duckler-selection-v1') return;
    let timer;
    const editable = () => document.activeElement?.matches('input,textarea,[contenteditable="true"]');
    const publish = () => {
      if (editable()) return;
      const text = window.getSelection()?.toString().trim().slice(0, 100000) || '';
      if (text) port.postMessage({ type: 'selection', text, url: location.href });
    };
    const changed = () => { clearTimeout(timer); timer = setTimeout(publish, 100); };
    const key = event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat && !editable()) {
        event.preventDefault(); publish(); port.postMessage({ type: 'save-and-send' });
      }
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('keydown', key);
    port.onDisconnect.addListener(() => {
      clearTimeout(timer); document.removeEventListener('selectionchange', changed); document.removeEventListener('keydown', key);
    });
    publish();
  });
})();
