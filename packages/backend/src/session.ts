import type { Database } from './database';

export const SESSION_COOKIE = '__Host-duckler_session';
export const hashSessionToken = async (token: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');

// Only call after a trusted authentication ceremony. There is no public session-creation endpoint.
export async function issueSession(db: Database, userId: string, lifetimeSeconds: number, now = Date.now()) {
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 604800) throw new Error('Invalid session lifetime');
  const user = await db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").bind(userId).first<{ id: string }>();
  if (!user) throw new Error('Authentication required');
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await hashSessionToken(token), userId, now, now, now + lifetimeSeconds * 1000).run();
  return { token, cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${lifetimeSeconds}` };
}

export async function authenticateSession(db: Database, request: Request, idleSeconds: number, absoluteSeconds: number, now: number) {
  const matches = (request.headers.get('Cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = await hashSessionToken(token);
  const session = await db.prepare(`SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    AND s.last_seen_at > ? AND s.created_at > ? AND u.status = 'active'`)
    .bind(tokenHash, now, now - idleSeconds * 1000, now - absoluteSeconds * 1000).first<{ user_id: string }>();
  if (!session) return null;
  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(now, tokenHash).run();
  return { userId: session.user_id, tokenHash };
}
