# Google setup for sign-in, Drive sync and share links

Duckler has no accounts of its own: people sign in with Google, their library syncs to a `Duckler`
folder in **their own** Google Drive, and shared collections are encrypted files in the owner's
Drive. To switch this on, the site needs two public values from a Google Cloud project you own:

| Value | Used for | Secret? |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | "Sign in with Google" | No. It reaches every browser by design; kept out of the public repo anyway. |
| `GOOGLE_API_KEY` | Opening share links without signing in | No, but restrict it (step 6) so nobody else can use it. |

Do these steps yourself in your browser (about 15 minutes). Don't paste the values into a chat; put them straight into Cloudflare (step 7).

1. Open <https://console.cloud.google.com/> and create a project named **Duckler**.
2. **APIs & Services → Library**: search **Google Drive API** and click **Enable**.
3. **Google Auth Platform → Branding**: app name **Duckler**, your support email, and the
   homepage `https://duckler.pages.dev`. **Audience**: choose **External** and leave it in
   **Testing**. Add your own Google account (and anyone testing with you) under **Test users**;
   testing allows up to 100 users with no Google review.
4. **Data Access → Add or remove scopes**: add `https://www.googleapis.com/auth/drive.file`
   (Duckler can only see files it created). It is a non-sensitive scope.
5. **Clients → Create client → Web application**, named **Duckler web**. Under **Authorized JavaScript
   origins**, add `https://duckler.pages.dev` and `http://localhost:5176`. Redirect URIs are not
   needed. Create it and copy the **Client ID** (ends in `.apps.googleusercontent.com`).
6. **APIs & Services → Credentials → Create credentials → API key**, then **Edit API key**:
   - **Application restrictions → Websites**: add `https://duckler.pages.dev/*` and `http://localhost:5176/*`.
   - **API restrictions → Restrict key → Google Drive API**.
   - Save, then copy the key.
7. Store both as **Cloudflare Pages secrets**. Because this project has a `wrangler.jsonc`, the dashboard
   locks plain variables, but secrets stay editable, and secrets never go into the public repository.
   Either:
   - **Dashboard:** Workers & Pages → duckler → Settings → Variables and secrets → **Add** → type
     **Secret**. Add `GOOGLE_CLIENT_ID` and `GOOGLE_API_KEY` for **Production**.
   - **Terminal:** run `npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name duckler`, paste the
     value when it asks (it isn't shown), then repeat for `GOOGLE_API_KEY`.

   Then **Deployments → latest → Retry deployment** so the new secrets apply. The site reads them at
   runtime from `/api/config`. Check that `https://duckler.pages.dev/api/config` shows two non-empty
   values.

   **Don't put them in `wrangler.jsonc`:** its plain `vars` would publish them in the public repository,
   and a duplicate name breaks publishing ("Binding name already in use"). A test
   (`scripts/deployment-config.test.ts`) guards this.
8. For local development, create `apps/web/.env.local` (ignored by git) with
   `VITE_GOOGLE_CLIENT_ID=…` and `VITE_GOOGLE_API_KEY=…` (local dev has no `/api/config`).

## Checking it works

1. On duckler.pages.dev, open **Settings → Account & sync → Sign in with Google**. While the app is in
   Testing, Google shows an "unverified app" notice; continue. A `Duckler` folder appears in your Drive.
2. Open the site in another browser (or a private window), sign in with the same account, and your
   cards appear there. Delete a card on one side, and it disappears on the other after a sync.
3. Right-click a collection → **Share link…** → **Create link**. Open the link in a private window:
   the collection shows, read-only, without signing in. **Stop sharing** makes the link fail.

## Later: leaving Testing

To let anyone sign in (not only test users), publish the app in **Audience**. For `drive.file`, Google
asks for brand verification: a privacy policy URL and a verified homepage domain. A `pages.dev`
subdomain can't be verified as yours, so this step needs a custom domain.
