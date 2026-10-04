import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
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
  exportLibrary,
  toggleCardInCollection,
  type CaptureQueueItem,
  type CardRecord,
  type CollectionRecord,
} from '@visual-library/shared';
import {
  deleteCollection,
  readCards,
  readCollections,
  removeCard,
  saveCard,
  saveCollection,
} from './lib/cardDb';
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  isGoogleDriveConfigured,
} from './lib/googleDrive';
import { clearPendingShareItems, readPendingShareItems, type PendingShareItem } from './lib/shareQueue';
import { parseExtensionCapture, type ExtensionCapture } from './lib/extensionCapture';
import { parseShareTargetFallback } from './lib/shareTargetFallback';

const defaultCards = [
  createCardFromInput({
    type: 'bookmark',
    title: 'Spec checklist',
    sourceUrl: 'https://example.com/spec',
    tags: ['reference', 'planning'],
    note: 'Track the milestone and accepted behavior for the next release candidate.',
  }),
  createCardFromInput({
    type: 'text',
    title: 'Design note',
    note: 'Keep the library local, searchable, and resilient before enabling sync.',
    tags: ['research'],
  }),
];

const defaultCollections = [
  createCollectionFromInput({
    name: 'Inbox',
    description: 'Fresh items to review',
    cardIds: defaultCards.map((card) => card.id),
  }),
  createCollectionFromInput({
    name: 'Research',
    description: 'Reference material',
    cardIds: [defaultCards[0].id],
  }),
];

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
type ActiveView = 'library' | 'collections' | 'canvas';

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
  const [cards, setCards] = useState<CardRecord[]>(defaultCards);
  const [collections, setCollections] = useState<CollectionRecord[]>(defaultCollections);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('library');
  const [profileName, setProfileName] = useState(() => localStorage.getItem('visual-library-profile-name') ?? 'My Library');
  const [profileTag, setProfileTag] = useState(() => localStorage.getItem('visual-library-profile-tag') ?? '');
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem('visual-library-profile-photo') ?? '');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState(false);
  const displayProfileName = profileName.trim() || 'My Library';
  const displayProfileTag = profileTag.trim().replace(/^@+/, '');
  const [bulkDestinationId, setBulkDestinationId] = useState<string>('');
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usageMb: number; quotaMb: number; persisted: boolean } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [collectionForm, setCollectionForm] = useState(emptyCollectionForm);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [cardComposerOpen, setCardComposerOpen] = useState(false);
  const [composerSourceOpen, setComposerSourceOpen] = useState(false);
  const [composerCollectionsOpen, setComposerCollectionsOpen] = useState(false);
  const [newCardCollectionIds, setNewCardCollectionIds] = useState<string[]>([]);
  const composerNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const cardComposerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const collectionMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const cardComposerWasOpenRef = useRef(false);

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
      const activeCollections = storedCollections.length > 0 ? storedCollections : defaultCollections;
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
        setCards(mergedCards.length > 0 ? mergedCards : defaultCards);
        setSelectedId(importedCards[0]?.id ?? null);
        setShareNotice(`Imported ${importedCards.length} shared item${importedCards.length === 1 ? '' : 's'} from your share sheet.`);
        void clearPendingShareItems();
      } else {
        if (extensionCard) {
          const card = extensionCard;
          setCards((current) => [card, ...current.filter((existing) => existing.id !== card.id)]);
          setSelectedId(card.id);
          setShareNotice(`Added “${card.title}” from Duckler Capture.`);
        } else if (extensionCaptureError || fallbackShareError) {
          setShareNotice(extensionCaptureError ?? fallbackShareError);
        } else if (storedCards.length > 0) {
          setCards(storedCards);
        }
      }

    }).catch((error: unknown) => {
      setShareNotice(error instanceof Error ? `Extension capture could not be saved: ${error.message}` : 'Extension capture could not be saved.');
    });

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('visual-library-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('visual-library-profile-name', displayProfileName);
  }, [displayProfileName]);

  useEffect(() => {
    localStorage.setItem('visual-library-profile-tag', displayProfileTag);
  }, [displayProfileTag]);

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
      if (event.key === 'Escape') {
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
    if (!addMenuOpen && !collectionMenuOpen && !profileOpen) {
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
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (addMenuOpen) {
        setAddMenuOpen(false);
        cardComposerTriggerRef.current?.focus();
      }
      if (collectionMenuOpen) {
        setCollectionMenuOpen(false);
      }
      if (profileOpen) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [addMenuOpen, collectionMenuOpen, profileOpen]);

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

  const trashedCards = useMemo(() => cards.filter((card) => card.trashed), [cards]);
  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const canvasNodes = useMemo<Node[]>(() => {
    return cards.slice(0, 6).map((card, index) => ({
      id: card.id,
      position: { x: (index % 3) * 220, y: Math.floor(index / 3) * 150 },
      data: { label: card.title },
      style: { width: 180, padding: 12, borderRadius: 12 },
    }));
  }, [cards]);

  const canvasEdges = useMemo<Edge[]>(() => {
    if (canvasNodes.length < 2) {
      return [];
    }

    return canvasNodes.slice(1).map((node, index) => ({
      id: `edge-${node.id}`,
      source: canvasNodes[index].id,
      target: node.id,
      animated: true,
    }));
  }, [canvasNodes]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
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
    event.target.value = '';
  };

  const handleCreateCard = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      return;
    }

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

    setCards((current) => [card, ...current]);
    setSelectedId(card.id);
    setForm(emptyForm);
    setMediaPreview(null);

    const changedCollections = collections
      .filter((collection) => newCardCollectionIds.includes(collection.id))
      .map((collection) => ({
        ...collection,
        cardIds: toggleCardInCollection(collection, card.id),
        updatedAt: new Date().toISOString(),
      }));
    if (changedCollections.length > 0) {
      setCollections((current) =>
        current.map((collection) =>
          changedCollections.find((changed) => changed.id === collection.id) ?? collection,
        ),
      );
      await Promise.all(changedCollections.map(saveCollection));
    }

    await saveCard(card);
    setCardComposerOpen(false);
  };

  const handleQueueCapture = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const queued = enqueueCapture({
      kind: form.type,
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

  const handleDeleteCollection = async (collectionId: string) => {
    await deleteCollection(collectionId);
    setCollections((current) => current.filter((collection) => collection.id !== collectionId));
    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId(null);
    }
    if (bulkDestinationId === collectionId) {
      setBulkDestinationId('');
    }
  };

  const handleUpdateSelected = async (updated: Partial<CardRecord>) => {
    if (!selectedCard) {
      return;
    }

    const nextCard: CardRecord = {
      ...selectedCard,
      ...updated,
      updatedAt: new Date().toISOString(),
      searchText: `${updated.title ?? selectedCard.title} ${updated.note ?? selectedCard.note} ${updated.sourceUrl ?? selectedCard.sourceUrl ?? ''} ${updated.tags?.join(' ') ?? selectedCard.tags.join(' ')}`.toLowerCase(),
      tags: updated.tags ?? selectedCard.tags,
    };

    setCards((current) => current.map((item) => (item.id === nextCard.id ? nextCard : item)));
    await saveCard(nextCard);
  };

  const handleToggleTrash = async (cardId: string) => {
    const target = cards.find((card) => card.id === cardId);
    if (!target) return;

    const nextCard = { ...target, trashed: !target.trashed, updatedAt: new Date().toISOString() };
    setCards((current) => current.map((card) => (card.id === cardId ? nextCard : card)));
    await saveCard(nextCard);
  };

  const handleDelete = async (cardId: string) => {
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
    if (selectedId === cardId) setSelectedId(null);
  };

  const handleToggleCardCollectionMembership = async (collectionId: string, cardId: string) => {
    const targetCollection = collections.find((collection) => collection.id === collectionId);
    if (!targetCollection) {
      return;
    }

    const nextCollection = {
      ...targetCollection,
      cardIds: toggleCardInCollection(targetCollection, cardId),
      updatedAt: new Date().toISOString(),
    };

    setCollections((current) => current.map((collection) => (collection.id === collectionId ? nextCollection : collection)));
    await saveCollection(nextCollection);
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
    setAddMenuOpen(false);
    setForm({ ...emptyForm, type });
    setNewCardCollectionIds(selectedCollectionId ? [selectedCollectionId] : []);
    setComposerSourceOpen(type === 'bookmark');
    setComposerCollectionsOpen(false);
    setCardComposerOpen(true);
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

  const handleExport = () => {
    const blob = new Blob([exportLibrary(cards, collections)], { type: 'application/json' });
    triggerDownload(blob, 'visual-library-export.json');
  };

  const handleObsidianExport = async () => {
    const archive = createObsidianExportArchive(cards, collections);
    const zip = new JSZip();

    for (const file of archive.files) {
      zip.file(file.path, file.content);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    triggerDownload(blob, 'visual-library-obsidian-export.zip');
  };

  const handleClearLocalCache = async () => {
    localStorage.removeItem('visual-library-capture-queue');
    localStorage.removeItem('visual-library-capture-receipts');
    localStorage.removeItem('visual-library-theme');
    await clearPendingShareItems();
    setCaptureQueue([]);
    setCaptureReceipts({});
    setShareNotice('Cleared the local capture and share cache. Your library content remains in IndexedDB.');
  };

  const handlePersistLocalStorage = async () => {
    if (!('storage' in navigator) || typeof navigator.storage?.persist !== 'function') {
      setShareNotice('This browser does not support persistent storage requests.');
      return;
    }

    const persisted = await navigator.storage.persist();
    setStorageEstimate((current) => ({
      usageMb: current?.usageMb ?? 0,
      quotaMb: current?.quotaMb ?? 0,
      persisted,
    }));
    setShareNotice(persisted ? 'Local storage persistence enabled for this device.' : 'Storage persistence was not granted by the browser.');
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

  return (
    <main className="app-shell">
      <header className="workspace-bar">
        <button
          type="button"
          className="brand-row home-link"
          aria-label="Duckler home"
          onClick={() => {
            setActiveView('library');
            setSelectedCollectionId(null);
            setSelectedId(null);
            setSelectedCardIds([]);
            setSearchTerm('');
            setTypeFilter('all');
            setSortMode('newest');
            setProfileOpen(false);
          }}
        >
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5.5c-3.3 0-6 2.6-6 6 0 3.1 2.2 5.7 5.1 6.1l1.8.3 1.4 3.3c.5 1.2 2.2 1.2 2.7 0l1.5-3.4 1.7-.2c3.2-.4 5.8-3.1 5.8-6.1 0-3.4-2.8-6-6.3-6-1.8 0-3.4.8-4.6 2-.6-.6-1.5-1-2.4-1Z" fill="currentColor" />
            </svg>
          </div>
          <span className="brand-name">duckler</span>
        </button>
        <label className="sidebar-search workspace-search" aria-label="Search library">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 0 1 5.1 11.1l4.3 4.3 1.4-1.4-4.3-4.3A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" fill="currentColor"/></svg>
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search library" />
        </label>
        <div className="workspace-tools">
          <div className="sync-status" aria-live="polite" title={sidebarStatusText}>
            <span className={`sync-dot ${syncStatus.connected ? 'online' : 'offline'}`} aria-hidden="true" />
            <span>{sidebarStatusText}</span>
          </div>
          <button type="button" className="settings-button theme-toggle" onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span>
          </button>
          <button type="button" className="secondary-button drive-action" onClick={() => void handleDriveConnection()} disabled={!isGoogleDriveConfigured() && !driveConnected} title={isGoogleDriveConfigured() || driveConnected ? 'Google Drive settings' : 'Configure VITE_GOOGLE_CLIENT_ID to enable Drive'}>
            {driveConnected ? 'Drive settings' : 'Connect Drive'}
          </button>
          <details className="workspace-menu">
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
        </div>
      </header>
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
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 0 1 5.1 11.1l4.3 4.3 1.4-1.4-4.3-4.3A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" fill="currentColor"/></svg>
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search your library" />
        </label>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button type="button" className="nav-item active">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Zm2 1.5v10h12V7H6Zm2 2h8v2H8V9Zm0 4h6v2H8v-2Z" fill="currentColor"/></svg>
            <span>Library</span>
          </button>
          <button type="button" className="nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-9Zm2.5-.5a.5.5 0 0 0-.5.5v9c0 .3.2.5.5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-9Zm1.5 2h6v2h-6V9Zm0 4h4v2h-4v-2Z" fill="currentColor"/></svg>
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
          <button type="button" className="settings-button" onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5a2.5 2.5 0 0 1 2.4 1.7l.4 1.3 1.4.4a2.5 2.5 0 0 1 1.5 3.2l-.6 1.4 1 1.2a2.5 2.5 0 0 1 0 3.2l-1 1.2.6 1.4a2.5 2.5 0 0 1-1.5 3.2l-1.4.4-.4 1.3A2.5 2.5 0 0 1 12 22.5a2.5 2.5 0 0 1-2.4-1.7l-.4-1.3-1.4-.4a2.5 2.5 0 0 1-1.5-3.2l.6-1.4-1-1.2a2.5 2.5 0 0 1 0-3.2l1-1.2-.6-1.4a2.5 2.5 0 0 1 1.5-3.2l1.4-.4.4-1.3A2.5 2.5 0 0 1 12 1.5Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" fill="currentColor"/></svg>
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
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

      <section className="content panel" data-view={activeView}>
        <header className="page-header">
          <h1>
            {activeView === 'library'
              ? (selectedCollection?.name ?? 'Library')
              : activeView === 'collections'
                ? 'Collections'
                : 'Canvases'}
          </h1>
        </header>

        {activeView === 'library' && (
          <div className="collection-shelf">
            <div className="collection-menu" ref={collectionMenuRef}>
              <button type="button" className="collection-menu-trigger" aria-label="Choose collection" aria-expanded={collectionMenuOpen} aria-haspopup="true" onClick={() => setCollectionMenuOpen((open) => !open)}>
                <span>{selectedCollection?.name ?? 'All cards'}</span>
                <span className="collection-menu-count">{selectedCollection?.cardIds.length ?? cards.filter((card) => !card.trashed).length}</span>
                <span className="menu-chevron" aria-hidden="true">⌄</span>
              </button>
              {collectionMenuOpen && <div className="collection-menu-popover" aria-label="Collections">
                <button
                  type="button"
                  className={`collection-menu-item ${selectedCollectionId === null ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCollectionId(null);
                    setCollectionMenuOpen(false);
                  }}
                >
                  <span>All cards</span>
                  <span>{cards.filter((card) => !card.trashed).length}</span>
                </button>
                {collections.map((collection) => (
                  <div key={collection.id} className="collection-menu-row">
                    <button
                      type="button"
                      className={`collection-menu-item ${selectedCollectionId === collection.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCollectionId(collection.id);
                        setCollectionMenuOpen(false);
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
                <details className="library-options">
              <summary>View options <span className="menu-chevron" aria-hidden="true">⌄</span></summary>
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
                <div className="library-option-actions">
                  <button type="button" onClick={handleExport}>Export JSON</button>
                  <button type="button" onClick={() => void handleObsidianExport()}>Export Obsidian</button>
                  {installPrompt && <button type="button" onClick={handleInstall}>Install app</button>}
                </div>
              </div>
              </details>
              </div>
            </div>
          </div>
        )}

        {activeView === 'library' && (
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

        {shareNotice && (
          <div className="status-banner success-banner" role="status">
            {shareNotice}
          </div>
        )}

        {activeView === 'collections' && (
          <div className="collection-grid" aria-label="Your collections">
            {collections.map((collection) => {
              const memberCards = collection.cardIds
                .map((cardId) => cards.find((card) => card.id === cardId && !card.trashed))
                .filter((card): card is CardRecord => Boolean(card))
                .slice(0, 4);
              const memberCount = collection.cardIds.filter((cardId) =>
                cards.some((card) => card.id === cardId && !card.trashed),
              ).length;

              return (
                <article key={collection.id} className="collection-tile">
                  <button
                    type="button"
                    className="collection-tile-main"
                    aria-label={`Open collection ${collection.name}`}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setActiveView('library');
                    }}
                  >
                    <span className="collection-tile-preview" aria-hidden="true">
                      {memberCards.length > 0 ? memberCards.map((card) => (
                        <span key={card.id} className={`collection-preview-item ${card.type === 'image' && card.dataUrl ? 'has-image' : ''}`}>
                          {card.type === 'image' && card.dataUrl
                            ? <img src={card.dataUrl} alt="" />
                            : <span>{card.title.slice(0, 1).toUpperCase()}</span>}
                        </span>
                      )) : <span className="collection-preview-empty">▱</span>}
                    </span>
                    <span className="collection-tile-info">
                      <span className="collection-tile-heading">
                        <span className="collection-folder-icon" aria-hidden="true">▱</span>
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
                <span aria-hidden="true">▱</span>
                <p>No collections yet</p>
                <button type="button" className="secondary-button" onClick={() => {
                  setActiveView('library');
                  setCollectionMenuOpen(true);
                }}>Create a collection</button>
              </div>
            )}
          </div>
        )}

        {activeView === 'library' && selectedCardIds.length > 0 && (
          <div className="bulk-actions">
            <span>{selectedCardIds.length} selected</span>
            <select value={bulkDestinationId} onChange={(event) => setBulkDestinationId(event.target.value)}>
              <option value="">Choose collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
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

        {activeView === 'library' && <div className="library-grid">
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
              <article
                key={card.id}
                className={`card-tile ${selectedId === card.id ? 'selected' : ''}`}
                tabIndex={0}
                aria-label={`Open ${card.title}`}
                onClick={() => setSelectedId(card.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(card.id);
                  }
                }}
              >
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
                {card.type === 'image' && card.dataUrl ? <img src={card.dataUrl} alt={card.title} className="card-image" /> : null}
                {card.type !== 'image' ? <div className="text-card-preview"><span>{card.title}</span></div> : null}
                <div className="card-body">
                  <h2>{card.title}</h2>
                  {card.note ? <p className="card-note">{card.note}</p> : null}
                  {sourceLabel ? <p className="card-source">{sourceLabel}</p> : null}
                </div>
              </article>
            );
          })}
        </div>}

        {activeView === 'library' && selectedCard ? (
          <aside className="detail-panel" aria-label="Card details">
            <div className="detail-header">
              <div className="detail-preview">
                {selectedCard.type === 'image' && selectedCard.dataUrl ? <img src={selectedCard.dataUrl} alt={selectedCard.title} /> : null}
                {selectedCard.type !== 'image' ? <div className="detail-preview-text">{selectedCard.title}</div> : null}
              </div>
              <button type="button" className="close-detail" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
            </div>

            <div className="detail-field">
              <label>Title</label>
              <input value={selectedCard.title} onChange={(event) => void handleUpdateSelected({ title: event.target.value })} />
            </div>
            <div className="detail-field">
              <label>Source</label>
              <input value={selectedCard.sourceUrl ?? ''} onChange={(event) => void handleUpdateSelected({ sourceUrl: event.target.value || undefined })} />
            </div>
            <div className="detail-field">
              <label>Note</label>
              <textarea value={selectedCard.note} onChange={(event) => void handleUpdateSelected({ note: event.target.value })} />
            </div>
            <div className="detail-field">
              <label>Tags</label>
              <input value={selectedCard.tags.join(', ')} onChange={(event) => void handleUpdateSelected({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
            </div>

            <div className="collection-assignment">
              <h3>Collections</h3>
              {collections.map((collection) => (
                <label key={collection.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={collection.cardIds.includes(selectedCard.id)}
                    onChange={() => void handleToggleCardCollectionMembership(collection.id, selectedCard.id)}
                  />
                  <span>{collection.name}</span>
                </label>
              ))}
            </div>

            <div className="detail-actions">
              <button type="button" onClick={() => void handleToggleTrash(selectedCard.id)}>{selectedCard.trashed ? 'Restore' : 'Move to trash'}</button>
              <button type="button" className="danger" onClick={() => void handleDelete(selectedCard.id)}>Delete</button>
            </div>
          </aside>
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

        <div className="canvas-panel panel">
          <h2>Canvas</h2>
          <div className="canvas-surface">
            <ReactFlow nodes={canvasNodes} edges={canvasEdges} fitView minZoom={0.3} maxZoom={1.5} nodesDraggable>
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </div>

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
      <nav className="bottom-dock" aria-label="Main navigation">
        <button type="button" className={`dock-item ${activeView === 'library' ? 'active' : ''}`} aria-current={activeView === 'library' ? 'page' : undefined} onClick={() => setActiveView('library')}>
          <span className="dock-icon" aria-hidden="true">▦</span><span>Library</span>
        </button>
        <button type="button" className={`dock-item ${activeView === 'collections' ? 'active' : ''}`} aria-current={activeView === 'collections' ? 'page' : undefined} onClick={() => setActiveView('collections')}>
          <span className="dock-icon" aria-hidden="true">▱</span><span>Collections</span>
        </button>
        <button type="button" className={`dock-item ${activeView === 'canvas' ? 'active' : ''}`} aria-current={activeView === 'canvas' ? 'page' : undefined} onClick={() => setActiveView('canvas')}>
          <span className="dock-icon" aria-hidden="true">▧</span><span>Canvas</span>
        </button>
        <div className="profile-menu" ref={profileMenuRef}>
          {profileOpen && (
            <div className="profile-popover" aria-label="Profile">
              <div className="profile-popover-heading">
                <span className="profile-avatar profile-avatar-large" aria-hidden="true">
                  {profilePhoto ? <img src={profilePhoto} alt="" /> : displayProfileName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{displayProfileName}</strong>
                  <span>{displayProfileTag ? `@${displayProfileTag}` : driveConnected ? driveAccount : 'Local profile'}</span>
                </div>
              </div>
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
              <div className="profile-photo-actions">
                <label className="profile-photo-picker">
                  <input
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Choose profile photo"
                    onChange={handleProfilePhotoChange}
                  />
                  <span>{profilePhoto ? 'Change photo' : 'Add photo'}</span>
                </label>
                {profilePhoto && (
                  <button type="button" className="profile-remove-photo" onClick={handleRemoveProfilePhoto}>
                    Remove photo
                  </button>
                )}
              </div>
              {profileMessage && <p className={`profile-message ${profileError ? 'error' : ''}`} role={profileError ? 'alert' : 'status'}>{profileMessage}</p>}
              <div className="profile-sync-state">
                <span className={`sync-dot ${syncStatus.connected ? 'online' : 'offline'}`} aria-hidden="true" />
                <span>{sidebarStatusText}</span>
              </div>
              <button type="button" className="profile-drive-action" onClick={() => void handleDriveConnection()} disabled={!isGoogleDriveConfigured() && !driveConnected}>
                {driveConnected ? 'Manage Drive connection' : 'Connect Google Drive'}
              </button>
            </div>
          )}
          <button
            type="button"
            className={`profile-trigger ${profileOpen ? 'active' : ''}`}
            aria-label="Open profile"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            onClick={() => setProfileOpen((open) => !open)}
          >
            <span className="profile-avatar" aria-hidden="true">
              {profilePhoto ? <img src={profilePhoto} alt="" /> : displayProfileName.slice(0, 1).toUpperCase()}
            </span>
          </button>
        </div>
      </nav>
      <div className={`add-menu ${addMenuOpen ? 'is-open' : ''}`} ref={addMenuRef}>
        <button ref={cardComposerTriggerRef} type="button" className="floating-add-button" aria-label="Add card" aria-expanded={addMenuOpen} aria-haspopup="true" title="Add card" onClick={() => setAddMenuOpen((open) => !open)}>+</button>
        {addMenuOpen && <div className="add-menu-popover" aria-label="Create">
          <div className="add-menu-group">
            <button type="button" onClick={() => {
              setActiveView('library');
              setAddMenuOpen(false);
              setCollectionMenuOpen(true);
            }}>
              <span className="add-menu-icon" aria-hidden="true">▱</span>
              <span>Collection</span>
            </button>
            <button type="button" onClick={() => {
              setActiveView('canvas');
              setAddMenuOpen(false);
            }}>
              <span className="add-menu-icon" aria-hidden="true">▧</span>
              <span>Canvas</span>
            </button>
          </div>
          <div className="add-menu-group">
            <button type="button" onClick={() => handleQuickAddCard('bookmark')}>
              <span className="add-menu-icon" aria-hidden="true">↗</span>
              <span>Link</span>
            </button>
            <label className="add-menu-action">
              <span className="add-menu-icon" aria-hidden="true">↥</span>
              <span>Upload</span>
              <input ref={imagePickerRef} type="file" accept="image/*" onChange={handleFileChange} />
            </label>
            <button type="button" onClick={() => handleQuickAddCard('text')}>
              <span className="add-menu-icon" aria-hidden="true">≡</span>
              <span>Note</span>
            </button>
          </div>
        </div>}
      </div>
      {cardComposerOpen && (
        <div
          className="composer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCardComposerOpen(false);
            }
          }}
        >
          <form
            className="card-composer"
            role="dialog"
            aria-modal="true"
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
              <button type="button" className="composer-close" aria-label="Close add card" onClick={() => setCardComposerOpen(false)}>×</button>
              <h2 id="card-composer-title" className="visually-hidden">Add card</h2>
              <div className="composer-toolbar">
                <label className="composer-type-control">
                  <span className="visually-hidden">Card type</span>
                  <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CardRecord['type'] })}>
                    <option value="bookmark">Bookmark</option>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                  </select>
                </label>
                <button type="button" className={`composer-tool ${composerSourceOpen ? 'active' : ''}`} aria-pressed={composerSourceOpen} onClick={() => setComposerSourceOpen((open) => !open)}>
                  <span aria-hidden="true">↗</span> Source
                </button>
                <button type="button" className="composer-tool" onClick={() => composerNoteRef.current?.focus()}>
                  <span aria-hidden="true">▤</span> Note
                </button>
                <button type="button" className={`composer-tool ${composerCollectionsOpen ? 'active' : ''}`} aria-expanded={composerCollectionsOpen} onClick={() => setComposerCollectionsOpen((open) => !open)}>
                  <span aria-hidden="true">▱</span> Collections{newCardCollectionIds.length ? ` · ${newCardCollectionIds.length}` : ''}
                </button>
                {form.type === 'image' && (
                  <label className="composer-tool composer-upload">
                    <span aria-hidden="true">↥</span> Image
                    <input type="file" accept="image/*" onChange={handleFileChange} />
                  </label>
                )}
                <button type="submit" className="primary-button composer-save">Save</button>
              </div>
            </header>
            <div className="composer-writing-area">
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
              <button type="button" className="composer-queue" onClick={handleQueueCapture}>Save for later</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
