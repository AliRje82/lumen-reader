import { create } from 'zustand'
import type { AuthSession, DocumentRecord } from '@/types'
import { listDocuments, searchDocuments, deleteDocument } from '@/storage/documents'
import { restoreSession, signInWithGoogle, signOutGoogle, isGoogleConfigured } from '@/drive/auth'
import { processPendingUploads } from '@/drive/sync'

interface AppState {
  ready: boolean
  online: boolean
  documents: DocumentRecord[]
  libraryQuery: string
  auth: AuthSession | null
  googleConfigured: boolean
  leftOpen: boolean
  rightOpen: boolean
  toast: { message: string; type: 'info' | 'error' | 'success' } | null
  init: () => Promise<void>
  refreshLibrary: () => Promise<void>
  setLibraryQuery: (q: string) => void
  connectDrive: () => Promise<void>
  disconnectDrive: () => Promise<void>
  removeDocument: (id: string) => Promise<void>
  setLeftOpen: (v: boolean) => void
  setRightOpen: (v: boolean) => void
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  documents: [],
  libraryQuery: '',
  auth: null,
  googleConfigured: false,
  leftOpen: true,
  rightOpen: true,
  toast: null,

  init: async () => {
    try {
      const auth = await restoreSession()
      await get().refreshLibrary()
      set({ ready: true, auth, googleConfigured: isGoogleConfigured() })
    } catch (err) {
      console.error('App init failed', err)
      set({ ready: true, googleConfigured: isGoogleConfigured() })
      get().showToast(
        err instanceof Error ? err.message : 'Storage failed to open',
        'error',
      )
    }

    window.addEventListener('online', () => {
      set({ online: true })
      void processPendingUploads()
    })
    window.addEventListener('offline', () => set({ online: false }))
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void processPendingUploads()
    })

    if (navigator.onLine) void processPendingUploads()
  },

  refreshLibrary: async () => {
    const q = get().libraryQuery
    const documents = q ? await searchDocuments(q) : await listDocuments()
    set({ documents })
  },

  setLibraryQuery: (libraryQuery) => {
    set({ libraryQuery })
    void get().refreshLibrary()
  },

  connectDrive: async () => {
    try {
      const auth = await signInWithGoogle()
      set({ auth })
      get().showToast(`Connected as ${auth.email ?? 'Google account'}`, 'success')
    } catch (err) {
      get().showToast(err instanceof Error ? err.message : 'Sign-in failed', 'error')
    }
  },

  disconnectDrive: async () => {
    await signOutGoogle()
    set({ auth: null })
    get().showToast('Disconnected from Google Drive', 'info')
  },

  removeDocument: async (id) => {
    await deleteDocument(id)
    await get().refreshLibrary()
  },

  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),

  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    window.setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null })
    }, 4000)
  },
  clearToast: () => set({ toast: null }),
}))
