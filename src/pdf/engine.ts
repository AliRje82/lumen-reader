import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'

// Vite-friendly worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export interface LoadedPdf {
  doc: PDFDocumentProxy
  pageCount: number
  fingerprint: string
}

export async function loadPdf(data: ArrayBuffer): Promise<LoadedPdf> {
  const copy = data.slice(0)
  const loadingTask = pdfjs.getDocument({
    data: copy,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise
  return {
    doc,
    pageCount: doc.numPages,
    fingerprint: doc.fingerprints[0] ?? '',
  }
}

export async function getPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  return doc.getPage(pageNumber)
}

export interface RenderResult {
  canvas: HTMLCanvasElement
  viewport: { width: number; height: number; scale: number }
  task: RenderTask
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  signal?: AbortSignal,
): Promise<RenderResult> {
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas 2D unavailable')

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const task = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  })

  if (signal) {
    const onAbort = () => {
      try {
        task.cancel()
      } catch {
        /* ignore */
      }
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  await task.promise
  return {
    canvas,
    viewport: { width: viewport.width, height: viewport.height, scale },
    task,
  }
}

export interface TextItemBox {
  str: string
  dir: string
  x: number
  y: number
  w: number
  h: number
  transform: number[]
  fontName: string
}

/** Extract searchable text with approximate page-space boxes (PDF user space, bottom-left origin). */
export async function extractPageText(page: PDFPageProxy): Promise<{
  text: string
  items: TextItemBox[]
}> {
  const content = await page.getTextContent()
  const items: TextItemBox[] = []
  let text = ''

  for (const item of content.items) {
    if (!('str' in item)) continue
    const tx = item.transform
    const x = tx[4] ?? 0
    const y = tx[5] ?? 0
    const h = Math.hypot(tx[2] ?? 0, tx[3] ?? 0) || (item.height as number) || 10
    const w = item.width ?? 0
    items.push({
      str: item.str,
      dir: item.dir,
      x,
      y,
      w,
      h,
      transform: [...tx],
      fontName: item.fontName,
    })
    text += item.str
    if (item.hasEOL) text += '\n'
  }

  return { text, items }
}

export async function searchInDocument(
  doc: PDFDocumentProxy,
  query: string,
  maxPages = 500,
): Promise<Array<{ pageIndex: number; matchIndex: number; snippet: string }>> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: Array<{ pageIndex: number; matchIndex: number; snippet: string }> = []
  const limit = Math.min(doc.numPages, maxPages)

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i)
    const { text } = await extractPageText(page)
    const lower = text.toLowerCase()
    let from = 0
    let matchIndex = 0
    while (true) {
      const idx = lower.indexOf(q, from)
      if (idx === -1) break
      const start = Math.max(0, idx - 40)
      const end = Math.min(text.length, idx + q.length + 40)
      results.push({
        pageIndex: i - 1,
        matchIndex,
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      })
      matchIndex++
      from = idx + q.length
      if (results.length >= 200) return results
    }
  }
  return results
}

export function computeFitWidthScale(pageWidth: number, containerWidth: number, padding = 32): number {
  if (pageWidth <= 0) return 1
  return Math.max(0.25, Math.min(4, (containerWidth - padding) / pageWidth))
}

export function computeFitPageScale(
  pageWidth: number,
  pageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 32,
): number {
  if (pageWidth <= 0 || pageHeight <= 0) return 1
  const sx = (containerWidth - padding) / pageWidth
  const sy = (containerHeight - padding) / pageHeight
  return Math.max(0.25, Math.min(4, Math.min(sx, sy)))
}

export { pdfjs }
