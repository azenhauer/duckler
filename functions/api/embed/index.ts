import { handleEmbedApi, type EmbedEnvironment } from '../../../packages/backend/src/embed';

// POST /api/embed — clip autofill embeddings (zero retention; see packages/backend/src/embed.ts).
export const onRequest = ({ request, env }: { request: Request; env: EmbedEnvironment }) => handleEmbedApi(request, env);
