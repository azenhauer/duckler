import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve('apps/extension/popup.html'), 'utf8');
const script = readFileSync(resolve('apps/extension/popup.js'), 'utf8');
const settings = () => document.querySelector<HTMLButtonElement>('#settings')!;
const optionsURL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html';

function initialize({ unavailableOptions = false, unavailableTabs = false, unavailableWorker = false, selection = '' } = {}) {
  const openOptionsPage = vi.fn(async () => { if (unavailableOptions) throw new Error('Unavailable'); });
  const create = vi.fn(async () => { if (unavailableTabs) throw new Error('Unavailable'); });
  const port = { onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn() };
  const chrome = {
    runtime: {
      openOptionsPage, getURL: vi.fn(() => optionsURL),
      sendMessage: vi.fn(async (message: { type: string }) => {
        if (unavailableWorker) throw new Error('Reload the extension.');
        return message.type === 'list-captures' ? { ok: true, items: [], budget: 1024 } : { ok: true };
      }),
    },
    tabs: { query: vi.fn(async () => [{ id: 1, url: selection ? 'https://example.com/article' : 'chrome://extensions/' }]), create, connect: vi.fn(() => port) },
    scripting: { executeScript: vi.fn(async () => [{ result: { title: 'Article', url: 'https://example.com/article', selection, pdfLinks: [] } }]) },
  };
  new Function('chrome', script)(chrome);
  return chrome;
}

beforeEach(() => { document.body.innerHTML = html; });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); document.body.innerHTML = ''; });

describe('extension Settings access', () => {
  it('puts selected text in Note and sends a separate caption with Ctrl+Enter', async () => {
    const chrome = initialize({ selection: 'Highlighted passage' });
    const note = document.querySelector<HTMLTextAreaElement>('#note-text')!;
    await waitFor(() => expect(note.value).toBe('Highlighted passage'));
    expect(document.querySelector('#note-label')).toHaveTextContent('Note');
    fireEvent.input(note, { target: { value: 'Edited highlighted passage' } });
    fireEvent.input(document.querySelector('#caption-text')!, { target: { value: 'My interpretation' } });
    await waitFor(() => expect(chrome.tabs.connect).toHaveBeenCalled());
    const port = chrome.tabs.connect.mock.results[0].value;
    port.onMessage.addListener.mock.calls[0][0]({ type: 'selection', text: 'Highlighted passage', url: 'https://example.com/article' });
    expect(note.value).toBe('Edited highlighted passage');
    fireEvent.keyDown(note, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(note, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'deliver-capture' }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'queue-capture', capture: expect.objectContaining({ kind: 'text', note: 'Edited highlighted passage', caption: 'My interpretation' }) }));
    expect(document.querySelector('#status')).toHaveTextContent('Saved');
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'queue-capture')).toHaveLength(1);
  });

  it('does not save or send an empty note with Ctrl+Enter', async () => {
    const chrome = initialize();
    await waitFor(() => expect(document.querySelector('#page-title')).toHaveTextContent('Keep a thought'));
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    expect(document.querySelector('#status')).toHaveTextContent('Write or highlight');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'queue-capture' }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'deliver-capture' });
  });
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
