import { CAPTURE_CHUNK_BYTES, CAPTURE_PORT, CAPTURE_PROTOCOL, MAX_CAPTURE_BYTES, MAX_QUEUE_ITEMS, base64ToBytes, parsePairing, type CaptureMetadata, type Pairing } from '../../../../packages/shared/src/captureProtocol';
import { importExtensionBytes } from './cardDb';

type Port = {
  postMessage(message: unknown): void; disconnect(): void;
  onMessage: { addListener(callback: (message: Record<string, unknown>) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
};
declare global {
  interface Window { chrome?: { runtime?: { connect(id: string, options: { name: string }): Port; lastError?: { message?: string } } } }
}
const CONNECTION_KEY = 'duckler-extension-connection';
const INVITATION_KEY = 'duckler-extension-invitation';
export function getLibraryInvitation(): Pairing {
  const saved = localStorage.getItem(INVITATION_KEY);
  if (saved) return parsePairing(JSON.parse(saved));
  const pairing = { origin: location.origin, libraryId: crypto.randomUUID(), nonce: `${crypto.randomUUID()}${crypto.randomUUID()}` };
  localStorage.setItem(INVITATION_KEY, JSON.stringify(pairing));
  return pairing;
}
export function getExtensionConnection(): (Pairing & { extensionId: string }) | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTION_KEY) ?? 'null');
    if (!saved || !/^[a-p]{32}$/.test(saved.extensionId)) return null;
    return { ...parsePairing(saved), extensionId: saved.extensionId };
  } catch { return null; }
}
export function acceptExtensionConnection(raw: string) {
  const value = JSON.parse(raw);
  const pairing = parsePairing(value);
  const invitation = getLibraryInvitation();
  if (typeof value.extensionId !== 'string' || !/^[a-p]{32}$/.test(value.extensionId) || pairing.origin !== invitation.origin
    || pairing.libraryId !== invitation.libraryId || pairing.nonce !== invitation.nonce) throw new Error('This connection code belongs to a different library. Start from step 1.');
  localStorage.setItem(CONNECTION_KEY, JSON.stringify({ ...pairing, extensionId: value.extensionId }));
}

export function startExtensionBridge(onChange: () => void, onStatus: (text: string) => void, getCollections?: () => Array<{ id: string; name: string; cardCount: number }>): () => void {
  const connection = getExtensionConnection();
  if (!connection) return () => {};
  const runtime = window.chrome?.runtime;
  if (!runtime?.connect) { onStatus('Open Duckler in Chrome or Edge to receive captures.'); return () => {}; }
  let stopped = false, port: Port | null = null, sequence = 0, draining = false, dirty = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<number, { resolve: (response: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const request = (message: Record<string, unknown>) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId = ++sequence;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Capture transfer timed out. It will retry when the extension reconnects.')); }, 20000);
    pending.set(requestId, { resolve, reject, timer });
    try { port!.postMessage({ ...message, ...connection, version: CAPTURE_PROTOCOL, requestId }); }
    catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
  });
  const drain = async (items?: unknown) => {
    if (draining) { dirty = true; return; }
    draining = true;
    try {
      const rows = items ?? (await request({ type: 'list' })).items;
      if (!Array.isArray(rows) || rows.length > MAX_QUEUE_ITEMS) throw new Error('Invalid extension queue.');
      if (rows.length) onStatus(`Receiving ${rows.length} capture${rows.length === 1 ? '' : 's'}…`);
      for (const meta of rows as CaptureMetadata[]) {
        if (stopped) break;
        if (meta.libraryId !== connection.libraryId || !/^[a-f0-9]{64}$/.test(meta.hash) || !Number.isInteger(meta.byteLength)
          || meta.byteLength <= 0 || meta.byteLength > MAX_CAPTURE_BYTES || meta.chunks !== Math.ceil(meta.byteLength / CAPTURE_CHUNK_BYTES)) throw new Error('Invalid capture envelope.');
        const bytes = new Uint8Array(meta.byteLength);
        for (let index = 0; index < meta.chunks; index++) {
          const response = await request({ type: 'chunk', id: meta.id, hash: meta.hash, index });
          if (response.index !== index || typeof response.data !== 'string') throw new Error('Capture chunks arrived out of order.');
          const chunk = base64ToBytes(response.data);
          if (chunk.length !== Math.min(CAPTURE_CHUNK_BYTES, meta.byteLength - index * CAPTURE_CHUNK_BYTES)) throw new Error('Capture chunk length does not match.');
          bytes.set(chunk, index * CAPTURE_CHUNK_BYTES);
        }
        await importExtensionBytes(bytes, meta);
        onChange();
        await request({ type: 'ack', id: meta.id, hash: meta.hash });
      }
      if (!stopped) onStatus(rows.length ? 'Captures saved on this device' : 'Extension connected');
    } catch (error) { if (!stopped) onStatus(error instanceof Error ? error.message : 'Capture could not be imported.'); }
    finally {
      draining = false;
      if (dirty && !stopped && port) { dirty = false; void drain(); }
    }
  };
  const connect = () => {
    if (stopped) return;
    try {
      port = runtime.connect(connection.extensionId, { name: CAPTURE_PORT });
      port.onMessage.addListener(message => {
        if (message.type === 'queue-changed') { void drain(); return; }
        const entry = pending.get(Number(message.requestId));
        if (!entry) return;
        clearTimeout(entry.timer); pending.delete(Number(message.requestId));
        if (message.ok) entry.resolve(message); else entry.reject(new Error(String(message.error)));
      });
      port.onDisconnect.addListener(() => {
        // Reading lastError prevents Chrome from treating an expected disconnection as unhandled.
        const reason = runtime.lastError?.message;
        port = null;
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(reason || 'Extension disconnected; pending captures are retained.')); }
        pending.clear();
        if (!stopped) { onStatus('Extension unavailable · reconnecting'); retry = setTimeout(connect, 5000); }
      });
      void request({ type: 'hello', collections: getCollections?.() ?? [] }).then(response => drain(response.items)).catch(error => { if (!stopped) onStatus(error.message); });
    } catch { if (!stopped) { onStatus('Extension unavailable'); retry = setTimeout(connect, 5000); } }
  };
  connect();
  const focus = () => { if (port && !stopped) void drain(); };
  window.addEventListener('focus', focus);
  return () => {
    stopped = true; clearTimeout(retry); window.removeEventListener('focus', focus);
    port?.disconnect();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Capture connection closed.')); }
    pending.clear();
  };
}
