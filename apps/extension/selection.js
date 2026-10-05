(() => {
  // Only a live copy (not one orphaned by an extension reload) blocks a fresh install.
  const alive = () => { try { return Boolean(chrome.runtime?.id); } catch { return false; } };
  if (window.__ducklerSelectionAlive?.()) return;
  window.__ducklerSelectionAlive = alive;
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'duckler-selection-v1') return;
    let timer;
    const editable = () => document.activeElement?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])');
    const publish = () => {
      if (editable()) return;
      const text = window.getSelection()?.toString().trim().slice(0, 100000) || '';
      if (text) port.postMessage({ type: 'selection', text, url: location.href, top: window === window.top });
    };
    const changed = () => { clearTimeout(timer); timer = setTimeout(publish, 100); };
    const key = event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat && !editable()) {
        event.preventDefault(); publish(); port.postMessage({ type: 'save-and-send' });
      }
    };
    document.addEventListener('selectionchange', changed);
    // Read before a site or the side panel clears selection on a later focus change.
    document.addEventListener('pointerup', publish, true);
    document.addEventListener('keyup', publish, true);
    document.addEventListener('keydown', key);
    port.onDisconnect.addListener(() => {
      clearTimeout(timer); document.removeEventListener('selectionchange', changed); document.removeEventListener('keydown', key);
      document.removeEventListener('pointerup', publish, true); document.removeEventListener('keyup', publish, true);
    });
    publish();
  });
})();
