import { useState } from 'react';
import type { CollectionRecord } from '@visual-library/shared';
import type { DriveSync } from '../lib/useDriveSync';
import { getGoogleApiKey } from '../lib/shareLinks';
import { Dialog } from './Dialog';
import { BButton } from './BButton';

/** Share a collection as a view-only link, or stop sharing it. */
export function ShareDialog({ collection, drive, onClose }: { collection: CollectionRecord; drive: DriveSync; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const shared = drive.shares.get(collection.id);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy the link by selecting it.'); }
  };
  return <Dialog label={`Share ${collection.name}`} className="app-settings share-dialog" onClose={onClose}>
    <BButton className="close-detail" label="Close sharing" onClick={onClose} />
    <h2>Share “{collection.name}”</h2>
    {!drive.configured || !getGoogleApiKey()
      ? <p className="account-sync-note">Share links aren’t set up on this site yet.</p>
      : !drive.signedIn
        ? <>
          <p className="account-sync-note">Sign in with Google to share. The shared copy lives in your own Drive.</p>
          <button type="button" className="google-sign-in" disabled={busy} onClick={() => void run(drive.signIn)}>{busy ? 'Opening Google…' : drive.account ? `Continue as ${drive.account.name || drive.account.email}` : 'Sign in with Google'}</button>
        </>
        : shared
          ? <>
            <p className="account-sync-note">Anyone with this link can view this collection. They can’t change it. It updates when you change the collection.</p>
            <div className="share-link-row">
              <input readOnly aria-label="Share link" value={shared.url} onFocus={event => event.currentTarget.select()} />
              <button type="button" className="primary" onClick={() => void copy(shared.url)}>{copied ? 'Copied ✓' : 'Copy link'}</button>
            </div>
            <div className="avatar-crop-actions">
              <button type="button" disabled={busy} onClick={() => void run(() => drive.unshare(collection.id))}>{busy ? 'Stopping…' : 'Stop sharing'}</button>
            </div>
          </>
          : <>
            <p className="account-sync-note">Make a view-only link: anyone who has it can see these {collection.cardIds.length} cards and save a copy. The link is encrypted end to end, and you can turn it off at any time. Your profile name, picture and card are shown on it.</p>
            <div className="avatar-crop-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void run(async () => { const url = await drive.share(collection); await copy(url); })}>{busy ? 'Creating link…' : 'Create link'}</button>
            </div>
          </>}
    {error && <p className="profile-message error" role="alert">{error}</p>}
  </Dialog>;
}
