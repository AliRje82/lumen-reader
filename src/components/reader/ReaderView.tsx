import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReaderStore } from '@/store/reader'
import { PdfPage } from './PdfPage'
import { SelectionToolbar } from './SelectionToolbar'
import { buildQuadFromSelection } from '@/annotations/geometry'
import { computeFitPageScale, computeFitWidthScale, searchInDocument } from '@/pdf/engine'
import type { AnnotationKind, HighlightColor, NormRect, StrokePoint } from '@/types'
import './ReaderView.css'

export function ReaderView() {
  const pdf = useReaderStore((s) => s.pdf)
  const document = useReaderStore((s) => s.document)
  const annotations = useReaderStore((s) => s.annotations)
  const tool = useReaderStore((s) => s.tool)
  const highlightColor = useReaderStore((s) => s.highlightColor)
  const penColor = useReaderStore((s) => s.penColor)
  const penWidth = useReaderStore((s) => s.penWidth)
  const highlighterWidth = useReaderStore((s) => s.highlighterWidth)
  const zoom = useReaderStore((s) => s.zoom)
  const zoomMode = useReaderStore((s) => s.zoomMode)
  const viewMode = useReaderStore((s) => s.viewMode)
  const currentPage = useReaderStore((s) => s.currentPage)
  const selectionToolbar = useReaderStore((s) => s.selectionToolbar)
  const searchQuery = useReaderStore((s) => s.searchQuery)
  const setZoom = useReaderStore((s) => s.setZoom)
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage)
  const setSelectionToolbar = useReaderStore((s) => s.setSelectionToolbar)
  const addAnnotation = useReaderStore((s) => s.addAnnotation)
  const deleteAnnotation = useReaderStore((s) => s.deleteAnnotation)
  const updateAnnotation = useReaderStore((s) => s.updateAnnotation)
  const setHighlightColor = useReaderStore((s) => s.setHighlightColor)
  const persistPosition = useReaderStore((s) => s.persistPosition)
  const setSearchResults = useReaderStore((s) => s.setSearchResults)
  const setTool = useReaderStore((s) => s.setTool)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })
  const [basePageSize, setBasePageSize] = useState({ w: 612, h: 792 })
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 4 })
  const [noteDraft, setNoteDraft] = useState<{ pageIndex: number; annId?: string; x?: number; y?: number } | null>(null)
  const [noteText, setNoteText] = useState('')

  const pageCount = document?.pageCount ?? pdf?.pageCount ?? 0

  // Map working page index -> pdf.js page number (1-based) or null if blank
  const pageMap = useMemo(() => {
    const inserts = new Set((document?.insertedPages ?? []).map((p) => p.index))
    const map: Array<number | null> = []
    let src = 1
    for (let i = 0; i < pageCount; i++) {
      if (inserts.has(i)) map.push(null)
      else {
        map.push(src)
        src++
      }
    }
    return map
  }, [document?.insertedPages, pageCount])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr) setContainerSize({ w: cr.width, h: cr.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    ;(async () => {
      const page = await pdf.doc.getPage(1)
      const vp = page.getViewport({ scale: 1 })
      if (!cancelled) setBasePageSize({ w: vp.width, h: vp.height })
    })()
    return () => {
      cancelled = true
    }
  }, [pdf])

  useEffect(() => {
    if (zoomMode === 'fit-width') {
      setZoom(computeFitWidthScale(basePageSize.w, containerSize.w), 'fit-width')
    } else if (zoomMode === 'fit-page') {
      setZoom(computeFitPageScale(basePageSize.w, basePageSize.h, containerSize.w, containerSize.h), 'fit-page')
    }
  }, [zoomMode, basePageSize, containerSize, setZoom])

  const pageWidth = basePageSize.w * zoom
  const pageHeight = basePageSize.h * zoom

  // Virtualization: estimate which pages are near viewport
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      const gap = 16
      const pageH = pageHeight + gap
      const start = Math.max(0, Math.floor(el.scrollTop / pageH) - 1)
      const end = Math.min(pageCount - 1, Math.ceil((el.scrollTop + el.clientHeight) / pageH) + 1)
      setVisibleRange({ start, end })
      const page = Math.min(pageCount - 1, Math.max(0, Math.round(el.scrollTop / pageH)))
      setCurrentPage(page)
      const maxScroll = el.scrollHeight - el.clientHeight
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
      void persistPosition(page, ratio)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [pageHeight, pageCount, setCurrentPage, persistPosition])

  // Restore scroll on open
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !document) return
    const gap = 16
    const top = document.readingPosition.page * (pageHeight + gap)
    el.scrollTop = top
  }, [document?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search
  useEffect(() => {
    if (!pdf || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const t = window.setTimeout(() => {
      void searchInDocument(pdf.doc, searchQuery).then(setSearchResults)
    }, 250)
    return () => window.clearTimeout(t)
  }, [pdf, searchQuery, setSearchResults])

  const lastAutoMarkup = useRef<string>('')

  const onTextSelect = useCallback(
    (info: { text: string; pageIndex: number; pageEl: HTMLElement; clientX: number; clientY: number }) => {
      setSelectionToolbar({
        x: info.clientX,
        y: info.clientY,
        text: info.text,
        pageIndex: info.pageIndex,
        pageEl: info.pageEl,
      })
      if (tool === 'highlight' || tool === 'underline' || tool === 'strikethrough') {
        const key = `${tool}:${info.pageIndex}:${info.text}`
        if (lastAutoMarkup.current === key) return
        const quads = buildQuadFromSelection(info.pageEl)
        if (!quads || !document) return
        lastAutoMarkup.current = key
        void addAnnotation({
          documentId: document.id,
          pageIndex: info.pageIndex,
          kind: tool as AnnotationKind,
          color: highlightColor,
          text: info.text,
          quads,
        })
        window.getSelection()?.removeAllRanges()
        setSelectionToolbar(null)
        window.setTimeout(() => {
          if (lastAutoMarkup.current === key) lastAutoMarkup.current = ''
        }, 400)
      }
    },
    [tool, document, highlightColor, addAnnotation, setSelectionToolbar],
  )

  const applyMarkup = async (kind: AnnotationKind) => {
    if (!selectionToolbar || !document) return
    const quads = buildQuadFromSelection(selectionToolbar.pageEl)
    if (!quads) return
    const ann = await addAnnotation({
      documentId: document.id,
      pageIndex: selectionToolbar.pageIndex,
      kind,
      color: highlightColor,
      text: selectionToolbar.text,
      quads,
    })
    window.getSelection()?.removeAllRanges()
    setSelectionToolbar(null)
    if (kind === 'note') {
      setNoteDraft({ pageIndex: selectionToolbar.pageIndex, annId: ann.id })
      setNoteText('')
    }
  }

  const onStrokeComplete = useCallback(
    async (stroke: {
      pageIndex: number
      points: StrokePoint[]
      width: number
      color: string
      opacity: number
      tool: 'pen' | 'highlighter-pen'
    }) => {
      if (!document) return
      await addAnnotation({
        documentId: document.id,
        pageIndex: stroke.pageIndex,
        kind: 'ink',
        color: stroke.color,
        stroke: {
          points: stroke.points,
          width: stroke.width,
          color: stroke.color,
          opacity: stroke.opacity,
          tool: stroke.tool,
        },
      })
    },
    [document, addAnnotation],
  )

  const onRegionComplete = useCallback(
    async (pageIndex: number, region: NormRect) => {
      if (!document) return
      await addAnnotation({
        documentId: document.id,
        pageIndex,
        kind: 'region',
        color: highlightColor,
        region,
        text: '[Region highlight]',
      })
    },
    [document, highlightColor, addAnnotation],
  )

  const onNotePlace = useCallback(
    (pageIndex: number, x: number, y: number) => {
      setNoteDraft({ pageIndex, x, y })
      setNoteText('')
    },
    [],
  )

  const saveNote = async () => {
    if (!document || !noteDraft || !noteText.trim()) {
      setNoteDraft(null)
      return
    }
    if (noteDraft.annId) {
      await updateAnnotation(noteDraft.annId, { note: noteText.trim(), kind: 'note' })
    } else {
      await addAnnotation({
        documentId: document.id,
        pageIndex: noteDraft.pageIndex,
        kind: 'note',
        color: 'yellow',
        note: noteText.trim(),
        region: { x: noteDraft.x ?? 0.05, y: noteDraft.y ?? 0.05, w: 0.02, h: 0.02 },
      })
    }
    setNoteDraft(null)
    setNoteText('')
    setTool('select')
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'h' || e.key === 'H') {
        if (selectionToolbar) void applyMarkup('highlight')
        else setTool('highlight')
      }
      if (e.key === 'Escape') {
        setSelectionToolbar(null)
        setTool('select')
        setNoteDraft(null)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void useReaderStore.getState().undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        void useReaderStore.getState().redo()
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        scrollToPage(Math.min(pageCount - 1, currentPage + 1))
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        scrollToPage(Math.max(0, currentPage - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const scrollToPage = (page: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ top: page * (pageHeight + 16), behavior: 'smooth' })
    setCurrentPage(page)
  }

  if (!pdf || !document) return null

  const pagesToRender =
    viewMode === 'single'
      ? [currentPage]
      : Array.from({ length: pageCount }, (_, i) => i).filter(
          (i) => i >= visibleRange.start && i <= visibleRange.end,
        )

  return (
    <div className="reader-view">
      <div className="reader-scroller scrollable" ref={scrollerRef}>
        <div
          className="reader-pages"
          style={{
            height: viewMode === 'single' ? undefined : pageCount * (pageHeight + 16),
            paddingTop: viewMode === 'continuous' ? visibleRange.start * (pageHeight + 16) : 0,
          }}
        >
          {(viewMode === 'single' ? [currentPage] : pagesToRender).map((i) => (
            <PdfPage
              key={`${document.id}-${i}-${pageMap[i] ?? 'blank'}`}
              pdfDoc={pdf.doc}
              pageIndex={i}
              pdfPageNumber={pageMap[i] ?? null}
              width={pageMap[i] == null ? pageWidth : pageWidth}
              height={pageMap[i] == null ? pageHeight : pageHeight}
              scale={zoom}
              annotations={annotations.filter((a) => a.pageIndex === i)}
              tool={tool}
              highlightColor={highlightColor}
              penColor={penColor}
              penWidth={penWidth}
              highlighterWidth={highlighterWidth}
              isBlank={pageMap[i] == null}
              onTextSelect={onTextSelect}
              onStrokeComplete={onStrokeComplete}
              onEraseAt={(_, id) => void deleteAnnotation(id)}
              onRegionComplete={onRegionComplete}
              onNotePlace={onNotePlace}
            />
          ))}
          {viewMode === 'continuous' && (
            <div style={{ height: Math.max(0, (pageCount - 1 - visibleRange.end) * (pageHeight + 16)) }} />
          )}
        </div>
      </div>

      {selectionToolbar && (
        <SelectionToolbar
          x={selectionToolbar.x}
          y={selectionToolbar.y}
          color={highlightColor}
          onHighlight={() => void applyMarkup('highlight')}
          onUnderline={() => void applyMarkup('underline')}
          onStrike={() => void applyMarkup('strikethrough')}
          onNote={() => void applyMarkup('note')}
          onColor={(c: HighlightColor) => void setHighlightColor(c)}
          onClose={() => setSelectionToolbar(null)}
        />
      )}

      {noteDraft && (
        <div className="note-modal" role="dialog" aria-label="Add note">
          <div className="note-modal-card">
            <h3>Note</h3>
            <textarea
              className="textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write a note…"
              autoFocus
            />
            <div className="note-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setNoteDraft(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveNote()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
