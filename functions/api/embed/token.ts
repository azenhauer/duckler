// POST /api/embed/token — FROZEN with /api/embed (see index.ts): always 404.
export const onRequest = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
