import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

// findBy…/waitFor wait up to 5 s (default 1 s): the full suite runs every file at once, and on a busy
// machine the App renders slower without anything being wrong.
configure({ asyncUtilTimeout: 5000 });

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}
