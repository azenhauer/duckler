import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '@xyflow/react/dist/style.css';
import {
  acknowledgeCapture,
  createCardFromInput,
  createCaptureReceipt,
  createCollectionFromInput,
  createObsidianExportArchive,
  createSyncReducerState,
  dedupeQueueItems,
  enqueueCapture,
  collectionParentError,
  appendCanvasesToObsidianArchive,
  buildSearchText,
  createLibraryBackup,
  orderCollectionTree,
  parseLibraryBackup,
  toggleCardInCollection,
  type CaptureQueueItem,
  type CardRecord,
  type CollectionRecord,
} from '@visual-library/shared';
import {
  deleteCollection,
  readCanvasBackups,
  readCards,
  readCollections,
  removeCard,
  restoreCards,
  restoreLibraryBackup,
  saveCard,
  saveCardThumb,
  saveCardWithCollections,
  linkCards,
  saveCollection,
  setCardCollectionMembership,
} from './lib/cardDb';
import { useDriveSync } from './lib/useDriveSync';
import { AccountSync, syncLabel } from './components/AccountSync';
import { ShareDialog } from './components/ShareDialog';
import { CollectionDescription } from './components/CollectionDescription';
import { ProfileHover } from './components/ProfileHover';
import { clearPendingShareItems, readPendingShareItems, type PendingShareItem } from './lib/shareQueue';
import { parseShareTargetFallback } from './lib/shareTargetFallback';
import { startExtensionBridge, getExtensionConnection } from './lib/extensionBridge';
import { appendToNote, isExternalDrop, readDrop, type DroppedItem } from './lib/drop';
import { ExtensionSetup } from './components/ExtensionSetup';
import { Dialog } from './components/Dialog';
import { SoundButton, UI_SOUND_EVENT, useUiSounds } from './components/UiSounds';
import { AppearanceSettings, appearancePresetNames } from './components/AppearanceSettings';
import { CardStyleSettings } from './components/CardStyleSettings';
import { useCardStyle } from './lib/cardStyle';
import { APPEARANCE_STORAGE_KEY, appearancePresets, appearanceStyle, loadAppearance, type AppearancePreset } from './lib/appearance';
import { NavigationIcon } from './components/NavigationIcon';
import { HOVER_CLOSE_DELAY, detailsHover, useHoverIntent } from './lib/hoverIntent';
import { useExitAnimation } from './lib/exitAnimation';
import { InterfaceIcon } from './components/InterfaceIcon';
import { CanvasGallery } from './components/CanvasGallery';
import { Notifications, notify } from './components/Notifications';
import { BButton } from './components/BButton';
import { ColorPopover } from './components/ColorPicker';
import { TileMenu } from './components/TileMenu';
import { inferImageTitle } from './lib/imageName';
import { AvatarCropper, CARD_IMAGE_SHAPE } from './components/AvatarCropper';
import { EditableName } from './components/EditableName';
import { LibraryCard, type CardApi } from './components/LibraryCard';
import { CollectionPickerPopover } from './components/CollectionPicker';
import { ShortcutLegend, ShortcutTables } from './components/ShortcutLegend';

// The canvas (React Flow) and the card editor are separate chunks, fetched when the app is idle so they
// open without delay but do not slow the first screen. React Flow's stylesheet stays in the main CSS.
const loadCardEditor = () => import('./components/CardEditor');
const loadCollectionCanvas = () => import('./components/CollectionCanvas');
const CardEditor = lazy(() => loadCardEditor().then(module => ({ default: module.CardEditor })));
const CollectionCanvas = lazy(() => loadCollectionCanvas().then(module => ({ default: module.CollectionCanvas })));
const preloadViews = () => { void loadCardEditor().catch(() => {}); void loadCollectionCanvas().catch(() => {}); };

/** The built-in Favorites area is opened like a collection, under this id (it is not a stored collection). */
const FAVORITES_ID = 'favorites';

const emptyForm = {
  type: 'bookmark' as CardRecord['type'],
  title: '',
  note: '',
  sourceUrl: '',
  tags: '',
};

const emptyCollectionForm = {
  name: '',
};


type TypeFilter = 'all' | 'image' | 'link' | 'text';
/** A short title from the first words of a text (whole words, about 60 characters). */
const titleFromText = (text: string) => {
  const words = text.replace(/\s+/g, ' ').trim();
  return words.length > 60 ? `${words.slice(0, 57).replace(/\s\S*$/, '')}…` : words;
};
/** A link's site name ("example.com"), used when a dropped link has no title yet. */
const titleFromUrl = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } };
type SortMode = 'newest' | 'oldest';
type ActiveView = 'home' | 'library' | 'collections' | 'canvas';
type NavigationEntry = { view: ActiveView; collectionId: string | null; canvasId: string | null };
const isNavigationEntry = (value: unknown): value is NavigationEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const id = (item: unknown) => item === null || (typeof item === 'string' && item.length > 0 && item.length <= 200);
  return ['home', 'library', 'collections', 'canvas'].includes(entry.view as string) && id(entry.collectionId) && id(entry.canvasId);
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const createCardFromSharedItem = (item: PendingShareItem): CardRecord | null => {
  const resolvedTitle = (item.title ?? item.text ?? item.url ?? '').trim();
  if (!resolvedTitle) {
    return null;
  }

  const isBookmark = Boolean(item.url) || /^https?:\/\//i.test((item.text ?? '').trim());
  const note = item.text && item.url ? item.text : item.text && !item.url ? item.text : '';

  return createCardFromInput({
    id: item.id,
    type: isBookmark ? 'bookmark' : 'text',
    title: resolvedTitle,
    sourceUrl: item.url || undefined,
    note,
    tags: ['shared'],
  });
};

// Profile images are only used when they are raster data URLs (what the cropper saves), never other text.
const SAFE_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const storedImage = (key: string) => { try { const value = localStorage.getItem(key) ?? ''; return SAFE_IMAGE.test(value) ? value : ''; } catch { return ''; } };

// A reload keeps the page you were on: the browser keeps each history entry's state across reloads.
const startEntry = (): NavigationEntry => {
  try { const entry = window.history.state?.duckler; if (isNavigationEntry(entry)) return entry; } catch { /* no history */ }
  return { view: 'home', collectionId: null, canvasId: null };
};

