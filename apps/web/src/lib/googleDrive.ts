const driveScope = 'https://www.googleapis.com/auth/drive.file';
let activeDriveAccessToken: string | null = null;

export type GoogleDriveAuthResult = {
  connected: boolean;
  email?: string;
  rootFolderId?: string;
  message: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { error?: string; error_description?: string; access_token?: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export const getGoogleDriveClientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

export const isGoogleDriveConfigured = (): boolean => getGoogleDriveClientId().length > 0;

export const getActiveDriveAccessToken = (): string | null => activeDriveAccessToken;

type DriveListResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    properties?: Record<string, string | undefined>;
  }>;
};

type DriveFileResponse = {
  id?: string;
  name?: string;
  properties?: Record<string, string | undefined>;
};

const fetchDriveJson = async <T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Drive request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

export const findOrCreateLibraryRoot = async (libraryName = 'Visual Library'): Promise<string | null> => {
  const accessToken = getActiveDriveAccessToken();
  if (!accessToken) {
    return null;
  }

  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${libraryName.replace(/'/g, "\\'")}' and trashed = false and 'root' in parents`;
  const listPayload = await fetchDriveJson<DriveListResponse>(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name,properties)&pageSize=10`,
    accessToken,
  );

  const existingFolder = listPayload.files?.[0];
  if (existingFolder?.id) {
    return existingFolder.id;
  }

  const createdFolder = await fetchDriveJson<DriveFileResponse>('https://www.googleapis.com/drive/v3/files', accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      name: libraryName,
      mimeType: 'application/vnd.google-apps.folder',
      properties: {
        appIdentifier: 'visual-library',
        libraryName,
      },
    }),
  });

  return createdFolder.id ?? null;
};

export const loadGoogleIdentityScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-drive-script="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleDriveScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services failed to load.'));
    document.head.appendChild(script);
  });

export const connectGoogleDrive = async (): Promise<GoogleDriveAuthResult> => {
  const clientId = getGoogleDriveClientId();

  if (!clientId) {
    return {
      connected: false,
      message: 'Google Drive is not configured. Set VITE_GOOGLE_CLIENT_ID before enabling the real Drive integration.',
    };
  }

  try {
    await loadGoogleIdentityScript();
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : 'Google Identity Services could not be loaded.',
    };
  }

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    return {
      connected: false,
      message: 'Google Identity Services is not available in this browser session.',
    };
  }

  return new Promise((resolve) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback: async (response) => {
        if (response.error) {
          resolve({
            connected: false,
            message: response.error_description ?? 'Google Drive authorization was denied.',
          });
          return;
        }

        const accessToken = response.access_token;
        if (!accessToken) {
          resolve({
            connected: false,
            message: 'Google Drive did not return an access token.',
          });
          return;
        }

        activeDriveAccessToken = accessToken;

        try {
          const profileResponse = await fetch(
            'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName,emailAddress)',
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          if (!profileResponse.ok) {
            throw new Error(`Drive profile lookup failed: ${profileResponse.status}`);
          }

          const profile = await profileResponse.json();
          const email = profile.user?.emailAddress ?? 'Google Drive account';

          try {
            const libraryRootId = await findOrCreateLibraryRoot();
            resolve({
              connected: true,
              email,
              rootFolderId: libraryRootId ?? 'pending-root-discovery',
              message: libraryRootId
                ? 'Google Drive authorization succeeded and the app root folder is available.'
                : 'Google Drive authorization succeeded. Root discovery is ready, but no root folder was created yet.',
            });
          } catch {
            resolve({
              connected: true,
              email,
              rootFolderId: 'pending-root-discovery',
              message: 'Google Drive authorization succeeded, but the library root could not be discovered or created yet.',
            });
          }
        } catch {
          resolve({
            connected: false,
            message: 'Google Drive token was acquired, but the Drive metadata request failed.',
          });
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const disconnectGoogleDrive = (): GoogleDriveAuthResult => {
  activeDriveAccessToken = null;
  return {
    connected: false,
    message: 'Google Drive disconnected. The local library remains available offline.',
  };
};
