import { handlePrivateApi, type ApiEnvironment } from '../../packages/backend/src/api';

export const onRequest = ({ request, env }: { request: Request; env: ApiEnvironment }) => handlePrivateApi(request, env);
