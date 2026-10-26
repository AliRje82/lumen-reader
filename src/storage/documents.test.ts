import { describe, it, expect, beforeEach } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { db } from './db'
import {
  importLocalPdf,
  getDocument,
  getDocumentBlob,
  putAnnotation,
  listAnnotations,
  saveReadingPosition,
  markDirty,
  deleteDocument,
  uid,
} from './documents'

async function sampleBlob(): Promise<Blob> {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Storage test', { x: 50, y: 700, size: 14, font })
  const bytes = await doc.save()
  return new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' })
}

describe('document storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('imports, persists annotations, and restores reading position', async () => {
    const blob = await sampleBlob()
    const doc = await importLocalPdf(blob, 'test.pdf', 1)
    expect(doc.id).toBeTruthy()
    expect(doc.syncStatus).toBe('local')

    const bytes = await getDocumentBlob(doc.id)
    expect(bytes?.byteLength).toBeGreaterThan(0)

    await putAnnotation({
      id: uid(),
      documentId: doc.id,
      pageIndex: 0,
      kind: 'highlight',
      color: 'green',
      text: 'Storage test',
      quads: { rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const anns = await listAnnotations(doc.id)
    expect(anns).toHaveLength(1)
    expect(anns[0]!.text).toBe('Storage test')

    await saveReadingPosition(doc.id, {
      page: 0,
      scrollRatio: 0.25,
      zoom: 1.2,
      zoomMode: 'custom',
    })
    await markDirty(doc.id)

    const reloaded = await getDocument(doc.id)
    expect(reloaded?.readingPosition.zoom).toBe(1.2)
    expect(reloaded?.hasUnsyncedChanges).toBe(true)

    await deleteDocument(doc.id)
    expect(await getDocument(doc.id)).toBeUndefined()
    expect(await listAnnotations(doc.id)).toHaveLength(0)
  })
})
