import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardRecord, CollectionRecord, ShareOwner } from '@visual-library/shared';
import { readCards, readCollections, LIBRARY_CHANGED_EVENT } from './cardDb';
import { DriveAuthError, driveClient, findOrCreateRoot, readLibraryFile, syncLibrary, type DriveClient } from './driveSync';
import { isGoogleDriveConfigured, loadGoogleIdentityScript, requestGoogleToken, revokeGoogleToken, type GoogleToken } from './googleDrive';
import { loadGoogleConfig } from './googleConfig';
import { listShares, refreshShares, shareCollection, shareUrl, stopSharing, type ShareRecord } from './shareLinks';

/** The signed-in Google account, remembered (without any token) so the app can offer "Continue as …". */
export type GoogleAccount = { email: string; name: string; photo?: string };
const ACCOUNT_KEY = 'duckler-google-account';
const readAccount = (): GoogleAccount | null => { try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null'); } catch { return null; } };
const writeAccount = (account: GoogleAccount | null) => { try { if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* private mode */ } };

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error' | 'expired';
export type DriveSync = {
  configured: boolean;
  account: GoogleAccount | null;
  signedIn: boolean;
  status: SyncStatus;
  message: string;
  lastSyncedAt: number | null;
  shares: Map<string, { share: ShareRecord; url: string }>;
  signIn: () => Promise<void>;
  signOut: () => void;
  syncNow: () => Promise<void>;
  share: (collection: CollectionRecord) => Promise<string>;
  unshare: (collectionId: string) => Promise<void>;
};

const SYNC_AFTER_CHANGE_MS = 3000;
const SYNC_EVERY_MS = 5 * 60 * 1000;

/**
 * Account + Drive sync for the whole app. Sync runs after sign-in, a few seconds after any local
 * change, when the window regains focus and every five minutes; runs never overlap. `onPulled`
 * is called when Drive brought changes, so the app can re-read its library.
 */
export function useDriveSync(onPulled: (cards: CardRecord[], collections: CollectionRecord[]) => void, owner: () => ShareOwner = () => ({ name: '' })): DriveSync {
  const [configured, setConfigured] = useState(isGoogleDriveConfigured);
  const [account, setAccount] = useState<GoogleAccount | null>(readAccount);
  const [token, setToken] = useState<GoogleToken | null>(null);
  const [status, setStatus] = useState<SyncStatus>(configured ? 'signed-out' : 'off');
  const [message, setMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [shares, setShares] = useState<DriveSync['shares']>(new Map());
  const session = useRef<{ drive: DriveClient; rootId: string } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const pulled = useRef(onPulled);
  pulled.current = onPulled;
  // Who share links show as the sharer: the Duckler profile name and photo, else the Google name.
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const sharer = useCallback((): ShareOwner => { const profile = ownerRef.current(); return { ...profile, name: profile.name || account?.name || '' }; }, [account?.name]);

  const fail = useCallback((error: unknown) => {
    if (error instanceof DriveAuthError) { session.current = null; setToken(null); setStatus('expired'); setMessage(error.message); return; }
    setStatus('error'); setMessage(error instanceof Error ? error.message : 'Sync failed. It will try again shortly.');
  }, []);

  const runSync = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    if (running.current) { again.current = true; return running.current; }
    running.current = (async () => {
      do {
        again.current = false;
        setStatus('syncing');
        try {
          const summary = await syncLibrary(current.drive, current.rootId);
          const [cards, collections] = await Promise.all([readCards(), readCollections()]);
          if (summary.received || summary.deleted) pulled.current(cards, collections);
          // Keep share links current with what was just synced.
          const [list, library] = await Promise.all([listShares(current.drive, current.rootId), readLibraryFile(current.drive, current.rootId)]);
          await refreshShares(current.drive, list, library.shareKeys, collections, cards, sharer());
          setShares(new Map(list.filter(share => library.shareKeys[share.collectionId]).map(share => [share.collectionId, { share, url: shareUrl(share.fileId, library.shareKeys[share.collectionId]) }])));
          setStatus('synced'); setMessage(''); setLastSyncedAt(Date.now());
        } catch (error) { fail(error); again.current = false; }
      } while (again.current);
    })().finally(() => { running.current = null; });
    return running.current;
  }, [fail, sharer]);

  const signIn = useCallback(async () => {
    try {
      const next = await requestGoogleToken(account?.email, !account);
      const drive = driveClient(next.accessToken);
      const about = await drive.about();
      const signedIn = { email: about.user?.emailAddress ?? '', name: about.user?.displayName ?? '', ...(about.user?.photoLink ? { photo: about.user.photoLink } : {}) };
      setAccount(signedIn); writeAccount(signedIn);
      session.current = { drive, rootId: await findOrCreateRoot(drive) };
      setToken(next);
      await runSync();
    } catch (error) { fail(error); throw error; }
  }, [account, fail, runSync]);

  const signOut = useCallback(() => {
    if (token) revokeGoogleToken(token.accessToken);
    session.current = null; setToken(null); setAccount(null); writeAccount(null);
    setShares(new Map()); setStatus(configured ? 'signed-out' : 'off'); setMessage(''); setLastSyncedAt(null);
  }, [configured, token]);

  const share = useCallback(async (collection: CollectionRecord) => {
    const current = session.current;
    if (!current) throw new Error('Sign in with Google to share collections.');
    const [cards, library] = await Promise.all([readCards(), readLibraryFile(current.drive, current.rootId)]);
    const result = await shareCollection(current.drive, current.rootId, collection, cards, sharer(), library.shareKeys);
    setShares(previous => new Map(previous).set(collection.id, { share: result.share, url: result.url }));
    return result.url;
  }, [sharer]);

  const unshare = useCallback(async (collectionId: string) => {
    const current = session.current, existing = shares.get(collectionId);
    if (!current || !existing) return;
    await stopSharing(current.drive, current.rootId, existing.share);
    setShares(previous => { const next = new Map(previous); next.delete(collectionId); return next; });
  }, [shares]);

  // Load Google's sign-in script early, so the Sign in click opens its window straight away.
  useEffect(() => { if (configured) void loadGoogleIdentityScript().catch(() => {}); }, [configured]);
  // The deployed site learns its Google values at runtime (/api/config).
  useEffect(() => {
    if (configured) return;
    let live = true;
    void loadGoogleConfig().then(found => { if (live && found.clientId) { setConfigured(true); setStatus(current => (current === 'off' ? 'signed-out' : current)); } });
    return () => { live = false; };
  }, [configured]);

  // Follow local changes, focus and a slow heartbeat while signed in.
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { void runSync(); }, SYNC_AFTER_CHANGE_MS); };
    const focus = () => { if (document.visibilityState === 'visible') void runSync(); };
    const beat = setInterval(() => { void runSync(); }, SYNC_EVERY_MS);
    // An expiring token is retired before Drive rejects it.
    const expiry = setTimeout(() => fail(new DriveAuthError()), Math.max(0, token.expiresAt - Date.now() - 60000));
    window.addEventListener(LIBRARY_CHANGED_EVENT, soon);
    document.addEventListener('visibilitychange', focus);
    return () => { clearTimeout(timer); clearTimeout(expiry); clearInterval(beat); window.removeEventListener(LIBRARY_CHANGED_EVENT, soon); document.removeEventListener('visibilitychange', focus); };
  }, [token, runSync, fail]);

  return { configured, account, signedIn: Boolean(token), status, message, lastSyncedAt, shares, signIn, signOut, syncNow: runSync, share, unshare };
}
