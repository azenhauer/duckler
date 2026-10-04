// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { CaptureQueue } from './queue';
import { bridgeRequest } from './bridge';
import { CAPTURE_CHUNK_BYTES, MAX_CAPTURE_BYTES, cropBounds, hashBytes, base64ToBytes } from '../../../packages/shared/src/captureProtocol';

const dbs: CaptureQueue[] = [];
const makeQueue = () => { const queue = new CaptureQueue(`capture-test-${crypto.randomUUID()}`); dbs.push(queue); return queue; };
const pairing = { origin: 'https://duckler.pages.dev', libraryId: 'library-id-1234567890', nonce: 'pairing-nonce-12345678901234567890123' };
const sender = { url: 'https://duckler.pages.dev/', tab: { id: 1 }, frameId: 0 };
const capture = { id: 'capture-1', kind: 'text', title: 'A thought', note: 'Keep this', createdAt: '2026-10-04T12:00:00Z' };
const request = { ...pairing, version: 1 };
afterEach(async () => { for (const db of dbs.splice(0)) await db.delete(); });

describe('durable extension queue and delivery', () => {
  it('preserves capture bytes after worker restart and binds pre-pairing captures', async () => {
    const queue = makeQueue();
    const saved = await queue.enqueue(capture);
    queue.close();
    const restarted = new CaptureQueue(queue.name); dbs.push(restarted);
    await restarted.pair(pairing);
    const restored = await restarted.captures.get(saved.id);
    expect(restored?.libraryId).toBe(pairing.libraryId);
    expect(restored?.hash).toBe(await hashBytes(restored!.bytes));
    expect(JSON.parse(new TextDecoder().decode(restored?.bytes))).toMatchObject(capture);
  });
  it('serializes concurrent saves transactionally without losing a capture', async () => {
    const queue = makeQueue();
    await Promise.all(Array.from({ length: 10 }, (_, index) => queue.enqueue({ ...capture, id: `capture-${index}` })));
    expect(await queue.captures.count()).toBe(10);
  });
  it('rejects wrong origin, iframe, protocol, library and nonce before exposing metadata', async () => {
    const queue = makeQueue(); await queue.pair(pairing); await queue.enqueue(capture);
    for (const hostile of [{ ...sender, url: 'https://evil.example/' }, { ...sender, frameId: 3 }, { ...sender, tab: undefined }]) {
      await expect(bridgeRequest(queue, hostile, { ...request, type: 'hello' }, false)).rejects.toThrow(/main tab/);
    }
    for (const wrong of [{ version: 2 }, { libraryId: 'other-library' }, { nonce: 'wrong' }]) {
      await expect(bridgeRequest(queue, sender, { ...request, ...wrong, type: 'hello' }, false)).rejects.toThrow(/does not match/);
    }
    expect(await queue.captures.count()).toBe(1);
  });
  it('pulls bounded ordered chunks and removes bytes only after a matching commit ACK', async () => {
    const queue = makeQueue(); await queue.pair(pairing);
    const saved = await queue.enqueue({ ...capture, kind: 'image', payload: 'data:image/png;base64,' + 'A'.repeat(CAPTURE_CHUNK_BYTES * 2) });
    const reply = await bridgeRequest(queue, sender, { ...request, type: 'hello' }, false);
    expect(reply).toHaveProperty('items');
    const chunks = [];
    for (let index = 0; index < saved.chunks; index++) {
      const chunk = await bridgeRequest(queue, sender, { ...request, type: 'chunk', id: saved.id, hash: saved.hash, index }, true) as { data: string };
      chunks.push(base64ToBytes(chunk.data));
    }
    expect(chunks.reduce((size, bytes) => size + bytes.length, 0)).toBe(saved.byteLength);
    await expect(queue.acknowledge(saved.id, 'wrong', pairing.libraryId)).rejects.toThrow(/does not match/);
    expect(await queue.captures.count()).toBe(1);
    await queue.acknowledge(saved.id, saved.hash, pairing.libraryId);
    await queue.acknowledge(saved.id, saved.hash, pairing.libraryId);
    expect(await queue.captures.count()).toBe(0);
  });
  it('retains pending captures after disconnection and refuses to reroute them to another library', async () => {
    const queue = makeQueue(); await queue.pair(pairing); const row = await queue.enqueue(capture);
    await bridgeRequest(queue, sender, { ...request, type: 'hello' }, false);
    await bridgeRequest(queue, sender, { ...request, type: 'chunk', id: row.id, hash: row.hash, index: 0 }, true);
    await expect(queue.pair({ ...pairing, libraryId: 'other-library-123456789' })).rejects.toThrow(/pending captures/);
    expect(await queue.captures.count()).toBe(1);
  });
  it('rejects oversized images and malformed source URLs without committing', async () => {
    const queue = makeQueue();
    await expect(queue.enqueue({ ...capture, sourceUrl: 'javascript:alert(1)' })).rejects.toThrow(/HTTP/);
    await expect(queue.enqueue({ ...capture, kind: 'image', payload: 'data:image/png;base64,' + 'A'.repeat(MAX_CAPTURE_BYTES) })).rejects.toThrow(/too large/);
    expect(await queue.captures.count()).toBe(0);
  });
});
describe('screenshot geometry', () => {
  it('normalizes reverse drags and measures actual bitmap scale at 2x DPR', () => {
    expect(cropBounds({ left: 90, top: 80, right: 10, bottom: 20 }, { width: 100, height: 100 }, { width: 200, height: 200 })).toEqual({ left: 20, top: 40, width: 160, height: 120 });
  });
  it('clamps edges and rejects small crops and ambiguous zoom mappings', () => {
    expect(cropBounds({ left: -20, top: -10, right: 110, bottom: 90 }, { width: 100, height: 100 }, { width: 125, height: 125 })).toEqual({ left: 0, top: 0, width: 125, height: 113 });
    expect(() => cropBounds({ left: 1, top: 1, right: 3, bottom: 3 }, { width: 100, height: 100 }, { width: 100, height: 100 })).toThrow(/4 × 4/);
    expect(() => cropBounds({ left: 1, top: 1, right: 50, bottom: 50 }, { width: 100, height: 100 }, { width: 100, height: 150 })).toThrow(/viewport changed/);
  });
});
