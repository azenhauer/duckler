/**
 * The two public Google values: the OAuth client ID (sign-in) and the browser API key (opening share
 * links). Local development reads them from `apps/web/.env.local` (VITE_*); the deployed site reads them
 * at runtime from /api/config (Cloudflare Pages secrets), so they never need to be in the repository.
 */
export type GoogleConfig = { clientId: string; apiKey: string };

let config: GoogleConfig = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim(),
  apiKey: (import.meta.env.VITE_GOOGLE_API_KEY ?? '').trim(),
};
let loading: Promise<GoogleConfig> | null = null;

export const googleConfig = (): GoogleConfig => config;

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');

/** Loads the runtime values once; later calls reuse the answer. Never throws. */
export function loadGoogleConfig(fetcher: typeof fetch = (...args) => fetch(...args)): Promise<GoogleConfig> {
  if (config.clientId && config.apiKey) return Promise.resolve(config);
  loading ??= fetcher('/api/config', { headers: { Accept: 'application/json' } })
    .then(response => (response.ok && response.headers.get('Content-Type')?.includes('application/json') ? response.json() : {}))
    .then((body: { googleClientId?: unknown; googleApiKey?: unknown }) => {
      config = { clientId: config.clientId || text(body.googleClientId), apiKey: config.apiKey || text(body.googleApiKey) };
      return config;
    })
    .catch(() => config);
  return loading;
}
