import Dexie, { type Table } from 'dexie';
import { CAPTURE_CHUNK_BYTES, MAX_CAPTURE_BYTES, MAX_QUEUE_BYTES, MAX_QUEUE_ITEMS, hashBytes, validateCapture, type CaptureMetadata, type Pairing } from '../../../packages/shared/src/captureProtocol';

type QueueRow = CaptureMetadata & { bytes: Uint8Array };
type Receipt = { id: string; hash: string; libraryId: string; receivedAt: string };
export type CollectionMetadata = { id: string; name: string; cardCount?: number };
export class CaptureQueue extends Dexie {
  captures!: Table<QueueRow, string>;
  receipts!: Table<Receipt, string>;
  settings!: Table<{ key: string; value: Pairing }, string>;
  collectionMetadata!: Table<{ libraryId: string; collections: CollectionMetadata[] }, string>;
  constructor(name = 'duckler-extension-captures') {
    super(name);
    this.version(1).stores({ captures: '&id, createdAt, libraryId', receipts: '&id, receivedAt', settings: '&key' });
    this.version(2).stores({ collectionMetadata: '&libraryId' });
  }
  async pairing() { return (await this.settings.get('pairing'))?.value; }
  async pair(pairing: Pairing) {
    await this.transaction('rw', this.captures, this.settings, async () => {
      const previous = await this.pairing();
      if (previous && (previous.libraryId !== pairing.libraryId || previous.origin !== pairing.origin) && await this.captures.count()) {
        throw new Error('Export or finish pending captures before connecting another library.');
      }
      await this.captures.where('libraryId').equals('unpaired').modify({ libraryId: pairing.libraryId });
      await this.settings.put({ key: 'pairing', value: pairing });
    });
  }
  async enqueue(input: unknown) {
    const capture = validateCapture(input);
    const bytes = new TextEncoder().encode(JSON.stringify(capture));
    if (bytes.length > MAX_CAPTURE_BYTES) throw new Error('Capture is too large. Select a smaller area (16 MiB limit).');
    const hash = await hashBytes(bytes);
    return this.transaction('rw', this.captures, this.settings, async () => {
      const rows = await this.captures.toArray();
      const existing = rows.find(row => row.id === capture.id);
      if (existing) {
        if (existing.hash !== hash) throw new Error('A different capture already uses this ID.');
        return existing;
      }
      if (rows.length >= MAX_QUEUE_ITEMS || rows.reduce((size, row) => size + row.byteLength, 0) + bytes.length > MAX_QUEUE_BYTES) {
        throw new Error('Capture queue is full. Open your library or export the queue to make room.');
      }
      const row: QueueRow = { id: capture.id, title: capture.title, kind: capture.kind, createdAt: capture.createdAt,
        libraryId: (await this.pairing())?.libraryId ?? 'unpaired', bytes, byteLength: bytes.length, hash, chunks: Math.ceil(bytes.length / CAPTURE_CHUNK_BYTES) };
      await this.captures.add(row);
      return row;
    });
  }
  async acknowledge(id: string, hash: string, libraryId: string) {
    return this.transaction('rw', this.captures, this.receipts, async () => {
      const row = await this.captures.get(id);
      if (row && (row.hash !== hash || row.libraryId !== libraryId)) throw new Error('Capture receipt does not match the pending item.');
      if (!row) {
        const receipt = await this.receipts.get(id);
        if (!receipt || receipt.hash !== hash || receipt.libraryId !== libraryId) throw new Error('Unknown capture receipt.');
        return;
      }
      await this.receipts.put({ id, hash, libraryId, receivedAt: new Date().toISOString() });
      await this.captures.delete(id);
      const oldest = await this.receipts.orderBy('receivedAt').keys();
      if (oldest.length > 100) await this.receipts.bulkDelete(oldest.slice(0, oldest.length - 100) as string[]);
    });
  }
  async metadata() {
    return (await this.captures.orderBy('createdAt').toArray()).map(({ bytes: _bytes, ...meta }) => meta);
  }
  async saveCollectionMetadata(libraryId: string, collections: CollectionMetadata[]) {
    await this.collectionMetadata.put({ libraryId, collections });
  }
  async readCollectionMetadata(libraryId: string) {
    return (await this.collectionMetadata.get(libraryId))?.collections ?? [];
  }
}
