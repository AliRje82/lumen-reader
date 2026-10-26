import { create } from 'zustand'
import type {
  AnnotationRecord,
  BookmarkRecord,
  DocumentRecord,
  HighlightColor,
  InsertedPage,
  ToolMode,
  ViewMode,
  ZoomMode,
} from '@/types'
import {
  getDocument,
  getDocumentBlob,
  listAnnotations,
  listBookmarks,
  putAnnotation,
  putAnnotations,
  removeAnnotation,
  removeAnnotations,
  saveReadingPosition,
  touchOpened,
  updateInsertedPages,
  uid,
  putBookmark,
  removeBookmark,
  markDirty,
} from '@/storage/documents'
import { loadPdf, type LoadedPdf } from '@/pdf/engine'
import { AnnotationHistory, applyRedo, applyUndo } from '@/annotations/history'
import { getSettings, setSettings } from '@/storage/db'
import { useAppStore } from '@/store/app'

interface ReaderState {
  documentId: string | null
  document: DocumentRecord | null
  pdf: LoadedPdf | null
  pdfBytes: ArrayBuffer | null
  loading: boolean
  error: string | null
  annotations: AnnotationRecord[]
  bookmarks: BookmarkRecord[]
  tool: ToolMode
  highlightColor: HighlightColor
  penColor: string
  penWidth: number
  highlighterWidth: number
  zoom: number
  zoomMode: ZoomMode
  viewMode: ViewMode
  currentPage: number
  distractionFree: boolean
  searchQuery: string
  searchResults: Array<{ pageIndex: number; matchIndex: number; snippet: string }>
  searchIndex: number
  selectionToolbar: { x: number; y: number; text: string; pageIndex: number; pageEl: HTMLElement } | null
  history: AnnotationHistory
  canUndo: boolean
  canRedo: boolean
  syncProgress: number | null

