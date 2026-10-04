import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve('apps/extension/options.html'), 'utf8');
const script = readFileSync(resolve('apps/extension/options.js'), 'utf8');
const pairing = { origin: 'http://localhost:5176', libraryId: 'library-id-123456789', nonce: 'nonce-12345678901234567890123456789012' };
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const input = () => document.querySelector<HTMLTextAreaElement>('#pairing-code')!;
const button = () => document.querySelector<HTMLButtonElement>('#confirm-connection')!;
const status = () => document.querySelector('#status')!;
const submit = () => fireEvent.submit(document.querySelector('#settings-form')!);
const startup = (message: { type: string }) => message.type === 'list-captures' ? { ok: true, items: [] } : { ok: true };
const initialize = (sendMessage: ReturnType<typeof vi.fn>) => new Function('chrome', script)({ runtime: { sendMessage } });

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = html; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('extension connection settings', () => {
  it('explains an empty setup code rather than appearing to do nothing', async () => {
    const send = vi.fn(async message => startup(message));
    initialize(send); await vi.advanceTimersByTimeAsync(0);
    submit();
    expect(status()).toHaveTextContent('Paste the library setup code');
    expect(status()).toHaveAttribute('role', 'alert');
    expect(send.mock.calls.some(([message]) => message.type === 'pair-library')).toBe(false);
  });

  it('shows malformed code errors next to Confirm', async () => {
    initialize(vi.fn(async message => startup(message))); await vi.advanceTimersByTimeAsync(0);
    input().value = 'not the full code'; submit();
    expect(status()).toHaveTextContent('not a valid setup code');
    expect(button()).not.toBeDisabled();
  });

  it('shows immediate progress and the successful confirmation code', async () => {
    initialize(vi.fn(async message => message.type === 'pair-library' ? { ok: true, pairing, extensionId } : startup(message)));
    await vi.advanceTimersByTimeAsync(0);
    input().value = JSON.stringify(pairing); submit();
    expect(button()).toBeDisabled(); expect(button()).toHaveTextContent('Connecting');
    expect(status()).toHaveTextContent('Connecting to your library');
    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toHaveTextContent('Connection confirmed');
    expect(document.querySelector('#connection-details')).not.toHaveAttribute('hidden');
    expect(JSON.parse(document.querySelector<HTMLTextAreaElement>('#confirmation-code')!.value)).toEqual({ ...pairing, extensionId });
    expect(button()).not.toBeDisabled();
  });

  it('surfaces a worker rejection and allows another attempt', async () => {
    initialize(vi.fn(async message => message.type === 'pair-library' ? { ok: false, error: 'This extension build does not support that library address.' } : startup(message)));
    await vi.advanceTimersByTimeAsync(0);
    input().value = JSON.stringify(pairing); submit(); await vi.advanceTimersByTimeAsync(0);
    expect(status()).toHaveTextContent('does not support that library address');
    expect(status()).toHaveAttribute('role', 'alert'); expect(button()).not.toBeDisabled();
  });

  it('times out an unresponsive worker without duplicate submits', async () => {
    const send = vi.fn(message => message.type === 'pair-library' ? new Promise(() => {}) : Promise.resolve(startup(message)));
    initialize(send); await vi.advanceTimersByTimeAsync(0);
    input().value = JSON.stringify(pairing); submit(); submit(); await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.filter(([message]) => message.type === 'pair-library')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(status()).toHaveTextContent('extension did not respond');
    expect(status()).toHaveTextContent('reload Duckler Capture');
    expect(button()).not.toBeDisabled();
  });
});
