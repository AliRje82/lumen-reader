import {
  getDocument,
  getDocumentBlob,
  saveExportedPdf,
  setSyncStatus,
  updateDocument,
  listAnnotations,
  importLocalPdf,
  uid,
} from '@/storage/documents'
import { db } from '@/storage/db'
import { exportAnnotatedPdf } from '@/pdf/export'
import { loadPdf } from '@/pdf/engine'
import { downloadFile, getFileMeta, updateFileSmart, createFile } from './api'
import type { DocumentRecord, DriveMeta } from '@/types'

export type ConflictChoice = 'keep-local' | 'keep-remote' | 'save-copy'

export interface SyncResult {
  ok: boolean
  conflict?: boolean
  remote?: DriveMeta
  error?: string
}

export async function buildExportBuffer(documentId: string): Promise<ArrayBuffer> {
  const doc = await getDocument(documentId)
  if (!doc) throw new Error('Document not found')
  const blob = await db.blobs.get(documentId)
  if (!blob) throw new Error('PDF bytes not found')

  const annotations = await listAnnotations(documentId)
  const exported = await exportAnnotatedPdf({
    originalPdf: blob.original,
    annotations,
    insertedPages: doc.insertedPages,
    pageCount: doc.pageCount,
  })
  await saveExportedPdf(documentId, exported)
  return exported
}

export async function syncDocumentToDrive(
  documentId: string,
  onProgress?: (ratio: number) => void,
): Promise<SyncResult> {
  const doc = await getDocument(documentId)
  if (!doc) return { ok: false, error: 'Document not found' }
  if (!doc.drive?.fileId) return { ok: false, error: 'No Drive file linked' }

  await setSyncStatus(documentId, 'uploading')

  try {
    const remote = await getFileMeta(doc.drive.fileId)
    const conflict = detectConflict(doc, remote)
    if (conflict) {
      await setSyncStatus(documentId, 'conflict')
      return {
        ok: false,
        conflict: true,
        remote: {
          fileId: remote.id,
          fileName: remote.name,
          mimeType: remote.mimeType,
          modifiedTime: remote.modifiedTime,
          revisionId: remote.headRevisionId,
          md5Checksum: remote.md5Checksum,
          webViewLink: remote.webViewLink,
        },
      }
    }

    const exported = await buildExportBuffer(documentId)
    const meta = await updateFileSmart(doc.drive.fileId, exported, onProgress)

    await updateDocument(documentId, {
      syncStatus: 'synced',
      hasUnsyncedChanges: false,
      drive: {
        fileId: meta.id,
        fileName: meta.name,
        mimeType: meta.mimeType,
        modifiedTime: meta.modifiedTime,
        revisionId: meta.headRevisionId,
        md5Checksum: meta.md5Checksum,
        webViewLink: meta.webViewLink,
      },
    })

    await db.pendingUploads.where('documentId').equals(documentId).delete()
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setSyncStatus(documentId, 'error')
    await db.pendingUploads.put({
      id: uid(),
      documentId,
      driveFileId: doc.drive.fileId,
      createdAt: Date.now(),
      attempts: 1,
      lastError: message,
      status: 'failed',
    })
    return { ok: false, error: message }
  }
}

function detectConflict(doc: DocumentRecord, remote: { modifiedTime?: string; md5Checksum?: string; headRevisionId?: string }): boolean {
  if (!doc.hasUnsyncedChanges) return false
  if (!doc.drive) return false

  if (doc.drive.revisionId && remote.headRevisionId && doc.drive.revisionId !== remote.headRevisionId) {
    return true
  }
  if (doc.drive.md5Checksum && remote.md5Checksum && doc.drive.md5Checksum !== remote.md5Checksum) {
    return true
  }
  if (
    doc.drive.modifiedTime &&
    remote.modifiedTime &&
    new Date(remote.modifiedTime).getTime() > new Date(doc.drive.modifiedTime).getTime() + 1000
  ) {
    return true
  }
  return false
}