  openDocument: (id: string) => Promise<void>
  closeDocument: () => void
  setTool: (tool: ToolMode) => void
  setHighlightColor: (c: HighlightColor) => void
  setPenColor: (c: string) => void
  setPenWidth: (w: number) => void
  setZoom: (zoom: number, mode?: ZoomMode) => void
  setViewMode: (mode: ViewMode) => void
  setCurrentPage: (page: number) => void
  setDistractionFree: (v: boolean) => void
  setSelectionToolbar: (v: ReaderState['selectionToolbar']) => void
  addAnnotation: (ann: Omit<AnnotationRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<AnnotationRecord>
  updateAnnotation: (id: string, patch: Partial<AnnotationRecord>) => Promise<void>
  deleteAnnotation: (id: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  insertBlankPage: (afterPageIndex: number) => Promise<void>
  deleteInsertedPage: (pageId: string) => Promise<void>
  addBookmark: (pageIndex: number, title: string) => Promise<void>
  deleteBookmark: (id: string) => Promise<void>
  persistPosition: (page: number, scrollRatio: number) => Promise<void>
  setSearchQuery: (q: string) => void
  setSearchResults: (r: ReaderState['searchResults']) => void
  setSearchIndex: (i: number) => void
  setSyncProgress: (n: number | null) => void
  reloadMeta: () => Promise<void>
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  documentId: null,
  document: null,
  pdf: null,
  pdfBytes: null,
  loading: false,
  error: null,
  annotations: [],
  bookmarks: [],
  tool: 'select',
  highlightColor: 'yellow',
  penColor: '#1a1f2e',
  penWidth: 2,
  highlighterWidth: 12,
  zoom: 1,
  zoomMode: 'fit-width',
  viewMode: 'continuous',
  currentPage: 0,
  distractionFree: false,
  searchQuery: '',
  searchResults: [],
  searchIndex: 0,
  selectionToolbar: null,
  history: new AnnotationHistory(),
  canUndo: false,
  canRedo: false,
  syncProgress: null,

  openDocument: async (id) => {
    set({ loading: true, error: null, documentId: id, pdf: null, selectionToolbar: null })
    get().history.clear()
    try {
      const settings = await getSettings()
      const doc = await getDocument(id)
      if (!doc) throw new Error('Document not found')
      const bytes = await getDocumentBlob(id)
      if (!bytes) throw new Error('PDF data missing')
      const pdf = await loadPdf(bytes)
      const annotations = await listAnnotations(id)
      const bookmarks = await listBookmarks(id)
      await touchOpened(id)

      // If inserted pages exist, pageCount should already reflect them
      set({
        document: doc,
        pdf,
        pdfBytes: bytes,
        annotations,
        bookmarks,
        loading: false,
        currentPage: doc.readingPosition.page,
        zoom: doc.readingPosition.zoom,
        zoomMode: doc.readingPosition.zoomMode,
        highlightColor: (settings.highlightColor as HighlightColor) || 'yellow',
        penColor: settings.penColor,
        penWidth: settings.penWidth,
        highlighterWidth: settings.highlighterWidth,
        distractionFree: settings.distractionFree,
        canUndo: false,
        canRedo: false,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to open PDF',
      })
    }
  },

  closeDocument: () => {
    const pdf = get().pdf
    void pdf?.doc.cleanup()
    set({
      documentId: null,
      document: null,
      pdf: null,
      pdfBytes: null,
      annotations: [],
      bookmarks: [],
      selectionToolbar: null,
      searchQuery: '',
      searchResults: [],
      error: null,
    })
  },

  setTool: (tool) => set({ tool }),
  setHighlightColor: async (highlightColor) => {
    set({ highlightColor })
    await setSettings({ highlightColor })
  },
  setPenColor: (penColor) => {
    set({ penColor })
    void setSettings({ penColor })
  },
  setPenWidth: (penWidth) => {
    set({ penWidth })
    void setSettings({ penWidth })
  },
  setZoom: (zoom, zoomMode = 'custom') => set({ zoom, zoomMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setDistractionFree: (distractionFree) => {
    set({ distractionFree })
    void setSettings({ distractionFree })
  },
  setSelectionToolbar: (selectionToolbar) => set({ selectionToolbar }),

  addAnnotation: async (partial) => {
    const now = Date.now()
    const ann: AnnotationRecord = {
      id: partial.id ?? uid(),
      createdAt: now,
      updatedAt: now,
      ...partial,
    }
    await putAnnotation(ann)
    const annotations = [...get().annotations, ann]
    get().history.push({ type: 'add', annotations: [ann] })
    set({
      annotations,
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
      document: get().document
        ? { ...get().document!, hasUnsyncedChanges: true, syncStatus: get().document!.drive ? 'pending' : 'local' }
        : null,
    })
    return ann
  },

  updateAnnotation: async (id, patch) => {
    const prev = get().annotations.find((a) => a.id === id)
    if (!prev) return
    const next = { ...prev, ...patch, updatedAt: Date.now() }
    await putAnnotation(next)
    get().history.push({ type: 'update', annotations: [next], previous: [prev] })
    set({
      annotations: get().annotations.map((a) => (a.id === id ? next : a)),
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
    })
  },

  deleteAnnotation: async (id) => {
    const prev = get().annotations.find((a) => a.id === id)
    if (!prev) return
    await removeAnnotation(id, prev.documentId)
    get().history.push({ type: 'remove', annotations: [prev] })
    set({
      annotations: get().annotations.filter((a) => a.id !== id),
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
    })
  },

  undo: async () => {
    const entry = get().history.undo()
    if (!entry) return
    const { annotations, insertedPages } = applyUndo(
      entry,
      get().annotations,
      get().document?.insertedPages ?? [],
    )
    const docId = get().documentId
    if (!docId) return

    // Persist: replace all annotations for simplicity on undo
    const existingIds = get().annotations.map((a) => a.id)
    await removeAnnotations(existingIds, docId)
    if (annotations.length) await putAnnotations(annotations)

    const pageCount =
      (get().pdf?.pageCount ?? 0) - (get().document?.insertedPages.length ?? 0) + insertedPages.length
    // pdf.pageCount is from loaded bytes; for working count use document.pageCount logic
    const basePages =
      (get().document?.pageCount ?? 0) - (get().document?.insertedPages.length ?? 0)
    await updateInsertedPages(docId, insertedPages, basePages + insertedPages.length)

    set({
      annotations,
      document: get().document
        ? { ...get().document!, insertedPages, pageCount: basePages + insertedPages.length }
        : null,
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
    })
    void pageCount
  },

  redo: async () => {
    const entry = get().history.redo()
    if (!entry) return
    const { annotations, insertedPages } = applyRedo(
      entry,
      get().annotations,
      get().document?.insertedPages ?? [],
    )
    const docId = get().documentId
    if (!docId) return
    const existingIds = get().annotations.map((a) => a.id)
    await removeAnnotations(existingIds, docId)
    if (annotations.length) await putAnnotations(annotations)
    const basePages =
      (get().document?.pageCount ?? 0) - (get().document?.insertedPages.length ?? 0)
    await updateInsertedPages(docId, insertedPages, basePages + insertedPages.length)
    set({
      annotations,
      document: get().document
        ? { ...get().document!, insertedPages, pageCount: basePages + insertedPages.length }
        : null,
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
    })
  },

  insertBlankPage: async (afterPageIndex) => {
    const doc = get().document
    const docId = get().documentId
    if (!doc || !docId) return
    const index = afterPageIndex + 1
    const blank: InsertedPage = {
      id: uid(),
      index,
      width: 612,
      height: 792,
      createdAt: Date.now(),
    }
    // Shift later inserts
    const insertedPages = [
      ...doc.insertedPages.map((p) => (p.index >= index ? { ...p, index: p.index + 1 } : p)),
      blank,
    ].sort((a, b) => a.index - b.index)

    // Shift annotation page indices
    const shifted = get().annotations.map((a) =>
      a.pageIndex >= index ? { ...a, pageIndex: a.pageIndex + 1, updatedAt: Date.now() } : a,
    )
    const pageCount = doc.pageCount + 1
    await updateInsertedPages(docId, insertedPages, pageCount)
    await putAnnotations(shifted.filter((a, i) => a.pageIndex !== get().annotations[i]?.pageIndex || a !== get().annotations[i]))
    // Always persist all shifted
    await putAnnotations(shifted)

    get().history.push({
      type: 'batch',
      annotations: [],
      insertedPages: [blank],
      previousInsertedPages: doc.insertedPages,
      previous: get().annotations,
    })

    set({
      annotations: shifted,
      document: { ...doc, insertedPages, pageCount, hasUnsyncedChanges: true },
      canUndo: get().history.canUndo,
      canRedo: get().history.canRedo,
    })
    void useAppStore.getState().refreshLibrary()
  },

  deleteInsertedPage: async (pageId) => {
    const doc = get().document
    const docId = get().documentId
    if (!doc || !docId) return
    const target = doc.insertedPages.find((p) => p.id === pageId)
    if (!target) return
    const index = target.index
    const insertedPages = doc.insertedPages
      .filter((p) => p.id !== pageId)
      .map((p) => (p.index > index ? { ...p, index: p.index - 1 } : p))
    const removedAnns = get().annotations.filter((a) => a.pageIndex === index)
    const shifted = get().annotations
      .filter((a) => a.pageIndex !== index)
      .map((a) => (a.pageIndex > index ? { ...a, pageIndex: a.pageIndex - 1 } : a))
    await removeAnnotations(
      removedAnns.map((a) => a.id),
      docId,
    )
    await putAnnotations(shifted)
    await updateInsertedPages(docId, insertedPages, doc.pageCount - 1)
    get().history.push({
      type: 'batch',
      annotations: [],
      previous: removedAnns,
      previousInsertedPages: doc.insertedPages,
      insertedPages,
    })
    set({
      annotations: shifted,
      document: { ...doc, insertedPages, pageCount: doc.pageCount - 1 },
      canUndo: true,
      canRedo: get().history.canRedo,
    })
  },

  addBookmark: async (pageIndex, title) => {
    const docId = get().documentId
    if (!docId) return
    const bm: BookmarkRecord = {
      id: uid(),
      documentId: docId,
      pageIndex,
      title,
      createdAt: Date.now(),
    }
    await putBookmark(bm)
    set({ bookmarks: [...get().bookmarks, bm] })
  },

  deleteBookmark: async (id) => {
    await removeBookmark(id)
    set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) })
  },

  persistPosition: async (page, scrollRatio) => {
    const docId = get().documentId
    if (!docId) return
    const { zoom, zoomMode } = get()
    await saveReadingPosition(docId, { page, scrollRatio, zoom, zoomMode })
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults, searchIndex: 0 }),
  setSearchIndex: (searchIndex) => set({ searchIndex }),
  setSyncProgress: (syncProgress) => set({ syncProgress }),

  reloadMeta: async () => {
    const id = get().documentId
    if (!id) return
    const document = await getDocument(id)
    const annotations = await listAnnotations(id)
    const bookmarks = await listBookmarks(id)
    set({ document: document ?? null, annotations, bookmarks })
    void markDirty
  },
}))
