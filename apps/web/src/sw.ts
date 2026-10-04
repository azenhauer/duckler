/// <reference lib="webworker" />

const workerScope = globalThis as unknown as ServiceWorkerGlobalScope;

workerScope.addEventListener('install', (event) => {
  const installEvent = event as ExtendableEvent;
  installEvent.waitUntil(workerScope.skipWaiting());
});

workerScope.addEventListener('activate', (event) => {
  const activateEvent = event as ExtendableEvent;
  activateEvent.waitUntil(workerScope.clients.claim());
});

const persistSharePayload = async (payload: { title?: string; text?: string; url?: string }) => {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const dbRequest = indexedDB.open('visual-library-pwa', 1);

  await new Promise<void>((resolve, reject) => {
    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result;
      if (!db.objectStoreNames.contains('visual-library-share-queue')) {
        db.createObjectStore('visual-library-share-queue', { keyPath: 'id' });
      }
    };

    dbRequest.onsuccess = () => {
      const db = dbRequest.result;
      const transaction = db.transaction('visual-library-share-queue', 'readwrite');
      const objectStore = transaction.objectStore('visual-library-share-queue');
      objectStore.put({ id: Date.now(), value: payload });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Share target write failed'));
    };

    dbRequest.onerror = () => reject(dbRequest.error ?? new Error('Unable to access the share queue'));
  });
};

workerScope.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;
  const url = new URL(fetchEvent.request.url);
  if (fetchEvent.request.method !== 'POST' || url.pathname !== '/share-target/') {
    return;
  }

  fetchEvent.respondWith(
    (async () => {
      try {
        const formData = await fetchEvent.request.formData();
        const payload = {
          title: String(formData.get('title') ?? '').trim() || 'Shared item',
          text: String(formData.get('text') ?? '').trim(),
          url: String(formData.get('url') ?? '').trim(),
        };
        await persistSharePayload(payload);
        return Response.redirect('/?shared=1', 303);
      } catch (error) {
        console.error('Failed to process share target payload', error);
        return Response.redirect('/?share_error=1', 303);
      }
    })(),
  );
});
