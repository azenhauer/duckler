import { useState } from 'react';
import type { DriveSync } from '../lib/useDriveSync';

const ago = (time: number | null) => {
  if (!time) return '';
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

export const syncLabel = (drive: DriveSync) => ({
  off: 'Local only',
  'signed-out': drive.account ? 'Sync paused · sign in to resume' : 'Local only',
  syncing: 'Syncing with Drive…',
  synced: `Synced ${ago(drive.lastSyncedAt)}`,
  error: 'Sync problem',
  expired: 'Sign in again to sync',
}[drive.status]);

/** Settings section: the Google account is the Duckler account; the library syncs to its Drive. */
export function AccountSync({ drive }: { drive: DriveSync }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  if (!drive.configured) return <div className="account-sync">
    <p className="account-sync-note">Google sign-in isn’t set up on this site yet, so your library stays on this device. Export a backup now and then.</p>
  </div>;
  if (!drive.signedIn) return <div className="account-sync">
    <p className="account-sync-note">{drive.account
      ? <>Signed in as <strong>{drive.account.email}</strong> before. Sign in again to keep your library in sync.</>
      : 'Sign in with Google to keep your library in your own Google Drive and on all your devices, and to share collections by link.'}</p>
    <button type="button" className="google-sign-in" disabled={busy} onClick={() => void run(drive.signIn)}>
      <svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>
      {busy ? 'Opening Google…' : drive.account ? `Continue as ${drive.account.name || drive.account.email}` : 'Sign in with Google'}
    </button>
    {drive.account && <button type="button" className="account-sync-link" onClick={() => void drive.signOut()}>Use another account</button>}
    {(error || drive.message) && <p className="profile-message error" role="alert">{error || drive.message}</p>}
  </div>;
  return <div className="account-sync">
    <p className="account-sync-who"><strong>{drive.account?.name || drive.account?.email}</strong><span>{drive.account?.email}</span></p>
    <p className={`account-sync-state is-${drive.status}`} role="status">{syncLabel(drive)}</p>
    {drive.status === 'error' && drive.message && <p className="profile-message error" role="alert">{drive.message}</p>}
    <div className="account-sync-actions">
      <button type="button" disabled={busy || drive.status === 'syncing'} onClick={() => void run(drive.syncNow)}>Sync now</button>
      <button type="button" onClick={() => void drive.signOut()}>Sign out</button>
    </div>
    <button type="button" className="account-sync-link" onClick={() => { if (window.confirm('Sign out and remove this account’s library from this device? It stays in your Google Drive and comes back when you sign in again.')) void drive.signOut(true); }}>Sign out and remove from this device</button>
    <p className="account-sync-note">Your library is in the “Duckler” folder of your Google Drive. Duckler can only see files it created there. Each Google account has its own library on this device.</p>
    {error && <p className="profile-message error" role="alert">{error}</p>}
  </div>;
}
