/**
 * Google sign-in for Drive sync (Google Identity Services token flow). Duckler has no accounts of its
 * own: the Google account is the account. The access token stays in memory only (never stored); after
 * a reload, signing in again takes one click. Scope drive.file: Duckler only sees files it created.
 */
import { googleConfig, loadGoogleConfig } from './googleConfig';

const driveScope = 'https://www.googleapis.com/auth/drive.file';

type TokenResponse = { error?: string; error_description?: string; access_token?: string; expires_in?: number };
type TokenClient = { requestAccessToken: (options?: { prompt?: string; login_hint?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback?: (error: { type?: string; message?: string }) => void }) => TokenClient;
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export const getGoogleDriveClientId = (): string => googleConfig().clientId;
export const isGoogleDriveConfigured = (): boolean => getGoogleDriveClientId().length > 0;

// One load per page. A failed load removes its script tag, so the next attempt starts clean instead
// of waiting forever on a tag whose load event already fired.
let scriptLoad: Promise<void> | null = null;
export const loadGoogleIdentityScript = (): Promise<void> => {
  if (typeof window === 'undefined' || window.google?.accounts?.oauth2) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    document.querySelector('script[data-google-drive-script="true"]')?.remove();
    const script = document.createElement('script');
    script.onload = () => { script.onload = script.onerror = null; resolve(); };
    script.onerror = () => {
      script.onload = script.onerror = null; script.remove(); scriptLoad = null;
      reject(new Error('Google sign-in could not load. Check your connection and try again.'));
    };
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.googleDriveScript = 'true';
    document.head.appendChild(script);
  });
  return scriptLoad;
};

export type GoogleToken = { accessToken: string; expiresAt: number };

/** Opens Google's sign-in (must run from a click). `hint` pre-selects a known account. */
export async function requestGoogleToken(hint?: string, firstTime = false): Promise<GoogleToken> {
  const clientId = getGoogleDriveClientId() || (await loadGoogleConfig()).clientId;
  if (!clientId) throw new Error('Google sign-in is not set up on this site yet.');
  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in is not available in this browser.');
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback: response => {
        if (response.error || !response.access_token) { reject(new Error(response.error_description || 'Google sign-in was cancelled.')); return; }
        resolve({ accessToken: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 });
      },
      error_callback: error => reject(new Error(error.type === 'popup_closed' ? 'Google sign-in was closed before finishing.' : error.message || 'Google sign-in failed.')),
    });
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '', ...(hint ? { login_hint: hint } : {}) });
  });
}

export function revokeGoogleToken(token: string) {
  try { window.google?.accounts?.oauth2?.revoke?.(token); } catch { /* signing out locally is enough */ }
}
