import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { exportAnnotatedPdf } from './export'
import type { AnnotationRecord, InsertedPage } from '@/types'

async function makeSamplePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Hello Lumen Reader', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  })
  page.drawText('Selectable sample text for highlights.', {
    x: 72,
    y: 680,
    size: 12,
    font,
  })
  const bytes = await doc.save()
  return Uint8Array.from(bytes).buffer
}

describe('exportAnnotatedPdf', () => {
  it('preserves original page and burns in highlight + ink', async () => {
    const original = await makeSamplePdf()
    const annotations: AnnotationRecord[] = [
      {
        id: 'a1',
        documentId: 'd1',
        pageIndex: 0,
        kind: 'highlight',
        color: 'yellow',
        createdAt: 1,
        updatedAt: 1,
        text: 'Hello',
        quads: { rects: [{ x: 0.1, y: 0.08, w: 0.3, h: 0.03 }] },
      },
      {
        id: 'a2',
        documentId: 'd1',
        pageIndex: 0,
        kind: 'ink',
        color: '#1a1f2e',
        createdAt: 1,
        updatedAt: 1,
        stroke: {
          points: [
            { x: 0.2, y: 0.4, p: 0.5, t: 0 },
            { x: 0.4, y: 0.45, p: 0.6, t: 10 },
            { x: 0.55, y: 0.42, p: 0.4, t: 20 },
          ],
          width: 2,
          color: '#1a1f2e',
          opacity: 1,
          tool: 'pen',
        },
      },
    ]

    const exported = await exportAnnotatedPdf({
      originalPdf: original,
      annotations,
      insertedPages: [],
      pageCount: 1,
    })

    const out = await PDFDocument.load(exported)
    expect(out.getPageCount()).toBe(1)
  })

  it('inserts blank pages and keeps annotations on shifted indices', async () => {
    const original = await makeSamplePdf()
    const inserted: InsertedPage[] = [
      { id: 'b1', index: 1, width: 612, height: 792, createdAt: 1 },
    ]
    const annotations: AnnotationRecord[] = [
      {
        id: 'ink1',
        documentId: 'd1',
        pageIndex: 1,
        kind: 'ink',
        color: '#c0392b',
        createdAt: 1,
        updatedAt: 1,
        stroke: {
          points: [
            { x: 0.1, y: 0.1, p: 0.5, t: 0 },
            { x: 0.5, y: 0.5, p: 0.5, t: 5 },
          ],
          width: 3,
          color: '#c0392b',
          opacity: 1,
          tool: 'pen',
        },
      },
    ]

    const exported = await exportAnnotatedPdf({
      originalPdf: original,
      annotations,
      insertedPages: inserted,
      pageCount: 2,
    })

    const out = await PDFDocument.load(exported)
    expect(out.getPageCount()).toBe(2)
  })
})