function App() {
  const sounds = useUiSounds();
  const [initialEntry] = useState(startEntry);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(initialEntry.collectionId);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>(initialEntry.view);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(initialEntry.canvasId);
  const navigationHistory = useRef<NavigationEntry[]>([]);
  const searchReturn = useRef(false);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const entry: NavigationEntry = isNavigationEntry(event.state?.duckler) ? event.state.duckler : { view: 'home', collectionId: null, canvasId: null };
      navigationHistory.current.pop();
      searchReturn.current = false;
      setActiveView(entry.view);
      setSelectedCollectionId(entry.collectionId);
      setSelectedCanvasId(entry.canvasId);
      setSearchTerm('');
      setTypeFilter('all');
      setSelectedId(null);
      setSelectedCardIds([]);
      setCollectionMenuOpen(false);
      // Back/Forward return to where the page was scrolled (saved on the entry when leaving it).
      const scrollY = typeof event.state?.scrollY === 'number' ? event.state.scrollY : 0;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' })));
    };
    // The app restores scroll itself, after the view has rendered.
    try { window.history.scrollRestoration = 'manual'; } catch { /* unsupported */ }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const [profileName, setProfileName] = useState(() => localStorage.getItem('visual-library-profile-name') ?? 'My Library');
  const [profileTag, setProfileTag] = useState(() => localStorage.getItem('visual-library-profile-tag') ?? '');
  const [profileBio, setProfileBio] = useState(() => (localStorage.getItem('duckler-profile-bio') ?? '').slice(0, 256));
  const profileColorInputRef = useRef<HTMLInputElement | null>(null);
  // Clicking the identity card itself (not the photo) opens its colour picker.
  const [profileColorAnchor, setProfileColorAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => { colorPickerOpenRef.current = !!profileColorAnchor; }, [profileColorAnchor]);
  const pickCardColor = (event: React.MouseEvent<HTMLElement>) => { if (!(event.target as HTMLElement).closest('.avatar-upload, .profile-card-image')) setProfileColorAnchor(event.currentTarget); };
  const [profilePhoto, setProfilePhoto] = useState(() => storedImage('visual-library-profile-photo'));
  const [profileCropFile, setProfileCropFile] = useState<File | null>(null);
  // The profile card's own image, shown translucent behind the name (cropped and compressed like the photo).
  const [profileCover, setProfileCover] = useState(() => storedImage('duckler-profile-cover'));
  const [profileCoverFile, setProfileCoverFile] = useState<File | null>(null);
  const coverStyle = profileCover ? { '--profile-cover': `url("${profileCover}")` } as CSSProperties : undefined;
  const [profileCardColor, setProfileCardColor] = useState(() => {
    const saved = localStorage.getItem('duckler-profile-card-color');
    return saved && /^#[\da-f]{6}$/i.test(saved) ? saved : '#779b91';
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState(false);
  const displayProfileName = profileName.trim() || 'My Library';
  const displayProfileTag = profileTag.trim().replace(/^@+/, '');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [captureQueue, setCaptureQueue] = useState<CaptureQueueItem[]>([]);
  const [captureReceipts, setCaptureReceipts] = useState<Record<string, string>>({});
  // Google account + Drive sync. When Drive brings changes, the library re-reads them.
  // Bumped when Drive brought changes, so an open canvas reloads what another device saved.
  const [pulledVersion, setPulledVersion] = useState(0);
  const selectedCollectionIdRef = useRef<string | null>(null);
  const navigateHomeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(preloadViews);
    return () => cancel(handle);
  }, []);
  const drive = useDriveSync((nextCards, nextCollections) => {
    setCards(nextCards); setCollections(nextCollections); setPulledVersion(version => version + 1);
    // After an account switch the open collection or canvas may not exist in the new library.
    const openId = selectedCollectionIdRef.current;
    if (openId && openId !== FAVORITES_ID && !nextCollections.some(collection => collection.id === openId)) navigateHomeRef.current();
  }, () => ({
    name: displayProfileName === 'My Library' ? '' : displayProfileName, photo: profilePhoto || undefined,
    tag: displayProfileTag || undefined, bio: profileBio || undefined, color: profileCardColor, cover: profileCover || undefined,
  }));
  const [shareCollectionId, setShareCollectionId] = useState<string | null>(null);
  // Shared-in items waiting for the person to accept them (see the share import on load).
  const [incomingShares, setIncomingShares] = useState<CardRecord[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('duckler-theme-mode') ?? localStorage.getItem('visual-library-theme');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
  });
  const [appearance, setAppearance] = useState(loadAppearance);
  const cardStyle = useCardStyle();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  const [extensionSetupOpen, setExtensionSetupOpen] = useState(false);
  const [extensionConnectionVersion, setExtensionConnectionVersion] = useState(0);
  const [extensionStatus, setExtensionStatus] = useState(() => getExtensionConnection() ? 'Connecting extension…' : '');
  const [cardSize, setCardSize] = useState(() => localStorage.getItem('duckler-card-size') ?? 'comfortable');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [quickAddPosition, setQuickAddPosition] = useState<{ left: number; top: number } | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usageMb: number; quotaMb: number; persisted: boolean } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [collectionForm, setCollectionForm] = useState(emptyCollectionForm);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [cardComposerOpen, setCardComposerOpen] = useState(false);
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [newlyCreatedCardId, setNewlyCreatedCardId] = useState<string | null>(null);
  const [capturedCardIds, setCapturedCardIds] = useState<string[]>([]);
  const knownCardIds = useRef<Set<string> | null>(null);
  const [removingCardIds, setRemovingCardIds] = useState<string[]>([]);
  const [undoMembership, setUndoMembership] = useState<{ cardId: string; collection: CollectionRecord } | null>(null);
  // Cards just deleted, with the collections they were in, while their Undo is offered.
  const [undoDelete, setUndoDelete] = useState<{ cards: CardRecord[]; memberships: Record<string, string[]> } | null>(null);
  useEffect(() => {
    if (!undoDelete) return;
    const timeout = window.setTimeout(() => setUndoDelete(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoDelete]);
  const [membershipSaving, setMembershipSaving] = useState(false);
  const membershipSavingRef = useRef(false);
  const membershipInFlight = useRef(new Set<string>());
  const membershipDesired = useRef(new Map<string, boolean>());
  useEffect(() => {
    if (!undoMembership || membershipSaving) return;
    const timeout = window.setTimeout(() => setUndoMembership(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoMembership, membershipSaving]);
  const composerSavingRef = useRef(false);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [composerSourceOpen, setComposerSourceOpen] = useState(false);
  const [composerCollectionsOpen, setComposerCollectionsOpen] = useState(false);
  const [newCardCollectionIds, setNewCardCollectionIds] = useState<string[]>([]);
  const composerNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const cardComposerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const collectionMenuRef = useRef<HTMLDivElement | null>(null);
  const collectionsRef = useRef<CollectionRecord[]>([]);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const backupPickerRef = useRef<HTMLInputElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuExitRef = useExitAnimation<HTMLDivElement>();
  const addMenuExitRef = useExitAnimation<HTMLDivElement>();
  // While the profile colour picker is open it counts as part of the account menu, so the menu stays.
  const colorPickerOpenRef = useRef(false);
  const accountHover = useHoverIntent(useCallback((open: boolean) => { if (!open && colorPickerOpenRef.current) return; if (!open || !settingsOpenRef.current) setAccountMenuOpen(open); }, []),
    // Trigger and popover are siblings: leaving one, the pointer may be heading to the other.
    { menu: left => left.closest('.account-menu') ? accountTriggerRef.current : document.querySelector('.account-menu') });
  const addHover = useHoverIntent(setAddMenuOpen);
  const collectionHover = useHoverIntent(setCollectionMenuOpen);
  const cardComposerWasOpenRef = useRef(false);

  useEffect(() => { collectionsRef.current = collections; }, [collections]);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  }, [appearance]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('visual-library-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleOnlineStatus = () => setIsOffline(!navigator.onLine);

    const measureStorage = async () => {
      if (!('storage' in navigator) || typeof navigator.storage?.estimate !== 'function') {
        return;
      }

      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;

      let persisted = false;
      if ('persist' in navigator.storage) {
        persisted = await navigator.storage.persist().catch(() => false);
      }

      setStorageEstimate({
        usageMb: usage / (1024 * 1024),
        quotaMb: quota / (1024 * 1024),
        persisted,
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    setIsOffline(!navigator.onLine);
    void measureStorage();

    // Items shared into Duckler (the OS share sheet, or its no-service-worker fallback in the address)
    // are never saved on their own: any website can submit that form or link to that address, so the
    // person confirms them first. The address parameters are removed straight away.
    let fallbackShare: PendingShareItem | null = null;
    let fallbackShareError: string | null = null;
    try {
      fallbackShare = parseShareTargetFallback(window.location.search);
    } catch (error) {
      fallbackShareError = error instanceof Error ? error.message : 'The shared item could not be read.';
    }
    if (['sharedId', 'sharedTitle', 'sharedText', 'sharedUrl'].some(key => new URLSearchParams(window.location.search).has(key))) {
      const cleanUrl = new URL(window.location.href);
      ['sharedId', 'sharedTitle', 'sharedText', 'sharedUrl'].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }

    void Promise.all([readCards(), readCollections(), readPendingShareItems()]).then(async ([storedCards, storedCollections, pendingSharedItems]) => {
      const shareItems = fallbackShare ? [...pendingSharedItems, fallbackShare] : pendingSharedItems;
      const incoming = shareItems
        .map((item) => createCardFromSharedItem(item))
        .filter((card): card is CardRecord => Boolean(card))
        .filter((card, index, all) => all.findIndex((candidate) => candidate.id === card.id) === index)
        .filter((card) => !storedCards.some((stored) => stored.id === card.id));
      if (pendingSharedItems.length) void clearPendingShareItems();
      setCollections(storedCollections);
      setCards(storedCards);
      if (incoming.length) setIncomingShares(incoming);
      else if (fallbackShareError) notify({ kind: 'error', title: 'Share failed', detail: fallbackShareError });
    }).catch((error: unknown) => {
      notify({ kind: 'error', title: 'Library not loaded', detail: error instanceof Error ? error.message : 'The library could not be read.' });
    }).finally(() => setLibraryLoaded(true));

    const storedQueue = localStorage.getItem('visual-library-capture-queue');
    if (storedQueue) {
      try {
        setCaptureQueue(dedupeQueueItems(JSON.parse(storedQueue) as CaptureQueueItem[]));
      } catch {
        setCaptureQueue([]);
      }
    }

    const storedReceipts = localStorage.getItem('visual-library-capture-receipts');
    if (storedReceipts) {
      try {
        setCaptureReceipts(JSON.parse(storedReceipts) as Record<string, string>);
      } catch {
        setCaptureReceipts({});
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  // A screenshot that newly arrives (extension, share sheet, upload or composer) gets a shutter cue and flash.
  // The first load and large batches such as a backup restore stay quiet.
  useEffect(() => {
    if (!libraryLoaded) return;
    const known = knownCardIds.current;
    knownCardIds.current = new Set(cards.map(card => card.id));
    if (!known) return;
    const fresh = cards.filter(card => card.type === 'image' && !card.trashed && !known.has(card.id)).map(card => card.id);
    if (!fresh.length || fresh.length > 5) return;
    setCapturedCardIds(current => [...new Set([...current, ...fresh])]);
    window.dispatchEvent(new CustomEvent(UI_SOUND_EVENT, { detail: 'capture' }));
    const timeout = window.setTimeout(() => setCapturedCardIds(current => current.filter(id => !fresh.includes(id))), 1100);
    return () => window.clearTimeout(timeout);
  }, [cards, libraryLoaded]);

  useEffect(() => {
    let disposed = false;
    let connectionNotified = false;
    const stop = startExtensionBridge(() => {
      void Promise.all([readCards(), readCollections()]).then(([nextCards, nextCollections]) => {
        if (disposed) return;
        setCards(nextCards);
        if (nextCollections.length) setCollections(nextCollections);
      });
    }, setExtensionStatus, () => collectionsRef.current.map(collection => ({ id: collection.id, name: collection.name, cardCount: collection.cardIds.length })), () => {
      setExtensionStatus('Extension connected');
      if (!connectionNotified) {
        connectionNotified = true;
        notify({ title: 'Extension connected', detail: 'Duckler Capture is ready to send captures to this library.' });
      }
    });
    return () => { disposed = true; stop(); };
  }, [extensionConnectionVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when pairing changes
  const extensionPaired = useMemo(() => Boolean(getExtensionConnection()), [extensionConnectionVersion]);

  useEffect(() => { localStorage.setItem('duckler-card-size', cardSize); }, [cardSize]);

  useEffect(() => {
    let frame = 0;
    const content = contentRef.current;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => {
      frame = 0;
      const search = searchBarRef.current;
      if (!search) return;
      const searchBounds = search.getBoundingClientRect();
      const stickyTop = Number.parseFloat(getComputedStyle(search).top) || 20;
      const docked = window.scrollY > 0 && searchBounds.top <= stickyTop + 1;
      search.dataset.docked = String(docked);
      // Cards no longer shift away from the docked search: measuring every card on scroll cost frames.
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    motion?.addEventListener('change', schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      motion?.removeEventListener('change', schedule);
      content?.querySelectorAll<HTMLElement>('.library-card').forEach(card => card.style.removeProperty('--search-clearance'));
    };
  }, [activeView, cards, cardSize, libraryLoaded, searchTerm, typeFilter, selectedCollectionId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('visual-library-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('duckler-theme-mode', themeMode);
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => {
      setTheme(themeMode === 'system' ? query?.matches ? 'dark' : 'light' : themeMode);
      const icon = document.querySelector<HTMLLinkElement>('link[data-browser-icon]');
      if (icon) icon.href = `/icons/duck-tab-${query?.matches ? 'dark' : 'light'}.png`;
    };
    update();
    query?.addEventListener('change', update);
    return () => query?.removeEventListener('change', update);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem('visual-library-profile-name', displayProfileName);
  }, [displayProfileName]);

  useEffect(() => {
    localStorage.setItem('visual-library-profile-tag', displayProfileTag);
  }, [displayProfileTag]);

  useEffect(() => { localStorage.setItem('duckler-profile-card-color', profileCardColor); }, [profileCardColor]);
  useEffect(() => { try { localStorage.setItem('duckler-profile-bio', profileBio); } catch { /* Keep in memory. */ } }, [profileBio]);

  useEffect(() => {
    if (!cardComposerOpen) {
      if (cardComposerWasOpenRef.current) {
        cardComposerTriggerRef.current?.focus();
        cardComposerWasOpenRef.current = false;
      }
      return;
    }

    cardComposerWasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const titleField = document.getElementById('new-card-title');
    titleField?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !composerSavingRef.current) {
        event.preventDefault(); // used: Esc does not also go back
        setCardComposerOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [cardComposerOpen]);

  useEffect(() => {
    if (!addMenuOpen && !collectionMenuOpen && !profileOpen && !accountMenuOpen && !quickAddPosition) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (addMenuOpen && !addMenuRef.current?.contains(event.target)) {
        setAddMenuOpen(false);
      }
      if (collectionMenuOpen && !collectionMenuRef.current?.contains(event.target)) {
        setCollectionMenuOpen(false);
      }
      if (profileOpen && !profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
      if (accountMenuOpen && !profileMenuRef.current?.contains(event.target) && !(event.target instanceof Element && event.target.closest('.color-pop'))) {
        setAccountMenuOpen(false);
      }
      // Only presses outside the menu close it; closing on a press inside removed the item before its click.
      if (quickAddPosition && !quickAddRef.current?.contains(event.target)) setQuickAddPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault(); // a menu was open: Esc closes it and does not also go back
      if (addMenuOpen) {
        setAddMenuOpen(false);
        // Focus returns to +, which must not reopen the menu it just closed.
        skipAddFocusOpen.current = true;
        cardComposerTriggerRef.current?.focus();
      }
      if (collectionMenuOpen) {
        setCollectionMenuOpen(false);
      }
      if (profileOpen) {
        setProfileOpen(false);
      }
      if (accountMenuOpen) {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
      if (quickAddPosition) setQuickAddPosition(null);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [addMenuOpen, collectionMenuOpen, profileOpen, accountMenuOpen, quickAddPosition]);

  useEffect(() => {
    localStorage.setItem('visual-library-capture-queue', JSON.stringify(captureQueue));
  }, [captureQueue]);

  useEffect(() => {
    localStorage.setItem('visual-library-capture-receipts', JSON.stringify(captureReceipts));
  }, [captureReceipts]);

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null;
  const selectedCanvas = collections.find(collection => collection.id === selectedCanvasId) ?? null;
  const isHome = activeView === 'home';
  const activeCardCount = cards.filter(card => !card.trashed).length;
  const favoriteCount = useMemo(() => cards.filter(card => card.favorite && !card.trashed).length, [cards]);
  const showLibraryFilters = activeView === 'library';
  // The search field always works on what the current page shows.
  const searchPlaceholder = isHome ? 'Search refs'
    : activeView === 'collections' ? 'Search collections'
    : activeView === 'canvas' ? 'Search canvases'
    : selectedCollection ? `Search ${selectedCollection.name}` : selectedCollectionId === FAVORITES_ID ? 'Search favorites' : 'Search all notes';
  const showAllCardsTile = !searchTerm.trim() || 'all cards'.includes(searchTerm.trim().toLocaleLowerCase());
  const visibleCollections = searchTerm.trim()
    ? collections.filter(collection => collection.name.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase()))
    : collections;

  const navigateTo = (view: ActiveView, collectionId: string | null = null) => {
    searchReturn.current = false;
    const changed = view !== activeView || collectionId !== (view === 'canvas' ? selectedCanvasId : view === 'library' ? selectedCollectionId : null);
    if (view === 'home') navigationHistory.current = [];
    else if (changed) {
      navigationHistory.current.push({ view: activeView, collectionId: selectedCollectionId, canvasId: selectedCanvasId });
    }
    // Mirror in-app navigation into browser history so Back/Forward move between collections.
    if (changed) {
      const entry: NavigationEntry = { view, collectionId: view === 'library' ? collectionId : null, canvasId: view === 'canvas' ? collectionId : null };
      try {
        window.history.replaceState({ ...(window.history.state ?? {}), scrollY: window.scrollY }, ''); // where this page was
        window.history.pushState({ ...(window.history.state ?? {}), scrollY: 0, duckler: entry }, '');
      } catch { /* History is optional. */ }
    }
    setActiveView(view);
    setSelectedCollectionId(view === 'library' ? collectionId : null);
    setSelectedCanvasId(view === 'canvas' ? collectionId : null);
    setSelectedId(null);
    setSelectedCardIds([]);
    setSearchTerm('');
    setTypeFilter('all');
    setProfileOpen(false);
    setCollectionMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  selectedCollectionIdRef.current = activeView === 'canvas' ? selectedCanvasId : selectedCollectionId;
  navigateHomeRef.current = () => navigateTo('home');
  // Typing on Home jumps to All cards; emptying that search goes back to where it started.
  const changeSearch = (value: string) => {
    if (isHome && value.trim()) { navigateTo('library'); searchReturn.current = true; }
    setSearchTerm(value);
    if (!value.trim() && searchReturn.current) { searchReturn.current = false; goBack(); }
  };
  const goBack = () => {
    searchReturn.current = false;
    if (isNavigationEntry(window.history.state?.duckler)) { window.history.back(); return; }
    const previous = navigationHistory.current.pop() ?? { view: 'home' as const, collectionId: null, canvasId: null };
    setActiveView(previous.view);
    setSelectedCollectionId(previous.collectionId);
    setSelectedCanvasId(previous.canvasId);
    setSearchTerm('');
    setTypeFilter('all');
    setSelectedId(null);
    setSelectedCardIds([]);
    setCollectionMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const visibleCards = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return [...cards]
      .filter((card) => {
        if (card.trashed) {
          return false;
        }

        if (selectedCollection && !selectedCollection.cardIds.includes(card.id)) {
          return false;
        }

        if (selectedCollectionId === FAVORITES_ID && !card.favorite) {
          return false;
        }

        if (typeFilter === 'image' && card.type !== 'image') {
          return false;
        }

        if (typeFilter === 'link' && card.type !== 'bookmark') {
          return false;
        }

        if (typeFilter === 'text' && card.type !== 'text') {
          return false;
        }

        if (!normalized) {
          return true;
        }

        return card.searchText.toLowerCase().includes(normalized);
      })
      .sort((left, right) => {
        const leftTime = new Date(left.updatedAt).getTime();
        const rightTime = new Date(right.updatedAt).getTime();
        return sortMode === 'newest' ? rightTime - leftTime : leftTime - rightTime;
      });
  }, [cards, searchTerm, selectedCollection, selectedCollectionId, sortMode, typeFilter]);

  // ---- Connected cards ("dialogues") and notes made from selected text ----
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [textMenu, setTextMenu] = useState<{ left: number; top: number; text: string; cardId: string } | null>(null);
  useEffect(() => {
    if (!connectFrom) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setConnectFrom(null); } };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, [connectFrom]);
  const connectCards = async (aId: string, bId: string, connect = true) => {
    setConnectFrom(null);
    if (aId === bId) return;
    try {
      const [a, b] = await linkCards(aId, bId, connect);
      setCards(current => current.map(card => card.id === a.id ? a : card.id === b.id ? b : card));
      window.dispatchEvent(new CustomEvent(UI_SOUND_EVENT, { detail: connect ? 'canvas-connect' : 'deselect' }));
      notify(connect ? { title: 'Connected', detail: `“${a.title}” ⇄ “${b.title}”` } : { kind: 'info', title: 'Disconnected', detail: `“${a.title}” · “${b.title}”` });
    } catch (error) {
      notify({ kind: 'error', title: connect ? "Couldn't connect" : "Couldn't disconnect", detail: error instanceof Error ? error.message : undefined });
    }
  };
  // A new note from selected text, connected to the card it came from and placed in its collections.
  const createNoteFromText = async (sourceId: string, text: string) => {
    const source = cards.find(card => card.id === sourceId);
    if (!source || !text.trim()) return;
    const base = createCardFromInput({ type: 'text', title: titleFromText(text), note: text.trim().slice(0, 100000) });
    const memberOf = collections.filter(item => item.cardIds.includes(sourceId));
    const changed = memberOf.map(item => ({ ...item, cardIds: [...new Set([...item.cardIds, base.id])], updatedAt: base.createdAt }));
    await saveCardWithCollections(base, changed);
    if (changed.length) setCollections(current => current.map(item => changed.find(next => next.id === item.id) ?? item));
    setCards(current => [base, ...current]);
    setNewlyCreatedCardId(base.id);
    const [created, updatedSource] = await linkCards(base.id, sourceId, true);
    setCards(current => current.map(card => card.id === created.id ? created : card.id === updatedSource.id ? updatedSource : card));
    notify({ title: 'Note created', detail: `Connected to “${source.title}”` });
  };
  const liveCardIds = useMemo(() => new Set(cards.filter(card => !card.trashed).map(card => card.id)), [cards]);
  const connectionsOf = (card: CardRecord) => (card.links ?? []).filter(link => liveCardIds.has(link.cardId));

  const selectCard = (cardId: string, additive: boolean) => setSelectedCardIds(current => additive
    ? (current.includes(cardId) ? current.filter(id => id !== cardId) : [...current, cardId])
    : (current.length === 1 && current[0] === cardId ? [] : [cardId]));
  // Cards read the latest handlers through a stable getter, so they only re-render when their own data changes.
  const cardApiRef = useRef<CardApi | null>(null);
  cardApiRef.current = {
    connectingFrom: connectFrom,
    select: cardId => selectCard(cardId, true),
    open: cardId => setSelectedId(cardId),
    startConnect: cardId => { setSelectedCardIds([]); setConnectFrom(cardId); },
    connect: (fromId, toId) => { void connectCards(fromId, toId); },
    remove: cardId => { void handleDelete(cardId); },
    move: async (card, collectionId) => {
      const updated = { ...card, updatedAt: new Date().toISOString() };
      const nextCollections = collections.map(collection => ({ ...collection, cardIds: collection.id === collectionId ? [...new Set([...collection.cardIds, card.id])] : collection.cardIds.filter(id => id !== card.id), updatedAt: updated.updatedAt }));
      await saveCardWithCollections(updated, nextCollections);
      setCards(current => current.map(item => item.id === card.id ? updated : item)); setCollections(nextCollections);
    },
    textMenu: menu => setTextMenu(menu),
    changeMembership: (cardId, collectionId, included) => { void changeMembership(cardId, collectionId, included); },
    createCollection: async (cardId, name) => { await handleCreateCollectionForCard(cardId, name); },
    openCollection: collectionId => navigateTo('library', collectionId),
    toggleFavorite: ids => { void toggleFavorite(ids); },
    // Saved quietly: no updatedAt change, so it is not an edit.
    storeThumb: (cardId, thumb) => {
      void saveCardThumb(cardId, thumb).catch(() => {});
      setCards(current => current.map(item => item.id === cardId ? { ...item, thumb } : item));
    },
  };
  const getCardApi = useCallback(() => cardApiRef.current!, []);
  // Esc is the Back button once nothing smaller (a dialog, menu, picker, selection, rename or search) wants it.
  const goBackRef = useRef<() => void>(() => {});
  goBackRef.current = goBack;
  const escapeBackBlocked = useRef(false);
  escapeBackBlocked.current = isHome || selectedCardIds.length > 0 || connectFrom !== null;
  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || escapeBackBlocked.current) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // The corner shortcut legend reports itself expanded, but it is not something Esc should close.
      const open = document.querySelectorAll('[role="dialog"], [role="menu"], .tile-menu, .color-pop, [aria-expanded="true"]:not(.ps-shortcut-legend-title)');
      // Copies left by closing animations (.is-leaving) don't count.
      if ([...open].some(element => !element.closest('.is-leaving'))) return;
      goBackRef.current();
    };
    window.addEventListener('keydown', back);
    return () => window.removeEventListener('keydown', back);
  }, []);
  // Single-key shortcuts (the list opens with ?). Ignored while typing, with a dialog or menu open, or
  // with modifier keys, so the browser's own shortcuts keep working.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = event => {
    if (event.defaultPrevented || event.repeat || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if ([...document.querySelectorAll('[role="dialog"], [role="menu"], .tile-menu, .color-pop')].some(element => !element.closest('.is-leaving'))) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'a' && activeView === 'library' && visibleCards.length) {
      event.preventDefault(); setSelectedCardIds(visibleCards.map(card => card.id)); return;
    }
    if (command) return;
    if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('.refs-search input')?.focus(); }
    else if (event.key.toLowerCase() === 'n' && !event.shiftKey) { event.preventDefault(); handleQuickAddCard('text'); }
    else if (event.key === '?') { event.preventDefault(); setShortcutsOpen(true); }
    else if (event.key.toLowerCase() === 'f' && !event.shiftKey && activeView === 'library') {
      const focused = target?.closest('[data-card-id]')?.getAttribute('data-card-id');
      const ids = selectedCardIds.length ? selectedCardIds : focused ? [focused] : [];
      if (ids.length) { event.preventDefault(); void toggleFavorite(ids); }
    }
  };
  useEffect(() => {
    const listen = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);
  useEffect(() => {
    if (!selectedCardIds.length) return;
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) setSelectedCardIds([]); };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [selectedCardIds.length]);

  const trashedCards = useMemo(() => cards.filter((card) => card.trashed), [cards]);
  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) openComposerWithFile(file, selectedCollectionId ? [selectedCollectionId] : []);
  };

  const isPdfFile = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  /** Opens the composer on a fresh card. `fields` prefill it (a dropped link, text…). */
  const openComposer = (fields: Partial<typeof emptyForm>, collectionIds: string[]) => {
    setComposerError('');
    setAddMenuOpen(false);
    setMediaPreview(null);
    setForm({ ...emptyForm, ...fields });
    setNewCardCollectionIds(collectionIds);
    setComposerSourceOpen(Boolean(fields.sourceUrl) || fields.type === 'bookmark');
    setComposerCollectionsOpen(false);
    setCardComposerOpen(true);
  };
  const loadComposerImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { setMediaPreview(String(reader.result ?? '')); };
    reader.readAsDataURL(file);
    // Name it from the image's own metadata or a meaningful file name, never "Screenshot 2026-…".
    void inferImageTitle(file).then(title => { if (title) setForm(current => current.title ? current : { ...current, title }); });
  };
  /** A PDF becomes a card straight away; an image opens the composer with its preview. */
  const openComposerWithFile = (file: File, collectionIds: string[], fields: Partial<typeof emptyForm> = {}) => {
    if (isPdfFile(file)) { setAddMenuOpen(false); void handleAddPdf(file, collectionIds); return; }
    openComposer({ ...fields, type: 'image' }, collectionIds);
    loadComposerImage(file);
  };

  // Drag and drop from other apps and websites. Dropping on the app (or on a collection tile) starts a
  // card with what was dropped; dropping while a card is being written adds it to that card.
  const dropDepth = useRef(0);
  const [dropping, setDropping] = useState(false);
  const dropTargetCollection = (target: EventTarget) =>
    (target instanceof Element ? target.closest('[data-collection-id]')?.getAttribute('data-collection-id') : null) ?? null;
  const addDropToComposer = (item: DroppedItem) => {
    const image = item.file && !isPdfFile(item.file) ? item.file : undefined;
    setForm(current => {
      const sourceUrl = current.sourceUrl || item.url;
      return { ...current, type: image ? 'image' : current.type, sourceUrl, note: appendToNote(current.note, [item.text, item.url !== sourceUrl ? item.url : '']) };
    });
    if (item.url) setComposerSourceOpen(true);
    if (image) loadComposerImage(image);
    else if (item.file) void handleAddPdf(item.file, newCardCollectionIds);
  };
  const handleExternalDrop = (event: React.DragEvent<HTMLElement>) => {
    dropDepth.current = 0;
    setDropping(false);
    if (!isExternalDrop(event.dataTransfer.types)) return;
    const intoField = event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]');
    const hasFile = event.dataTransfer.types.includes('Files');
    if (intoField && !hasFile) return; // text dropped into a field goes where the caret is
    event.preventDefault(); // a dropped file must never replace the app in the tab
    const item = readDrop(event.dataTransfer);
    if (!item) return;
    if (cardComposerOpen) { addDropToComposer(item); return; }
    if (document.querySelector('[role="dialog"]')) return; // another dialog (editor, settings) is in front
    const target = dropTargetCollection(event.target) ?? (activeView === 'library' ? selectedCollectionId : null);
    const collectionIds = target ? [target] : [];
    if (item.file) openComposerWithFile(item.file, collectionIds, { sourceUrl: item.url, note: item.text });
    else if (item.url) openComposer({ type: 'bookmark', sourceUrl: item.url, note: item.text }, collectionIds);
    else openComposer({ type: 'text', note: item.text }, collectionIds);
  };
  const dropHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => { if (isExternalDrop(event.dataTransfer.types)) { dropDepth.current++; setDropping(true); } },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => { if (isExternalDrop(event.dataTransfer.types) && --dropDepth.current <= 0) { dropDepth.current = 0; setDropping(false); } },
    onDragOver: (event: React.DragEvent<HTMLElement>) => { if (isExternalDrop(event.dataTransfer.types)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } },
    onDrop: handleExternalDrop,
  };

  // A PDF becomes a card straight away: first page as its picture, the file and its text kept with it.
  const handleAddPdf = async (file: File, collectionIds: string[] = selectedCollectionId ? [selectedCollectionId] : []) => {
    // Each upload's "Reading…" notice is replaced by that upload's own result.
    const noticeKey = `pdf:${crypto.randomUUID()}`;
    notify({ kind: 'progress', key: noticeKey, title: 'Reading PDF', detail: file.name });
    try {
      const { readPdfFile } = await import('./lib/pdf');
      const { title, thumbnail, pdf } = await readPdfFile(file);
      const base = createCardFromInput({ type: 'pdf', title, dataUrl: thumbnail, note: '' });
      const card = { ...base, pdf, searchText: buildSearchText({ ...base, pdf }) };
      const changed = collections.filter(item => collectionIds.includes(item.id)).map(item => ({ ...item, cardIds: [...new Set([...item.cardIds, card.id])], updatedAt: card.createdAt }));
      await saveCardWithCollections(card, changed);
      if (changed.length) setCollections(current => current.map(item => changed.find(next => next.id === item.id) ?? item));
      setCards(current => [card, ...current]);
      setNewlyCreatedCardId(card.id);
      notify({ key: noticeKey, title: 'PDF added', detail: `“${title}” · ${pdf.pageCount} page${pdf.pageCount === 1 ? '' : 's'}` });
    } catch (error) {
      notify({ kind: 'error', key: noticeKey, title: "Couldn't add PDF", detail: error instanceof Error ? error.message : 'This PDF could not be added.' });
    }
  };

  const handleCreateCard = async (event: React.FormEvent) => {
    event.preventDefault();
    if (composerSavingRef.current) return;

    // A note typed without a title is named after its first words.
    const trimmedTitle = form.title.trim() || titleFromText(form.note) || titleFromUrl(form.sourceUrl);
    if (!trimmedTitle) {
      setComposerError('Add a title or some text first.');
      return;
    }

    composerSavingRef.current = true;
    setComposerSaving(true);
    setComposerError('');
    try {
      const card = createCardFromInput({
        type: form.type,
        title: trimmedTitle,
        note: form.note.trim(),
        sourceUrl: form.sourceUrl.trim() || undefined,
        tags: form.tags
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
        dataUrl: form.type === 'image' ? mediaPreview ?? undefined : undefined,
      });

      const changedCollections = collections
        .filter((collection) => newCardCollectionIds.includes(collection.id))
        .map((collection) => ({
          ...collection,
          cardIds: toggleCardInCollection(collection, card.id),
          updatedAt: new Date().toISOString(),
        }));
      await saveCardWithCollections(card, changedCollections);
      // The composer closes (and paints) first; adding the card re-lays out the whole grid, so it follows as a transition.
      setForm(emptyForm);
      setMediaPreview(null);
      setCardComposerOpen(false);
      notify({ title: 'Card added', detail: `“${card.title}”` });
      startTransition(() => {
        if (changedCollections.length > 0) {
          setCollections((current) =>
            current.map((collection) =>
              changedCollections.find((changed) => changed.id === collection.id) ?? collection,
            ),
          );
        }
        setCards((current) => [card, ...current]);
        setNewlyCreatedCardId(card.id);
        // Saving is the end of the task: show the new card (in its collection when made elsewhere) instead of reopening it.
        if (activeView !== 'library') navigateTo('library', newCardCollectionIds[0] ?? null);
      });
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Could not save. Your draft is still here.');
    } finally {
      composerSavingRef.current = false;
      setComposerSaving(false);
    }
  };

  const handleQueueCapture = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (composerSavingRef.current) return;

    const queued = enqueueCapture({
      kind: form.type === 'pdf' ? 'image' : form.type,
      title: form.title.trim() || 'Queued capture',
      sourceUrl: form.sourceUrl,
      note: form.note,
      status: 'queued',
      payload: mediaPreview ?? '',
    });

    setCaptureQueue((current) => [queued, ...current]);
    setForm(emptyForm);
    setMediaPreview(null);
    setCardComposerOpen(false);
  };

  const handleAcknowledgeCapture = async (itemId: string) => {
    const receipt = createCaptureReceipt(itemId, 'saved');
    setCaptureQueue((current) => acknowledgeCapture(current, itemId, 'received'));
    setCaptureReceipts((current) => ({ ...current, [receipt.id]: itemId }));
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  // Right-click on a collection or canvas tile: Open / Rename (/ Delete for collections).
  const [tileMenu, setTileMenu] = useState<{ id: string; kind: 'collection' | 'canvas'; left: number; top: number } | null>(null);
  const openTileMenu = (event: React.MouseEvent, id: string, kind: 'collection' | 'canvas') => {
    event.preventDefault(); event.stopPropagation();
    setQuickAddPosition(null);
    setTileMenu({ id, kind, left: event.clientX, top: event.clientY });
  };
  const handleRenameCollection = async (collectionId: string, value: FormDataEntryValue | null) => {
    setRenamingCollectionId(current => current === collectionId ? null : current);
    const target = collectionsRef.current.find(item => item.id === collectionId);
    const name = typeof value === 'string' ? value.trim().slice(0, 120) : '';
    if (!target || !name || name === target.name) return;
    const next = { ...target, name, updatedAt: new Date().toISOString() };
    setCollections(current => current.map(item => item.id === collectionId ? next : item));
    try { await saveCollection(next); notify({ title: 'Renamed', detail: `“${target.name}” → “${name}”` }); }
    catch { setCollections(current => current.map(item => item.id === collectionId ? target : item)); notify({ kind: 'error', title: "Couldn't rename collection" }); }
  };

  const handleDescribeCollection = async (collectionId: string, description: string) => {
    const target = collectionsRef.current.find(item => item.id === collectionId);
    if (!target || description === target.description) return;
    const next = { ...target, description, updatedAt: new Date().toISOString() };
    setCollections(current => current.map(item => item.id === collectionId ? next : item));
    try { await saveCollection(next); window.dispatchEvent(new CustomEvent(UI_SOUND_EVENT, { detail: 'save' })); }
    catch { setCollections(current => current.map(item => item.id === collectionId ? target : item)); notify({ kind: 'error', title: "Couldn't save the description" }); }
  };

  // Every canvas belongs to a collection, so an empty canvas is a new, empty collection opened on its board.
  const handleCreateEmptyCanvas = async () => {
    const taken = new Set(collections.map(collection => collection.name.toLocaleLowerCase()));
    let name = 'Untitled canvas';
    for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1) name = `Untitled canvas ${index}`;
    const collection = createCollectionFromInput({ name, description: 'Canvas', cardIds: [] });
    try {
      await saveCollection(collection);
      setCollections(current => [collection, ...current]);
      navigateTo('canvas', collection.id);
      notify({ title: 'Canvas created', detail: `“${name}” · rename it from Collections` });
    } catch {
      notify({ kind: 'error', title: "Couldn't create canvas" });
    }
  };

  const handleCreateCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = collectionForm.name.trim();
    if (!trimmedName) {
      return;
    }

    const collection = createCollectionFromInput({
      name: trimmedName,
      description: 'User-made collection',
    });

    setCollections((current) => [collection, ...current]);
    // Opening the new collection is a navigation, so Back returns to where it was made.
    if (activeView === 'library') navigateTo('library', collection.id); else setSelectedCollectionId(collection.id);
    setCollectionForm(emptyCollectionForm);
    await saveCollection(collection);
    setCollectionMenuOpen(false);
  };

  // One level of nesting: moving a collection never changes its cards or memberships.
  const handleSetCollectionParent = async (collectionId: string, parentId: string | null) => {
    const problem = collectionParentError(collectionsRef.current, collectionId, parentId);
    if (problem) { notify({ kind: 'error', title: "Can't move collection", detail: problem }); return; }
    const target = collectionsRef.current.find(item => item.id === collectionId);
    if (!target || (target.parentId ?? null) === parentId) return;
    const { parentId: _old, ...rest } = target;
    const next = { ...rest, ...(parentId ? { parentId } : {}), updatedAt: new Date().toISOString() };
    setCollections(current => current.map(item => item.id === collectionId ? next : item));
    try { await saveCollection(next); }
    catch { setCollections(current => current.map(item => item.id === collectionId ? target : item)); notify({ kind: 'error', title: "Couldn't move collection" }); }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    const removed = collections.find(collection => collection.id === collectionId);
    await deleteCollection(collectionId);
    notify({ kind: 'info', title: 'Collection deleted', detail: removed ? `“${removed.name}” · its cards are kept` : undefined });
    setCollections((current) => current.filter((collection) => collection.id !== collectionId)
      .map(collection => collection.parentId === collectionId ? (({ parentId: _parent, ...rest }) => rest)(collection) : collection));
    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId(null);
    }
  };

  const handleToggleTrash = async (cardId: string) => {
    const target = cards.find((card) => card.id === cardId);
    if (!target) return;

    const nextCard = { ...target, trashed: !target.trashed, updatedAt: new Date().toISOString() };
    setCards((current) => current.map((card) => (card.id === cardId ? nextCard : card)));
    await saveCard(nextCard);
    notify(nextCard.trashed ? { kind: 'info', title: 'Moved to trash', detail: `“${nextCard.title}”` } : { title: 'Restored', detail: `“${nextCard.title}”` });
  };

  // Starring is an edit like any other (updatedAt changes), so it syncs to the account's other devices.
  // Several cards: if all are starred they are unstarred, otherwise all become starred.
  const toggleFavorite = async (cardIds: string[]) => {
    const targets = cards.filter(card => cardIds.includes(card.id));
    if (!targets.length) return;
    const favorite = !targets.every(card => card.favorite);
    const now = new Date().toISOString();
    const updated = targets.map(card => {
      const { favorite: _previous, ...rest } = card;
      return favorite ? { ...rest, favorite: true, updatedAt: now } : { ...rest, updatedAt: now };
    });
    setCards(current => current.map(card => updated.find(item => item.id === card.id) ?? card));
    for (const card of updated) await saveCard(card);
  };

  // Deleting asks nothing: the cards go at once and an Undo stays for a few seconds instead.
  const handleDelete = async (cardIds: string | string[]) => {
    const ids = [...new Set(Array.isArray(cardIds) ? cardIds : [cardIds])].filter(id => !removingCardIds.includes(id));
    const doomed = cards.filter(item => ids.includes(item.id));
    if (!doomed.length) return;
    const memberships: Record<string, string[]> = {};
    for (const collection of collections) {
      const inside = collection.cardIds.filter(id => ids.includes(id));
      if (inside.length) memberships[collection.id] = inside;
    }
    setRemovingCardIds(current => [...new Set([...current, ...ids])]);
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    await new Promise(resolve => window.setTimeout(resolve, 180));
    try {
      const now = new Date().toISOString();
      setCollections(current => current.map(collection => collection.cardIds.some(id => ids.includes(id)) ? { ...collection, cardIds: collection.cardIds.filter(id => !ids.includes(id)), updatedAt: now } : collection));
      setSelectedCardIds(current => current.filter(id => !ids.includes(id)));
      for (const id of ids) await removeCard(id);
      setCards(current => current.filter(card => !ids.includes(card.id)));
      setUndoDelete({ cards: doomed, memberships });
    } finally {
      setRemovingCardIds(current => current.filter(id => !ids.includes(id)));
    }
  };
  const handleUndoDelete = async () => {
    const pending = undoDelete;
    if (!pending) return;
    setUndoDelete(null);
    try {
      const restored = await restoreCards(pending.cards, pending.memberships);
      setCards(current => [...restored.cards, ...current.filter(card => !restored.cards.some(item => item.id === card.id))]);
      setCollections(current => current.map(collection => restored.collections.find(item => item.id === collection.id) ?? collection));
      notify({ title: 'Restored', detail: restored.cards.length === 1 ? `“${restored.cards[0].title}”` : `${restored.cards.length} cards` });
    } catch (error) {
      notify({ kind: 'error', title: "Couldn't restore", detail: error instanceof Error ? error.message : undefined });
    }
  };

  useEffect(() => {
    const deleteSelected = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || event.repeat || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || activeView !== 'library') return;
      const target = event.target instanceof Element ? event.target : null;
      if (document.querySelector('[role="dialog"], [role="menu"]') || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const focusedId = target?.closest('[data-card-id]')?.getAttribute('data-card-id');
      const ids = selectedCardIds.length ? selectedCardIds : focusedId ? [focusedId] : [];
      if (!ids.length) return;
      event.preventDefault();
      void handleDelete(ids).catch(error => notify({ kind: 'error', title: "Couldn't delete card", detail: error instanceof Error ? error.message : undefined }));
    };
    document.addEventListener('keydown', deleteSelected);
    return () => document.removeEventListener('keydown', deleteSelected);
  });

  // Each card/collection relationship is serialized on its own: a toggle made while that relationship is
  // still saving is applied after it, so a stale response can never reverse a newer choice.
  const changeMembership = async (cardId: string, collectionId: string, included: boolean) => {
    const key = `${cardId}\u0000${collectionId}`;
    const applyRelationship = (item: CollectionRecord, present: boolean) => ({
      ...item,
      cardIds: present ? [...new Set([...item.cardIds, cardId])] : item.cardIds.filter(id => id !== cardId),
    });
    const collection = collectionsRef.current.find(item => item.id === collectionId);
    if (!collection) return;
    if (membershipInFlight.current.has(key)) {
      membershipDesired.current.set(key, included);
      setCollections(current => current.map(item => item.id === collectionId ? applyRelationship(item, included) : item));
      return;
    }
    if (collection.cardIds.includes(cardId) === included) return;
    const previousUndo = undoMembership;
    membershipInFlight.current.add(key);
    membershipSavingRef.current = true;
    setMembershipSaving(true);
    setCollections(current => current.map(item => item.id === collectionId ? applyRelationship(item, included) : item));
    let target = included;
    try {
      for (;;) {
        const saved = await setCardCollectionMembership(cardId, collectionId, target);
        const next = membershipDesired.current.get(key);
        membershipDesired.current.delete(key);
        if (next === undefined || next === target) {
          setCollections(current => current.map(item => item.id === collectionId ? saved : item));
          if (target) setUndoMembership(current => current?.cardId === cardId && current.collection.id === collectionId ? null : current);
          else setUndoMembership({ cardId, collection: saved });
          break;
        }
        target = next;
      }
    } catch (error) {
      membershipDesired.current.delete(key);
      // Show what storage actually holds rather than guessing which step failed.
      const stored = await readCollections().catch(() => null);
      setCollections(current => stored ?? current.map(item => item.id === collectionId ? applyRelationship(item, !target) : item));
      setUndoMembership(previousUndo);
      notify({ kind: 'error', title: "Couldn't update card", detail: error instanceof Error && ['Card no longer exists', 'Collection no longer exists'].includes(error.message)
        ? error.message : 'Try again.' });
    } finally {
      membershipInFlight.current.delete(key);
      membershipSavingRef.current = membershipInFlight.current.size > 0;
      setMembershipSaving(membershipInFlight.current.size > 0);
    }
  };

  const handleCreateCollectionForCard = async (cardId: string, name: string) => {
    const collection = createCollectionFromInput({ name: name.trim(), description: 'User-made collection', cardIds: [cardId] });
    await saveCollection(collection);
    setCollections(current => [collection, ...current]);
  };

  const handleUndoMembership = async () => {
    if (undoMembership) await changeMembership(undoMembership.cardId, undoMembership.collection.id, true);
  };

  const selectionCollectionsRef = useRef<HTMLButtonElement | null>(null);
  const [selectionPickerOpen, setSelectionPickerOpen] = useState(false);
  useEffect(() => { if (!selectedCardIds.length) setSelectionPickerOpen(false); }, [selectedCardIds.length]);
  const setSelectionMembership = async (collectionId: string, included: boolean) => {
    const target = collections.find(collection => collection.id === collectionId);
    if (!target || !selectedCardIds.length) return;
    const next = { ...target, cardIds: included ? [...new Set([...target.cardIds, ...selectedCardIds])] : target.cardIds.filter(id => !selectedCardIds.includes(id)), updatedAt: new Date().toISOString() };
    setCollections(current => current.map(collection => collection.id === collectionId ? next : collection));
    await saveCollection(next);
  };
  const createCollectionForSelection = async (name: string) => {
    const collection = createCollectionFromInput({ name: name.trim(), description: 'User-made collection', cardIds: [...selectedCardIds] });
    await saveCollection(collection);
    setCollections(current => [collection, ...current]);
    notify({ title: 'Collection created', detail: `“${collection.name}” · ${collection.cardIds.length} card${collection.cardIds.length === 1 ? '' : 's'}` });
  };

  const handleQuickAddCard = (type: CardRecord['type'] = 'bookmark') => {
    setComposerError('');
    setAddMenuOpen(false);
    setForm({ ...emptyForm, type });
    setNewCardCollectionIds(selectedCollectionId ? [selectedCollectionId] : []);
    setComposerSourceOpen(type === 'bookmark');
    setComposerCollectionsOpen(false);
    setCardComposerOpen(true);
  };

  // The right-click menu only stays while it has the pointer or focus: it closes when the pointer leaves
  // (or never arrives), when focus moves away, and on scroll, resize or window blur.
  const quickAddRef = useRef<HTMLDivElement | null>(null);
  const quickAddTimer = useRef<number | undefined>(undefined);
  const quickAddHovered = useRef(false);
  const skipAddFocusOpen = useRef(false);
  const scheduleQuickAddClose = (delay: number | null) => {
    window.clearTimeout(quickAddTimer.current);
    if (delay !== null) quickAddTimer.current = window.setTimeout(() => setQuickAddPosition(null), delay);
  };
  useEffect(() => {
    if (!quickAddPosition) return;
    quickAddHovered.current = false;
    quickAddRef.current?.focus({ preventScroll: true });
    scheduleQuickAddClose(1500);
    const close = () => setQuickAddPosition(null);
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('blur', close);
    return () => {
      window.clearTimeout(quickAddTimer.current);
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('blur', close);
    };
  }, [quickAddPosition]);

  // The + menu and the right-click menu offer the same actions, in the same order (two groups).
  const createActions: { label: string; icon: React.ReactNode; group: 0 | 1; run: () => void }[] = [
    { label: 'Collection', icon: <NavigationIcon name="collections" />, group: 0, run: () => { navigateTo('library'); setCollectionMenuOpen(true); } },
    { label: 'Canvas', icon: <NavigationIcon name="canvas" />, group: 0, run: () => { void handleCreateEmptyCanvas(); } },
    { label: 'Link', icon: <InterfaceIcon name="link" />, group: 1, run: () => handleQuickAddCard('bookmark') },
    { label: 'Upload', icon: <InterfaceIcon name="upload" />, group: 1, run: () => imagePickerRef.current?.click() },
    { label: 'Note', icon: <InterfaceIcon name="note" />, group: 1, run: () => handleQuickAddCard('text') },
  ];

  const openQuickAddMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,button,a,[contenteditable="true"],article,.card-collection-pills')) return;
    if ('preventDefault' in event) event.preventDefault();
    const point = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setAddMenuOpen(false);
    setQuickAddPosition({ left: Math.max(12, Math.min(point.x, window.innerWidth - 250)), top: Math.max(12, Math.min(point.y, window.innerHeight - 220)) });
  };

  const sidebarStatusText = syncLabel(drive);

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      // Read from storage so the backup reflects saved state, including every canvas.
      const [storedCards, storedCollections, canvases] = await Promise.all([readCards(), readCollections(), readCanvasBackups()]);
      const backup = createLibraryBackup(storedCards, storedCollections, canvases);
      triggerDownload(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'visual-library-export.json');
      notify({ title: 'Backup exported', detail: `${storedCards.length} cards · ${storedCollections.length} collections` });
    } catch (error) {
      notify({ kind: 'error', title: 'Export failed', detail: error instanceof Error ? error.message : undefined });
    }
  };

  const handleBackupRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const report = await restoreLibraryBackup(parseLibraryBackup(await file.text()));
      const [nextCards, nextCollections] = await Promise.all([readCards(), readCollections()]);
      setCards(nextCards);
      setCollections(nextCollections);
      const added = `${report.cardsAdded} card${report.cardsAdded === 1 ? '' : 's'}, ${report.collectionsAdded} collection${report.collectionsAdded === 1 ? '' : 's'} and ${report.canvasesAdded} canvas${report.canvasesAdded === 1 ? '' : 'es'}`;
      notify({ title: 'Backup restored', detail: `Restored ${added}.${report.skipped ? ` Kept ${report.skipped} existing item${report.skipped === 1 ? '' : 's'} unchanged.` : ''}` });
    } catch (error) {
      notify({ kind: 'error', title: 'Restore failed', detail: error instanceof Error ? error.message : 'Backup could not be restored.' });
    }
  };

  const handleObsidianExport = async () => {
    // Canvases become notes with an SVG preview and their text annotations.
    // Drive sync settles every conflict when it merges (the newer edit wins), so nothing is ever left unresolved.
    const archive = appendCanvasesToObsidianArchive(createObsidianExportArchive(cards, collections, { syncState: createSyncReducerState() }), await readCanvasBackups().catch(() => []), cards);
    const { default: JSZip } = await import('jszip'); // only needed for this export
    const zip = new JSZip();

    for (const file of archive.files) {
      zip.file(file.path, file.content);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    triggerDownload(blob, 'visual-library-obsidian-export.zip');
    notify({ title: 'Obsidian export ready', detail: 'visual-library-obsidian-export.zip' });
  };

  const handleClearLocalCache = async () => {
    localStorage.removeItem('visual-library-capture-queue');
    localStorage.removeItem('visual-library-capture-receipts');
    localStorage.removeItem('visual-library-theme');
    await clearPendingShareItems();
    setCaptureQueue([]);
    setCaptureReceipts({});
    notify({ kind: 'info', title: 'Cache cleared', detail: 'Your library content is untouched.' });
  };

  const handlePersistLocalStorage = async () => {
    if (!('storage' in navigator) || typeof navigator.storage?.persist !== 'function') {
      notify({ kind: 'info', title: 'Not supported', detail: 'This browser does not support persistent storage requests.' });
      return;
    }

    const persisted = await navigator.storage.persist();
    setStorageEstimate((current) => ({
      usageMb: current?.usageMb ?? 0,
      quotaMb: current?.quotaMb ?? 0,
      persisted,
    }));
    notify(persisted ? { title: 'Storage persisted', detail: 'Local storage persistence enabled for this device.' } : { kind: 'info', title: 'Not granted', detail: 'Storage persistence was not granted by the browser.' });
  };

  const pickProfileImage = (event: React.ChangeEvent<HTMLInputElement>, open: (file: File) => void) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
      setProfileError(true);
      setProfileMessage('Choose a JPEG, PNG, WebP, GIF or AVIF image.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setProfileError(true);
      setProfileMessage('That image is too large to open (30 MB at most).');
      return;
    }
    // Any size is fine: the cropper saves a small, compressed copy.
    setProfileMessage('');
    setAccountMenuOpen(false);
    open(file);
  };
  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => pickProfileImage(event, setProfileCropFile);
  const handleProfileCoverChange = (event: React.ChangeEvent<HTMLInputElement>) => pickProfileImage(event, setProfileCoverFile);
  const saveProfileCover = (dataUrl: string) => {
    setProfileCoverFile(null);
    try { localStorage.setItem('duckler-profile-cover', dataUrl); }
    catch { setProfileError(true); setProfileMessage('The card image could not be saved in this browser.'); return; }
    setProfileCover(dataUrl); setProfileError(false); setProfileMessage('Card image saved on this device.');
    notify({ title: 'Card image updated', detail: 'Saved on this device.' });
  };
  const removeProfileCover = () => {
    try { localStorage.removeItem('duckler-profile-cover'); } catch { /* nothing stored */ }
    setProfileCover(''); setProfileMessage('Card image removed.'); setProfileError(false);
  };

  const saveCroppedProfilePhoto = (dataUrl: string) => {
    setProfileCropFile(null);
    try {
      localStorage.setItem('visual-library-profile-photo', dataUrl);
    } catch {
      setProfileError(true);
      setProfileMessage('The photo could not be saved in this browser.');
      return;
    }
    setProfilePhoto(dataUrl);
    setProfileError(false);
    setProfileMessage('Profile photo saved on this device.');
    notify({ title: 'Photo updated', detail: 'Saved on this device.' });
  };

  const handleRemoveProfilePhoto = () => {
    try {
      localStorage.removeItem('visual-library-profile-photo');
    } catch {
      setProfileError(true);
      setProfileMessage('The saved photo could not be removed from this browser.');
      return;
    }
    setProfilePhoto('');
    setProfileError(false);
    setProfileMessage('Profile photo removed.');
  };

  const themeToggle = <button type="button" className="settings-button theme-toggle" onClick={() => setThemeMode(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
    <InterfaceIcon name={theme === 'dark' ? 'sun' : 'moon'} />
  </button>;

  return (
    <main className="app-shell" data-canvas-open={activeView === 'canvas' && selectedCanvas ? 'true' : undefined} data-dropping={dropping ? 'true' : undefined} {...dropHandlers} aria-busy={!libraryLoaded} onContextMenu={openQuickAddMenu} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) openQuickAddMenu(event); }} {...cardStyle.shellProps} style={{ '--profile-accent': profileCardColor, ...appearanceStyle(appearance.values, theme), ...cardStyle.shellStyle } as CSSProperties}>
      <button type="button" className="mobile-menu-toggle" onClick={() => setMobileSidebarOpen((current) => !current)} aria-label="Toggle navigation">
        ☰
      </button>
      {mobileSidebarOpen && (
        <button type="button" className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation overlay" />
      )}
      <aside className={`sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} hidden>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img" aria-label="Duckler logo">
              <path d="M9 5.5c-3.3 0-6 2.6-6 6 0 3.1 2.2 5.7 5.1 6.1l1.8.3 1.4 3.3c.5 1.2 2.2 1.2 2.7 0l1.5-3.4 1.7-.2c3.2-.4 5.8-3.1 5.8-6.1 0-3.4-2.8-6-6.3-6-1.8 0-3.4.8-4.6 2-.6-.6-1.5-1-2.4-1Z" fill="currentColor" />
            </svg>
          </div>
          <span className="brand-name">duckler</span>
        </div>

        <label className="sidebar-search" aria-label="Search library">
          <InterfaceIcon name="search" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search your library" />
        </label>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button type="button" className="nav-item active">
            <NavigationIcon name="library" />
            <span>Library</span>
          </button>
          <button type="button" className="nav-item">
            <NavigationIcon name="canvas" />
            <span>Canvases</span>
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="section-header">
            <span>Collections</span>
            <button type="button" aria-label="Add collection" className="mini-add" onClick={() => setCollectionForm({ name: collectionForm.name || 'New collection' })}>+</button>
          </div>

          <form onSubmit={handleCreateCollection} className="collection-form">
            <input
              value={collectionForm.name}
              onChange={(event) => setCollectionForm({ name: event.target.value })}
              placeholder="Add collection"
            />
            <button type="submit" className="secondary-button">Add</button>
          </form>

          <div className="collection-list">
            <button
              type="button"
              className={`collection-button ${selectedCollectionId === null ? 'active' : ''}`}
              onClick={() => navigateTo('library', null)}
            >
              <span className="collection-check" aria-hidden="true" />
              <span>All cards</span>
            </button>
            {collections.map((collection) => (
              <div key={collection.id} className="collection-row">
                <button
                  type="button"
                  className={`collection-button ${selectedCollectionId === collection.id ? 'active' : ''}`}
                  onClick={() => navigateTo('library', collection.id)}
                >
                  <span className="collection-check" aria-hidden="true" />
                  <span>{collection.name}</span>
                </button>
                <span className="collection-count">{collection.cardIds.length}</span>
                <button type="button" className="mini-delete" onClick={() => void handleDeleteCollection(collection.id)} aria-label={`Delete ${collection.name}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="sync-status" aria-live="polite">
            <span className={`sync-dot ${drive.signedIn ? 'online' : 'offline'}`} aria-hidden="true" />
            <span>{sidebarStatusText}</span>
          </div>
          <button type="button" className="settings-button secondary-settings" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5a2.5 2.5 0 0 1 2.4 1.7l.4 1.3 1.4.4a2.5 2.5 0 0 1 1.5 3.2l-.6 1.4 1 1.2a2.5 2.5 0 0 1 0 3.2l-1 1.2.6 1.4a2.5 2.5 0 0 1-1.5 3.2l-1.4.4-.4 1.3A2.5 2.5 0 0 1 12 22.5a2.5 2.5 0 0 1-2.4-1.7l-.4-1.3-1.4-.4a2.5 2.5 0 0 1-1.5-3.2l.6-1.4-1-1.2a2.5 2.5 0 0 1 0-3.2l1-1.2-.6-1.4a2.5 2.5 0 0 1 1.5-3.2l1.4-.4.4-1.3A2.5 2.5 0 0 1 12 1.5Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" fill="currentColor"/></svg>
            <span>Sync settings</span>
          </button>
          {storageEstimate && (
            <div className="storage-status" aria-live="polite">
              <span>{storageEstimate.usageMb.toFixed(1)} MB / {storageEstimate.quotaMb.toFixed(1)} MB</span>
              <div className="storage-actions">
                <button type="button" className="mini-button" onClick={() => void handlePersistLocalStorage()}>
                  {storageEstimate.persisted ? 'Persisted' : 'Persist'}
                </button>
                <button type="button" className="mini-button" onClick={() => void handleClearLocalCache()}>
                  Clear cache
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <section ref={contentRef} className={`content panel ${isHome ? 'home-view' : ''}`} data-view={activeView}>
        {/* Inside the content's stacking context: above the cards, below the pinned Back and search. */}
        {!isHome && !(activeView === 'canvas' && selectedCanvas) && <div className="top-scrim" aria-hidden="true" />}
        {!(activeView === 'canvas' && selectedCanvas) && <div ref={searchBarRef} className={`refs-search ${isHome ? 'home-search' : 'is-compact'} ${searchTerm ? 'has-query' : ''}`}>
          <label className="sidebar-search workspace-search refs-search-field" aria-label="Search refs">
            <InterfaceIcon name="search" />
            <input aria-label="Search" value={searchTerm} onChange={event => changeSearch(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape' && searchTerm) { event.stopPropagation(); changeSearch(''); } }} placeholder={searchPlaceholder} />
            {searchTerm && <button type="button" className="refs-search-clear" aria-label="Clear search" onClick={() => changeSearch('')}>×</button>}
          </label>{themeToggle}
        </div>}
        {isHome && <div className="home-launcher" aria-label="Explore library">
          <button type="button" className="home-entry" aria-label="Open collections" onClick={() => navigateTo('collections')}>
            <NavigationIcon name="collections" expanded /><span>Collections</span>
          </button>
          <button type="button" className="home-entry" aria-label="Open canvas" onClick={() => navigateTo('canvas')}>
            <NavigationIcon name="canvas" expanded /><span>Canvas</span>
          </button>
          {activeCardCount > 0 && <button type="button" className="home-all-notes" aria-label="All notes" onClick={() => navigateTo('library')}>
            All notes <span>{activeCardCount}</span><InterfaceIcon name="link" />
          </button>}
          {favoriteCount > 0 && <button type="button" className="home-all-notes home-favorites" aria-label="Favorites" onClick={() => navigateTo('library', FAVORITES_ID)}>
            Favorites <span>{favoriteCount}</span><InterfaceIcon name="star-filled" />
          </button>}
        </div>}
        {!isHome && <header className="page-header">
          <button type="button" className="page-back b-button" aria-label="Go back" onClick={goBack}><span className="b-ring" aria-hidden="true" /><span className="b-label" aria-hidden="true">Back</span></button>
          <div>
          <h1 className={activeView === 'library' ? 'visually-hidden' : undefined}>
            {activeView === 'library'
              ? (selectedCollection?.name ?? 'refs')
              : activeView === 'collections'
                ? 'Collections'
                : selectedCanvas?.name ?? 'Canvases'}
          </h1>
          </div>
        </header>}

        {showLibraryFilters && (
          <div className="collection-shelf">
            {selectedCollection && <div className="collection-owner-row"><ProfileHover showName label={`${displayProfileName}'s profile`} profile={{ name: displayProfileName, photo: profilePhoto || undefined, tag: displayProfileTag || undefined, bio: profileBio || undefined, color: profileCardColor, cover: profileCover || undefined }} /></div>}
            <div className="collection-menu" ref={collectionMenuRef} {...collectionHover}>
              <button type="button" className="collection-menu-trigger" aria-label="Choose collection" aria-expanded={collectionMenuOpen} aria-haspopup="true" onClick={() => setCollectionMenuOpen((open) => !open)}>
                <span>{selectedCollectionId === FAVORITES_ID ? 'Favorites' : selectedCollection?.name ?? 'All notes'}</span>
                <span className="collection-menu-count">{selectedCollection?.cardIds.length ?? cards.filter((card) => !card.trashed).length}</span>
                <span className="menu-chevron" aria-hidden="true">⌄</span>
              </button>
              {collectionMenuOpen && <div className="collection-menu-popover" aria-label="Collections">
                <button
                  type="button"
                  className={`collection-menu-item ${selectedCollectionId === null ? 'active' : ''}`}
                  onClick={() => {
                    navigateTo('library');
                  }}
                >
                  <span>All notes</span>
                  <span>{cards.filter((card) => !card.trashed).length}</span>
                </button>
                {orderCollectionTree(collections).map(({ collection, depth }) => (
                  <div key={collection.id} className={`collection-menu-row ${depth ? 'is-child' : ''}`}>
                    <button
                      type="button"
                      className={`collection-menu-item ${selectedCollectionId === collection.id ? 'active' : ''}`}
                      onClick={() => {
                        navigateTo('library', collection.id);
                      }}
                    >
                      <span>{collection.name}</span>
                      <span>{collection.cardIds.length}</span>
                    </button>
                    <button type="button" className="collection-menu-delete" onClick={() => void handleDeleteCollection(collection.id)} aria-label={`Delete ${collection.name}`}>×</button>
                  </div>
                ))}
                <form onSubmit={handleCreateCollection} className="collection-menu-form">
                  <input value={collectionForm.name} onChange={(event) => setCollectionForm({ name: event.target.value })} aria-label="New collection name" placeholder="New collection" />
                  <button type="submit" aria-label="Create collection">+</button>
                </form>
              </div>}
            </div>
            <div className="toolbar">
              <div className="toolbar-actions">
                {selectedCollection && <button type="button" className={`collection-share ${drive.shares.has(selectedCollection.id) ? 'is-shared' : ''}`} aria-label={`Share ${selectedCollection.name}`} title={drive.shares.has(selectedCollection.id) ? 'Shared · manage link' : 'Share a view-only link'}
                  onClick={() => setShareCollectionId(selectedCollection.id)}><InterfaceIcon name="link" /></button>}
                <details className="library-options" {...detailsHover}>
              <summary aria-label="View options" title="View options"><InterfaceIcon name="more" /></summary>
              <div className="library-options-popover">
                <label className="option-field">
                  <span>Type</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
                    <option value="all">All types</option>
                    <option value="image">Images</option>
                    <option value="link">Links</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label className="option-field">
                  <span>Sort</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
                <label className="option-field"><span>Card size</span>
                  <select aria-label="Card size" value={cardSize} onChange={event => setCardSize(event.target.value)}>
                    <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
                  </select>
                </label>
                <div className="library-option-actions">
                  <button type="button" onClick={() => void handleExport()}>Export backup</button>
                  <button type="button" onClick={() => backupPickerRef.current?.click()}>Restore backup</button>
                  <input ref={backupPickerRef} type="file" accept="application/json,.json" hidden aria-label="Restore backup file" onChange={event => void handleBackupRestore(event)} />
                  <button type="button" onClick={() => void handleObsidianExport()}>Export Obsidian</button>
                  {installPrompt && <button type="button" onClick={handleInstall}>Install app</button>}
                </div>
              </div>
              </details>
              </div>
            </div>
          </div>
        )}

        {showLibraryFilters && selectedCollection && <div className="collection-description-row">
          <CollectionDescription key={selectedCollection.id} value={selectedCollection.description}
            onSave={description => void handleDescribeCollection(selectedCollection.id, description)} />
        </div>}

        {showLibraryFilters && (
          <nav className="media-filter-row" aria-label="Filter by media type">
            {([
              ['all', 'All items'],
              ['image', 'Images'],
              ['link', 'Links'],
              ['text', 'Notes'],
            ] as const).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                className={`media-filter ${typeFilter === filter ? 'active' : ''}`}
                aria-pressed={typeFilter === filter}
                onClick={() => setTypeFilter(filter)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {isOffline && (
          <div className="status-banner">
            Offline mode: the app shell remains available locally while you work without the active connection.
          </div>
        )}


        {activeView === 'collections' && (
          <div className="collection-grid" aria-label="Your collections">
            {searchTerm.trim() && !visibleCollections.length && !showAllCardsTile && <p className="search-empty">No collections match “{searchTerm.trim()}”.</p>}
            {showAllCardsTile && (() => {
              // Every card belongs to "All cards": it sits with the collections but can't be renamed, nested or deleted.
              const live = cards.filter(card => !card.trashed);
              return <article className="collection-tile collection-tile-all">
                <button type="button" className="collection-tile-main" aria-label="Open collection All cards" onClick={() => navigateTo('library')}>
                  <span className="collection-tile-preview" aria-hidden="true">
                    {live.length ? live.slice(0, 4).map(card => <span key={card.id} className={`collection-preview-item ${(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? 'has-image' : ''}`}>
                      {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.dataUrl} alt="" decoding="async" loading="lazy" /> : <span>{card.title.slice(0, 1).toUpperCase()}</span>}
                    </span>) : <span className="collection-preview-empty"><NavigationIcon name="collections" /></span>}
                  </span>
                  <span className="collection-tile-info">
                    <span className="collection-tile-heading">
                      <span className="collection-folder-icon" aria-hidden="true"><NavigationIcon name="collections" /></span>
                      <strong>All cards</strong>
                      <span className="collection-tile-count">{live.length}</span>
                    </span>
                    <span className="collection-tile-description">Everything in your library</span>
                  </span>
                </button>
              </article>;
            })()}
            {(!searchTerm.trim() || 'favorites'.includes(searchTerm.trim().toLocaleLowerCase())) && (() => {
              // Starred cards, from every collection; like All cards, it can't be renamed or deleted.
              const starred = cards.filter(card => card.favorite && !card.trashed);
              return <article className="collection-tile collection-tile-all collection-tile-favorites">
                <button type="button" className="collection-tile-main" aria-label="Open Favorites" onClick={() => navigateTo('library', FAVORITES_ID)}>
                  <span className="collection-tile-preview" aria-hidden="true">
                    {starred.length ? starred.slice(0, 4).map(card => <span key={card.id} className={`collection-preview-item ${(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? 'has-image' : ''}`}>
                      {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.thumb?.url || card.dataUrl} alt="" decoding="async" loading="lazy" /> : <span>{card.title.slice(0, 1).toUpperCase()}</span>}
                    </span>) : <span className="collection-preview-empty"><InterfaceIcon name="star" /></span>}
                  </span>
                  <span className="collection-tile-info">
                    <span className="collection-tile-heading">
                      <span className="collection-folder-icon" aria-hidden="true"><InterfaceIcon name="star-filled" /></span>
                      <strong>Favorites</strong>
                      <span className="collection-tile-count">{starred.length}</span>
                    </span>
                    <span className="collection-tile-description">Cards you starred</span>
                  </span>
                </button>
              </article>;
            })()}
            {orderCollectionTree(visibleCollections).map(({ collection, depth }) => {
              const memberCards = collection.cardIds
                .map((cardId) => cards.find((card) => card.id === cardId && !card.trashed))
                .filter((card): card is CardRecord => Boolean(card))
                .slice(0, 4);
              const memberCount = collection.cardIds.filter((cardId) =>
                cards.some((card) => card.id === cardId && !card.trashed),
              ).length;

              return (
                <article key={collection.id} className={`collection-tile ${depth ? 'is-child' : ''}`} data-depth={depth} data-collection-id={collection.id} onContextMenu={event => openTileMenu(event, collection.id, 'collection')}>
                  <button
                    type="button"
                    className="collection-tile-main"
                    aria-label={`Open collection ${collection.name}`}
                    onClick={() => {
                      navigateTo('library', collection.id);
                    }}
                  >
                    <span className="collection-tile-preview" aria-hidden="true">
                      {memberCards.length > 0 ? memberCards.map((card) => (
                        <span key={card.id} className={`collection-preview-item ${(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? 'has-image' : ''}`}>
                          {(card.type === 'image' || card.type === 'pdf') && card.dataUrl
                            ? <img src={card.dataUrl} alt="" decoding="async" loading="lazy" />
                            : <span>{card.title.slice(0, 1).toUpperCase()}</span>}
                        </span>
                      )) : <span className="collection-preview-empty"><NavigationIcon name="collections" /></span>}
                    </span>
                    <span className="collection-tile-info">
                      <span className="collection-tile-heading">
                        <span className="collection-folder-icon" aria-hidden="true"><NavigationIcon name="collections" /></span>
                        <strong>{collection.name}</strong>
                        <span className="collection-tile-count">{memberCount}</span>
                      </span>
                      {collection.description && <span className="collection-tile-description">{collection.description}</span>}
                      <span className="collection-tile-owner">
                        <span className="collection-owner-avatar" aria-hidden="true">
                          {profilePhoto ? <img src={profilePhoto} alt="" /> : displayProfileName.slice(0, 1).toUpperCase()}
                        </span>
                        {displayProfileTag ? `@${displayProfileTag}` : displayProfileName}
                      </span>
                    </span>
                  </button>
                  <label className="collection-parent-field" title="Nest inside another collection">
                    <span className="visually-hidden">Parent of {collection.name}</span>
                    <select aria-label={`Parent of ${collection.name}`} value={collection.parentId ?? ''} onChange={event => void handleSetCollectionParent(collection.id, event.target.value || null)}>
                      <option value="">Top level</option>
                      {collections.filter(item => !collectionParentError(collections, collection.id, item.id)).map(item => <option key={item.id} value={item.id}>Inside {item.name}</option>)}
                    </select>
                  </label>
                  {renamingCollectionId === collection.id
                    ? <form className="collection-rename" onSubmit={event => { event.preventDefault(); void handleRenameCollection(collection.id, new FormData(event.currentTarget).get('name')); }}>
                      <input name="name" aria-label={`New name for ${collection.name}`} defaultValue={collection.name} maxLength={120} autoFocus onFocus={event => event.currentTarget.select()}
                        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setRenamingCollectionId(null); } }}
                        onBlur={event => void handleRenameCollection(collection.id, event.currentTarget.value)} />
                    </form>
                    : <button type="button" className="collection-rename-button" aria-label={`Rename ${collection.name}`} title="Rename" onClick={() => setRenamingCollectionId(collection.id)}><b className="glyph-tri" aria-hidden="true">△</b>Rename</button>}
                  <button
                    type="button"
                    className="collection-tile-delete"
                    aria-label={`Delete ${collection.name}`}
                    onClick={() => void handleDeleteCollection(collection.id)}
                  >
                    ×
                  </button>
                </article>
              );
            })}
            {collections.length === 0 && (
              <div className="empty-view">
                <NavigationIcon name="collections" />
                <p>No collections of your own yet</p>
                <button type="button" className="secondary-button" onClick={() => {
                  navigateTo('library');
                  setCollectionMenuOpen(true);
                }}>Create a collection</button>
              </div>
            )}
          </div>
        )}


        {activeView === 'library' && visibleCards.length === 0 && <div className="library-empty">
          <span aria-hidden="true">✧</span><h2>{searchTerm ? 'No matches' : selectedCollectionId === FAVORITES_ID ? 'No favorites yet' : 'No cards yet'}</h2>
          <p>{searchTerm ? 'Try a different search or clear your filters.' : selectedCollectionId === FAVORITES_ID ? 'Star a card with ☆ in its toolbar, or select cards and press F.' : extensionPaired ? 'Capture from the Duckler side panel, drop something here, or write a note.' : ''}</p>
          {/* A browser that is already paired is not asked to connect again. */}
          <button type="button" onClick={() => searchTerm ? changeSearch('') : extensionPaired ? handleQuickAddCard('text') : setExtensionSetupOpen(true)}>{searchTerm ? 'Clear search' : extensionPaired ? 'New note' : 'Connect your browser'}</button>
        </div>}
        {activeView === 'library' && <p id="card-select-hint" hidden>Click to select, double-click or Enter to edit.</p>}
        {connectFrom && (() => { const from = cards.find(card => card.id === connectFrom); return from ? <div className="selection-hint connect-hint" role="status">
          <span><b className="glyph-tri" aria-hidden="true">△</b>Pick a card to connect with “{from.title}”</span>
          <button type="button" onClick={() => setConnectFrom(null)}><b className="glyph-cir" aria-hidden="true">○</b>Esc · Cancel</button>
        </div> : null; })()}
        {/* One strip for any selection: count, collections (the same picker as under each card), connect, clear. */}
        {activeView === 'library' && selectedCardIds.length > 0 && <div className="selection-hint" role="group" aria-label="Selected card actions">
          <span role="status"><b className="glyph-sqr" aria-hidden="true">□</b>{selectedCardIds.length} selected</span>
          <button ref={selectionCollectionsRef} type="button" className="selection-collections" aria-haspopup="dialog" aria-expanded={selectionPickerOpen}
            onClick={() => setSelectionPickerOpen(open => !open)}><b className="glyph-crs" aria-hidden="true">✕</b>Collections…</button>
          {selectedCardIds.length === 2 && <button type="button" className="selection-connect" onClick={() => { void connectCards(selectedCardIds[0], selectedCardIds[1]); setSelectedCardIds([]); }}><b className="glyph-tri" aria-hidden="true">△</b>Connect these two</button>}
          <button type="button" aria-label="Clear selection" onClick={() => setSelectedCardIds([])}><b className="glyph-cir" aria-hidden="true">○</b>Esc · Clear</button>
        </div>}
        {activeView === 'library' && selectionPickerOpen && selectedCardIds.length > 0 && selectionCollectionsRef.current && (() => {
          const inAll = collections.filter(item => selectedCardIds.every(id => item.cardIds.includes(id))).map(item => item.id);
          const inSome = collections.filter(item => !inAll.includes(item.id) && selectedCardIds.some(id => item.cardIds.includes(id))).map(item => item.id);
          return <CollectionPickerPopover label="Collections for the selected cards" collections={collections} selectedIds={inAll} partialIds={inSome}
            anchor={selectionCollectionsRef.current} onClose={() => setSelectionPickerOpen(false)}
            onToggle={(collectionId, included) => void setSelectionMembership(collectionId, included)}
            onCreate={createCollectionForSelection} onOpenCollection={collectionId => navigateTo('library', collectionId)} />;
        })()}
        {activeView === 'library' && <div onClick={event => { if (event.target === event.currentTarget) setSelectedCardIds([]); }} className={`library-grid card-size-${cardSize} ${selectedCardIds.length ? 'has-selection' : ''} ${connectFrom ? 'is-connecting' : ''}`} style={{ maxWidth: Math.max(1, Math.min(cardSize === 'compact' ? 4 : 3, visibleCards.length)) * (cardSize === 'compact' ? 260 : 360) + Math.max(0, Math.min(cardSize === 'compact' ? 4 : 3, visibleCards.length) - 1) * 24 }}>
          {visibleCards.map(card => <LibraryCard key={card.id} card={card} collections={collections} api={getCardApi}
            isOpen={selectedId === card.id} isChecked={selectedCardIds.includes(card.id)} isNew={newlyCreatedCardId === card.id}
            isCaptured={capturedCardIds.includes(card.id)} isRemoving={removingCardIds.includes(card.id)} connectionCount={connectionsOf(card).length} />)}
        </div>}

        {(activeView === 'library' || activeView === 'canvas') && selectedCard ? (
          <Suspense fallback={null}><CardEditor key={selectedCard.id} card={selectedCard} collections={collections} onClose={() => setSelectedId(null)}
            onTrash={() => { void handleToggleTrash(selectedCard.id); setSelectedId(null); }}
            onDelete={() => { void handleDelete(selectedCard.id); }}
            onCapturePdfPage={selectedCard.type === 'pdf' ? async (page, image) => {
              // A captured page is an ordinary image card that remembers which PDF and page it came from.
              const base = createCardFromInput({ type: 'image', title: `${selectedCard.title} — p. ${page}`, dataUrl: image });
              const card = { ...base, source: { pdfCardId: selectedCard.id, page, fileName: selectedCard.pdf?.fileName } };
              const memberOf = collections.filter(item => item.cardIds.includes(selectedCard.id));
              const changed = memberOf.map(item => ({ ...item, cardIds: [...new Set([...item.cardIds, card.id])], updatedAt: card.createdAt }));
              await saveCardWithCollections(card, changed);
              if (changed.length) setCollections(current => current.map(item => changed.find(next => next.id === item.id) ?? item));
              setCards(current => [card, ...current]);
              notify({ title: 'Page captured', detail: `Page ${page} is now an image card.` });
            } : undefined}
            pdfNotes={selectedCard.type === 'pdf' ? cards.filter(item => item.type === 'text' && !item.trashed && item.source?.pdfCardId === selectedCard.id)
              .map(item => ({ id: item.id, page: item.source!.page, title: item.title, note: item.note })) : undefined}
            onOpenCard={id => setSelectedId(id)}
            connected={connectionsOf(selectedCard).map(link => cards.find(card => card.id === link.cardId)!).map(card => ({ id: card.id, title: card.title, note: card.note, type: card.type, dataUrl: card.dataUrl }))}
            onDisconnect={id => void connectCards(selectedCard.id, id, false)}
            onNoteFromSelection={text => createNoteFromText(selectedCard.id, text)}
            onCreateLinkedNote={selectedCard.type === 'pdf' || selectedCard.source ? async (text, page) => {
              // The note links to the PDF (and page) this card is, or was captured from, and joins its collections.
              const pdfCard = selectedCard.type === 'pdf' ? selectedCard : cards.find(item => item.id === selectedCard.source!.pdfCardId);
              const pageNumber = page ?? selectedCard.source!.page;
              const words = text.replace(/\s+/g, ' ').trim();
              const title = words.length > 60 ? `${words.slice(0, 57).replace(/\s\S*$/, '')}…` : words;
              const base = createCardFromInput({ type: 'text', title: title || `Note on page ${pageNumber}`, note: text.slice(0, 20000) });
              const card = { ...base, source: { pdfCardId: pdfCard?.id ?? selectedCard.source!.pdfCardId, page: pageNumber, fileName: pdfCard?.pdf?.fileName ?? selectedCard.source?.fileName } };
              const linked = { ...card, searchText: buildSearchText(card) };
              const memberOf = collections.filter(item => item.cardIds.includes(pdfCard?.id ?? selectedCard.id));
              const changed = memberOf.map(item => ({ ...item, cardIds: [...new Set([...item.cardIds, linked.id])], updatedAt: linked.createdAt }));
              await saveCardWithCollections(linked, changed);
              if (changed.length) setCollections(current => current.map(item => changed.find(next => next.id === item.id) ?? item));
              setCards(current => [linked, ...current]);
              notify({ title: 'Note created', detail: `Linked to page ${pageNumber}${pdfCard ? ` of “${pdfCard.title}”` : ''}` });
            } : undefined}
            pdfSource={selectedCard.source ? (() => { const pdf = cards.find(item => item.id === selectedCard.source!.pdfCardId && !item.trashed); return pdf ? { title: pdf.title, open: () => setSelectedId(pdf.id) } : undefined; })() : undefined}
            onSave={async (draft, collectionIds) => {
              const updated = { ...draft, updatedAt: new Date().toISOString(), searchText: buildSearchText(draft) };
              const nextCollections = collections.map(collection => ({ ...collection, cardIds: collectionIds.includes(collection.id) ? [...new Set([...collection.cardIds, draft.id])] : collection.cardIds.filter(id => id !== draft.id), updatedAt: updated.updatedAt }));
              await saveCardWithCollections(updated, nextCollections);
              setCards(current => current.map(card => card.id === draft.id ? updated : card)); setCollections(nextCollections);
              notify({ title: 'Saved', detail: `“${updated.title}”` });
            }} /></Suspense>
        ) : null}

        {captureQueue.length > 0 && (
          <div className="capture-queue panel">
            <h2>Capture queue</h2>
            <ul>
              {captureQueue.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.status}</span>
                  </div>
                  <button type="button" onClick={() => void handleAcknowledgeCapture(item.id)}>
                    Acknowledge
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(captureReceipts).length > 0 && (
          <div className="receipt-box">
            <h3>Delivery receipts</h3>
            <span>{Object.keys(captureReceipts).length} accepted</span>
          </div>
        )}

        {activeView === 'canvas' && (selectedCanvas
          ? <Suspense fallback={null}><CollectionCanvas key={`${selectedCanvas.id}:${pulledVersion}`} collection={selectedCanvas} cards={cards} onEditCard={setSelectedId} onRestoreCard={id => { void handleToggleTrash(id); }} onBack={goBack}
            onNavigate={target => target === 'settings' ? setSettingsOpen(true) : navigateTo(target === 'home' ? 'home' : target === 'collections' ? 'collections' : 'canvas')} /></Suspense>
          : <CanvasGallery collections={collections} cards={cards} search={searchTerm} onOpen={id => navigateTo('canvas', id)} onCreateCollection={() => { navigateTo('library'); setCollectionMenuOpen(true); }} onCreateCanvas={() => void handleCreateEmptyCanvas()}
            onTileContextMenu={(event, id) => openTileMenu(event, id, 'canvas')} renamingId={renamingCollectionId}
            onRename={(id, name) => void handleRenameCollection(id, name)} onCancelRename={() => setRenamingCollectionId(null)} />)}


        {trashedCards.length > 0 && (
          <div className="trash-panel">
            <h2>Trash</h2>
            <ul>
              {trashedCards.map((card) => (
                <li key={card.id}>
                  <span>{card.title}</span>
                  <button type="button" onClick={() => void handleToggleTrash(card.id)}>Restore</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {/* Keyboard / assistive fallback for the profile colour; clicking the card opens the picker. */}
      <input ref={profileColorInputRef} className="visually-hidden" tabIndex={-1} aria-label="Profile card color" value={profileCardColor} onChange={event => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) setProfileCardColor(event.target.value); }} />
      {profileColorAnchor && <ColorPopover anchor={profileColorAnchor} label="Profile card colour" value={profileCardColor} onChange={setProfileCardColor} onClose={() => setProfileColorAnchor(null)}
        swatches={['#3cc8ff', '#506bbb', '#2a2ca6', '#3ddc84', '#f2d33d', '#ff7ad9', '#ff4b4b', '#e6f6ff']} />}
      <div className="top-actions" role="group" aria-label="Quick controls">
        <SoundButton preferences={sounds.preferences} setPreferences={sounds.setPreferences} preview={sounds.preview} />
        <button type="button" className="settings-gear" aria-label="Open settings" title="Settings" aria-haspopup="dialog" onClick={() => { setProfileOpen(false); setAccountMenuOpen(false); setSettingsOpen(true); }}>
            <InterfaceIcon name="settings" />
          </button>
      </div>
      {textMenu && <TileMenu title="Selected text" position={textMenu} onClose={() => setTextMenu(null)} items={[
        { label: 'New note from selection', onSelect: () => { void createNoteFromText(textMenu.cardId, textMenu.text); } },
        { label: 'Copy', onSelect: () => { void navigator.clipboard?.writeText(textMenu.text).catch(() => {}); } },
      ]} />}
      {tileMenu && (() => {
        const target = collections.find(item => item.id === tileMenu.id);
        if (!target) return null;
        return <TileMenu title={target.name} position={tileMenu} onClose={() => setTileMenu(null)} items={[
          { label: tileMenu.kind === 'canvas' ? 'Open canvas' : 'Open collection', onSelect: () => navigateTo(tileMenu.kind === 'canvas' ? 'canvas' : 'library', target.id) },
          { label: 'Rename', onSelect: () => setRenamingCollectionId(target.id) },
          { label: drive.shares.has(target.id) ? 'Shared · link…' : 'Share link…', onSelect: () => setShareCollectionId(target.id) },
          ...(tileMenu.kind === 'canvas' ? [{ label: 'Open as collection', onSelect: () => navigateTo('library', target.id) }] : [{ label: 'Open its canvas', onSelect: () => navigateTo('canvas', target.id) }]),
          ...(tileMenu.kind === 'collection' ? [{ label: 'Delete', danger: true, onSelect: () => { if (window.confirm(`Delete “${target.name}”? Its cards are kept.`)) void handleDeleteCollection(target.id); } }] : []),
        ]} />;
      })()}
      {incomingShares.length > 0 && <Dialog label="Add shared items" className="app-settings incoming-shares" onClose={() => setIncomingShares([])}>
        <BButton className="close-detail" label="Discard shared items" onClick={() => setIncomingShares([])} />
        <h2>Add {incomingShares.length === 1 ? 'this shared item' : `${incomingShares.length} shared items`}?</h2>
        <p className="account-sync-note">Something was shared to Duckler. Check it before it goes into your library.</p>
        <ul className="incoming-share-list">
          {incomingShares.map(card => <li key={card.id}><strong>{card.title}</strong>{card.sourceUrl && <small>{(() => { try { return new URL(card.sourceUrl).hostname; } catch { return ''; } })()}</small>}{card.note && card.note !== card.title && <span>{card.note.slice(0, 200)}</span>}</li>)}
        </ul>
        <div className="avatar-crop-actions">
          <button type="button" onClick={() => setIncomingShares([])}>Discard</button>
          <button type="button" className="primary" onClick={() => {
            const accepted = incomingShares;
            setIncomingShares([]);
            void Promise.all(accepted.map(saveCard)).then(() => {
              setCards(current => [...accepted, ...current.filter(card => !accepted.some(item => item.id === card.id))]);
              navigateTo('library');
              notify({ title: 'Added', detail: `${accepted.length} shared item${accepted.length === 1 ? '' : 's'} added to your library.` });
            }).catch(() => notify({ kind: 'error', title: 'Not saved', detail: 'The shared items could not be saved.' }));
          }}>Add to library</button>
        </div>
      </Dialog>}
      {shareCollectionId && (() => {
        const target = collections.find(item => item.id === shareCollectionId);
        return target ? <ShareDialog collection={target} drive={drive} onClose={() => setShareCollectionId(null)} /> : null;
      })()}
      <Notifications />
      <div className="bottom-scrim" aria-hidden="true" />
      <nav className={`bottom-dock ${isHome ? 'home-dock' : ''}`} aria-label="Main navigation">
        <button type="button" className={`dock-item dock-home ${isHome ? 'active' : ''}`} aria-label="Duckler home" aria-current={isHome ? 'page' : undefined} onClick={() => { navigateTo('home'); setSortMode('newest'); }}>
          <span className="brand-mark duckler-mark" aria-hidden="true" />
        </button>
        <button type="button" className={`dock-item ${activeView === 'collections' ? 'active' : ''}`} aria-current={activeView === 'collections' ? 'page' : undefined} onClick={() => navigateTo('collections')}>
          <NavigationIcon name="collections" /><span>Collections</span>
        </button>
        <button type="button" className={`dock-item ${activeView === 'canvas' ? 'active' : ''}`} aria-current={activeView === 'canvas' ? 'page' : undefined} onClick={() => navigateTo('canvas')}>
          <NavigationIcon name="canvas" /><span>Canvas</span>
        </button>
        <div className="profile-menu" ref={profileMenuRef}>
          {accountMenuOpen && <div ref={accountMenuExitRef} className="profile-popover account-menu" role="dialog" aria-label="Account menu" {...accountHover}>
            <div className={`profile-identity-card is-clickable ${profileCover ? 'has-cover' : ''}`} style={coverStyle} role="group" aria-label="Profile card" title="Click to change the card colour" onClick={pickCardColor}>
              <label className="profile-card-image" title={profileCover ? 'Change card image' : 'Add a card image'} onClick={event => event.stopPropagation()}>
                <InterfaceIcon name="image" />
                <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label={profileCover ? 'Change profile card image' : 'Add profile card image'} onChange={handleProfileCoverChange} />
              </label>
              <label className="profile-avatar profile-avatar-large avatar-upload" title={profilePhoto ? 'Change photo' : 'Add photo'}>
                {profilePhoto ? <img src={profilePhoto} alt="" /> : <span aria-hidden="true">{displayProfileName.slice(0, 1).toUpperCase()}</span>}
                <span className="avatar-upload-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span>
                <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="Change profile photo" onChange={handleProfilePhotoChange} />
              </label>
              <EditableName value={profileName} placeholder="My Library" onChange={setProfileName} />
              {displayProfileTag && <span>@{displayProfileTag}</span>}
              {profileBio && <p className="profile-bio">{profileBio}</p>}
            </div>
            <section className="account-menu-section" aria-labelledby="account-appearance-title">
              <span id="account-appearance-title" className="account-menu-label">Appearance</span>
              <div className="theme-mode-toggle" role="group" aria-label="Color mode">
                {(['light', 'dark', 'system'] as const).map(mode => <button type="button" key={mode} aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
              </div>
              <label className="account-menu-field"><span>Skin</span>
                <select aria-label="Skin" value={appearance.preset} onChange={event => {
                  const preset = event.target.value as AppearancePreset;
                  setAppearance(preset === 'custom' ? { ...appearance, preset } : { preset, values: { ...appearancePresets[preset] } });
                }}>
                  {(Object.keys(appearancePresetNames) as Exclude<AppearancePreset, 'custom'>[]).map(preset => <option key={preset} value={preset}>{appearancePresetNames[preset]}</option>)}
                  <option value="custom">Custom</option>
                </select>
              </label>
            </section>
            <div className="account-menu-actions">
              <button type="button" onClick={() => { setAccountMenuOpen(false); setSettingsOpen(true); }}>All settings</button>
              <button type="button" onClick={() => { setAccountMenuOpen(false); setExtensionSetupOpen(true); }}>Browser extension{extensionStatus && <small>{extensionStatus}</small>}</button>
              {drive.configured && (drive.signedIn
                ? <button type="button" onClick={() => { setAccountMenuOpen(false); setSettingsOpen(true); }}>Google account<small>{syncLabel(drive)}</small></button>
                : <button type="button" onClick={() => { setAccountMenuOpen(false); void drive.signIn().catch(() => setSettingsOpen(true)); }}>{drive.account ? 'Resume sync' : 'Sign in with Google'}<small>{drive.account?.email ?? 'Sync with your Drive'}</small></button>)}
            </div>
          </div>}
          <button ref={accountTriggerRef} type="button" className={`profile-trigger ${accountMenuOpen ? 'active' : ''}`} aria-label="Account menu" title="Account" aria-haspopup="dialog" aria-expanded={accountMenuOpen} {...accountHover} 
            onClick={() => { setProfileOpen(false); setAccountMenuOpen(true); }}>
            <span className="profile-avatar" aria-hidden="true">{profilePhoto ? <img src={profilePhoto} alt="" /> : displayProfileName.slice(0, 1).toUpperCase()}</span>
          </button>
        </div>
      </nav>
      <ShortcutLegend onShowAll={() => setShortcutsOpen(true)} context={
        cardComposerOpen ? 'composer'
          : (activeView === 'library' || activeView === 'canvas') && selectedCard ? 'editor'
            : activeView === 'canvas' && selectedCanvas ? 'canvas'
              : activeView === 'library' && selectedCardIds.length ? 'selection'
                : activeView === 'library' ? 'library' : 'home'} />
      {shortcutsOpen && <Dialog label="Keyboard shortcuts" className="app-settings shortcuts-dialog" onClose={() => setShortcutsOpen(false)}>
        <BButton className="close-detail" label="Close keyboard shortcuts" onClick={() => setShortcutsOpen(false)} />
        <h2>Keyboard shortcuts</h2>
        <ShortcutTables />
      </Dialog>}
      {settingsOpen && <Dialog label="Settings" className="app-settings" onClose={() => setSettingsOpen(false)}>
        <BButton className="close-detail" label="Close settings" onClick={() => setSettingsOpen(false)} />
        <h2>Settings</h2>
        <div className={`settings-profile-card profile-identity-card is-clickable ${profileCover ? 'has-cover' : ''}`} style={coverStyle} title="Click to change the card colour" onClick={pickCardColor}>
          <label className="profile-card-image" title={profileCover ? 'Change card image' : 'Add a card image'} onClick={event => event.stopPropagation()}>
                <InterfaceIcon name="image" />
                <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label={profileCover ? 'Change profile card image' : 'Add profile card image'} onChange={handleProfileCoverChange} />
              </label>
          <label className="profile-avatar settings-avatar avatar-upload" title={profilePhoto ? 'Change photo' : 'Add photo'}>
            {profilePhoto ? <img src={profilePhoto} alt="" /> : <span aria-hidden="true">{displayProfileName.slice(0, 1).toUpperCase()}</span>}
            <span className="avatar-upload-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span>
            <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="Choose profile photo" onChange={handleProfilePhotoChange} />
          </label>
          <EditableName value={profileName} placeholder="My Library" onChange={setProfileName} />{displayProfileTag && <span>@{displayProfileTag}</span>}
          {profileBio && <p className="profile-bio">{profileBio}</p>}
        </div>
        <h3>Profile</h3>
              <label className="profile-name-field">
                <span>Profile name</span>
                <input
                  aria-label="Profile name"
                  value={profileName}
                  maxLength={48}
                  onChange={(event) => setProfileName(event.target.value)}
                />
              </label>
              <label className="profile-name-field">
                <span>User tag</span>
                <span className="profile-tag-input">
                  <span aria-hidden="true">@</span>
                  <input
                    aria-label="Profile tag"
                    value={profileTag}
                    maxLength={33}
                    placeholder="yourname"
                    onChange={(event) => setProfileTag(event.target.value)}
                  />
                </span>
              </label>
              <label className="profile-name-field profile-bio-field">
                <span>Description <small>{profileBio.length}/256</small></span>
                <textarea aria-label="Profile description" maxLength={256} rows={3} value={profileBio} placeholder="A line or two about you" onChange={event => setProfileBio(event.target.value.slice(0, 256))} />
              </label>
              <div className="profile-photo-actions">
                <span className="profile-photo-hint">Click your picture to {profilePhoto ? 'change' : 'add'} it.</span>
                {profilePhoto && (
                  <button type="button" className="profile-remove-photo" onClick={handleRemoveProfilePhoto}>
                    Remove photo
                  </button>
                )}
                {profileCover && <button type="button" className="profile-remove-photo" onClick={removeProfileCover}>Remove card image</button>}
              </div>
              {profileMessage && <p className={`profile-message ${profileError ? 'error' : ''}`} role={profileError ? 'alert' : 'status'}>{profileMessage}</p>}

        <div className="settings-section">
          <button type="button" className="settings-nav-row" onClick={() => { setSettingsOpen(false); setExtensionSetupOpen(true); }}>
            <span className="settings-row-icon" aria-hidden="true"><InterfaceIcon name="browser" /></span><span><strong>Browser extension</strong>{extensionStatus && <small>{extensionStatus}</small>}</span><InterfaceIcon name="link" />
          </button>
        </div>
        <h3>Account &amp; sync</h3>
        <AccountSync drive={drive} />
          <details className="workspace-menu" {...detailsHover}>
            <summary aria-label="Storage settings" title="Storage settings">•••</summary>
            {storageEstimate && (
              <div className="workspace-menu-content">
                <span>{storageEstimate.usageMb.toFixed(1)} MB of {storageEstimate.quotaMb.toFixed(1)} MB used</span>
                <button type="button" className="mini-button" onClick={() => void handlePersistLocalStorage()}>
                  {storageEstimate.persisted ? 'Storage protected' : 'Protect storage'}
                </button>
                <button type="button" className="mini-button" onClick={() => void handleClearLocalCache()}>
                  Clear temporary data
                </button>
              </div>
            )}
          </details>
        <div className="settings-appearance">
          <span>Theme</span><div className="theme-segment" role="group" aria-label="Theme">
            {(['light', 'dark', 'system'] as const).map(mode => <button type="button" key={mode} aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
          </div>
        </div>
        <AppearanceSettings value={appearance} onChange={setAppearance} />
        <CardStyleSettings value={cardStyle.style} onChange={cardStyle.setStyle} />
        {sounds.settings}
      </Dialog>}
      {extensionSetupOpen && <ExtensionSetup connectionStatus={extensionStatus} onClose={() => setExtensionSetupOpen(false)} onConnected={() => { setExtensionStatus('Connecting extension…'); setExtensionConnectionVersion(current => current + 1); }} />}
      {/* After Settings, so the cropper is the topmost dialog. */}
      {profileCropFile && <AvatarCropper file={profileCropFile} onCancel={() => setProfileCropFile(null)} onSave={saveCroppedProfilePhoto} />}
      {profileCoverFile && <AvatarCropper file={profileCoverFile} shape={CARD_IMAGE_SHAPE} onCancel={() => setProfileCoverFile(null)} onSave={saveProfileCover} />}
      {undoMembership && <div className="membership-undo" role="status"><span>Removed from {undoMembership.collection.name}</span><button type="button" disabled={membershipSaving} onClick={() => void handleUndoMembership()}>Undo</button></div>}
      {undoDelete && !undoMembership && <div className="membership-undo" role="status"><span>Deleted {undoDelete.cards.length === 1 ? `“${undoDelete.cards[0].title.slice(0, 40)}”` : `${undoDelete.cards.length} cards`}</span><button type="button" onClick={() => void handleUndoDelete()}>Undo</button></div>}
      {quickAddPosition && <div ref={quickAddRef} className="quick-add-context" role="menu" aria-label="Quick add" tabIndex={-1} style={{ left: quickAddPosition.left, top: quickAddPosition.top }}
        onPointerEnter={() => { quickAddHovered.current = true; scheduleQuickAddClose(null); }}
        onPointerLeave={() => { quickAddHovered.current = false; scheduleQuickAddClose(HOVER_CLOSE_DELAY); }}
        // Safari doesn't focus clicked buttons, so a blur while the pointer is on the menu isn't "leaving" it.
        onBlur={event => { if (!quickAddHovered.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setQuickAddPosition(null); }}>
        <strong>Quick add</strong>
        {createActions.map(action => <button key={action.label} type="button" role="menuitem" onClick={() => { setQuickAddPosition(null); action.run(); }}>{action.icon}{action.label}</button>)}
      </div>}
      {/* One file input for every Upload action (it used to live inside the + menu, so right-click Upload had none). */}
      <input ref={imagePickerRef} type="file" accept="image/*,application/pdf,.pdf" onChange={handleFileChange} hidden />
      <div className={`add-menu ${addMenuOpen ? 'is-open' : ''}`} ref={addMenuRef} {...addHover}>
        <button ref={cardComposerTriggerRef} type="button" className="floating-add-button" aria-label="Add card" aria-expanded={addMenuOpen} aria-haspopup="true" title="Add card" onFocus={() => { if (skipAddFocusOpen.current) skipAddFocusOpen.current = false; else setAddMenuOpen(true); }} onClick={() => setAddMenuOpen(true)}>+</button>
        {addMenuOpen && <div ref={addMenuExitRef} className="add-menu-popover" aria-label="Create">
          {([0, 1] as const).map(group => <div key={group} className="add-menu-group">
            {createActions.filter(action => action.group === group).map(action => <button key={action.label} type="button" onClick={() => { setAddMenuOpen(false); action.run(); }}>
              <span className="add-menu-icon" aria-hidden="true">{action.icon}</span>
              <span>{action.label}</span>
            </button>)}
          </div>)}
        </div>}
      </div>
      {cardComposerOpen && (
        <div
          className={`composer-backdrop ${composerSaving ? 'is-saving' : ''}`}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !composerSaving) {
              setCardComposerOpen(false);
            }
          }}
        >
          <form
            className="card-composer"
            role="dialog"
            aria-modal="true"
            aria-busy={composerSaving}
            aria-labelledby="card-composer-title"
            onSubmit={handleCreateCard}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
                ),
              );
              const first = focusable[0];
              const last = focusable.at(-1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <header className="composer-topbar">
              <BButton className="composer-close" label="Close add card" disabled={composerSaving} onClick={() => setCardComposerOpen(false)} />
              <h2 id="card-composer-title" className="visually-hidden">Add card</h2>
                <label className="composer-type-control">
                  <span className="visually-hidden">Card type</span>
                  <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CardRecord['type'] })}>
                    <option value="bookmark">Bookmark</option>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                  </select>
                </label>
              <div className="composer-toolbar">
                <button type="button" className={`composer-tool ${composerSourceOpen ? 'active' : ''}`} title="Source" aria-pressed={composerSourceOpen} onClick={() => setComposerSourceOpen((open) => !open)}>
                  <span aria-hidden="true"><InterfaceIcon name="link" /></span> Source
                </button>
                <button type="button" className="composer-tool" title="Note" onClick={() => composerNoteRef.current?.focus()}>
                  <span aria-hidden="true"><InterfaceIcon name="note" /></span> Note
                </button>
                <button type="button" className={`composer-tool ${composerCollectionsOpen ? 'active' : ''}`} title="Collections" aria-expanded={composerCollectionsOpen} onClick={() => setComposerCollectionsOpen((open) => !open)}>
                  <span aria-hidden="true"><NavigationIcon name="collections" /></span> Collections{newCardCollectionIds.length ? ` · ${newCardCollectionIds.length}` : ''}
                </button>
                {form.type === 'image' && (
                  <label className="composer-tool composer-upload">
                    <span aria-hidden="true"><InterfaceIcon name="upload" /></span> Image
                    <input type="file" accept="image/*,application/pdf,.pdf" onChange={handleFileChange} />
                  </label>
                )}
              </div>
              <button type="submit" className="primary-button composer-save" disabled={composerSaving}>{composerSaving && <span className="save-spinner" aria-hidden="true" />}{composerSaving ? 'Saving…' : 'Save'}</button>
            </header>
            <div className="composer-writing-area">
              {composerError && <p className="composer-error" role="alert">{composerError}</p>}
              {composerSourceOpen && (
                <label className="composer-source-field">
                  <span className="visually-hidden">Source URL</span>
                  <input type="text" inputMode="url" autoCapitalize="off" placeholder="Paste a link" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} />
                </label>
              )}
              {composerCollectionsOpen && (
                <div className="composer-collections" aria-label="Choose collections">
                  {collections.length === 0 ? <span>No collections yet</span> : collections.map((collection) => (
                    <label key={collection.id} className="composer-collection-option">
                      <input
                        type="checkbox"
                        checked={newCardCollectionIds.includes(collection.id)}
                        onChange={() => setNewCardCollectionIds((current) =>
                          current.includes(collection.id)
                            ? current.filter((id) => id !== collection.id)
                            : [...current, collection.id],
                        )}
                      />
                      <span>{collection.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <input
                id="new-card-title"
                className="composer-title"
                aria-label="Title"
                autoComplete="off"
                placeholder="Untitled"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <textarea
                ref={composerNoteRef}
                className="composer-note"
                aria-label="Note"
                placeholder="Type here… Enter saves, Shift+Enter starts a new line"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              />
              <label className="composer-tags">
                <span className="visually-hidden">Tags</span>
                <input placeholder="Add tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
              </label>
              {mediaPreview && form.type === 'image' ? <img src={mediaPreview} alt="Image preview" className="preview" /> : null}
              <button type="button" className="composer-queue" disabled={composerSaving} onClick={handleQueueCapture}>Save for later</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;

