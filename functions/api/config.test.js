import { describe, expect, it } from 'vitest';
import { onRequestGet } from './config.ts';

const read = async env => (await onRequestGet({ env })).json();

describe('GET /api/config', () => {
  it('returns the Google values from Pages secrets', async () => {
    const env = { GOOGLE_CLIENT_ID: '123456789-abcdef.apps.googleusercontent.com', GOOGLE_API_KEY: `AIza${'x'.repeat(35)}` };
    expect(await read(env)).toEqual({ googleClientId: env.GOOGLE_CLIENT_ID, googleApiKey: env.GOOGLE_API_KEY });
  });
  it('also reads the VITE_-prefixed names used in the local .env file', async () => {
    const env = { VITE_GOOGLE_CLIENT_ID: '123456789-abcdef.apps.googleusercontent.com', VITE_GOOGLE_API_KEY: 'text' };
    expect(await read(env)).toEqual({ googleClientId: env.VITE_GOOGLE_CLIENT_ID, googleApiKey: '' }); // a placeholder key is refused
  });
  it('returns empty values when unset or malformed, never anything else', async () => {
    expect(await read({})).toEqual({ googleClientId: '', googleApiKey: '' });
    expect(await read({ GOOGLE_CLIENT_ID: '<script>', GOOGLE_API_KEY: 'TODO' })).toEqual({ googleClientId: '', googleApiKey: '' });
  });
});
