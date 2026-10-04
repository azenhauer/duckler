import type { Database } from './database';
import { authenticateSession, SESSION_COOKIE } from './session';

export interface ApiEnvironment {
  DUCKLER_DB?: Database;
  DUCKLER_API_ENABLED?: string;
  DUCKLER_ORIGIN?: string;
  DUCKLER_ENVIRONMENT?: string;
  DUCKLER_SESSION_IDLE_SECONDS?: string;
  DUCKLER_SESSION_ABSOLUTE_SECONDS?: string;
}
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const notFound = () => new ApiError(404, 'Resource not found');
const invalidInput = () => new ApiError(400, 'Invalid request');
const MAX_BODY_BYTES = 32768;

function response(status: number, value?: unknown, cookie?: string, production = false): Response {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Vary': 'Cookie, Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
  });
  if (production) headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (cookie) headers.set('Set-Cookie', cookie);
  if (value !== undefined) headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(value === undefined ? null : JSON.stringify(value), { status, headers });
}

function config(env: ApiEnvironment) {
  if (env.DUCKLER_API_ENABLED !== 'true' || !env.DUCKLER_DB) throw new ApiError(503, 'Private API unavailable');
  if (!['production', 'development'].includes(env.DUCKLER_ENVIRONMENT ?? '')) throw new ApiError(503, 'Private API unavailable');
  let origin: URL;
  try { origin = new URL(env.DUCKLER_ORIGIN ?? ''); } catch { throw new ApiError(503, 'Private API unavailable'); }
  const local = env.DUCKLER_ENVIRONMENT === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== env.DUCKLER_ORIGIN || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw new ApiError(503, 'Private API unavailable');
  const idle = Number(env.DUCKLER_SESSION_IDLE_SECONDS), absolute = Number(env.DUCKLER_SESSION_ABSOLUTE_SECONDS);
  if (!Number.isSafeInteger(idle) || !Number.isSafeInteger(absolute) || idle < 60 || idle > absolute || absolute > 604800) throw new ApiError(503, 'Private API unavailable');
  return { db: env.DUCKLER_DB, origin: origin.origin, idle, absolute, production: env.DUCKLER_ENVIRONMENT === 'production' };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'Expected JSON');
  if (!request.body) throw invalidInput();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    let next = await reader.read();
    while (!next.done) {
      length += next.value.length;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'Request too large'); }
      chunks.push(next.value);
      next = await reader.read();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalidInput();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidInput();
  } finally { reader.releaseLock(); }
}
function fields(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).some(key => !names.includes(key))) throw invalidInput();
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string') throw invalidInput();
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) throw invalidInput();
  return trimmed;
}
function cardInput(value: Record<string, unknown>) {
  fields(value, ['type', 'title', 'note', 'sourceUrl']);
  if (value.type !== 'text' && value.type !== 'bookmark') throw invalidInput();
  const title = text(value.title, 1000, true), note = text(value.note ?? '', 20000), sourceUrl = text(value.sourceUrl ?? '', 2048);
  if (sourceUrl) {
    let url: URL;
    try { url = new URL(sourceUrl); } catch { throw invalidInput(); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw invalidInput();
  }
  return { type: value.type, title, note, sourceUrl };
}

// SQL always includes authenticated ownership; public/share routes deliberately do not exist yet.
export async function handlePrivateApi(request: Request, env: ApiEnvironment, now = Date.now()): Promise<Response> {
  let production = false;
  try {
    const settings = config(env);
    production = settings.production;
    const { db } = settings;
    const url = new URL(request.url);
    if (url.origin !== settings.origin) throw new ApiError(403, 'Request origin denied');
    const origin = request.headers.get('Origin');
    if ((origin && origin !== settings.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'Request origin denied');
    const mutation = !['GET', 'HEAD'].includes(request.method);
    if (mutation && origin !== settings.origin) throw new ApiError(403, 'Request origin denied');
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) throw new ApiError(405, 'Method not allowed');
    const session = await authenticateSession(db, request, settings.idle, settings.absolute, now);
    if (!session) throw new ApiError(401, 'Authentication required');
    const owner = session.userId;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts.slice(1).some(part => !/^[a-zA-Z0-9_-]{1,80}$/.test(part))) throw notFound();
    const [, kind, id, relation, collectionId] = parts;
    if (kind === 'session' && parts.length === 2 && request.method === 'GET') {
      const user = await db.prepare('SELECT username, display_name AS displayName FROM users WHERE id = ?').bind(owner).first();
      return response(200, user, undefined, production);
    }
    if (kind === 'session' && parts.length === 2 && request.method === 'DELETE') {
      await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND user_id = ?').bind(now, session.tokenHash, owner).run();
      return response(204, undefined, `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, production);
    }
    if (kind === 'sessions' && parts.length === 2 && request.method === 'DELETE') {
      await db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, owner).run();
      return response(204, undefined, `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, production);
    }
    if (kind !== 'cards' && kind !== 'collections') throw notFound();
    if (kind === 'cards' && parts.length === 5 && relation === 'collections' && ['PUT', 'DELETE'].includes(request.method)) {
      const allowed = await db.prepare(`SELECT c.id FROM cards c JOIN collections l ON l.id = ? AND l.owner_user_id = c.owner_user_id
        WHERE c.id = ? AND c.owner_user_id = ?`).bind(collectionId, id, owner).first();
      if (!allowed) throw notFound();
      if (request.method === 'PUT') {
        await db.prepare(`INSERT OR IGNORE INTO card_collections (owner_user_id, card_id, collection_id)
          SELECT c.owner_user_id, c.id, l.id FROM cards c JOIN collections l ON l.owner_user_id = c.owner_user_id
          WHERE c.id = ? AND l.id = ? AND c.owner_user_id = ?`).bind(id, collectionId, owner).run();
      } else {
        await db.prepare('DELETE FROM card_collections WHERE card_id = ? AND collection_id = ? AND owner_user_id = ?').bind(id, collectionId, owner).run();
      }
      return response(204, undefined, undefined, production);
    }
    if (parts.length > 3) throw notFound();
    // Table and column identifiers come from this fixed allowlist, never from user input.
    const table = kind === 'cards' ? 'cards' : 'collections';
    const columns = kind === 'cards' ? 'id, type, title, note, source_url AS sourceUrl, visibility, created_at AS createdAt, updated_at AS updatedAt'
      : 'id, name, visibility, created_at AS createdAt, updated_at AS updatedAt';
    if (request.method === 'GET') {
      if (id) {
        const resource = await db.prepare(`SELECT ${columns} FROM ${table} WHERE id = ? AND owner_user_id = ?`).bind(id, owner).first();
        if (!resource) throw notFound();
        return response(200, resource, undefined, production);
      }
      const query = url.searchParams.get('q') ?? '';
      if (query.length > 200) throw invalidInput();
      const search = kind === 'cards' ? "instr(lower(title || ' ' || note || ' ' || source_url), lower(?)) > 0" : 'instr(lower(name), lower(?)) > 0';
      const resources = await db.prepare(`SELECT ${columns} FROM ${table} WHERE owner_user_id = ? AND ${search} ORDER BY updated_at DESC, id LIMIT 100`).bind(owner, query).all();
      return response(200, resources.results, undefined, production);
    }
    if (request.method === 'DELETE' && id) {
      const result = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND owner_user_id = ?`).bind(id, owner).run();
      if (!result.meta.changes) throw notFound();
      return response(204, undefined, undefined, production);
    }
    if ((request.method === 'POST' && !id) || (request.method === 'PUT' && id)) {
      const value = await body(request);
      const resourceId = id ?? crypto.randomUUID();
      if (kind === 'collections') {
        fields(value, ['name']);
        const name = text(value.name, 120, true);
        const result = id
          ? await db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?').bind(name, now, id, owner).run()
          : await db.prepare('INSERT INTO collections (id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(resourceId, owner, name, now, now).run();
        if (!result.meta.changes) throw notFound();
      } else {
        const card = cardInput(value);
        const result = id
          ? await db.prepare('UPDATE cards SET type = ?, title = ?, note = ?, source_url = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?')
            .bind(card.type, card.title, card.note, card.sourceUrl, now, id, owner).run()
          : await db.prepare('INSERT INTO cards (id, owner_user_id, type, title, note, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(resourceId, owner, card.type, card.title, card.note, card.sourceUrl, now, now).run();
        if (!result.meta.changes) throw notFound();
      }
      return response(id ? 200 : 201, { id: resourceId }, undefined, production);
    }
    throw new ApiError(405, 'Method not allowed');
  } catch (error) {
    if (error instanceof ApiError) return response(error.status, { error: error.message }, undefined, production);
    // Do not send database messages, stack traces, secrets or private names to clients.
    return response(500, { error: 'Request failed' }, undefined, production);
  }
}
