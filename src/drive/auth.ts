import { getAuthSession, setAuthSession } from '@/storage/db'
import type { AuthSession } from '@/types'

/** Narrowest scope that supports open-via-Picker + update of those files. */
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
  'profile',
].join(' ')

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'

let gisLoaded = false
let gapiLoaded = false

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
}

export function getGoogleApiKey(): string {
  return import.meta.env.VITE_GOOGLE_API_KEY?.trim() ?? ''
}

export function getGoogleAppId(): string {
  return import.meta.env.VITE_GOOGLE_APP_ID?.trim() ?? ''
}

export function isGoogleConfigured(): boolean {
  return Boolean(getGoogleClientId())
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      s.dataset.loaded = '1'
      resolve()
    }
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export async function loadGoogleIdentity(): Promise<void> {
  if (gisLoaded && window.google?.accounts?.oauth2) return
  await loadScript(GIS_SRC)
  gisLoaded = true
}

export async function loadGapiPicker(): Promise<void> {
  if (gapiLoaded && window.gapi) return
  await loadScript(GAPI_SRC)
  await new Promise<void>((resolve) => {
    window.gapi!.load('client:picker', () => resolve())
  })
  const apiKey = getGoogleApiKey()
  if (apiKey) {
    await window.gapi!.client.init({ apiKey })
  }
  // Also load picker script namespace
  await loadScript('https://apis.google.com/js/picker.js')
  gapiLoaded = true
}

export async function restoreSession(): Promise<AuthSession | null> {
  const session = await getAuthSession()
  if (!session) return null
  if (session.expiresAt < Date.now() + 60_000) {
    await setAuthSession(null)
    return null
  }
  return session
}

export async function signInWithGoogle(): Promise<AuthSession> {
  if (!isGoogleConfigured()) {
    throw new Error('Google OAuth client ID is not configured. See docs/GOOGLE_SETUP.md')
  }
  await loadGoogleIdentity()

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: DRIVE_SCOPES,
      callback: async (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Sign-in failed'))
          return
        }
        const expiresIn = Number(response.expires_in ?? 3600)
        let email: string | undefined
        let name: string | undefined
        let picture: string | undefined
        try {
          const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          }).then((r) => r.json())
          email = profile.email
          name = profile.name
          picture = profile.picture
        } catch {
          /* profile optional */
        }
        const session: AuthSession = {
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          scopes: DRIVE_SCOPES.split(' '),
          email,
          name,
          picture,
        }
        await setAuthSession(session)
        resolve(session)
      },
      error_callback: (err) => reject(new Error(err.message ?? err.type ?? 'Sign-in error')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export async function ensureAccessToken(): Promise<string> {
  const session = await restoreSession()
  if (session) return session.accessToken
  const next = await signInWithGoogle()
  return next.accessToken
}

export async function refreshTokenInteractive(): Promise<AuthSession> {
  await setAuthSession(null)
  return signInWithGoogle()
}

export async function signOutGoogle(): Promise<void> {
  const session = await getAuthSession()
  if (session?.accessToken && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(session.accessToken)
    } catch {
      /* ignore */
    }
  }
  await setAuthSession(null)
}
