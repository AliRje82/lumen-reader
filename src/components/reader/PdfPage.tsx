import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getPage, renderPageToCanvas } from '@/pdf/engine'
import type { AnnotationRecord, NormRect, StrokePoint, ToolMode, HighlightColor } from '@/types'
import { HIGHLIGHT_COLORS } from '@/types'
import { smoothStroke, hitTestAnnotation } from '@/annotations/geometry'
import { AnnotationLayer } from './AnnotationLayer'
import './PdfPage.css'

interface PdfPageProps {
  pdfDoc: PDFDocumentProxy
  /** 0-based working page index */
  pageIndex: number
  /** Actual PDF.js page number (1-based), or null for blank inserted page */
  pdfPageNumber: number | null
  width: number
  height: number
  scale: number
  annotations: AnnotationRecord[]
  tool: ToolMode
  highlightColor: HighlightColor
  penColor: string
  penWidth: number
  highlighterWidth: number
  isBlank?: boolean
  onTextSelect: (info: {
    text: string
    pageIndex: number
    pageEl: HTMLElement
    clientX: number
    clientY: number
  }) => void
  onStrokeComplete: (stroke: {
    pageIndex: number
    points: StrokePoint[]
    width: number
    color: string
    opacity: number
    tool: 'pen' | 'highlighter-pen'
  }) => void
  onEraseAt: (pageIndex: number, annotationId: string) => void
  onRegionComplete: (pageIndex: number, region: NormRect) => void
  onNotePlace: (pageIndex: number, x: number, y: number) => void
}

