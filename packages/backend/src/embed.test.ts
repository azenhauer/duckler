// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBED_LIMITS, EMBED_MODEL, extractVectors, handleEmbedApi, issueToken, verifyToken, workersAiEmbedder, type CounterStore, type EmbedEnvironment, type Embedder } from './embed';

const SECRET = 'test-secret-that-is-long-enough-0123456789';
const ORIGIN = 'https://duckler.pages.dev';
const memoryStore = () => {
  const map = new Map<string, string>();
  const store: CounterStore & { map: Map<string, string> } = { map, get: async key => map.get(key) ?? null, put: async (key, value) => { map.set(key, value); } };
  return store;
};
const mockEmbedder = () => {
  const calls: string[][] = [];
  const embedder: Embedder & { calls: string[][] } = { calls, embed: async texts => { calls.push(texts); return texts.map((_, index) => [index + 1, 0.5, -0.25]); } };
  return embedder;
};
const env = (overrides: Partial<EmbedEnvironment> = {}): EmbedEnvironment => ({ CLASSIFY_TOKEN_SECRET: SECRET, EMBED_USAGE: memoryStore(), ...overrides });
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});
const tokenFor = async (environment: EmbedEnvironment, embedder: Embedder) => (await (await handleEmbedApi(post('/api/embed/token'), environment, { embedder })).json()).token as string;

afterEach(() => { vi.restoreAllMocks(); });

