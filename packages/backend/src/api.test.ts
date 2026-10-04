// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { handlePrivateApi, type ApiEnvironment } from './api';
import { type Database, type Statement, type SqlValue } from './database';
import { issueSession, hashSessionToken, SESSION_COOKIE } from './session';

// Real SQLite enforces the migration constraints; only the D1 transport adapter is substituted.
interface SqliteStatement { get(...values: SqlValue[]): unknown; all(...values: SqlValue[]): unknown[]; run(...values: SqlValue[]): { changes: number }; }
interface SqliteDatabase { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void; }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase };
const now = 1800000000000;
let sqlite: SqliteDatabase;
let db: Database;
let env: ApiEnvironment;
let alice: string, bob: string;
function adapt(sql: string, values: SqlValue[] = []): Statement {
  return {
    bind: (...next) => adapt(sql, next),
    first: async <T>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  };
}
function request(path: string, token = alice, method = 'GET', value?: unknown, extra: Record<string, string> = {}) {
  return new Request(`https://duckler.test/api/${path}`, {
    method,
    headers: { Cookie: `${SESSION_COOKIE}=${token}`, ...(method !== 'GET' ? { Origin: 'https://duckler.test' } : {}),
      ...(value !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
const call = (path: string, token = alice, method = 'GET', value?: unknown, extra?: Record<string, string>) =>
  handlePrivateApi(request(path, token, method, value, extra), env, now);
async function create(path: string, value: unknown, token = alice) {
  const result = await call(path, token, 'POST', value);
  expect(result.status).toBe(201);
  return (await result.json() as { id: string }).id;
}
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../../migrations/0001_private_library.sql', import.meta.url), 'utf8'));
  db = { prepare: sql => adapt(sql) };
  env = { DUCKLER_DB: db, DUCKLER_API_ENABLED: 'true', DUCKLER_ORIGIN: 'https://duckler.test',
    DUCKLER_ENVIRONMENT: 'production', DUCKLER_SESSION_IDLE_SECONDS: '1800', DUCKLER_SESSION_ABSOLUTE_SECONDS: '86400' };
  for (const user of ['alice', 'bob']) {
    await db.prepare('INSERT INTO users (id, username, display_name, created_at) VALUES (?, ?, ?, ?)').bind(user, user, user, now).run();
  }
  alice = (await issueSession(db, 'alice', 86400, now)).token;
  bob = (await issueSession(db, 'bob', 86400, now)).token;
});
afterEach(() => sqlite.close());

describe('private API authorization with real SQL', () => {
  for (const kind of ['collections', 'cards']) {
    it(`${kind}: blocks cross-user read, list, search, update and delete`, async () => {
      const input = kind === 'cards' ? { type: 'text', title: 'Private needle', note: 'Private body' } : { name: 'Private needle' };
      const id = await create(kind, input);
      expect((await call(`${kind}/${id}`)).status).toBe(200);
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const denied = await call(`${kind}/${id}`, bob, method, method === 'PUT' ? input : undefined);
        const missing = await call(`${kind}/missing`, bob, method, method === 'PUT' ? input : undefined);
        expect(denied.status).toBe(404);
        expect(await denied.text()).toBe(await missing.text());
      }
      expect(await (await call(kind, bob)).json()).toEqual([]);
      expect(await (await call(`${kind}?q=needle`, bob)).json()).toEqual([]);
      expect(await (await call(`${kind}?q=needle`)).json()).toHaveLength(1);
      expect((await call(`${kind}/${id}`)).status).toBe(200);
      expect((await call(`${kind}/${id}`, alice, 'DELETE')).status).toBe(204);
      expect((await call(`${kind}/${id}`)).status).toBe(404);
    });
  }
  it('derives ownership from the session and rejects injected ownership, permissions, IDs and visibility', async () => {
    for (const unexpected of [{ owner_user_id: 'bob' }, { role: 'admin' }, { permissions: ['read'] }, { id: 'bob-card' }, { visibility: 'public' }]) {
      expect((await call('collections', alice, 'POST', { name: 'Collection', ...unexpected })).status).toBe(400);
    }
    const id = await create('collections', { name: 'Private' });
    const row = await db.prepare('SELECT owner_user_id, visibility FROM collections WHERE id = ?').bind(id).first();
    expect(row).toEqual({ owner_user_id: 'alice', visibility: 'private' });
    const serialized = await (await call(`collections/${id}`)).json();
    expect(serialized).not.toHaveProperty('owner_user_id');
  });
  it('enforces both ownership references in the database, even if a caller bypasses the API', async () => {
    const card = await create('cards', { type: 'text', title: 'Alice card' });
    const collection = await create('collections', { name: 'Bob collection' }, bob);
    await expect(db.prepare('INSERT INTO card_collections (owner_user_id, card_id, collection_id) VALUES (?, ?, ?)')
      .bind('alice', card, collection).run()).rejects.toThrow();
    await expect(db.prepare("UPDATE collections SET visibility = 'public' WHERE id = ?").bind(collection).run()).rejects.toThrow();
  });
  it('allows many collections, idempotent assignment and relationship-only removal', async () => {
    const card = await create('cards', { type: 'text', title: 'Shared reference' });
    const first = await create('collections', { name: 'First' });
    const second = await create('collections', { name: 'Second' });
    for (const id of [first, first, second]) expect((await call(`cards/${card}/collections/${id}`, alice, 'PUT')).status).toBe(204);
    expect((await db.prepare('SELECT * FROM card_collections').all()).results).toHaveLength(2);
    expect((await call(`cards/${card}/collections/${first}`, alice, 'DELETE')).status).toBe(204);
    expect((await db.prepare('SELECT collection_id FROM card_collections').all()).results).toEqual([{ collection_id: second }]);
    expect((await call(`cards/${card}`)).status).toBe(200);
    expect((await call(`collections/${second}`, alice, 'DELETE')).status).toBe(204);
    expect((await db.prepare('SELECT * FROM card_collections').all()).results).toEqual([]);
    expect((await call(`cards/${card}`)).status).toBe(200);
  });
  it('rejects mixed-owner assignment and unauthorized removal without leaking collection names', async () => {
    const aCard = await create('cards', { type: 'text', title: 'Alice' });
    const bCard = await create('cards', { type: 'text', title: 'Bob' }, bob);
    const aCollection = await create('collections', { name: 'Alice secret' });
    const bCollection = await create('collections', { name: 'Bob secret' }, bob);
    await call(`cards/${aCard}/collections/${aCollection}`, alice, 'PUT');
    for (const method of ['PUT', 'DELETE']) {
      for (const [card, collection, token] of [[aCard, bCollection, alice], [bCard, aCollection, alice], [aCard, aCollection, bob]]) {
        const denied = await call(`cards/${card}/collections/${collection}`, token, method);
        expect(denied.status).toBe(404);
        expect(await denied.json()).toEqual({ error: 'Resource not found' });
      }
    }
    expect((await db.prepare('SELECT * FROM card_collections').all()).results).toHaveLength(1);
  });
});

describe('session and request security', () => {
  it('uses random opaque cookies, stores hashes only and exposes no internal identity', async () => {
    const issued = await issueSession(db, 'alice', 3600, now);
    expect(issued.cookie).toContain('Path=/; HttpOnly; Secure; SameSite=Strict');
    expect(issued.cookie).toMatch(/^__Host-duckler_session=/);
    expect(issued.cookie).not.toContain('Domain=');
    expect(issued.token).not.toBe(alice);
    const rows = (await db.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>()).results;
    expect(rows.some(row => row.token_hash === issued.token)).toBe(false);
    expect(rows.map(row => row.token_hash)).toContain(await hashSessionToken(issued.token));
    expect(await (await call('session')).json()).toEqual({ username: 'alice', displayName: 'alice' });
  });
  it('does not accept usernames, client ownership headers, bearer tokens or duplicate cookies as authentication', async () => {
    for (const token of ['', 'alice', 'invalid', 'A'.repeat(43)]) expect((await call('collections', token)).status).toBe(401);
    expect((await call('collections', '', 'GET', undefined, { Authorization: `Bearer ${alice}`, 'X-User-Id': 'alice' })).status).toBe(401);
    expect((await call('collections', alice, 'GET', undefined, { Cookie: `${SESSION_COOKIE}=${alice}; ${SESSION_COOKIE}=${bob}` })).status).toBe(401);
    expect((await call('login', alice, 'POST', { username: 'alice' })).status).toBe(404);
  });
  it('enforces idle and absolute expiry, account disablement, logout and all-session revocation', async () => {
    expect((await handlePrivateApi(request('session'), env, now + 1800000)).status).toBe(401);
    const expired = (await issueSession(db, 'alice', 60, now - 60000)).token;
    expect((await call('session', expired)).status).toBe(401);
    const old = (await issueSession(db, 'alice', 604800, now - 86400000)).token;
    await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, await hashSessionToken(old)).run();
    expect((await call('session', old)).status).toBe(401);
    await db.prepare("UPDATE users SET status = 'disabled' WHERE id = 'bob'").run();
    expect((await call('session', bob)).status).toBe(401);
    const logout = await call('session', alice, 'DELETE');
    expect(logout.status).toBe(204);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await call('session')).status).toBe(401);
    alice = (await issueSession(db, 'alice', 86400, now)).token;
    const another = (await issueSession(db, 'alice', 86400, now)).token;
    expect((await call('sessions', alice, 'DELETE')).status).toBe(204);
    expect((await call('session', another)).status).toBe(401);
  });
  it('fails closed for missing or unsafe production configuration', async () => {
    for (const overrides of [{ DUCKLER_DB: undefined }, { DUCKLER_API_ENABLED: undefined }, { DUCKLER_ORIGIN: 'http://duckler.test' },
      { DUCKLER_ORIGIN: undefined }, { DUCKLER_ENVIRONMENT: undefined }, { DUCKLER_SESSION_IDLE_SECONDS: '0' },
      { DUCKLER_SESSION_ABSOLUTE_SECONDS: undefined }, { DUCKLER_SESSION_ABSOLUTE_SECONDS: '99999999' }]) {
      expect((await handlePrivateApi(request('collections'), { ...env, ...overrides }, now)).status).toBe(503);
    }
  });
  it('blocks cross-origin reads and writes, missing mutation origins and preflight without wildcard CORS', async () => {
    for (const method of ['GET', 'POST']) {
      expect((await call('collections', alice, method, method === 'POST' ? { name: 'No' } : undefined, { Origin: 'https://evil.test' })).status).toBe(403);
    }
    const noOrigin = request('collections', alice, 'POST', { name: 'No' });
    noOrigin.headers.delete('Origin');
    expect((await handlePrivateApi(noOrigin, env, now)).status).toBe(403);
    expect((await call('collections', alice, 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    const preflight = await call('collections', alice, 'OPTIONS', undefined, { Origin: 'https://evil.test' });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('disables private response caching and sets restrictive API headers on success and errors', async () => {
    for (const token of [alice, 'bad']) {
      const result = await call('collections', token);
      expect(result.headers.get('Cache-Control')).toBe('private, no-store');
      expect(result.headers.get('Vary')).toBe('Cookie, Origin');
      expect(result.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(result.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  });
  it('rejects oversized, malformed, unexpected fields and executable URLs; keeps captured HTML inert text', async () => {
    for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:password@example.com']) {
      expect((await call('cards', alice, 'POST', { type: 'bookmark', title: 'Bad', sourceUrl })).status).toBe(400);
    }
    expect((await call('cards', alice, 'POST', { type: 'image', title: 'Not enabled' })).status).toBe(400);
    expect((await call('cards', alice, 'POST', { type: 'text', title: 'Oversize', note: 'a'.repeat(40000) })).status).toBe(413);
    expect((await handlePrivateApi(new Request('https://duckler.test/api/cards', { method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=${alice}`, Origin: 'https://duckler.test', 'Content-Type': 'application/json' }, body: '{' }), env, now)).status).toBe(400);
    const id = await create('cards', { type: 'text', title: '<script>alert(1)</script>', note: '<img onerror=alert(1)>' });
    const result = await call(`cards/${id}`);
    expect(result.headers.get('Content-Type')).toContain('application/json');
    expect((await result.json() as { title: string }).title).toBe('<script>alert(1)</script>');
  });
  it('redacts infrastructure errors without serializing SQL, paths or secrets', async () => {
    const broken: Database = { prepare() { throw new Error('SQL secret token internal path'); } };
    const result = await handlePrivateApi(request('collections'), { ...env, DUCKLER_DB: broken }, now);
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({ error: 'Request failed' });
  });
});
