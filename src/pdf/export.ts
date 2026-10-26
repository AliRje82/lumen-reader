import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type {
  AnnotationRecord,
  HighlightColor,
  InsertedPage,
  NormRect,
  StrokeData,
} from '@/types'
import { HIGHLIGHT_COLORS } from '@/types'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  }
}

function colorOf(c: HighlightColor | string) {
  const hex = (HIGHLIGHT_COLORS as Record<string, string>)[c] ?? c
  return hexToRgb(hex.startsWith('#') ? hex : '#f5d76e')
}

/** Convert normalized top-left rect to PDF bottom-left coords. */
function normToPdf(rect: NormRect, pageWidth: number, pageHeight: number) {
  return {
    x: rect.x * pageWidth,
    y: pageHeight - (rect.y + rect.h) * pageHeight,
    w: rect.w * pageWidth,
    h: rect.h * pageHeight,
  }
}

function drawStroke(
  page: ReturnType<PDFDocument['getPages']>[number],
  stroke: StrokeData,
  pageWidth: number,
  pageHeight: number,
) {
  const pts = stroke.points
  if (pts.length < 2) return
  const { r, g, b } = hexToRgb(stroke.color.startsWith('#') ? stroke.color : '#1a1f2e')
  const opacity = stroke.opacity ?? (stroke.tool === 'highlighter-pen' ? 0.35 : 1)

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const c = pts[i]!
    const x1 = a.x * pageWidth
    const y1 = pageHeight - a.y * pageHeight
    const x2 = c.x * pageWidth
    const y2 = pageHeight - c.y * pageHeight
    const avgP = ((a.p || 0.5) + (c.p || 0.5)) / 2
    const thickness = Math.max(0.5, stroke.width * (0.5 + avgP))
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color: rgb(r, g, b),
      opacity,
    })
  }
}

export interface ExportOptions {
  originalPdf: ArrayBuffer
  annotations: AnnotationRecord[]
  insertedPages: InsertedPage[]
  /** Working page count including blanks */
  pageCount: number
}

/**
 * Build an exportable PDF:
 * - Starts from the original PDF
 * - Inserts blank pages at recorded indices
 * - Burns in highlights, underlines, ink, and note markers as page content
 *
 * Editable annotation metadata remains in IndexedDB separately.
 */
export async function exportAnnotatedPdf(options: ExportOptions): Promise<ArrayBuffer> {
  const { originalPdf, annotations, insertedPages } = options
  const src = await PDFDocument.load(originalPdf.slice(0), {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  const out = await PDFDocument.create()
  out.setTitle(src.getTitle() ?? 'Annotated PDF')
  out.setProducer('Lumen Reader')
  out.setCreator('Lumen Reader')

  const srcPageCount = src.getPageCount()
  const sortedInserts = [...insertedPages].sort((a, b) => a.index - b.index)

  // Build ordered list of page sources: { type: 'src', i } | { type: 'blank', page }
  type Slot =
    | { type: 'src'; srcIndex: number }
    | { type: 'blank'; meta: InsertedPage }

  const slots: Slot[] = []
  let srcCursor = 0
  let insertPtr = 0

  const totalWorking =
    srcPageCount + sortedInserts.length

  for (let workingIndex = 0; workingIndex < totalWorking; workingIndex++) {
    const insert = sortedInserts.find((p) => p.index === workingIndex)
    // Prefer matching by sorted walk
    const nextInsert = sortedInserts[insertPtr]
    if (nextInsert && nextInsert.index === workingIndex) {
      slots.push({ type: 'blank', meta: nextInsert })
      insertPtr++
    } else if (insert && !slots.some((s) => s.type === 'blank' && s.meta.id === insert.id)) {
      slots.push({ type: 'blank', meta: insert })
    } else if (srcCursor < srcPageCount) {
      slots.push({ type: 'src', srcIndex: srcCursor })
      srcCursor++
    }
  }

  // Fallback if algorithm missed pages
  while (srcCursor < srcPageCount) {
    slots.push({ type: 'src', srcIndex: srcCursor++ })
  }
  while (insertPtr < sortedInserts.length) {
    slots.push({ type: 'blank', meta: sortedInserts[insertPtr++]! })
  }

  const font = await out.embedFont(StandardFonts.Helvetica)

  for (let pageIndex = 0; pageIndex < slots.length; pageIndex++) {
    const slot = slots[pageIndex]!
    let pageWidth: number
    let pageHeight: number

    if (slot.type === 'src') {
      const [copied] = await out.copyPages(src, [slot.srcIndex])
      const page = out.addPage(copied)
      pageWidth = page.getWidth()
      pageHeight = page.getHeight()
      await drawAnnotationsForPage(page, annotations, pageIndex, pageWidth, pageHeight, font)
    } else {
      pageWidth = slot.meta.width || 612
      pageHeight = slot.meta.height || 792
      const page = out.addPage([pageWidth, pageHeight])
      // subtle paper fill
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
      })
      await drawAnnotationsForPage(page, annotations, pageIndex, pageWidth, pageHeight, font)
    }
  }

  const bytes = await out.save({ useObjectStreams: true })
  return Uint8Array.from(bytes).buffer
}

async function drawAnnotationsForPage(
  page: ReturnType<PDFDocument['getPages']>[number],
  annotations: AnnotationRecord[],
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const pageAnns = annotations.filter((a) => a.pageIndex === pageIndex)

  for (const ann of pageAnns) {
    if (ann.kind === 'ink' && ann.stroke) {
      drawStroke(page, ann.stroke, pageWidth, pageHeight)
      continue
    }

    if (ann.kind === 'region' && ann.region) {
      const r = normToPdf(ann.region, pageWidth, pageHeight)
      const { r: cr, g, b } = colorOf(ann.color)
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        color: rgb(cr, g, b),
        opacity: 0.35,
      })
      continue
    }

    if ((ann.kind === 'highlight' || ann.kind === 'underline' || ann.kind === 'strikethrough') && ann.quads) {
      const { r: cr, g, b } = colorOf(ann.color)
      for (const rect of ann.quads.rects) {
        const r = normToPdf(rect, pageWidth, pageHeight)
        if (ann.kind === 'highlight') {
          page.drawRectangle({
            x: r.x,
            y: r.y,
            width: r.w,
            height: r.h,
            color: rgb(cr, g, b),
            opacity: 0.4,
          })
        } else if (ann.kind === 'underline') {
          page.drawLine({
            start: { x: r.x, y: r.y - 1 },
            end: { x: r.x + r.w, y: r.y - 1 },
            thickness: 1.2,
            color: rgb(cr, g, b),
          })
        } else {
          page.drawLine({
            start: { x: r.x, y: r.y + r.h / 2 },
            end: { x: r.x + r.w, y: r.y + r.h / 2 },
            thickness: 1.2,
            color: rgb(cr, g, b),
          })
        }
      }
    }

    if (ann.kind === 'note' || ann.note) {
      const anchor = ann.quads?.rects[0] ?? ann.region
      if (anchor) {
        const r = normToPdf(anchor, pageWidth, pageHeight)
        page.drawCircle({
          x: r.x + 6,
          y: r.y + r.h + 6,
          size: 6,
          color: rgb(0.95, 0.75, 0.2),
        })
        if (ann.note) {
          const label = ann.note.slice(0, 80)
          page.drawText(label, {
            x: Math.min(r.x, pageWidth - 120),
            y: Math.min(r.y + r.h + 14, pageHeight - 12),
            size: 8,
            font,
            color: rgb(0.2, 0.2, 0.2),
            maxWidth: 200,
          })
        }
      }
    }
  }

}
