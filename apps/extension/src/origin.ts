export function isAllowedLibraryOrigin(origin: string, matches: string[]): boolean {
  const target = new URL(origin);
  return matches.some(pattern => {
    const allowed = new URL(pattern.replace('/*', '/'));
    const loopback = allowed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(allowed.hostname);
    // Development match patterns cover loopback ports. Pairing and every delivery
    // request still bind to the user's exact origin, including its chosen port.
    return loopback ? target.protocol === allowed.protocol && target.hostname === allowed.hostname : target.origin === allowed.origin;
  });
}
