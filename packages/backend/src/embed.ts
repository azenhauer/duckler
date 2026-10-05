// Clip autofill embed service (docs/ai-coop/PROTOCOL.md 1.3). Turns short clip / collection texts into
// vectors with Workers AI. ZERO RETENTION (I3b): nothing here stores or logs request or response
// bodies; the only state is a daily usage counter keyed by a hash of the install id (or of the IP
// for token issuance), which expires after two days. Every failure is a plain status code, and the
// whole service refuses to run (503) until its secret, model binding and counter store exist.

export const EMBED_MODEL = '@cf/baai/bge-m3';
export const EMBED_LIMITS = {
  maxTexts: 16,
  maxTextChars: 4000,
  maxBodyBytes: 64 * 1024,
  callsPerInstallPerDay: 200,
  tokensPerIpPerDay: 20,
  timeoutMs: 5000,
  minSecretLength: 32,
} as const;

/** The parts of a Workers KV namespace this service uses (only for counters, never content). */
export interface CounterStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
/** Workers AI binding (`env.AI`). */
export interface AiBinding { run(model: string, input: unknown): Promise<unknown> }
/** Swappable embedding backend (Workers AI in production, a mock in tests). */
export interface Embedder { embed(texts: string[]): Promise<number[][]> }

export interface EmbedEnvironment {
  AI?: AiBinding;
  CLASSIFY_TOKEN_SECRET?: string;
  EMBED_USAGE?: CounterStore;
  /** Extra allowed origins (comma separated); the deployment's own origin is always allowed. */
  DUCKLER_ALLOWED_ORIGINS?: string;
}

/** Accepts either documented response shape ({ data } or { response }) and checks every vector. */
export function extractVectors(output: unknown, expected: number): number[][] {
  const record = output as { data?: unknown; response?: unknown } | null;
  const vectors = Array.isArray(record?.data) ? record.data : Array.isArray(record?.response) ? record.response : null;
  if (!vectors || vectors.length !== expected) throw new Error('Unexpected embedding response');
  for (const vector of vectors) {
    if (!Array.isArray(vector) || !vector.length || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Unexpected embedding response');
  }
  return vectors as number[][];
}

export const workersAiEmbedder = (ai: AiBinding): Embedder => ({
  async embed(texts) { return extractVectors(await ai.run(EMBED_MODEL, { text: texts }), texts.length); },
});

const encoder = new TextEncoder();
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}
async function sha256(message: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(message))));
}
/** Constant-time comparison of two ASCII strings. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

/** A per-install token: `<random install id>.<HMAC of it>`; the server keeps no list of tokens. */
export async function issueToken(secret: string): Promise<string> {
  const installId = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  return `${installId}.${await hmac(secret, `install:${installId}`)}`;
}
/** The install id inside a valid token, or null. */
export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const match = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  return sameText(match[2], await hmac(secret, `install:${match[1]}`)) ? match[1] : null;
}

/** Counts one use against a daily budget; false once the budget is spent. Keys hold only hashes. */
async function takeDaily(store: CounterStore, scope: string, subject: string, limit: number, now: Date): Promise<boolean> {
  const key = `${scope}:${await sha256(subject)}:${now.toISOString().slice(0, 10)}`;
  const used = Number(await store.get(key)) || 0;
  if (used >= limit) return false;
  await store.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  return true;
}

function reply(status: number, value?: unknown): Response {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

function originAllowed(request: Request, env: EmbedEnvironment): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin, ...(env.DUCKLER_ALLOWED_ORIGINS ?? '').split(',').map(item => item.trim()).filter(Boolean)]);
  return allowed.has(origin);
}

async function readTexts(request: Request): Promise<string[] | null> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > EMBED_LIMITS.maxBodyBytes) return null;
  const raw = await request.text();
  if (encoder.encode(raw).length > EMBED_LIMITS.maxBodyBytes) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  const texts = (body as { texts?: unknown })?.texts;
  if (!Array.isArray(texts) || !texts.length || texts.length > EMBED_LIMITS.maxTexts) return null;
  if (texts.some(text => typeof text !== 'string' || !text.trim() || text.length > EMBED_LIMITS.maxTextChars)) return null;
  return texts as string[];
}

/** Routes POST /api/embed/token and POST /api/embed. */
export async function handleEmbedApi(request: Request, env: EmbedEnvironment, options: { embedder?: Embedder; now?: Date; timeoutMs?: number } = {}): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (path !== '/api/embed' && path !== '/api/embed/token') return reply(404, { error: 'Not found' });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const secret = env.CLASSIFY_TOKEN_SECRET ?? '';
  const embedder = options.embedder ?? (env.AI ? workersAiEmbedder(env.AI) : undefined);
  if (secret.length < EMBED_LIMITS.minSecretLength || !env.EMBED_USAGE || !embedder) return reply(503, { error: 'Autofill is not configured' });
  if (!originAllowed(request, env)) return reply(403, { error: 'Origin not allowed' });
  const now = options.now ?? new Date();

  if (path === '/api/embed/token') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!await takeDaily(env.EMBED_USAGE, 'token', ip, EMBED_LIMITS.tokensPerIpPerDay, now)) return reply(429, { error: 'Too many requests' });
    return reply(200, { token: await issueToken(secret) });
  }

  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? '';
  const installId = await verifyToken(secret, token);
  if (!installId) return reply(401, { error: 'Invalid token' });
  const texts = await readTexts(request);
  if (!texts) return reply(400, { error: 'Invalid request' });
  if (!await takeDaily(env.EMBED_USAGE, 'embed', installId, EMBED_LIMITS.callsPerInstallPerDay, now)) return reply(429, { error: 'Daily limit reached' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const vectors = await Promise.race([
      embedder.embed(texts),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), options.timeoutMs ?? EMBED_LIMITS.timeoutMs); }),
    ]);
    return reply(200, { model: EMBED_MODEL, vectors });
  } catch (error) {
    // No details and no logging: the texts must not leave this request (I3b).
    return reply(error instanceof Error && error.message === 'timeout' ? 504 : 502, { error: 'Embedding unavailable' });
  } finally { clearTimeout(timer); }
}
