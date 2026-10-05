// POST /api/embed — clip autofill embeddings. FROZEN by the owner (October 2026): the route answers
// 404 whatever is configured, so nothing can spend Workers AI quota. The implementation stays in
// packages/backend/src/embed.ts; restore `handleEmbedApi(request, env)` here to switch it back on.
export const onRequest = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
