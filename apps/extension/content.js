(() => {
  if (window.__ducklerRegionPickerInstalled) return;
  window.__ducklerRegionPickerInstalled = true;
  let host, surface, selection, start, viewport, invalid = false, busy = false, toastHost;
  const toast = (text, error = false) => {
    toastHost?.remove();
    toastHost = document.createElement('div');
    const root = toastHost.attachShadow({ mode: 'closed' });
    const message = document.createElement('div');
    message.setAttribute('role', error ? 'alert' : 'status');
    message.textContent = text;
    message.style.cssText = 'max-width:440px;padding:14px 20px;border:1px solid ' + (error ? '#a76055' : '#697b60') + ';border-radius:12px;background:#242821;color:#f7f5ef;font:14px/1.5 system-ui;box-shadow:0 8px 30px #0004;';
    root.append(message);
    toastHost.style.cssText = 'all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;';
    document.documentElement.append(toastHost);
    const savedHost = toastHost;
    setTimeout(() => savedHost.remove(), error ? 8000 : 3500);
  };
  const unchanged = () => viewport && location.href === viewport.url && innerWidth === viewport.width && innerHeight === viewport.height
    && scrollX === viewport.scrollX && scrollY === viewport.scrollY && devicePixelRatio === viewport.dpr
    && Math.abs((visualViewport?.scale || 1) - 1) < 0.01 && !invalid;
  const cancel = () => {
    invalid = true; host?.remove(); host = undefined; surface = undefined; selection = undefined; start = undefined;
    for (const event of ['scroll', 'resize', 'pagehide', 'blur']) window.removeEventListener(event, cancel, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', visibility, true);
  };
  const visibility = () => { if (document.hidden) cancel(); };
  const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
  const coordinate = event => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) });
  const begin = event => {
    if (event.button !== 0 || busy) return;
    event.preventDefault(); start = coordinate(event); surface.setPointerCapture(event.pointerId); selection.hidden = false;
  };
  const move = event => {
    if (!start || !selection) return;
    const end = coordinate(event);
    Object.assign(selection.style, { left: Math.min(start.x, end.x) + 'px', top: Math.min(start.y, end.y) + 'px', width: Math.abs(end.x - start.x) + 'px', height: Math.abs(end.y - start.y) + 'px' });
  };
  const end = async event => {
    if (!start || !host || busy) return;
    const point = coordinate(event), rect = { left: start.x, top: start.y, right: point.x, bottom: point.y };
    start = undefined;
    if (Math.abs(rect.right - rect.left) < 4 || Math.abs(rect.bottom - rect.top) < 4) { toast('Drag a larger area to capture.', true); cancel(); return; }
    busy = true; host.style.display = 'none';
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!unchanged()) throw new Error('The page changed. Start the screenshot again.');
      const response = await chrome.runtime.sendMessage({ type: 'capture-region', rect, viewport: { width: viewport.width, height: viewport.height }, url: viewport.url });
      if (!response?.ok) throw new Error(response?.error || 'Could not save this screenshot.');
      toast('Screenshot queued · open your library to receive it');
    } catch (error) { toast(error.message || 'Could not save this screenshot.', true); }
    finally { busy = false; cancel(); }
  };
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'capture-feedback') { toast(message.text, message.error); respond({ ok: true }); return false; }
    if (message?.type === 'check-capture-viewport') {
      respond({ ok: unchanged() && message.url === viewport.url && message.viewport.width === viewport.width && message.viewport.height === viewport.height }); return false;
    }
    if (message?.type !== 'start-region-capture') return false;
    if (!/^https?:$/.test(location.protocol) || Math.abs((visualViewport?.scale || 1) - 1) >= 0.01) { respond({ ok: false, error: 'Use screenshot upload for this page or reset pinch zoom.' }); return false; }
    if (busy) { respond({ ok: false, error: 'A screenshot is already being saved.' }); return false; }
    cancel(); invalid = false; toastHost?.remove();
    viewport = { url: location.href, width: innerWidth, height: innerHeight, scrollX, scrollY, dpr: devicePixelRatio };
    host = document.createElement('div'); host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' }), style = document.createElement('style');
    style.textContent = ':host{all:initial}.surface{position:fixed;inset:0;background:#0003;cursor:crosshair;touch-action:none}.hint{position:absolute;top:24px;left:50%;transform:translateX(-50%);background:#242821;color:#faf8ef;padding:12px 20px;border-radius:999px;font:14px system-ui;pointer-events:none}.selection{position:absolute;border:2px solid #d5e4a9;box-shadow:0 0 0 10000px #0003;pointer-events:none}';
    surface = document.createElement('div'); surface.className = 'surface'; surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', 'Drag to capture. Escape to cancel.');
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Drag to capture · Esc to cancel';
    selection = document.createElement('div'); selection.className = 'selection'; selection.hidden = true;
    surface.append(hint, selection); shadow.append(style, surface); document.documentElement.append(host);
    surface.addEventListener('pointerdown', begin); surface.addEventListener('pointermove', move); surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', cancel);
    for (const event of ['scroll', 'resize', 'pagehide', 'blur']) window.addEventListener(event, cancel, true);
    document.addEventListener('keydown', onKey, true); document.addEventListener('visibilitychange', visibility, true);
    respond({ ok: true }); return false;
  });
})();
