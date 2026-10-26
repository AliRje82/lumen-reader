# Google Drive OAuth setup

Lumen uses **Google Identity Services** (token client) and the **Google Picker** / **Drive API** entirely in the browser. There is no custom backend.

## 1. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g. `lumen-reader`).
3. Note the **project number** (used as optional `VITE_GOOGLE_APP_ID`).

## 2. Enable APIs

Enable:

- **Google Drive API**
- **Google Picker API**

## 3. Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or Internal for Workspace-only).
3. App name: `Lumen Reader`.
4. Add scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `openid`
   - `email`
   - `profile`
5. Add test users while the app is in Testing status.

### Why `drive.file`?

`drive.file` lets the app access only files the user opens with the app (via Picker) or that the app creates. It cannot browse the user’s entire Drive. That is intentional for privacy and matches Google’s recommended narrow scope.

## 4. Create credentials

### OAuth 2.0 Client ID (Web application)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized JavaScript origins (examples):
   - `http://localhost:5173` (Vite dev)
   - `http://localhost:4173` (Vite preview)
   - Your production origin, e.g. `https://your-domain.com`
4. Redirect URIs are **not required** for the GIS token client flow used here.
5. Copy the **Client ID** into `.env` as `VITE_GOOGLE_CLIENT_ID`.

Never put a client **secret** in the frontend.

### API key (Browser key) for Picker

1. Create an **API key**.
2. Restrict by HTTP referrer to the same origins as above.
3. Restrict the key to **Google Picker API** (and Drive if prompted).
4. Set `VITE_GOOGLE_API_KEY` in `.env`.

Optional: set `VITE_GOOGLE_APP_ID` to the numeric Cloud project number for Picker `setAppId`.

## 5. Local configuration

```bash
cp .env.example .env
# edit .env with your Client ID and API key
pnpm dev
```

Without these values, local PDF import, reading, highlighting, handwriting, blank pages, and export still work. Drive buttons show a setup hint.

## 6. Production notes

- Add the production HTTPS origin to Authorized JavaScript origins and API key referrers.
- Publish the OAuth consent screen when ready for non-test users.
- Token refresh: expired tokens trigger an interactive re-authorization.
- Background sync is not guaranteed on iOS; the app syncs when foregrounded or connectivity returns.
