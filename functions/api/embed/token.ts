import { handleEmbedApi, type EmbedEnvironment } from '../../../packages/backend/src/embed';

// POST /api/embed/token — issues a per-install token for /api/embed.
export const onRequest = ({ request, env }: { request: Request; env: EmbedEnvironment }) => handleEmbedApi(request, env);
