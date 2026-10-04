import { CAPTURE_CHUNK_BYTES, CAPTURE_PROTOCOL, bytesToBase64, type Pairing } from '../../../packages/shared/src/captureProtocol';
import { CaptureQueue } from './queue';

export function validateSender(sender: { url?: string; frameId?: number; tab?: { id?: number } }, pairing: Pairing | undefined) {
  if (!pairing || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !sender.url || new URL(sender.url).origin !== pairing.origin) {
    throw new Error('Only the connected library in its main tab can receive captures.');
  }
}
export async function bridgeRequest(queue: CaptureQueue, sender: Parameters<typeof validateSender>[0], message: Record<string, unknown>, authenticated: boolean) {
  const pairing = await queue.pairing();
  validateSender(sender, pairing);
  if (!pairing) throw new Error('Connect your library first.');
  if (message.version !== CAPTURE_PROTOCOL || message.libraryId !== pairing.libraryId || message.nonce !== pairing.nonce) {
    throw new Error('Library connection does not match. Connect the extension again.');
  }
  if (message.type === 'hello' || (message.type === 'list' && authenticated)) {
    return { items: (await queue.metadata()).filter(item => item.libraryId === pairing.libraryId) };
  }
  if (!authenticated) throw new Error('Connect the library before requesting captures.');
  if (message.type === 'chunk') {
    const row = await queue.captures.get(String(message.id));
    if (!row || row.libraryId !== pairing.libraryId || row.hash !== message.hash) throw new Error('Capture is unavailable or changed.');
    const index = message.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= row.chunks) throw new Error('Invalid capture chunk.');
    return { index, data: bytesToBase64(row.bytes.subarray(index * CAPTURE_CHUNK_BYTES, (index + 1) * CAPTURE_CHUNK_BYTES)) };
  }
  if (message.type === 'ack') {
    await queue.acknowledge(String(message.id), String(message.hash), pairing.libraryId);
    return { acknowledged: true };
  }
  throw new Error('Unsupported capture protocol request.');
}
