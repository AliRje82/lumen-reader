import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api', () => ({
  getFileMeta: vi.fn(),
  downloadFile: vi.fn(),
  updateFileSmart: vi.fn(),
  createFile: vi.fn(),
}))

vi.mock('@/pdf/export', () => ({
  exportAnnotatedPdf: vi.fn(async () => new ArrayBuffer(8)),
}))

vi.mock('@/pdf/engine', () => ({
  loadPdf: vi.fn(async () => ({ doc: {}, pageCount: 1, fingerprint: 'test' })),
}))

import { getFileMeta, updateFileSmart } from './api'
import { syncDocumentToDrive } from './sync'
import { db } from '@/storage/db'
import { importLocalPdf, updateDocument } from '@/storage/documents'
import { PDFDocument } from 'pdf-lib'

describe('Drive sync (mocked)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    vi.clearAllMocks()
  })

  it('updates existing Drive file and marks synced', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    const doc = await importLocalPdf(new Blob([Uint8Array.from(bytes)]), 'drive.pdf', 1, {
      fileId: 'file-123',
      fileName: 'drive.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2024-01-01T00:00:00.000Z',
      revisionId: 'rev1',
      md5Checksum: 'abc',
    })
    await updateDocument(doc.id, { hasUnsyncedChanges: true, syncStatus: 'pending' })

    vi.mocked(getFileMeta).mockResolvedValue({
      id: 'file-123',
      name: 'drive.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2024-01-01T00:00:00.000Z',
      headRevisionId: 'rev1',
      md5Checksum: 'abc',
    })
    vi.mocked(updateFileSmart).mockResolvedValue({
      id: 'file-123',
      name: 'drive.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2024-01-02T00:00:00.000Z',
      headRevisionId: 'rev2',
      md5Checksum: 'def',
    })

    const result = await syncDocumentToDrive(doc.id)
    expect(result.ok).toBe(true)
    expect(updateFileSmart).toHaveBeenCalledWith('file-123', expect.any(ArrayBuffer), undefined)
    const updated = await db.documents.get(doc.id)
    expect(updated?.syncStatus).toBe('synced')
    expect(updated?.drive?.fileId).toBe('file-123')
  })

  it('detects conflicts when remote revision diverged', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    const doc = await importLocalPdf(new Blob([Uint8Array.from(bytes)]), 'drive.pdf', 1, {
      fileId: 'file-123',
      fileName: 'drive.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2024-01-01T00:00:00.000Z',
      revisionId: 'rev1',
      md5Checksum: 'abc',
    })
    await updateDocument(doc.id, { hasUnsyncedChanges: true, syncStatus: 'pending' })

    vi.mocked(getFileMeta).mockResolvedValue({
      id: 'file-123',
      name: 'drive.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2024-01-03T00:00:00.000Z',
      headRevisionId: 'rev-remote',
      md5Checksum: 'zzz',
    })

    const result = await syncDocumentToDrive(doc.id)
    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    expect(updateFileSmart).not.toHaveBeenCalled()
  })
})
