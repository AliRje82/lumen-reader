import { db } from './db'
import type {
  AnnotationRecord,
  BookmarkRecord,
  DocumentRecord,
  InsertedPage,
  ReadingPosition,
  SyncStatus,
} from '@/types'
import { DEFAULT_READING_POSITION } from '@/types'

function uid(): string {
  return crypto.randomUUID()
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function importLocalPdf(
  file: File | Blob,
  name: string,
  pageCount: number,
  drive?: DocumentRecord['drive'],
): Promise<DocumentRecord> {
  const buffer = await file.arrayBuffer()
  const contentHash = await hashBuffer(buffer)
  const now = Date.now()
  const id = uid()

  const doc: DocumentRecord = {
    id,
    name,
    pageCount,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    readingPosition: { ...DEFAULT_READING_POSITION },
    syncStatus: drive ? 'synced' : 'local',
    drive,
    contentHash,
    sizeBytes: buffer.byteLength,
    hasUnsyncedChanges: false,
    localRevision: 0,
    insertedPages: [],
    tags: [],
  }

  await db.transaction('rw', db.documents, db.blobs, async () => {
    await db.documents.put(doc)
    await db.blobs.put({ id, original: buffer, updatedAt: now })
  })

  return doc
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return db.documents.orderBy('lastOpenedAt').reverse().toArray()
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  return db.documents.get(id)
}

export async function getDocumentBlob(id: string): Promise<ArrayBuffer | undefined> {
  const blob = await db.blobs.get(id)
  return blob?.exported ?? blob?.original
}

export async function getOriginalBlob(id: string): Promise<ArrayBuffer | undefined> {
  const blob = await db.blobs.get(id)
  return blob?.original
}

export async function saveExportedPdf(id: string, exported: ArrayBuffer): Promise<void> {
  const existing = await db.blobs.get(id)
  if (!existing) throw new Error('Document blob not found')
  await db.blobs.put({
    ...existing,
    exported,
    updatedAt: Date.now(),
  })
  await db.documents.update(id, {
    sizeBytes: exported.byteLength,
    updatedAt: Date.now(),
  })
}

export async function updateDocument(
  id: string,
  patch: Partial<DocumentRecord>,
): Promise<void> {
  await db.documents.update(id, { ...patch, updatedAt: Date.now() })
}

export async function touchOpened(id: string): Promise<void> {
  await db.documents.update(id, { lastOpenedAt: Date.now() })
}

export async function saveReadingPosition(
  id: string,
  position: ReadingPosition,
): Promise<void> {
  await db.documents.update(id, { readingPosition: position })
}

export async function markDirty(id: string): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) return
  await db.documents.update(id, {
    hasUnsyncedChanges: true,
    syncStatus: doc.drive ? 'pending' : 'local',
    localRevision: doc.localRevision + 1,
    updatedAt: Date.now(),
  })
}

export async function setSyncStatus(id: string, syncStatus: SyncStatus): Promise<void> {
  await db.documents.update(id, { syncStatus, updatedAt: Date.now() })
}

export async function deleteDocument(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.documents,
    db.blobs,
    db.annotations,
    db.bookmarks,
    db.pendingUploads,
    async () => {
      await db.documents.delete(id)
      await db.blobs.delete(id)
      await db.annotations.where('documentId').equals(id).delete()
      await db.bookmarks.where('documentId').equals(id).delete()
      await db.pendingUploads.where('documentId').equals(id).delete()
    },
  )
}

export async function listAnnotations(documentId: string): Promise<AnnotationRecord[]> {
  return db.annotations.where('documentId').equals(documentId).sortBy('pageIndex')
}

export async function putAnnotation(ann: AnnotationRecord): Promise<void> {
  await db.annotations.put(ann)
  await markDirty(ann.documentId)
}

export async function putAnnotations(anns: AnnotationRecord[]): Promise<void> {
  if (anns.length === 0) return
  await db.annotations.bulkPut(anns)
  await markDirty(anns[0]!.documentId)
}

export async function removeAnnotation(id: string, documentId: string): Promise<void> {
  await db.annotations.delete(id)
  await markDirty(documentId)
}

export async function removeAnnotations(ids: string[], documentId: string): Promise<void> {
  await db.annotations.bulkDelete(ids)
  await markDirty(documentId)
}

export async function searchAnnotations(
  query: string,
): Promise<Array<AnnotationRecord & { documentName?: string }>> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all = await db.annotations.toArray()
  const docs = await db.documents.toArray()
  const nameById = new Map(docs.map((d) => [d.id, d.name]))
  return all
    .filter(
      (a) =>
        a.text?.toLowerCase().includes(q) ||
        a.note?.toLowerCase().includes(q),
    )
    .map((a) => ({ ...a, documentName: nameById.get(a.documentId) }))
}

export async function listBookmarks(documentId: string): Promise<BookmarkRecord[]> {
  return db.bookmarks.where('documentId').equals(documentId).sortBy('pageIndex')
}

export async function putBookmark(bm: BookmarkRecord): Promise<void> {
  await db.bookmarks.put(bm)
}

export async function removeBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id)
}

export async function updateInsertedPages(
  documentId: string,
  insertedPages: InsertedPage[],
  pageCount: number,
): Promise<void> {
  await db.documents.update(documentId, {
    insertedPages,
    pageCount,
    updatedAt: Date.now(),
  })
  await markDirty(documentId)
}

export async function searchDocuments(query: string): Promise<DocumentRecord[]> {
  const q = query.trim().toLowerCase()
  const all = await listDocuments()
  if (!q) return all
  return all.filter((d) => d.name.toLowerCase().includes(q))
}

export { uid }
