import { describe, expect, it } from 'vitest';
import { isAllowedLibraryOrigin } from './origin';

describe('build-specific library origins', () => {
  it('allows the local preview port in the development build', () => {
    expect(isAllowedLibraryOrigin('http://localhost:5176', ['http://localhost/*'])).toBe(true);
    expect(isAllowedLibraryOrigin('http://127.0.0.1:5176', ['http://127.0.0.1/*'])).toBe(true);
  });
  it('rejects lookalike hosts and mismatched protocols', () => {
    expect(isAllowedLibraryOrigin('http://localhost.evil.example:5176', ['http://localhost/*'])).toBe(false);
    expect(isAllowedLibraryOrigin('https://localhost:5176', ['http://localhost/*'])).toBe(false);
  });
  it('keeps the production build restricted to its deployed origin', () => {
    expect(isAllowedLibraryOrigin('https://duckler.pages.dev', ['https://duckler.pages.dev/*'])).toBe(true);
    expect(isAllowedLibraryOrigin('http://localhost:5176', ['https://duckler.pages.dev/*'])).toBe(false);
    expect(isAllowedLibraryOrigin('https://duckler.pages.dev:8443', ['https://duckler.pages.dev/*'])).toBe(false);
  });
});
