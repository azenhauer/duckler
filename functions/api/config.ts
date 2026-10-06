// GET /api/config: the public Google values the site needs at runtime (sign-in and share links).
// They are Cloudflare Pages secrets (GOOGLE_CLIENT_ID, GOOGLE_API_KEY), so they never sit in this
// public repository. Both are public by design once the site uses them (they ship to every browser);
// the API key is protected by its website and API restrictions in Google Cloud, not by secrecy.
// The VITE_-prefixed names are accepted too, since that is how the local .env file names them.
type Env = { GOOGLE_CLIENT_ID?: string; GOOGLE_API_KEY?: string; VITE_GOOGLE_CLIENT_ID?: string; VITE_GOOGLE_API_KEY?: string };

const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const API_KEY = /^AIza[0-9A-Za-z_-]{35}$/;

export const onRequestGet = ({ env }: { env: Env }) => {
  const clientId = (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '').trim(), apiKey = (env.GOOGLE_API_KEY || env.VITE_GOOGLE_API_KEY || '').trim();
  return new Response(JSON.stringify({
    googleClientId: CLIENT_ID.test(clientId) ? clientId : '',
    googleApiKey: API_KEY.test(apiKey) ? apiKey : '',
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
};
