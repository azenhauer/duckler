import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

it('publishes a finished selection before focus can clear it and cleans up on disconnect', () => {
  const script = readFileSync(resolve('apps/extension/selection.js'), 'utf8');
  let connect: (port: unknown) => void = () => {};
  let disconnect = () => {};
  const postMessage = vi.fn();
  const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Selected passage' } as Selection);
  try {
    new Function('chrome', script)({ runtime: { id: 'test', onConnect: { addListener: (fn: typeof connect) => { connect = fn; } } } });
    connect({ name: 'duckler-selection-v1', postMessage, onDisconnect: { addListener: (fn: typeof disconnect) => { disconnect = fn; } } });
    postMessage.mockClear();
    document.dispatchEvent(new Event('pointerup'));
    selection.mockReturnValue({ toString: () => '' } as Selection);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Selected passage' }));
    disconnect();
    postMessage.mockClear();
    document.dispatchEvent(new Event('pointerup'));
    expect(postMessage).not.toHaveBeenCalled();
  } finally {
    disconnect(); selection.mockRestore();
    delete (window as unknown as Record<string, unknown>).__ducklerSelectionAlive;
  }
});
