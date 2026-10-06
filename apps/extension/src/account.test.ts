// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureQueue } from './queue';
import { accessToken, deliverToAccount, readAccount, signIn } from './account';

const CLIENT_ID = '1234-abcdef.apps.googleusercontent.com';
const capture = (id: string) => ({ id, kind: 'text', title: `Thought ${id}`, note: 'Keep this', createdAt: '2026-10-07T12:00:00Z' });

/** chrome.* as far as account.ts uses it, with Google's sign-in answering through launchWebAuthFlow. */
function fakeChrome(answer: (url: URL) => string) {
  const local = new Map<string, unknown>(), session = new Map<string, unknown>();
  const area = (map: Map<string, unknown>) => ({
    get: async (key: string) => (map.has(key) ? { [key]: map.get(key) } : {}),
    set: async (items: Record<string, unknown>) => { for (const [key, value] of Object.entries(items)) map.set(key, value); },
    remove: async (key: string) => { map.delete(key); },
  });
  return {
    storage: { local: area(local), session: area(session) },
    identity: { getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/', launchWebAuthFlow: vi.fn(async ({ url }: { url: string }) => answer(new URL(url))) },
    runtime: { getManifest: () => ({ externally_connectable: { matches: ['https://duckler.pages.dev/*'] } }) },
  };
}

/** Google's endpoints: config, Drive folder lookup, upload and about. */
function fakeGoogle(options: { failUpload?: boolean } = {}) {
  const uploads: { name: string; parents: string[]; appProperties: Record<string, string>; body: string }[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/config') return json({ googleClientId: CLIENT_ID, googleApiKey: '' });
    if (new Headers(init.headers).get('Authorization') !== 'Bearer token-1') return json({}, 401);
    if (url.pathname.endsWith('/about')) return json({ user: { emailAddress: 'ana@example.com' } });
    if (url.pathname === '/drive/v3/files' && (init.method ?? 'GET') === 'GET') return json({ files: [{ id: 'root-1' }] });
    if (url.pathname === '/upload/drive/v3/files') {
      if (options.failUpload) return json({}, 503);
      const form = init.body as FormData;
      const metadata = JSON.parse(await (form.get('metadata') as Blob).text());
      uploads.push({ ...metadata, body: await (form.get('file') as Blob).text() });
      return json({ id: `file-${uploads.length}` });
    }
    return json({}, 404);
  });
  return { fetcher, uploads };
}

const queues: CaptureQueue[] = [];
const makeQueue = () => { const queue = new CaptureQueue(`account-test-${crypto.randomUUID()}`); queues.push(queue); return queue; };
const okAnswer = (url: URL) => `https://x.chromiumapp.org/#access_token=token-1&expires_in=3600&state=${url.searchParams.get('state')}`;

beforeEach(() => { vi.stubGlobal('chrome', fakeChrome(okAnswer)); });
afterEach(async () => { vi.unstubAllGlobals(); for (const queue of queues.splice(0)) await queue.delete(); });

describe('account delivery from the extension', () => {
  it('signs in with the library’s client ID and delivers queued captures to the account’s Duckler folder', async () => {
    const google = fakeGoogle();
    vi.stubGlobal('fetch', google.fetcher);
    expect((await readAccount()).mode).toBe('paired'); // pairing stays the default
    expect(await signIn()).toEqual({ mode: 'account', email: 'ana@example.com' });
    const auth = new URL((chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>).mock.calls[0][0].url);
    expect(auth.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(auth.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');

    const queue = makeQueue();
    await queue.enqueue(capture('a')); await queue.enqueue(capture('b'));
    expect(await deliverToAccount(queue)).toBe(2);
    expect(await queue.captures.count()).toBe(0);
    expect(google.uploads.map(upload => [upload.parents[0], upload.appProperties])).toEqual([['root-1', { kind: 'capture', capture: 'a' }], ['root-1', { kind: 'capture', capture: 'b' }]]);
    expect(JSON.parse(google.uploads[0].body)).toMatchObject({ id: 'a', title: 'Thought a' });
  });

  it('keeps captures queued when Drive refuses them', async () => {
    vi.stubGlobal('fetch', fakeGoogle({ failUpload: true }).fetcher);
    const queue = makeQueue();
    await queue.enqueue(capture('c'));
    await expect(deliverToAccount(queue)).rejects.toThrow(/stays on this device/);
    expect(await queue.captures.count()).toBe(1);
  });

  it('refuses a sign-in answer that is not for its own request', async () => {
    vi.stubGlobal('chrome', fakeChrome(() => 'https://x.chromiumapp.org/#access_token=stolen&expires_in=3600&state=someone-else'));
    vi.stubGlobal('fetch', fakeGoogle().fetcher);
    await expect(accessToken(true)).rejects.toThrow(/did not finish/);
  });
});
