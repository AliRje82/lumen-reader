/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_API_KEY: string
  readonly VITE_GOOGLE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
          revoke: (token: string, callback?: () => void) => void
        }
      }
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder
        DocsView: new (viewId?: string) => GoogleDocsView
        ViewId: { PDFS: string; DOCS: string }
        Action: { PICKED: string; CANCEL: string }
        Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string }
      }
    }
    gapi?: {
      load: (api: string, callback: () => void) => void
      client: {
        init: (config: { apiKey: string; discoveryDocs?: string[] }) => Promise<void>
      }
    }
  }
}

interface GooglePickerBuilder {
  addView: (view: GoogleDocsView) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setAppId: (appId: string) => GooglePickerBuilder
  setCallback: (cb: (data: GooglePickerResponse) => void) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  enableFeature: (feature: string) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface GoogleDocsView {
  setMimeTypes: (types: string) => GoogleDocsView
  setIncludeFolders: (include: boolean) => GoogleDocsView
}

interface GooglePickerResponse {
  action: string
  docs?: Array<{
    id: string
    name: string
    mimeType: string
    url?: string
    sizeBytes?: number
  }>
}

export {}
