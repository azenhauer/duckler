import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve('apps/extension/popup.html'), 'utf8');
const script = readFileSync(resolve('apps/extension/popup.js'), 'utf8');
const settings = () => document.querySelector<HTMLButtonElement>('#settings')!;
const optionsURL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html';

function initialize({ unavailableOptions = false, unavailableTabs = false, unavailableWorker = false } = {}) {
  const openOptionsPage = vi.fn(async () => { if (unavailableOptions) throw new Error('Unavailable'); });
  const create = vi.fn(async () => { if (unavailableTabs) throw new Error('Unavailable'); });
  const chrome = {
    runtime: {
      openOptionsPage, getURL: vi.fn(() => optionsURL),
      sendMessage: vi.fn(async (message: { type: string }) => {
        if (unavailableWorker) throw new Error('Reload the extension.');
        return message.type === 'list-captures' ? { ok: true, items: [], budget: 1024 } : { ok: true };
      }),
    },
    tabs: { query: vi.fn(async () => [{ id: 1, url: 'chrome://extensions/' }]), create },
  };
  new Function('chrome', script)(chrome);
  return chrome;
}

beforeEach(() => { document.body.innerHTML = html; });
afterEach(() => { document.body.innerHTML = ''; });

describe('extension Settings access', () => {
  it('has a visible Settings label and works on restricted browser pages', async () => {
    const chrome = initialize();
    expect(settings()).toHaveTextContent('Settings');
    await waitFor(() => expect(document.querySelector('#page-title')).toHaveTextContent('Keep a thought'));
    fireEvent.click(settings());
    await waitFor(() => expect(settings()).not.toBeDisabled());
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('opens Settings from the disconnected footer too', async () => {
    const chrome = initialize();
    await waitFor(() => expect(document.querySelector('#connection-status')).toHaveTextContent('Connect library'));
    fireEvent.click(document.querySelector('#connection-status')!);
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
    await waitFor(() => expect(settings()).not.toBeDisabled());
  });

  it('falls back to its own options tab if Chrome cannot open the options page', async () => {
    const chrome = initialize({ unavailableOptions: true });
    fireEvent.click(settings());
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: optionsURL }));
    expect(settings()).not.toBeDisabled();
  });

  it('shows a useful error instead of silently failing', async () => {
    initialize({ unavailableOptions: true, unavailableTabs: true });
    fireEvent.click(settings());
    await waitFor(() => expect(document.querySelector('#status')).toHaveTextContent('Could not open Settings'));
    expect(document.querySelector('#status')).toHaveAttribute('role', 'alert');
    expect(settings()).not.toBeDisabled();
  });

  it('still opens Settings when the capture worker is unavailable', async () => {
    const chrome = initialize({ unavailableWorker: true });
    await waitFor(() => expect(document.querySelector('#status')).toHaveTextContent('Reload the extension'));
    fireEvent.click(settings());
    await waitFor(() => expect(settings()).not.toBeDisabled());
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce();
  });
});
