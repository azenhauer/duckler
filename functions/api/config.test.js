import { describe, expect, it } from 'vitest';
import { onRequestGet } from './config.ts';

const read = async env => (await onRequestGet({ env })).json();

describe('GET /api/config', () => {
  it('returns the Google values from Pages secrets', async () => {
    const env = { GOOGLE_CLIENT_ID: '123456789-abcdef.apps.googleusercontent.com', GOOGLE_API_KEY: `AIza${'x'.repeat(35)}` };
    expect(await read(env)).toEqual({ googleClientId: env.GOOGLE_CLIENT_ID, googleApiKey: env.GOOGLE_API_KEY });
  });
  it('returns empty values when unset or malformed, never anything else', async () => {
    expect(await read({})).toEqual({ googleClientId: '', googleApiKey: '' });
    expect(await read({ GOOGLE_CLIENT_ID: '<script>', GOOGLE_API_KEY: 'TODO' })).toEqual({ googleClientId: '', googleApiKey: '' });
  });
});