export function PdfPage({
  pdfDoc,
  pageIndex,
  pdfPageNumber,
  width,
  height,
  scale,
  annotations,
  tool,
  highlightColor,
  penColor,
  penWidth,
  highlighterWidth,
  isBlank,
  onTextSelect,
  onStrokeComplete,
  onEraseAt,
  onRegionComplete,
  onNotePlace,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [drawing, setDrawing] = useState<StrokePoint[] | null>(null)
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null)
  const [regionCurrent, setRegionCurrent] = useState<NormRect | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (pdfPageNumber == null || !canvasRef.current) {
      setRendered(true)
      return
    }

    const canvas = canvasRef.current
    const textLayerDiv = textLayerRef.current
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRendered(false)

    let cancelled = false

    ;(async () => {
      try {
        const page = await getPage(pdfDoc, pdfPageNumber)
        if (ac.signal.aborted || cancelled) return
        await renderPageToCanvas(page, canvas, scale, ac.signal)
        if (ac.signal.aborted || cancelled) return

        // Text layer via pdf.js TextLayer if available
        if (textLayerDiv) {
          textLayerDiv.innerHTML = ''
          const viewport = page.getViewport({ scale })
          textLayerDiv.style.width = `${viewport.width}px`
          textLayerDiv.style.height = `${viewport.height}px`

          const textContent = await page.getTextContent()
          // Manual text layer for reliable selection (pdf.js TextLayer API varies by version)
          for (const item of textContent.items) {
            if (!('str' in item) || !item.str) continue
            const tx = item.transform
            const fontHeight = Math.hypot(tx[2] ?? 0, tx[3] ?? 0) * scale
            const left = (tx[4] ?? 0) * scale
            const bottom = (tx[5] ?? 0) * scale
            const span = document.createElement('span')
            span.textContent = item.str
            span.style.left = `${left}px`
            span.style.top = `${viewport.height - bottom - fontHeight}px`
            span.style.fontSize = `${Math.max(1, fontHeight)}px`
            span.style.fontFamily = 'sans-serif'
            span.style.transformOrigin = '0% 0%'
            const angle = Math.atan2(tx[1] ?? 0, tx[0] ?? 1)
            if (Math.abs(angle) > 0.01) {
              span.style.transform = `rotate(${angle}rad)`
            }
            textLayerDiv.appendChild(span)
          }
        }
        if (!cancelled) setRendered(true)
      } catch (err) {
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return
        if (!cancelled) console.error('Page render failed', err)
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [pdfDoc, pdfPageNumber, scale])

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const el = pageRef.current
    if (!el) return { x: 0, y: 0 }
    const box = el.getBoundingClientRect()
    return {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    }
  }, [])

  const isDrawTool = tool === 'pen' || tool === 'highlighter-pen' || tool === 'eraser'
  const isRegion = tool === 'region'
  const allowTextSelect = tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strikethrough' || tool === 'note'

  const onPointerDown = (e: ReactPointerEvent) => {
    if (tool === 'note' && e.button === 0) {
      const p = toNorm(e.clientX, e.clientY)
      onNotePlace(pageIndex, p.x, p.y)
      return
    }
    if (isRegion && e.button === 0) {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      const p = toNorm(e.clientX, e.clientY)
      setRegionStart(p)
      setRegionCurrent({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }
    if (!isDrawTool || e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = toNorm(e.clientX, e.clientY)
    const pt: StrokePoint = {
      x: p.x,
      y: p.y,
      p: e.pressure || 0.5,
      t: e.timeStamp,
    }
    setDrawing([pt])

    if (tool === 'eraser') {
      const hit = annotations.find((a) =>
        hitTestAnnotation(p.x, p.y, a.quads, a.region, a.stroke?.points),
      )
      if (hit) onEraseAt(pageIndex, hit.id)
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (regionStart) {
      const p = toNorm(e.clientX, e.clientY)
      setRegionCurrent({
        x: Math.min(regionStart.x, p.x),
        y: Math.min(regionStart.y, p.y),
        w: Math.abs(p.x - regionStart.x),
        h: Math.abs(p.y - regionStart.y),
      })
      return
    }
    if (!drawing) return
    const p = toNorm(e.clientX, e.clientY)
    const pt: StrokePoint = { x: p.x, y: p.y, p: e.pressure || 0.5, t: e.timeStamp }
    setDrawing((prev) => (prev ? [...prev, pt] : [pt]))

    if (tool === 'eraser') {
      const hit = annotations.find((a) =>
        a.kind === 'ink' && hitTestAnnotation(p.x, p.y, undefined, undefined, a.stroke?.points),
      )
      if (hit) onEraseAt(pageIndex, hit.id)
    }
  }

  const onPointerUp = () => {
    if (regionCurrent && regionCurrent.w > 0.01 && regionCurrent.h > 0.01) {
      onRegionComplete(pageIndex, regionCurrent)
    }
    setRegionStart(null)
    setRegionCurrent(null)

    if (!drawing || drawing.length < 2) {
      setDrawing(null)
      return
    }
    if (tool === 'pen' || tool === 'highlighter-pen') {
      const smoothed = smoothStroke(drawing, 3)
      onStrokeComplete({
        pageIndex,
        points: smoothed,
        width: tool === 'highlighter-pen' ? highlighterWidth : penWidth,
        color: tool === 'highlighter-pen' ? HIGHLIGHT_COLORS[highlightColor] : penColor,
        opacity: tool === 'highlighter-pen' ? 0.35 : 1,
        tool,
      })
    }
    setDrawing(null)
  }

  const onPointerCancel = () => {
    setDrawing(null)
    setRegionStart(null)
    setRegionCurrent(null)
  }

  useEffect(() => {
    const onSel = () => {
      if (!allowTextSelect) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !pageRef.current) return
      if (!pageRef.current.contains(sel.anchorNode)) return
      const text = sel.toString().trim()
      if (!text) return
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      onTextSelect({
        text,
        pageIndex,
        pageEl: pageRef.current,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top,
      })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [allowTextSelect, onTextSelect, pageIndex])

  return (
    <div
      className={`pdf-page ${isBlank ? 'blank' : ''} ${isDrawTool || isRegion ? 'drawing' : ''}`}
      ref={pageRef}
      data-page-index={pageIndex}
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {pdfPageNumber != null ? (
        <canvas ref={canvasRef} className="pdf-canvas" aria-label={`Page ${pageIndex + 1}`} />
      ) : (
        <div className="blank-page-surface" aria-label={`Blank page ${pageIndex + 1}`} />
      )}
      <div
        ref={textLayerRef}
        className={`text-layer ${allowTextSelect && !isDrawTool ? 'selectable' : 'no-select'}`}
      />
      <AnnotationLayer
        annotations={annotations}
        width={width}
        height={height}
        liveStroke={drawing}
        liveTool={tool}
        liveColor={tool === 'highlighter-pen' ? HIGHLIGHT_COLORS[highlightColor] : penColor}
        liveWidth={tool === 'highlighter-pen' ? highlighterWidth : penWidth}
        regionPreview={regionCurrent}
      />
      {!rendered && pdfPageNumber != null && <div className="page-skeleton" aria-hidden />}
    </div>
  )
}
