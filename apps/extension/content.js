(() => {
  // A copy left behind by a reloaded extension can no longer talk to it; only a live copy blocks a new one.
  const alive = () => { try { return Boolean(chrome.runtime?.id); } catch { return false; } };
  if (window.__ducklerRegionPickerAlive?.()) return;
  window.__ducklerRegionPickerAlive = alive;
  let host, surface, selection, start, viewport, invalid = false, busy = false, toastHost;
  const toast = (text, error = false) => {
    toastHost?.remove();
    toastHost = document.createElement('div');
    const root = toastHost.attachShadow({ mode: 'closed' });
    const message = document.createElement('div');
    message.setAttribute('role', error ? 'alert' : 'status');
    message.textContent = text;
    message.style.cssText = 'max-width:440px;padding:14px 20px;border:1px solid ' + (error ? '#ff6868' : '#536978') + ';border-radius:4px;background:#14181cf5;color:#e8ebed;font:14px/1.5 system-ui;box-shadow:0 8px 30px #0009;';
    root.append(message);
    toastHost.style.cssText = 'all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;';
    document.documentElement.append(toastHost);
    const savedHost = toastHost;
    setTimeout(() => savedHost.remove(), error ? 8000 : 3500);
  };
  // Names a capture from the page itself: the most prominent text inside the selected area (headings,
  // captions, image alt text, product names), else the nearest heading above it, plus page title metadata.
  const regionHint = rect => {
    const box = { left: Math.min(rect.left, rect.right), top: Math.min(rect.top, rect.bottom), right: Math.max(rect.left, rect.right), bottom: Math.max(rect.top, rect.bottom) };
    const clean = value => (value || '').replace(/\s+/g, ' ').trim();
    const inside = r => {
      const area = r.width * r.height;
      if (!area) return 0;
      return Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left)) * Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) / area;
    };
    const weight = el => {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) return 7 - Number(tag[1]);
      if (el.getAttribute('role') === 'heading' || el.getAttribute('itemprop') === 'name') return 4;
      if (['FIGCAPTION', 'CAPTION', 'LEGEND'].includes(tag)) return 3.5;
      if (tag === 'IMG') return 2.5;
      if (['STRONG', 'B', 'TH', 'DT', 'LABEL'].includes(tag)) return 2;
      return 1;
    };
    let best = null, bestScore = 0, scanned = 0;
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],[itemprop="name"],figcaption,caption,legend,img[alt],strong,b,th,dt,label,p,li,a')) {
      if (++scanned > 4000) break;
      const r = el.getBoundingClientRect();
      if (r.bottom < box.top || r.top > box.bottom || r.right < box.left || r.left > box.right || inside(r) < .6) continue;
      const value = clean(el.tagName === 'IMG' ? el.getAttribute('alt') : el.innerText).slice(0, 200);
      if (value.length < 3) continue;
      const size = parseFloat(getComputedStyle(el).fontSize) || 16;
      const score = weight(el) * (size / 16) * (value.length > 100 ? .5 : 1);
      if (score > bestScore) { best = value; bestScore = score; }
    }
    if (!best || bestScore < 1.5) {
      // Nothing prominent inside: use the closest heading just above the selection.
      let closest = null, distance = Infinity;
      for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
        const r = el.getBoundingClientRect(), gap = box.top - r.bottom;
        if (gap < -4 || gap > 600 || r.right < box.left || r.left > box.right) continue;
        if (gap < distance) { distance = gap; closest = clean(el.innerText).slice(0, 200); }
      }
      if (closest && closest.length >= 3) best = closest;
    }
    const meta = name => clean(document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content')).slice(0, 300);
    return { subject: best || '', pageTitle: clean(document.title).slice(0, 300), ogTitle: meta('og:title') || meta('twitter:title'), siteName: meta('og:site_name') || meta('application-name'), host: location.hostname };
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
      const hint = regionHint(rect);
      const response = await chrome.runtime.sendMessage({ type: 'prepare-region-review', rect, viewport: { width: viewport.width, height: viewport.height }, url: viewport.url, hint });
      if (response?.error === 'Unsupported capture request.') throw new Error('Reload Duckler Capture in Extensions, refresh this website, and try again.');
      if (!response?.ok) throw new Error(response?.error || 'Could not save this screenshot.');
      cancel();
      // Screenshots are reviewed in the side panel; without one they are saved straight away.
      toast(response.inPanel ? 'Screenshot ready in the Duckler panel' : 'Screenshot saved to Duckler');
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
    if (busy) { respond({ ok: false, error: 'Finish the current screenshot first.' }); return false; }
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
