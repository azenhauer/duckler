import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '@xyflow/react/dist/style.css';
import JSZip from 'jszip';
import {
  acknowledgeCapture,
  createCardFromInput,
  createCaptureReceipt,
  createCollectionFromInput,
  createDriveStatus,
  createObsidianExportArchive,
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
  restoreLibraryBackup,
  saveCard,
  saveCardWithCollections,
  saveCollection,
  setCardCollectionMembership,
} from './lib/cardDb';
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  isGoogleDriveConfigured,
} from './lib/googleDrive';
import { clearPendingShareItems, readPendingShareItems, type PendingShareItem } from './lib/shareQueue';
import { parseExtensionCapture, type ExtensionCapture } from './lib/extensionCapture';
import { parseShareTargetFallback } from './lib/shareTargetFallback';
import { startExtensionBridge, getExtensionConnection } from './lib/extensionBridge';
import { ExtensionSetup } from './components/ExtensionSetup';
import { Dialog } from './components/Dialog';
import { CardEditor } from './components/CardEditor';
import { ScreenshotNote } from './components/ScreenshotNote';
import { SoundButton, UI_SOUND_EVENT, useUiSounds } from './components/UiSounds';
import { CardActions } from './components/CardActions';
import { CardCollectionControls } from './components/CollectionPicker';
import { AppearanceSettings, appearancePresetNames } from './components/AppearanceSettings';
import { CardStyleSettings } from './components/CardStyleSettings';
import { useCardStyle } from './lib/cardStyle';
import { APPEARANCE_STORAGE_KEY, appearancePresets, appearanceStyle, loadAppearance, type AppearancePreset } from './lib/appearance';
import { NavigationIcon } from './components/NavigationIcon';
import { HOVER_CLOSE_DELAY, detailsHover, useHoverIntent } from './lib/hoverIntent';
import { useExitAnimation } from './lib/exitAnimation';
import { InterfaceIcon } from './components/InterfaceIcon';
import { CanvasGallery } from './components/CanvasGallery';
import { CollectionCanvas } from './components/CollectionCanvas';
import { Notifications, notify } from './components/Notifications';
import { BButton } from './components/BButton';
import { inferImageTitle } from './lib/imageName';

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

const processedExtensionCaptureIds = new Set<string>();

type TypeFilter = 'all' | 'image' | 'link' | 'text';
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

