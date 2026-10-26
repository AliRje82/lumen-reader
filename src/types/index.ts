/** Normalized page rectangle: fractions of page width/height (origin top-left). */
export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple'

export type AnnotationKind =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'note'
  | 'region'
  | 'ink'

export type SyncStatus =
  | 'local'
  | 'synced'
  | 'pending'
  | 'uploading'
  | 'conflict'
  | 'error'
  | 'offline'

export type ToolMode =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'note'
  | 'pen'
  | 'highlighter-pen'
  | 'eraser'
  | 'region'

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom'

export type ThemeMode = 'light' | 'dark' | 'system'

export type ViewMode = 'continuous' | 'single'

export interface ReadingPosition {
  page: number
  scrollRatio: number
  zoom: number
  zoomMode: ZoomMode
}

export interface DriveMeta {
  fileId: string
  fileName: string
  mimeType: string
  modifiedTime?: string
  revisionId?: string
  md5Checksum?: string
  webViewLink?: string
}

export interface DocumentRecord {
  id: string
  name: string
  pageCount: number
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  readingPosition: ReadingPosition
  syncStatus: SyncStatus
  drive?: DriveMeta
  /** SHA-256 of original bytes when imported */
  contentHash?: string
  /** Bytes size of stored PDF blob */
  sizeBytes: number
  hasUnsyncedChanges: boolean
  /** Local revision counter for conflict detection */
  localRevision: number
  /** Inserted blank page descriptors (1-based insert positions after export merge) */
  insertedPages: InsertedPage[]
  folderId?: string
  tags: string[]
}

export interface InsertedPage {
  id: string
  /** 0-based index in the working document page list */
  index: number
  width: number
  height: number
  createdAt: number
}

export interface DocumentBlob {
  id: string
  /** Original imported PDF bytes */
  original: ArrayBuffer
  /** Last exported PDF bytes (with burned-in annotations), if any */
  exported?: ArrayBuffer
  updatedAt: number
}

export interface TextQuad {
  rects: NormRect[]
  /** Character offsets within page text content when available */
  beginIndex?: number
  endIndex?: number
}

export interface AnnotationRecord {
  id: string
  documentId: string
  pageIndex: number
  kind: AnnotationKind
  color: HighlightColor | string
  createdAt: number
  updatedAt: number
  /** Selected / associated text */
  text?: string
  note?: string
  /** Precise geometry for text markup */
  quads?: TextQuad
  /** Freehand ink */
  stroke?: StrokeData
  /** Region highlight for scanned pages */
  region?: NormRect
}

export interface StrokePoint {
  x: number
  y: number
  p: number
  t: number
}

export interface StrokeData {
  points: StrokePoint[]
  width: number
  color: string
  opacity: number
  tool: 'pen' | 'highlighter-pen' | 'eraser'
}

export interface BookmarkRecord {
  id: string
  documentId: string
  pageIndex: number
  title: string
  createdAt: number
  scrollRatio?: number
}

export interface FolderRecord {
  id: string
  name: string
  createdAt: number
  parentId?: string
}

export interface PendingUpload {
  id: string
  documentId: string
  driveFileId: string
  createdAt: number
  attempts: number
  lastError?: string
  status: 'queued' | 'uploading' | 'failed'
}

export interface AuthSession {
  accessToken: string
  expiresAt: number
  scopes: string[]
  email?: string
  name?: string
  picture?: string
}

export interface HistoryEntry {
  type: 'add' | 'update' | 'remove' | 'batch'
  annotations: AnnotationRecord[]
  previous?: AnnotationRecord[]
  insertedPages?: InsertedPage[]
  previousInsertedPages?: InsertedPage[]
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#f5d76e',
  green: '#7dcea0',
  blue: '#85c1e9',
  pink: '#f5b7b1',
  orange: '#f0b27a',
  purple: '#d2b4de',
}

export const DEFAULT_READING_POSITION: ReadingPosition = {
  page: 0,
  scrollRatio: 0,
  zoom: 1,
  zoomMode: 'fit-width',
}
