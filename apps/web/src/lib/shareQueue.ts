export type PendingShareItem = {
  id?: string;
  title?: string;
  text?: string;
  url?: string;
};

const SHARED_ITEM_STORE = 'visual-library-share-queue';
const DB_NAME = 'visual-library-pwa';
const DB_VERSION = 1;

const fallbackRead = (): PendingShareItem[] => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(SHARED_ITEM_STORE);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PendingShareItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => !!item && (item.title || item.text || item.url)) : [];
  } catch {
    return [];
  }
};

const fallbackWrite = (items: PendingShareItem[]) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(SHARED_ITEM_STORE, JSON.stringify(items));
};

const openQueueDb = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARED_ITEM_STORE)) {
        db.createObjectStore(SHARED_ITEM_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open share queue database'));
  });

const readQueueFromIndexedDb = async (): Promise<PendingShareItem[]> => {
  if (typeof indexedDB === 'undefined') {
    return fallbackRead();
  }

  try {
    const db = await openQueueDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(SHARED_ITEM_STORE, 'readonly');
      const objectStore = transaction.objectStore(SHARED_ITEM_STORE);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const rows = request.result as Array<{ id: number; value: PendingShareItem }>;
        resolve(rows.map((row) => row.value));
      };

      request.onerror = () => resolve(fallbackRead());
    });
  } catch {
    return fallbackRead();
  }
};

const writeQueueToIndexedDb = async (items: PendingShareItem[]) => {
  if (typeof indexedDB === 'undefined') {
    fallbackWrite(items);
    return;
  }

  try {
    const db = await openQueueDb();
    const transaction = db.transaction(SHARED_ITEM_STORE, 'readwrite');
    const objectStore = transaction.objectStore(SHARED_ITEM_STORE);

    objectStore.clear();
    items.forEach((item, index) => {
      objectStore.put({ id: index, value: item });
    });

    transaction.oncomplete = () => {
      fallbackWrite(items);
    };
    transaction.onerror = () => fallbackWrite(items);
  } catch {
    fallbackWrite(items);
  }
};

export const readPendingShareItems = async (): Promise<PendingShareItem[]> => {
  const indexed = await readQueueFromIndexedDb();
  return indexed.filter((item) => !!item && (item.title || item.text || item.url));
};

export const savePendingShareItems = async (items: PendingShareItem[]) => {
  const sanitized = items.filter((item) => !!item && (item.title || item.text || item.url));
  await writeQueueToIndexedDb(sanitized);
};

export const clearPendingShareItems = async () => {
  await writeQueueToIndexedDb([]);
};