function App() {
  const sounds = useUiSounds();
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
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
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const [profileName, setProfileName] = useState(() => localStorage.getItem('visual-library-profile-name') ?? 'My Library');
  const [profileTag, setProfileTag] = useState(() => localStorage.getItem('visual-library-profile-tag') ?? '');
  const [profileBio, setProfileBio] = useState(() => (localStorage.getItem('duckler-profile-bio') ?? '').slice(0, 256));
  const profileColorInputRef = useRef<HTMLInputElement | null>(null);
  // Clicking the identity card itself (not the photo) opens its colour picker.
  const pickCardColor = (event: React.MouseEvent) => { if (!(event.target as HTMLElement).closest('.avatar-upload')) profileColorInputRef.current?.click(); };
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem('visual-library-profile-photo') ?? '');
  const [profileCardColor, setProfileCardColor] = useState(() => {
    const saved = localStorage.getItem('duckler-profile-card-color');
    return saved && /^#[\da-f]{6}$/i.test(saved) ? saved : '#779b91';
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState(false);
  const displayProfileName = profileName.trim() || 'My Library';
  const displayProfileTag = profileTag.trim().replace(/^@+/, '');
  const [bulkDestinationId, setBulkDestinationId] = useState<string>('');
  const [bulkNewName, setBulkNewName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [captureQueue, setCaptureQueue] = useState<CaptureQueueItem[]>([]);
  const [captureReceipts, setCaptureReceipts] = useState<Record<string, string>>({});
  const [syncState, setSyncState] = useState<string[]>(['card-1', 'card-2']);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveAccount, setDriveAccount] = useState<string>('Not connected');
  const [driveRootId, setDriveRootId] = useState<string>('not-discovered');
  const [driveMessage, setDriveMessage] = useState<string>('Local library is ready. Drive integration requires Google auth and a configured OAuth client.');
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
  const accountHover = useHoverIntent(useCallback((open: boolean) => { if (!open || !settingsOpenRef.current) setAccountMenuOpen(open); }, []));
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

    const extensionCaptureParam = new URLSearchParams(window.location.search).get('ducklerCapture');
    let fallbackShare: PendingShareItem | null = null;
    let fallbackShareError: string | null = null;
    try {
      fallbackShare = parseShareTargetFallback(window.location.search);
    } catch (error) {
      fallbackShareError = error instanceof Error ? error.message : 'The shared item could not be read.';
    }
    const clearFallbackShareParams = () => {
      const cleanUrl = new URL(window.location.href);
      ['sharedId', 'sharedTitle', 'sharedText', 'sharedUrl'].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    };
    if (fallbackShareError && new URLSearchParams(window.location.search).has('sharedId')) {
      clearFallbackShareParams();
    }
    let extensionCapture: ExtensionCapture | null = null;
    let extensionCaptureError: string | null = null;
    try {
      extensionCapture = parseExtensionCapture(extensionCaptureParam);
    } catch (error) {
      extensionCaptureError = error instanceof Error ? error.message : 'Could not read the extension capture.';
    }
    let duplicateMountCapture = false;
    if (extensionCapture && processedExtensionCaptureIds.has(extensionCapture.id)) {
      extensionCapture = null;
      duplicateMountCapture = true;
    } else if (extensionCapture) {
      processedExtensionCaptureIds.add(extensionCapture.id);
    }
    const clearExtensionCaptureParam = () => {
      if (!extensionCaptureParam) return;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('ducklerCapture');
      window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    };
    if (extensionCaptureParam && !extensionCapture && !duplicateMountCapture) {
      clearExtensionCaptureParam();
    }

    void Promise.all([readCards(), readCollections(), readPendingShareItems()]).then(async ([storedCards, storedCollections, pendingSharedItems]) => {
      const activeCollections = storedCollections;
      const shareItems = fallbackShare ? [...pendingSharedItems, fallbackShare] : pendingSharedItems;
      const importedCards = shareItems
        .map((item) => createCardFromSharedItem(item))
        .filter((card): card is CardRecord => Boolean(card))
        .filter((card, index, all) => all.findIndex((candidate) => candidate.id === card.id) === index)
        .filter((card) => !storedCards.some((stored) => stored.id === card.id));
      await Promise.all(importedCards.map(saveCard));
      if (fallbackShare) clearFallbackShareParams();

      let extensionCard: CardRecord | null = null;
      if (extensionCapture && !storedCards.some((card) => card.id === extensionCapture?.id)) {
        const cardType = extensionCapture.kind === 'image' || extensionCapture.kind === 'screenshot'
          ? 'image'
          : extensionCapture.kind === 'text'
            ? 'text'
            : 'bookmark';
        const created = createCardFromInput({
          id: extensionCapture.id,
          type: cardType,
          title: extensionCapture.title,
          sourceUrl: extensionCapture.sourceUrl,
          note: extensionCapture.note,
          tags: extensionCapture.tags,
          dataUrl: cardType === 'image' ? extensionCapture.payload : undefined,
        });
        extensionCard = extensionCapture.createdAt
          ? { ...created, createdAt: extensionCapture.createdAt }
          : created;
        await saveCard(extensionCard);
        if (extensionCapture.collectionName) {
          const matchingCollection = activeCollections.find(
            (collection) => collection.name.toLowerCase() === extensionCapture?.collectionName?.toLowerCase(),
          );
          if (matchingCollection) {
            const updatedCollection = {
              ...matchingCollection,
              cardIds: Array.from(new Set([...matchingCollection.cardIds, extensionCard.id])),
              updatedAt: new Date().toISOString(),
            };
            await saveCollection(updatedCollection);
            activeCollections.splice(
              activeCollections.findIndex((collection) => collection.id === updatedCollection.id),
              1,
              updatedCollection,
            );
          } else {
            const createdCollection = createCollectionFromInput({
              name: extensionCapture.collectionName,
              cardIds: [extensionCard.id],
            });
            await saveCollection(createdCollection);
            activeCollections.unshift(createdCollection);
          }
        }
      }
      if (extensionCapture && !extensionCard) {
        clearExtensionCaptureParam();
      } else if (extensionCard) {
        clearExtensionCaptureParam();
      }
      setCollections(activeCollections);

      if (importedCards.length > 0) {
        const mergedCards = [...importedCards, ...(extensionCard ? [extensionCard] : []), ...storedCards];
        setCards(mergedCards);
        setSelectedId(importedCards[0]?.id ?? null);
        setActiveView('library');
        notify({ title: 'Imported', detail: `Imported ${importedCards.length} shared item${importedCards.length === 1 ? '' : 's'} from your share sheet.` });
        void clearPendingShareItems();
      } else {
        if (extensionCard) {
          const card = extensionCard;
          setCards((current) => [card, ...current.filter((existing) => existing.id !== card.id)]);
          setSelectedId(card.id);
          setActiveView('library');
          notify({ title: 'Captured', detail: `Added “${card.title}” from Duckler Capture.` });
        } else if (extensionCaptureError || fallbackShareError) {
          notify({ kind: 'error', title: 'Capture failed', detail: extensionCaptureError ?? fallbackShareError ?? undefined });
        } else {
          setCards(storedCards);
        }
      }

    }).catch((error: unknown) => {
      notify({ kind: 'error', title: 'Capture not saved', detail: error instanceof Error ? `Extension capture could not be saved: ${error.message}` : 'Extension capture could not be saved.' });
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
    const stop = startExtensionBridge(() => {
      void Promise.all([readCards(), readCollections()]).then(([nextCards, nextCollections]) => {
        if (disposed) return;
        setCards(nextCards);
        if (nextCollections.length) setCollections(nextCollections);
      });
    }, setExtensionStatus, () => collectionsRef.current.map(collection => ({ id: collection.id, name: collection.name, cardCount: collection.cardIds.length })));
    return () => { disposed = true; stop(); };
  }, [extensionConnectionVersion]);

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
      if (accountMenuOpen && !profileMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
      if (quickAddPosition) setQuickAddPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
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

  useEffect(() => {
    if (selectedCollectionId && !bulkDestinationId) {
      setBulkDestinationId(selectedCollectionId);
    }
  }, [bulkDestinationId, selectedCollectionId]);

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null;
  const selectedCanvas = collections.find(collection => collection.id === selectedCanvasId) ?? null;
  const isHome = activeView === 'home';
  const activeCardCount = cards.filter(card => !card.trashed).length;
  const showLibraryFilters = activeView === 'library';
  // The search field always works on what the current page shows.
  const searchPlaceholder = isHome ? 'Search refs'
    : activeView === 'collections' ? 'Search collections'
    : activeView === 'canvas' ? 'Search canvases'
    : selectedCollection ? `Search ${selectedCollection.name}` : 'Search all notes';
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
      try { window.history.pushState({ ...(window.history.state ?? {}), duckler: entry }, ''); } catch { /* History is optional. */ }
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
  }, [cards, searchTerm, selectedCollection, sortMode, typeFilter]);

  const selectCard = (cardId: string, additive: boolean) => setSelectedCardIds(current => additive
    ? (current.includes(cardId) ? current.filter(id => id !== cardId) : [...current, cardId])
    : (current.length === 1 && current[0] === cardId ? [] : [cardId]));
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
    if (!file) {
      return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      event.target.value = '';
      setAddMenuOpen(false);
      void handleAddPdf(file);
      return;
    }

    setForm({ ...emptyForm, type: 'image' });
    setMediaPreview(null);
    setNewCardCollectionIds(selectedCollectionId ? [selectedCollectionId] : []);
    setComposerSourceOpen(false);
    setComposerCollectionsOpen(false);
    setCardComposerOpen(true);
    setAddMenuOpen(false);
    const reader = new FileReader();
    reader.onload = () => {
      setMediaPreview(String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
    // Name it from the image's own metadata or a meaningful file name, never "Screenshot 2026-…".
    void inferImageTitle(file).then(title => { if (title) setForm(current => current.title ? current : { ...current, title }); });
    event.target.value = '';
  };

  // A PDF becomes a card straight away: first page as its picture, the file and its text kept with it.
  const handleAddPdf = async (file: File) => {
    // Each upload's "Reading…" notice is replaced by that upload's own result.
    const noticeKey = `pdf:${crypto.randomUUID()}`;
    notify({ kind: 'progress', key: noticeKey, title: 'Reading PDF', detail: file.name });
    try {
      const { readPdfFile } = await import('./lib/pdf');
      const { title, thumbnail, pdf } = await readPdfFile(file);
      const base = createCardFromInput({ type: 'pdf', title, dataUrl: thumbnail, note: '' });
      const card = { ...base, pdf, searchText: buildSearchText({ ...base, pdf }) };
      const changed = selectedCollectionId ? collections.filter(item => item.id === selectedCollectionId).map(item => ({ ...item, cardIds: [...new Set([...item.cardIds, card.id])], updatedAt: card.createdAt })) : [];
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

    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
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
      if (changedCollections.length > 0) {
        setCollections((current) =>
          current.map((collection) =>
            changedCollections.find((changed) => changed.id === collection.id) ?? collection,
          ),
        );
      }
      setCards((current) => [card, ...current]);
      setNewlyCreatedCardId(card.id);
      setSelectedId(card.id);
      notify({ title: 'Card added', detail: `“${card.title}”` });
      setActiveView('library');
      setForm(emptyForm);
      setMediaPreview(null);
      setCardComposerOpen(false);
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
    setSyncState((current) => {
      const next = [...current, itemId];
      return Array.from(new Set(next)).sort();
    });
  };

  const handleDriveConnection = async () => {
    if (driveConnected) {
      const disconnected = disconnectGoogleDrive();
      setDriveConnected(false);
      setDriveAccount('Not connected');
      setDriveRootId('not-discovered');
      setDriveMessage(disconnected.message);
      return;
    }

    const result = await connectGoogleDrive();
    setDriveConnected(result.connected);
    setDriveAccount(result.email ?? 'Not connected');
    setDriveRootId(result.rootFolderId ?? 'not-discovered');
    setDriveMessage(result.message);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
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
    setSelectedCollectionId(collection.id);
    setBulkDestinationId(collection.id);
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
    if (bulkDestinationId === collectionId) {
      setBulkDestinationId('');
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

  const handleDelete = async (cardId: string) => {
    const card = cards.find(item => item.id === cardId);
    if (!card || !window.confirm(`Delete “${card.title}” permanently? This cannot be undone.`)) return;
    setRemovingCardIds(current => current.includes(cardId) ? current : [...current, cardId]);
    if (selectedId === cardId) setSelectedId(null);
    await new Promise(resolve => window.setTimeout(resolve, 180));
    try {
      setCollections((current) =>
        current.map((collection) => ({
          ...collection,
          cardIds: collection.cardIds.filter((id) => id !== cardId),
          updatedAt: new Date().toISOString(),
        })),
      );
      setSelectedCardIds((current) => current.filter((id) => id !== cardId));
      await removeCard(cardId);
      setCards((current) => current.filter((card) => card.id !== cardId));
      notify({ kind: 'info', title: 'Deleted', detail: `“${card.title}”` });
    } finally {
      setRemovingCardIds(current => current.filter(id => id !== cardId));
    }
  };

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

  const handleBulkAddToCollection = async (collectionId: string) => {
    const resolvedCollectionId = collectionId || selectedCollectionId || '';
    if (!resolvedCollectionId || selectedCardIds.length === 0) {
      return;
    }

    const targetCollection = collections.find((collection) => collection.id === resolvedCollectionId);
    if (!targetCollection) {
      return;
    }

    const nextCollection = {
      ...targetCollection,
      cardIds: Array.from(new Set([...targetCollection.cardIds, ...selectedCardIds])),
      updatedAt: new Date().toISOString(),
    };

    setCollections((current) => current.map((collection) => (collection.id === resolvedCollectionId ? nextCollection : collection)));
    setSelectedCardIds([]);
    setBulkDestinationId(resolvedCollectionId);
    await saveCollection(nextCollection);
  };

  // Create a collection on the spot from the selection bar and put every selected card in it.
  const handleBulkCreateCollection = async () => {
    const name = bulkNewName?.trim();
    if (!name || selectedCardIds.length === 0) return;
    const collection = createCollectionFromInput({ name, description: 'User-made collection', cardIds: [...selectedCardIds] });
    try {
      await saveCollection(collection);
      setCollections(current => [collection, ...current]);
      setBulkDestinationId(collection.id);
      setSelectedCardIds([]);
      setBulkNewName(null);
      notify({ title: 'Collection created', detail: `“${name}” · ${collection.cardIds.length} cards` });
    } catch {
      notify({ kind: 'error', title: "Couldn't create collection" });
    }
  };

  const handleBulkRemoveFromCollection = async (collectionId: string) => {
    const resolvedCollectionId = collectionId || selectedCollectionId || '';
    if (!resolvedCollectionId || selectedCardIds.length === 0) {
      return;
    }

    const targetCollection = collections.find((collection) => collection.id === resolvedCollectionId);
    if (!targetCollection) {
      return;
    }

    const nextCollection = {
      ...targetCollection,
      cardIds: targetCollection.cardIds.filter((cardId) => !selectedCardIds.includes(cardId)),
      updatedAt: new Date().toISOString(),
    };

    setCollections((current) => current.map((collection) => (collection.id === resolvedCollectionId ? nextCollection : collection)));
    setSelectedCardIds([]);
    setBulkDestinationId(resolvedCollectionId);
    await saveCollection(nextCollection);
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

  const openQuickAddMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,button,a,[contenteditable="true"],article,.card-collection-pills')) return;
    if ('preventDefault' in event) event.preventDefault();
    const point = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setAddMenuOpen(false);
    setQuickAddPosition({ left: Math.max(12, Math.min(point.x, window.innerWidth - 250)), top: Math.max(12, Math.min(point.y, window.innerHeight - 220)) });
  };

  const syncStatus = createDriveStatus(driveConnected, syncState);
  const sidebarStatusText = syncStatus.connected ? `Connected • ${syncState.length} update${syncState.length === 1 ? '' : 's'}` : 'Local only';

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
    const archive = appendCanvasesToObsidianArchive(createObsidianExportArchive(cards, collections), await readCanvasBackups().catch(() => []), cards);
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

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileError(true);
      setProfileMessage('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setProfileError(true);
      setProfileMessage('Profile photos must be 1 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setProfileError(true);
        setProfileMessage('The selected photo could not be read.');
        return;
      }
      try {
        localStorage.setItem('visual-library-profile-photo', reader.result);
      } catch {
        setProfileError(true);
        setProfileMessage('The photo could not be saved in this browser. Try a smaller image.');
        return;
      }
      setProfilePhoto(reader.result);
      setProfileError(false);
      setProfileMessage('Profile photo saved on this device.');
    };
    reader.onerror = () => {
      setProfileError(true);
      setProfileMessage('The selected photo could not be read.');
    };
    reader.readAsDataURL(file);
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
    <main className="app-shell" aria-busy={!libraryLoaded} onContextMenu={openQuickAddMenu} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) openQuickAddMenu(event); }} {...cardStyle.shellProps} style={{ '--profile-accent': profileCardColor, ...appearanceStyle(appearance.values, theme), ...cardStyle.shellStyle } as CSSProperties}>
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
              onClick={() => setSelectedCollectionId(null)}
            >
              <span className="collection-check" aria-hidden="true" />
              <span>All cards</span>
            </button>
            {collections.map((collection) => (
              <div key={collection.id} className="collection-row">
                <button
                  type="button"
                  className={`collection-button ${selectedCollectionId === collection.id ? 'active' : ''}`}
                  onClick={() => setSelectedCollectionId(collection.id)}
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
            <span className={`sync-dot ${syncStatus.connected ? 'online' : 'offline'}`} aria-hidden="true" />
            <span>{sidebarStatusText}</span>
          </div>
          <button type="button" className="settings-button secondary-settings" onClick={() => void handleDriveConnection()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5a2.5 2.5 0 0 1 2.4 1.7l.4 1.3 1.4.4a2.5 2.5 0 0 1 1.5 3.2l-.6 1.4 1 1.2a2.5 2.5 0 0 1 0 3.2l-1 1.2.6 1.4a2.5 2.5 0 0 1-1.5 3.2l-1.4.4-.4 1.3A2.5 2.5 0 0 1 12 22.5a2.5 2.5 0 0 1-2.4-1.7l-.4-1.3-1.4-.4a2.5 2.5 0 0 1-1.5-3.2l.6-1.4-1-1.2a2.5 2.5 0 0 1 0-3.2l1-1.2-.6-1.4a2.5 2.5 0 0 1 1.5-3.2l1.4-.4.4-1.3A2.5 2.5 0 0 1 12 1.5Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" fill="currentColor"/></svg>
            <span>{driveConnected ? 'Settings' : 'Sync settings'}</span>
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
            <input value={searchTerm} onChange={event => changeSearch(event.target.value)}
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
          </h1></div>
        </header>}

        {showLibraryFilters && (
          <div className="collection-shelf">
            <div className="collection-menu" ref={collectionMenuRef} {...collectionHover}>
              <button type="button" className="collection-menu-trigger" aria-label="Choose collection" aria-expanded={collectionMenuOpen} aria-haspopup="true" onClick={() => setCollectionMenuOpen((open) => !open)}>
                <span>{selectedCollection?.name ?? 'All notes'}</span>
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
                      {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.dataUrl} alt="" /> : <span>{card.title.slice(0, 1).toUpperCase()}</span>}
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
            {orderCollectionTree(visibleCollections).map(({ collection, depth }) => {
              const memberCards = collection.cardIds
                .map((cardId) => cards.find((card) => card.id === cardId && !card.trashed))
                .filter((card): card is CardRecord => Boolean(card))
                .slice(0, 4);
              const memberCount = collection.cardIds.filter((cardId) =>
                cards.some((card) => card.id === cardId && !card.trashed),
              ).length;

              return (
                <article key={collection.id} className={`collection-tile ${depth ? 'is-child' : ''}`} data-depth={depth}>
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
                            ? <img src={card.dataUrl} alt="" />
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

        {activeView === 'library' && selectedCardIds.length > 1 && (
          <div className="bulk-actions" role="group" aria-label="Selected card actions">
            <span>{selectedCardIds.length} selected</span>
            {bulkNewName === null ? <select aria-label="Choose collection" value={bulkDestinationId} onChange={(event) => { if (event.target.value === '__new') setBulkNewName(''); else setBulkDestinationId(event.target.value); }}>
              <option value="">Choose collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
              <option value="__new">+ New collection…</option>
            </select> : <form className="bulk-new-collection" onSubmit={event => { event.preventDefault(); void handleBulkCreateCollection(); }}>
              <input autoFocus aria-label="New collection name" placeholder="New collection name" maxLength={120} value={bulkNewName} onChange={event => setBulkNewName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setBulkNewName(null); } }} />
              <button type="submit" disabled={!bulkNewName.trim()}>Create &amp; add</button>
              <BButton label="Cancel new collection" onClick={() => setBulkNewName(null)} />
            </form>}
            <button type="button" onClick={() => void handleBulkAddToCollection(bulkDestinationId)}>
              Add to collection
            </button>
            <button type="button" className="secondary-button" onClick={() => void handleBulkRemoveFromCollection(bulkDestinationId)}>
              Remove from collection
            </button>
            <button type="button" className="ghost-button" onClick={() => setSelectedCardIds([])}>
              Clear selection
            </button>
          </div>
        )}

        {activeView === 'library' && visibleCards.length === 0 && <div className="library-empty">
          <span aria-hidden="true">✧</span><h2>{searchTerm ? 'No matches' : 'No cards yet'}</h2>
          <p>{searchTerm ? 'Try a different search or clear your filters.' : ''}</p>
          <button type="button" onClick={() => searchTerm ? changeSearch('') : setExtensionSetupOpen(true)}>{searchTerm ? 'Clear search' : 'Connect your browser'}</button>
        </div>}
        {activeView === 'library' && <p id="card-select-hint" hidden>Click to select, double-click or Enter to edit.</p>}
        {activeView === 'library' && <div onClick={event => { if (event.target === event.currentTarget) setSelectedCardIds([]); }} className={`library-grid card-size-${cardSize} ${selectedCardIds.length ? 'has-selection' : ''}`} style={{ maxWidth: Math.max(1, Math.min(cardSize === 'compact' ? 4 : 3, visibleCards.length)) * (cardSize === 'compact' ? 260 : 360) + Math.max(0, Math.min(cardSize === 'compact' ? 4 : 3, visibleCards.length) - 1) * 24 }}>
          {visibleCards.map((card) => {
            const sourceLabel = card.sourceUrl
              ? (() => {
                  try {
                    return new URL(card.sourceUrl).hostname.replace('www.', '');
                  } catch {
                    return card.sourceUrl;
                  }
                })()
              : null;

            return (
              <div className={`library-card ${newlyCreatedCardId === card.id ? 'is-new' : ''} ${capturedCardIds.includes(card.id) ? 'is-captured' : ''} ${removingCardIds.includes(card.id) ? 'is-removing' : ''}`} key={card.id}>
                <div className="tile-header">
                  <input
                    type="checkbox"
                    aria-label={`Select ${card.title}`}
                    checked={selectedCardIds.includes(card.id)}
                    onChange={() => {
                      setSelectedCardIds((current) =>
                        current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
                      );
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              <CardActions title={card.title} collections={collections} onEdit={() => setSelectedId(card.id)} onDelete={() => { void handleDelete(card.id); }} onMove={async collectionId => {
                const updated = { ...card, updatedAt: new Date().toISOString() };
                const nextCollections = collections.map(collection => ({ ...collection, cardIds: collection.id === collectionId ? [...new Set([...collection.cardIds, card.id])] : collection.cardIds.filter(id => id !== card.id), updatedAt: updated.updatedAt }));
                await saveCardWithCollections(updated, nextCollections);
                setCards(current => current.map(item => item.id === card.id ? updated : item)); setCollections(nextCollections);
              }} />
              <article
                className={`card-tile card-type-${card.type} ${selectedId === card.id ? 'selected' : ''} ${selectedCardIds.includes(card.id) ? 'is-checked' : ''}`}
                data-tinted={card.color ? 'true' : undefined}
                style={card.color ? { '--card-tint': card.color } as CSSProperties : undefined}
                tabIndex={0}
                aria-label={`Open ${card.title}`}
                aria-describedby="card-select-hint"
                // One click selects (Ctrl/Cmd/Shift adds to the selection); a double click opens the editor.
                onClick={(event) => selectCard(card.id, event.ctrlKey || event.metaKey || event.shiftKey)}
                onDoubleClick={() => setSelectedId(card.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    setSelectedId(card.id);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    selectCard(card.id, true);
                  }
                }}
              >


                {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.dataUrl} alt={card.title} className="card-image" /> : null}
                {card.type === 'pdf' && <span className="card-pdf-badge">PDF · {card.pdf?.pageCount ?? '?'} p</span>}
                {card.source && <span className="card-pdf-badge card-source-badge">Page {card.source.page}</span>}
                {capturedCardIds.includes(card.id) && <span className="capture-flash" aria-hidden="true"><i /><i /><i /><i /></span>}
                {card.type === 'text' ? <div className="text-card-preview note-card-preview"><span className="card-kind">NOTE</span><p>{card.note || card.title}</p></div> : null}
                {card.type === 'bookmark' ? <div className="bookmark-card-preview">
                  <span className="card-kind">LINK <InterfaceIcon name="link" /></span>
                  <h2>{card.title}</h2>{card.note && <p>{card.note}</p>}
                  {sourceLabel && <span className="bookmark-domain">{sourceLabel}</span>}
                </div> : null}
                <div className="card-body">
                  {card.type !== 'bookmark' && <h2>{card.title}</h2>}
                  <div className="card-footer-meta" hidden={card.type === 'image'}>
                    <span>{card.type === 'image' ? 'Image' : card.type === 'text' ? 'Note' : 'Link'}</span>
                    <time dateTime={card.createdAt}>{new Date(card.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
                  </div>
                  {card.tags.length > 0 && <div className="card-tag-list">{card.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</div>}
                </div>
              </article>
              {card.type === 'image' && <ScreenshotNote note={card.note} />}
              <CardCollectionControls cardId={card.id} collections={collections}
                onToggle={(collectionId, included) => void changeMembership(card.id, collectionId, included)}
                onCreate={name => handleCreateCollectionForCard(card.id, name)}
                onOpenCollection={collectionId => navigateTo('library', collectionId)} />
              </div>
            );
          })}
        </div>}

        {(activeView === 'library' || activeView === 'canvas') && selectedCard ? (
          <CardEditor key={selectedCard.id} card={selectedCard} collections={collections} onClose={() => setSelectedId(null)}
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
            }} />
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
          ? <CollectionCanvas key={selectedCanvas.id} collection={selectedCanvas} cards={cards} onEditCard={setSelectedId} onRestoreCard={id => { void handleToggleTrash(id); }} onBack={goBack} />
          : <CanvasGallery collections={collections} cards={cards} search={searchTerm} onOpen={id => navigateTo('canvas', id)} onCreateCollection={() => { navigateTo('library'); setCollectionMenuOpen(true); }} onCreateCanvas={() => void handleCreateEmptyCanvas()} />)}

        <div className="sync-panel panel">
          <h2>Sync status</h2>
          <p>{syncStatus.connected ? 'Google Drive connected' : 'Google Drive offline'}</p>
          <p>Account: {driveAccount}</p>
          <p>Root folder: {driveRootId}</p>
          <p>Status: {driveMessage}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleDriveConnection()}
            disabled={!isGoogleDriveConfigured() && !driveConnected}
          >
            {driveConnected ? 'Disconnect Drive' : 'Connect Drive'}
          </button>
          {!isGoogleDriveConfigured() && !driveConnected && (
            <p className="status-banner">Set VITE_GOOGLE_CLIENT_ID to enable the real Google Drive OAuth flow. Until then, this app stays in local-only mode.</p>
          )}
        </div>

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
      <input ref={profileColorInputRef} className="visually-hidden" type="color" aria-label="Profile card color" value={profileCardColor} onChange={event => setProfileCardColor(event.target.value)} />
      <div className="top-actions" role="group" aria-label="Quick controls">
        <SoundButton preferences={sounds.preferences} setPreferences={sounds.setPreferences} preview={sounds.preview} />
        <button type="button" className="settings-gear" aria-label="Open settings" title="Settings" aria-haspopup="dialog" onClick={() => { setProfileOpen(false); setAccountMenuOpen(false); setSettingsOpen(true); }}>
            <InterfaceIcon name="settings" />
          </button>
      </div>
      <ul className="ps-hints" aria-hidden="true">
        <li><b className="crs">✕</b>Enter</li><li><b className="cir">○</b>Back</li><li><b className="tri">△</b>Options</li><li><b className="sqr">□</b>Select</li>
      </ul>
      <Notifications />
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
            <div className="profile-identity-card is-clickable" role="group" aria-label="Profile card" title="Click to change the card colour" onClick={pickCardColor}>
              <label className="profile-avatar profile-avatar-large avatar-upload" title={profilePhoto ? 'Change photo' : 'Add photo'}>
                {profilePhoto ? <img src={profilePhoto} alt="" /> : <span aria-hidden="true">{displayProfileName.slice(0, 1).toUpperCase()}</span>}
                <span className="avatar-upload-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span>
                <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Change profile photo" onChange={handleProfilePhotoChange} />
              </label>
              <strong>{displayProfileName}</strong>
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
              <button type="button" onClick={() => { setAccountMenuOpen(false); setExtensionSetupOpen(true); }}>Browser extension</button>
              {isGoogleDriveConfigured() && <button type="button" onClick={() => { setAccountMenuOpen(false); void handleDriveConnection(); }}>{driveConnected ? 'Disconnect Google Drive' : 'Connect Google Drive'}</button>}
            </div>
          </div>}
          <button ref={accountTriggerRef} type="button" className={`profile-trigger ${accountMenuOpen ? 'active' : ''}`} aria-label="Account menu" title="Account" aria-haspopup="dialog" aria-expanded={accountMenuOpen} {...accountHover} 
            onClick={() => { setProfileOpen(false); setAccountMenuOpen(true); }}>
            <span className="profile-avatar" aria-hidden="true">{profilePhoto ? <img src={profilePhoto} alt="" /> : displayProfileName.slice(0, 1).toUpperCase()}</span>
          </button>
        </div>
      </nav>
      {settingsOpen && <Dialog label="Settings" className="app-settings" onClose={() => setSettingsOpen(false)}>
        <BButton className="close-detail" label="Close settings" onClick={() => setSettingsOpen(false)} />
        <h2>Settings</h2>
        <div className="settings-profile-card profile-identity-card is-clickable" title="Click to change the card colour" onClick={pickCardColor}>
          <label className="profile-avatar settings-avatar avatar-upload" title={profilePhoto ? 'Change photo' : 'Add photo'}>
            {profilePhoto ? <img src={profilePhoto} alt="" /> : <span aria-hidden="true">{displayProfileName.slice(0, 1).toUpperCase()}</span>}
            <span className="avatar-upload-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span>
            <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={handleProfilePhotoChange} />
          </label>
          <strong>{displayProfileName}</strong>{displayProfileTag && <span>@{displayProfileTag}</span>}
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
              </div>
              {profileMessage && <p className={`profile-message ${profileError ? 'error' : ''}`} role={profileError ? 'alert' : 'status'}>{profileMessage}</p>}

        <div className="settings-section">
          <button type="button" className="settings-nav-row" onClick={() => { setSettingsOpen(false); setExtensionSetupOpen(true); }}>
            <span className="settings-row-icon" aria-hidden="true"><InterfaceIcon name="browser" /></span><span><strong>Browser extension</strong>{extensionStatus && <small>{extensionStatus}</small>}</span><InterfaceIcon name="link" />
          </button>
        </div>
        <div className="settings-section">
          <button type="button" className="settings-nav-row" onClick={() => void handleDriveConnection()} disabled={!isGoogleDriveConfigured() && !driveConnected} title={isGoogleDriveConfigured() || driveConnected ? 'Google Drive settings' : 'Configure VITE_GOOGLE_CLIENT_ID to enable Drive'}>
            {driveConnected ? 'Drive settings' : 'Connect Drive'}
          </button>
        </div>
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
      {extensionSetupOpen && <ExtensionSetup onClose={() => setExtensionSetupOpen(false)} onConnected={() => setExtensionConnectionVersion(current => current + 1)} />}
      {undoMembership && <div className="membership-undo" role="status"><span>Removed from {undoMembership.collection.name}</span><button type="button" disabled={membershipSaving} onClick={() => void handleUndoMembership()}>Undo</button></div>}
      {quickAddPosition && <div ref={quickAddRef} className="quick-add-context" role="menu" aria-label="Quick add" tabIndex={-1} style={{ left: quickAddPosition.left, top: quickAddPosition.top }}
        onPointerEnter={() => { quickAddHovered.current = true; scheduleQuickAddClose(null); }}
        onPointerLeave={() => { quickAddHovered.current = false; scheduleQuickAddClose(HOVER_CLOSE_DELAY); }}
        // Safari doesn't focus clicked buttons, so a blur while the pointer is on the menu isn't "leaving" it.
        onBlur={event => { if (!quickAddHovered.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setQuickAddPosition(null); }}>
        <strong>Quick add</strong>
        <button type="button" role="menuitem" onClick={() => { navigateTo('library'); setQuickAddPosition(null); setCollectionMenuOpen(true); }}><NavigationIcon name="collections" />Collection</button>
        <button type="button" role="menuitem" onClick={() => { setQuickAddPosition(null); void handleCreateEmptyCanvas(); }}><NavigationIcon name="canvas" />Canvas</button>
        <button type="button" role="menuitem" onClick={() => { setQuickAddPosition(null); handleQuickAddCard('bookmark'); }}><InterfaceIcon name="link" />Link</button>
        <button type="button" role="menuitem" onClick={() => { setQuickAddPosition(null); imagePickerRef.current?.click(); }}><InterfaceIcon name="upload" />Upload</button>
        <button type="button" role="menuitem" onClick={() => { setQuickAddPosition(null); handleQuickAddCard('text'); }}><InterfaceIcon name="note" />Note</button>
      </div>}
      <div className={`add-menu ${addMenuOpen ? 'is-open' : ''}`} ref={addMenuRef} {...addHover}>
        <button ref={cardComposerTriggerRef} type="button" className="floating-add-button" aria-label="Add card" aria-expanded={addMenuOpen} aria-haspopup="true" title="Add card" onFocus={() => { if (skipAddFocusOpen.current) skipAddFocusOpen.current = false; else setAddMenuOpen(true); }} onClick={() => setAddMenuOpen(true)}>+</button>
        {addMenuOpen && <div ref={addMenuExitRef} className="add-menu-popover" aria-label="Create">
          <div className="add-menu-group">
            <button type="button" onClick={() => {
              navigateTo('library');
              setAddMenuOpen(false);
              setCollectionMenuOpen(true);
            }}>
              <span className="add-menu-icon" aria-hidden="true"><NavigationIcon name="collections" /></span>
              <span>Collection</span>
            </button>
            <button type="button" onClick={() => {
              setAddMenuOpen(false);
              void handleCreateEmptyCanvas();
            }}>
              <span className="add-menu-icon" aria-hidden="true"><NavigationIcon name="canvas" /></span>
              <span>Canvas</span>
            </button>
          </div>
          <div className="add-menu-group">
            <button type="button" onClick={() => handleQuickAddCard('bookmark')}>
              <span className="add-menu-icon" aria-hidden="true"><InterfaceIcon name="link" /></span>
              <span>Link</span>
            </button>
            <label className="add-menu-action">
              <span className="add-menu-icon" aria-hidden="true"><InterfaceIcon name="upload" /></span>
              <span>Upload</span>
              <input ref={imagePickerRef} type="file" accept="image/*,application/pdf,.pdf" onChange={handleFileChange} />
            </label>
            <button type="button" onClick={() => handleQuickAddCard('text')}>
              <span className="add-menu-icon" aria-hidden="true"><InterfaceIcon name="note" /></span>
              <span>Note</span>
            </button>
          </div>
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
                required
                placeholder="Untitled"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <textarea
                ref={composerNoteRef}
                className="composer-note"
                aria-label="Note"
                placeholder="Type here..."
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
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




