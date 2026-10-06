/**
 * Account delivery: instead of handing captures to one paired library tab, the extension signs in to
 * the same Google account as the library and puts each capture in that account's Duckler folder on
 * Drive. Any library signed in to the account (any device) imports them on its next sync. Pairing stays
 * the way for local, non-Drive use.
 *
 * The access token lives in chrome.storage.session (memory only, gone when the browser closes); scope
 * drive.file, so the extension only sees files the Duckler app created.
 */
import type { CaptureQueue } from './queue';

export type DeliveryMode = 'paired' | 'account';
export type AccountState = { mode: DeliveryMode; email: string };

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SETTINGS = 'duckler-account';
const TOKEN = 'duckler-account-token';

/** The library this build talks to (from the manifest), where its public Google client ID is served. */
export const libraryOrigin = () => {
  const match = chrome.runtime.getManifest().externally_connectable?.matches?.[0] ?? 'https://duckler.pages.dev/*';
  return new URL(match.replace('/*', '/')).origin;
};

export async function readAccount(): Promise<AccountState> {
  const stored = (await chrome.storage.local.get(SETTINGS))[SETTINGS] as Partial<AccountState> | undefined;
  return { mode: stored?.mode === 'account' ? 'account' : 'paired', email: typeof stored?.email === 'string' ? stored.email : '' };
}
const writeAccount = (state: AccountState) => chrome.storage.local.set({ [SETTINGS]: state });

async function clientId(): Promise<string> {
  const response = await fetch(`${libraryOrigin()}/api/config`, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
  const body = response.ok ? await response.json() as { googleClientId?: unknown } : {};
  const id = typeof body.googleClientId === 'string' ? body.googleClientId : '';
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Google sign-in is not set up on your library yet.');
  return id;
}

/** A valid access token; `interactive` may show Google's account window (only from a click). */
export async function accessToken(interactive: boolean): Promise<string> {
  const cached = (await chrome.storage.session.get(TOKEN))[TOKEN] as { token: string; expiresAt: number } | undefined;
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const { email } = await readAccount();
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: await clientId(), response_type: 'token', redirect_uri: chrome.identity.getRedirectURL(), scope: SCOPE, state,
    prompt: interactive ? 'select_account' : 'none', ...(email ? { login_hint: email } : {}),
  }).toString();
  const redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive });
  const answer = new URLSearchParams(new URL(redirect ?? 'about:blank').hash.slice(1));
  const token = answer.get('access_token');
  if (answer.get('state') !== state || !token) throw new Error(answer.get('error') === 'interaction_required' ? 'Sign in to Google again in Duckler Capture settings.' : 'Google sign-in did not finish.');
  await chrome.storage.session.set({ [TOKEN]: { token, expiresAt: Date.now() + Number(answer.get('expires_in') ?? 3600) * 1000 } });
  return token;
}

const drive = async (token: string, url: string, init: RequestInit = {}) => {
  const response = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (response.status === 401) { await chrome.storage.session.remove(TOKEN); throw new Error('Google sign-in expired. Sign in again in Duckler Capture settings.'); }
  if (!response.ok) throw new Error(`Google Drive answered ${response.status}. The capture stays on this device.`);
  return response;
};

export async function signIn(): Promise<AccountState> {
  const token = await accessToken(true);
  const about = await (await drive(token, `${API}/about?fields=user(emailAddress)`)).json() as { user?: { emailAddress?: string } };
  const state: AccountState = { mode: 'account', email: about.user?.emailAddress ?? '' };
  await writeAccount(state);
  return state;
}

export async function signOut(): Promise<AccountState> {
  const cached = (await chrome.storage.session.get(TOKEN))[TOKEN] as { token: string } | undefined;
  await chrome.storage.session.remove(TOKEN);
  if (cached) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cached.token)}`, { method: 'POST' }).catch(() => {});
  const state: AccountState = { mode: 'paired', email: '' };
  await writeAccount(state);
  return state;
}

/** The same Duckler folder the library uses (found by its app property; made if this is the first device). */
async function rootFolder(token: string): Promise<string> {
  const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='duckler' and value='root' } and trashed = false");
  const found = await (await drive(token, `${API}/files?q=${q}&spaces=drive&fields=files(id)`)).json() as { files?: { id: string }[] };
  if (found.files?.[0]) return found.files[0].id;
  const made = await (await drive(token, `${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Duckler', mimeType: 'application/vnd.google-apps.folder', appProperties: { duckler: 'root' } }) })).json() as { id: string };
  return made.id;
}

/**
 * Uploads every queued capture to the account's Drive and removes each from the queue once Drive has it.
 * Without a token (signed out, or a click is needed) nothing happens and the captures wait.
 */
export async function deliverToAccount(queue: CaptureQueue, interactive = false): Promise<number> {
  const rows = await queue.captures.orderBy('createdAt').toArray();
  if (!rows.length) return 0;
  const token = await accessToken(interactive);
  const parent = await rootFolder(token);
  let sent = 0;
  for (const row of rows) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: `capture-${row.id}.json`, parents: [parent], appProperties: { kind: 'capture', capture: row.id } })], { type: 'application/json' }));
    form.append('file', new Blob([row.bytes.slice().buffer as ArrayBuffer], { type: 'application/json' }));
    await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form });
    await queue.captures.delete(row.id);
    sent++;
  }
  return sent;
}