export async function resolveConflict(
  documentId: string,
  choice: ConflictChoice,
): Promise<SyncResult> {
  const doc = await getDocument(documentId)
  if (!doc?.drive?.fileId) return { ok: false, error: 'No Drive link' }

  if (choice === 'keep-local') {
    // Force overwrite: refresh baseline then upload
    const remote = await getFileMeta(doc.drive.fileId)
    await updateDocument(documentId, {
      drive: {
        ...doc.drive,
        modifiedTime: remote.modifiedTime,
        revisionId: remote.headRevisionId,
        md5Checksum: remote.md5Checksum,
      },
      hasUnsyncedChanges: true,
      syncStatus: 'pending',
    })
    return syncDocumentToDrive(documentId)
  }

  if (choice === 'keep-remote') {
    const buffer = await downloadFile(doc.drive.fileId)
    const remote = await getFileMeta(doc.drive.fileId)
    const blob = await db.blobs.get(documentId)
    if (!blob) return { ok: false, error: 'Missing local blob' }
    await db.blobs.put({
      id: documentId,
      original: buffer,
      exported: undefined,
      updatedAt: Date.now(),
    })
    await db.annotations.where('documentId').equals(documentId).delete()
    await updateDocument(documentId, {
      hasUnsyncedChanges: false,
      syncStatus: 'synced',
      insertedPages: [],
      drive: {
        fileId: remote.id,
        fileName: remote.name,
        mimeType: remote.mimeType,
        modifiedTime: remote.modifiedTime,
        revisionId: remote.headRevisionId,
        md5Checksum: remote.md5Checksum,
        webViewLink: remote.webViewLink,
      },
      localRevision: doc.localRevision + 1,
    })
    return { ok: true, remote: {
      fileId: remote.id,
      fileName: remote.name,
      mimeType: remote.mimeType,
      modifiedTime: remote.modifiedTime,
      revisionId: remote.headRevisionId,
      md5Checksum: remote.md5Checksum,
    } }
  }

  // save-copy: upload local as a new Drive file
  const exported = await buildExportBuffer(documentId)
  const copyName = doc.name.replace(/\.pdf$/i, '') + ' (conflict copy).pdf'
  const created = await createFile(copyName, exported)
  await updateDocument(documentId, {
    name: copyName,
    syncStatus: 'synced',
    hasUnsyncedChanges: false,
    drive: {
      fileId: created.id,
      fileName: created.name,
      mimeType: created.mimeType,
      modifiedTime: created.modifiedTime,
      revisionId: created.headRevisionId,
      md5Checksum: created.md5Checksum,
      webViewLink: created.webViewLink,
    },
  })
  return { ok: true }
}

export async function refreshFromDrive(documentId: string): Promise<SyncResult> {
  const doc = await getDocument(documentId)
  if (!doc?.drive?.fileId) return { ok: false, error: 'No Drive link' }
  if (doc.hasUnsyncedChanges) {
    return { ok: false, conflict: true, error: 'Local changes would be lost. Resolve conflict first.' }
  }
  const remote = await getFileMeta(doc.drive.fileId)
  const buffer = await downloadFile(doc.drive.fileId)
  await db.blobs.put({
    id: documentId,
    original: buffer,
    exported: undefined,
    updatedAt: Date.now(),
  })
  await updateDocument(documentId, {
    name: remote.name,
    syncStatus: 'synced',
    drive: {
      fileId: remote.id,
      fileName: remote.name,
      mimeType: remote.mimeType,
      modifiedTime: remote.modifiedTime,
      revisionId: remote.headRevisionId,
      md5Checksum: remote.md5Checksum,
      webViewLink: remote.webViewLink,
    },
  })
  return { ok: true }
}

export async function openDrivePdf(
  fileId: string,
  name: string,
  mimeType: string,
): Promise<DocumentRecord> {
  // Reuse existing local doc linked to same Drive file
  const existing = await db.documents.filter((d) => d.drive?.fileId === fileId).first()
  if (existing) {
    if (!existing.hasUnsyncedChanges) {
      const remote = await getFileMeta(fileId)
      const changed =
        (existing.drive?.md5Checksum && remote.md5Checksum && existing.drive.md5Checksum !== remote.md5Checksum) ||
        (existing.drive?.revisionId && remote.headRevisionId && existing.drive.revisionId !== remote.headRevisionId)
      if (changed) {
        const buffer = await downloadFile(fileId)
        await db.blobs.put({ id: existing.id, original: buffer, updatedAt: Date.now() })
        const loaded = await loadPdf(buffer)
        await updateDocument(existing.id, {
          name: remote.name,
          pageCount: loaded.pageCount,
          syncStatus: 'synced',
          drive: {
            fileId: remote.id,
            fileName: remote.name,
            mimeType: remote.mimeType,
            modifiedTime: remote.modifiedTime,
            revisionId: remote.headRevisionId,
            md5Checksum: remote.md5Checksum,
            webViewLink: remote.webViewLink,
          },
        })
      }
    }
    return (await getDocument(existing.id))!
  }

  const buffer = await downloadFile(fileId)
  const remote = await getFileMeta(fileId)
  const loaded = await loadPdf(buffer)
  return importLocalPdf(
    new Blob([new Uint8Array(buffer)]),
    name || remote.name,
    loaded.pageCount,
    {
      fileId,
      fileName: name || remote.name,
      mimeType: mimeType || remote.mimeType,
      modifiedTime: remote.modifiedTime,
      revisionId: remote.headRevisionId,
      md5Checksum: remote.md5Checksum,
      webViewLink: remote.webViewLink,
    },
  )
}

export async function processPendingUploads(): Promise<void> {
  if (!navigator.onLine) return
  const pending = await db.pendingUploads.where('status').anyOf('queued', 'failed').toArray()
  for (const job of pending) {
    await syncDocumentToDrive(job.documentId)
  }
}

export { getDocumentBlob }
