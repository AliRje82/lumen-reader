import Dexie, { type EntityTable } from 'dexie'
import type {
  AnnotationRecord,
  AuthSession,
  BookmarkRecord,
  DocumentBlob,
  DocumentRecord,
  FolderRecord,
  PendingUpload,
} from '@/types'

export class LumenDB extends Dexie {
  documents!: EntityTable<DocumentRecord, 'id'>
  blobs!: EntityTable<DocumentBlob, 'id'>
  annotations!: EntityTable<AnnotationRecord, 'id'>
  bookmarks!: EntityTable<BookmarkRecord, 'id'>
  folders!: EntityTable<FolderRecord, 'id'>
  pendingUploads!: EntityTable<PendingUpload, 'id'>
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>

  constructor() {
    super('lumen-reader')
    this.version(1).stores({
      documents: 'id, name, updatedAt, lastOpenedAt, syncStatus, folderId, *tags',
      blobs: 'id',
      annotations: 'id, documentId, pageIndex, kind, color, updatedAt, [documentId+pageIndex]',
      bookmarks: 'id, documentId, pageIndex',
      folders: 'id, name, parentId',
      pendingUploads: 'id, documentId, status, createdAt',
      meta: 'key',
    })
  }
}

export const db = new LumenDB()

const AUTH_KEY = 'auth-session'
const THEME_KEY = 'theme-mode'
const SETTINGS_KEY = 'app-settings'

export async function getAuthSession(): Promise<AuthSession | null> {
  const row = await db.meta.get(AUTH_KEY)
  return (row?.value as AuthSession | undefined) ?? null
}

export async function setAuthSession(session: AuthSession | null): Promise<void> {
  if (!session) {
    await db.meta.delete(AUTH_KEY)
    return
  }
  await db.meta.put({ key: AUTH_KEY, value: session })
}

export async function getThemeMode(): Promise<string> {
  const row = await db.meta.get(THEME_KEY)
  return (row?.value as string) ?? 'system'
}

export async function setThemeMode(mode: string): Promise<void> {
  await db.meta.put({ key: THEME_KEY, value: mode })
}

export interface AppSettings {
  highlightColor: string
  penColor: string
  penWidth: number
  highlighterWidth: number
  defaultTool: string
  distractionFree: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  highlightColor: 'yellow',
  penColor: '#1a1f2e',
  penWidth: 2,
  highlighterWidth: 12,
  defaultTool: 'select',
  distractionFree: false,
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.meta.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<AppSettings> | undefined) }
}

export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = { ...current, ...partial }
  await db.meta.put({ key: SETTINGS_KEY, value: next })
  return next
}
