import { create } from 'zustand'
import { getThemeMode, setThemeMode } from '@/storage/db'
import type { ThemeMode } from '@/types'

interface ThemeState {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  init: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function apply(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  resolved: 'light',
  init: async () => {
    const mode = (await getThemeMode()) as ThemeMode
    const resolved = resolve(mode)
    apply(resolved)
    set({ mode, resolved })
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().mode === 'system') {
        const next = resolve('system')
        apply(next)
        set({ resolved: next })
      }
    })
  },
  setMode: async (mode) => {
    await setThemeMode(mode)
    const resolved = resolve(mode)
    apply(resolved)
    set({ mode, resolved })
  },
}))
