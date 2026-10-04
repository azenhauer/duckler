(() => {
  if (window.__ducklerRegionPickerInstalled) return;
  window.__ducklerRegionPickerInstalled = true;

  let overlay;
  let selection;
  let start;
  let pageUrl;

  const removeOverlay = () => {
    overlay?.remove();
    overlay = undefined;
    selection = undefined;
    document.removeEventListener('keydown', onKeyDown, true);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      removeOverlay();
    }
  };

  const queueRegion = async (rect) => {
    const response = await chrome.runtime.sendMessage({
      type: 'capture-visible-tab',
      url: pageUrl,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    if (!response?.ok || !response.screenshot) throw new Error(response?.error || 'Could not capture the visible tab.');

    const image = new Image();
    image.src = response.screenshot;
    await image.decode();
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const x = Math.max(0, Math.floor(rect.left * scaleX));
    const y = Math.max(0, Math.floor(rect.top * scaleY));
    const width = Math.min(image.naturalWidth - x, Math.ceil(rect.width * scaleX));
    const height = Math.min(image.naturalHeight - y, Math.ceil(rect.height * scaleY));
    if (width < 2 || height < 2) throw new Error('Select a larger screenshot region.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This page cannot prepare a cropped screenshot.');
    context.drawImage(image, x, y, width, height, 0, 0, width, height);

    let payload = canvas.toDataURL('image/jpeg', 0.82);
    let quality = 0.68;
    while (payload.length > 1_300_000 && quality >= 0.38) {
      payload = canvas.toDataURL('image/jpeg', quality);
      quality -= 0.1;
    }
    if (payload.length > 1_300_000) throw new Error('This crop is too large. Select a smaller region.');

    const title = document.title || location.hostname || 'Screenshot';
    const queued = await chrome.runtime.sendMessage({
      type: 'queue-capture',
      capture: {
        kind: 'screenshot',
        title: `Screenshot — ${title}`.slice(0, 1000),
        sourceUrl: pageUrl,
        payload,
      },
    });
    if (!queued?.ok) throw new Error(queued?.error || 'Could not save screenshot to the queue.');
    await chrome.runtime.sendMessage({ type: 'deliver-capture', id: queued.item.id });
  };

  const beginSelection = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    start = { x: event.clientX, y: event.clientY };
    selection = document.createElement('div');
    selection.style.cssText = 'position:fixed;z-index:2147483647;border:2px solid #8d73bd;background:rgba(141,115,189,.18);pointer-events:none;';
    overlay.append(selection);
    const move = (moveEvent) => {
      const left = Math.min(start.x, moveEvent.clientX);
      const top = Math.min(start.y, moveEvent.clientY);
      selection.style.left = `${left}px`;
      selection.style.top = `${top}px`;
      selection.style.width = `${Math.abs(start.x - moveEvent.clientX)}px`;
      selection.style.height = `${Math.abs(start.y - moveEvent.clientY)}px`;
    };
    const end = async (endEvent) => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', end, true);
      const rect = {
        left: Math.min(start.x, endEvent.clientX),
        top: Math.min(start.y, endEvent.clientY),
        width: Math.abs(start.x - endEvent.clientX),
        height: Math.abs(start.y - endEvent.clientY),
      };
      removeOverlay();
      try {
        await queueRegion(rect);
      } catch (error) {
        console.error('Duckler screenshot capture failed.', error);
      }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'start-region-capture') return false;
    if (!/^https?:$/.test(location.protocol)) {
      sendResponse({ ok: false, error: 'Screenshot capture is only available on regular websites.' });
      return false;
    }
    removeOverlay();
    pageUrl = location.href;
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Select screenshot area. Press Escape to cancel.');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.22);cursor:crosshair;touch-action:none;';
    const hint = document.createElement('div');
    hint.textContent = 'Drag to capture · Esc to cancel';
    hint.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:9px 14px;border-radius:9px;background:#252522;color:#fff;font:14px/1.4 sans-serif;pointer-events:none;';
    overlay.append(hint);
    overlay.addEventListener('pointerdown', beginSelection, true);
    document.documentElement.append(overlay);
    document.addEventListener('keydown', onKeyDown, true);
    sendResponse({ ok: true });
    return false;
  });
})();