describe('embed service configuration and access', () => {
  it('refuses to run until the secret, counter store and model all exist (fails closed)', async () => {
    const embedder = mockEmbedder();
    for (const environment of [env({ CLASSIFY_TOKEN_SECRET: undefined }), env({ CLASSIFY_TOKEN_SECRET: 'short' }), env({ EMBED_USAGE: undefined })]) {
      expect((await handleEmbedApi(post('/api/embed/token'), environment, { embedder })).status).toBe(503);
    }
    expect((await handleEmbedApi(post('/api/embed/token'), env())).status).toBe(503); // no AI binding, no embedder
  });

  it('only answers POSTs on its two paths', async () => {
    const embedder = mockEmbedder();
    expect((await handleEmbedApi(new Request(`${ORIGIN}/api/embed`, { headers: { Origin: ORIGIN } }), env(), { embedder })).status).toBe(405);
    expect((await handleEmbedApi(post('/api/embed/other'), env(), { embedder })).status).toBe(404);
  });

  it('accepts only its own origin (plus configured extras)', async () => {
    const embedder = mockEmbedder();
    expect((await handleEmbedApi(post('/api/embed/token', undefined, { Origin: 'https://evil.example' }), env(), { embedder })).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/embed/token`, { method: 'POST' });
    expect((await handleEmbedApi(noOrigin, env(), { embedder })).status).toBe(403);
    expect((await handleEmbedApi(post('/api/embed/token', undefined, { Origin: 'http://localhost:5176' }), env({ DUCKLER_ALLOWED_ORIGINS: 'http://localhost:5176' }), { embedder })).status).toBe(200);
  });
});

describe('per-install tokens', () => {
  it('issues tokens that verify, and rejects tampered or foreign ones', async () => {
    const token = await issueToken(SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(await verifyToken(SECRET, token)).toBe(token.split('.')[0]);
    expect(await verifyToken(SECRET, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(await verifyToken('another-secret-that-is-long-enough-012345', token)).toBeNull();
    expect(await verifyToken(SECRET, 'garbage')).toBeNull();
  });

  it('limits token issuance per IP per day', async () => {
    const environment = env(), embedder = mockEmbedder();
    for (let index = 0; index < EMBED_LIMITS.tokensPerIpPerDay; index += 1) expect((await handleEmbedApi(post('/api/embed/token'), environment, { embedder })).status).toBe(200);
    expect((await handleEmbedApi(post('/api/embed/token'), environment, { embedder })).status).toBe(429);
    expect((await handleEmbedApi(post('/api/embed/token', undefined, { 'CF-Connecting-IP': '198.51.100.2' }), environment, { embedder })).status).toBe(200);
  });
});

describe('embedding requests', () => {
  it('returns one vector per text with no-store headers', async () => {
    const environment = env(), embedder = mockEmbedder();
    const token = await tokenFor(environment, embedder);
    const response = await handleEmbedApi(post('/api/embed', { texts: ['Harbour lights', 'Faróis ao entardecer'] }, { Authorization: `Bearer ${token}` }), environment, { embedder });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ model: EMBED_MODEL, vectors: [[1, 0.5, -0.25], [2, 0.5, -0.25]] });
    expect(embedder.calls).toEqual([['Harbour lights', 'Faróis ao entardecer']]);
  });

  it('rejects missing or invalid tokens and malformed or oversized bodies', async () => {
    const environment = env(), embedder = mockEmbedder();
    const token = await tokenFor(environment, embedder);
    const auth = { Authorization: `Bearer ${token}` };
    expect((await handleEmbedApi(post('/api/embed', { texts: ['x'] }), environment, { embedder })).status).toBe(401);
    expect((await handleEmbedApi(post('/api/embed', { texts: ['x'] }, { Authorization: 'Bearer nope' }), environment, { embedder })).status).toBe(401);
    for (const body of ['not json', {}, { texts: [] }, { texts: [''] }, { texts: [42] }, { texts: Array(EMBED_LIMITS.maxTexts + 1).fill('x') }, { texts: ['x'.repeat(EMBED_LIMITS.maxTextChars + 1)] }]) {
      expect((await handleEmbedApi(post('/api/embed', body, auth), environment, { embedder })).status).toBe(400);
    }
    expect((await handleEmbedApi(post('/api/embed', 'x'.repeat(EMBED_LIMITS.maxBodyBytes + 1), auth), environment, { embedder })).status).toBe(400);
    expect(embedder.calls).toHaveLength(0);
  });

  it('caps calls per install per day and resets the next day', async () => {
    const environment = env(), embedder = mockEmbedder();
    const token = await tokenFor(environment, embedder);
    const call = (now: Date) => handleEmbedApi(post('/api/embed', { texts: ['x'] }, { Authorization: `Bearer ${token}` }), environment, { embedder, now });
    const day = new Date('2026-10-05T10:00:00Z');
    for (let index = 0; index < EMBED_LIMITS.callsPerInstallPerDay; index += 1) expect((await call(day)).status).toBe(200);
    expect((await call(day)).status).toBe(429);
    expect((await call(new Date('2026-10-06T00:01:00Z'))).status).toBe(200);
  });

  it('times out (5 s in production) and hides model errors', async () => {
    const environment = env();
    const token = await tokenFor(environment, mockEmbedder());
    const slow = await handleEmbedApi(post('/api/embed', { texts: ['slow'] }, { Authorization: `Bearer ${token}` }), environment, { embedder: { embed: () => new Promise(() => {}) }, timeoutMs: 30 });
    expect(slow.status).toBe(504);
    expect(EMBED_LIMITS.timeoutMs).toBe(5000);
    const failing = await handleEmbedApi(post('/api/embed', { texts: ['secret page text'] }, { Authorization: `Bearer ${token}` }), environment, { embedder: { embed: async () => { throw new Error('model said: secret page text'); } } });
    expect(failing.status).toBe(502);
    expect(await failing.text()).not.toContain('secret page text');
  });

  it('keeps nothing: counters hold only hashes and dates, and nothing is logged (I3b)', async () => {
    const store = memoryStore(), environment = env({ EMBED_USAGE: store }), embedder = mockEmbedder();
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map(method => vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    const token = await tokenFor(environment, embedder);
    await handleEmbedApi(post('/api/embed', { texts: ['Private clip text about my trip'] }, { Authorization: `Bearer ${token}` }), environment, { embedder });
    const stored = JSON.stringify([...store.map]);
    expect(stored).not.toContain('Private clip text');
    expect(stored).not.toContain('203.0.113.7');
    expect(stored).not.toContain(token.split('.')[0]);
    for (const [key, value] of store.map) { expect(key).toMatch(/^(token|embed):[A-Za-z0-9_-]{43}:\d{4}-\d{2}-\d{2}$/); expect(value).toMatch(/^\d+$/); }
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });
});

describe('Workers AI response parsing', () => {
  it('accepts { data } and { response } shapes and rejects anything else', async () => {
    expect(extractVectors({ shape: [1, 2], data: [[0.1, 0.2]] }, 1)).toEqual([[0.1, 0.2]]);
    expect(extractVectors({ response: [[0.3], [0.4]] }, 2)).toEqual([[0.3], [0.4]]);
    expect(() => extractVectors({ data: [[0.1]] }, 2)).toThrow(); // wrong count
    for (const bad of [null, {}, { data: [[]] }, { data: [[Number.NaN]] }, { data: [['1']] }, { response: 'x' }]) expect(() => extractVectors(bad, 1)).toThrow();
    const ai = { run: vi.fn(async () => ({ data: [[1, 2, 3]] })) };
    expect(await workersAiEmbedder(ai).embed(['a'])).toEqual([[1, 2, 3]]);
    expect(ai.run).toHaveBeenCalledWith(EMBED_MODEL, { text: ['a'] });
  });
});
