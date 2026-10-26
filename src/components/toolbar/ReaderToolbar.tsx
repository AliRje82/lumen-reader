import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Eraser,
  FilePlus2,
  Highlighter,
  Maximize,
  Moon,
  MousePointer2,
  PenTool,
  Redo2,
  Search,
  Square,
  StickyNote,
  Strikethrough,
  Sun,
  Underline,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
  PanelLeft,
  PanelRight,
  Focus,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useReaderStore } from '@/store/reader'
import { useAppStore } from '@/store/app'
import { useThemeStore } from '@/store/theme'
import { syncDocumentToDrive, buildExportBuffer } from '@/drive/sync'
import { HIGHLIGHT_COLORS, type HighlightColor, type ToolMode } from '@/types'
import './ReaderToolbar.css'

export function ReaderToolbar() {
  const navigate = useNavigate()
  const document = useReaderStore((s) => s.document)
  const tool = useReaderStore((s) => s.tool)
  const setTool = useReaderStore((s) => s.setTool)
  const highlightColor = useReaderStore((s) => s.highlightColor)
  const setHighlightColor = useReaderStore((s) => s.setHighlightColor)
  const zoom = useReaderStore((s) => s.zoom)
  const setZoom = useReaderStore((s) => s.setZoom)
  const currentPage = useReaderStore((s) => s.currentPage)
  const canUndo = useReaderStore((s) => s.canUndo)
  const canRedo = useReaderStore((s) => s.canRedo)
  const undo = useReaderStore((s) => s.undo)
  const redo = useReaderStore((s) => s.redo)
  const insertBlankPage = useReaderStore((s) => s.insertBlankPage)
  const addBookmark = useReaderStore((s) => s.addBookmark)
  const distractionFree = useReaderStore((s) => s.distractionFree)
  const setDistractionFree = useReaderStore((s) => s.setDistractionFree)
  const searchQuery = useReaderStore((s) => s.searchQuery)
  const setSearchQuery = useReaderStore((s) => s.setSearchQuery)
  const searchResults = useReaderStore((s) => s.searchResults)
  const searchIndex = useReaderStore((s) => s.searchIndex)
  const setSearchIndex = useReaderStore((s) => s.setSearchIndex)
  const syncProgress = useReaderStore((s) => s.syncProgress)
  const setSyncProgress = useReaderStore((s) => s.setSyncProgress)
  const reloadMeta = useReaderStore((s) => s.reloadMeta)
  const pageCount = document?.pageCount ?? 0

  const leftOpen = useAppStore((s) => s.leftOpen)
  const rightOpen = useAppStore((s) => s.rightOpen)
  const setLeftOpen = useAppStore((s) => s.setLeftOpen)
  const setRightOpen = useAppStore((s) => s.setRightOpen)
  const showToast = useAppStore((s) => s.showToast)
  const online = useAppStore((s) => s.online)
  const auth = useAppStore((s) => s.auth)

  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  if (distractionFree) {
    return (
      <div className="reader-toolbar minimal">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setDistractionFree(false)}
          aria-label="Exit focus mode"
        >
          <Focus size={18} />
        </button>
        <span className="page-indicator">
          {currentPage + 1} / {pageCount}
        </span>
      </div>
    )
  }

  const tools: Array<{ id: ToolMode; icon: typeof PenTool; label: string }> = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'highlight', icon: Highlighter, label: 'Highlight' },
    { id: 'underline', icon: Underline, label: 'Underline' },
    { id: 'strikethrough', icon: Strikethrough, label: 'Strike' },
    { id: 'note', icon: StickyNote, label: 'Note' },
    { id: 'pen', icon: PenTool, label: 'Pen' },
    { id: 'highlighter-pen', icon: Highlighter, label: 'Ink highlight' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'region', icon: Square, label: 'Region' },
  ]

  const sync = async () => {
    if (!document) return
    if (!document.drive?.fileId) {
      // Local export download
      try {
        const buf = await buildExportBuffer(document.id)
        const blob = new Blob([buf], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = window.document.createElement('a')
        a.href = url
        a.download = document.name.replace(/\.pdf$/i, '') + '-annotated.pdf'
        a.click()
        URL.revokeObjectURL(url)
        showToast('Exported annotated PDF', 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Export failed', 'error')
      }
      return
    }
    if (!auth) {
      showToast('Connect Google Drive to sync', 'info')
      return
    }
    setSyncProgress(0)
    const result = await syncDocumentToDrive(document.id, (r) => setSyncProgress(r))
    setSyncProgress(null)
    await reloadMeta()
    if (result.conflict) {
      showToast('Conflict detected — resolve in the panel', 'error')
      useAppStore.getState().setRightOpen(true)
    } else if (result.ok) {
      showToast('Synced to Google Drive', 'success')
    } else {
      showToast(result.error ?? 'Sync failed', 'error')
    }
  }

  return (
    <header className="reader-toolbar">
      <div className="tb-left">
        <button type="button" className="btn btn-icon" onClick={() => navigate('/')} aria-label="Library">
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setLeftOpen(!leftOpen)}
          aria-label="Toggle library panel"
        >
          <PanelLeft size={18} />
        </button>
        <div className="doc-title-block">
          <h1 className="doc-title" title={document?.name}>
            {document?.name ?? 'Document'}
          </h1>
          <SyncBadge
            status={document?.syncStatus}
            online={online}
            progress={syncProgress}
            dirty={document?.hasUnsyncedChanges}
          />
        </div>
      </div>

      <div className="tb-center" role="toolbar" aria-label="Annotation tools">
        {tools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            className={`btn btn-icon sm ${tool === id ? 'active' : ''}`}
            aria-label={label}
            aria-pressed={tool === id}
            title={label}
            onClick={() => setTool(id)}
          >
            <Icon size={16} />
          </button>
        ))}
        <div className="color-row">
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`color-dot ${highlightColor === c ? 'active' : ''}`}
              style={{ background: HIGHLIGHT_COLORS[c] }}
              aria-label={c}
              onClick={() => void setHighlightColor(c)}
            />
          ))}
        </div>
        <button type="button" className="btn btn-icon sm" disabled={!canUndo} onClick={() => void undo()} aria-label="Undo">
          <Undo2 size={16} />
        </button>
        <button type="button" className="btn btn-icon sm" disabled={!canRedo} onClick={() => void redo()} aria-label="Redo">
          <Redo2 size={16} />
        </button>
      </div>

      <div className="tb-right">
        <div className="search-box">
          <Search size={14} />
          <input
            className="input search-input"
            placeholder="Find in document"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search in PDF"
          />
          {searchResults.length > 0 && (
            <span className="search-count">
              {searchIndex + 1}/{searchResults.length}
              <button
                type="button"
                className="btn btn-icon sm"
                aria-label="Previous match"
                onClick={() => setSearchIndex((searchIndex - 1 + searchResults.length) % searchResults.length)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="btn btn-icon sm"
                aria-label="Next match"
                onClick={() => setSearchIndex((searchIndex + 1) % searchResults.length)}
              >
                <ChevronRight size={14} />
              </button>
            </span>
          )}
        </div>

        <div className="page-nav">
          <button
            type="button"
            className="btn btn-icon sm"
            aria-label="Previous page"
            onClick={() => {
              const el = window.document.querySelector('.reader-scroller')
              if (el) el.scrollBy({ top: -400, behavior: 'smooth' })
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="page-indicator">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-icon sm"
            aria-label="Next page"
            onClick={() => {
              const el = window.document.querySelector('.reader-scroller')
              if (el) el.scrollBy({ top: 400, behavior: 'smooth' })
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button type="button" className="btn btn-icon sm" onClick={() => setZoom(Math.max(0.4, zoom - 0.1))} aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button type="button" className="btn btn-icon sm" onClick={() => setZoom(1, 'fit-width')} aria-label="Fit width" title="Fit width">
          <Maximize size={16} />
        </button>
        <button type="button" className="btn btn-icon sm" onClick={() => setZoom(Math.min(3, zoom + 0.1))} aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>

        <button
          type="button"
          className="btn btn-icon sm"
          onClick={() => void insertBlankPage(currentPage)}
          aria-label="Insert blank page"
          title="Insert blank page after current"
        >
          <FilePlus2 size={16} />
        </button>
        <button
          type="button"
          className="btn btn-icon sm"
          onClick={() => void addBookmark(currentPage, `Page ${currentPage + 1}`)}
          aria-label="Bookmark page"
        >
          <Bookmark size={16} />
        </button>
        <button type="button" className="btn btn-icon sm" onClick={() => setDistractionFree(true)} aria-label="Focus mode">
          <Focus size={16} />
        </button>
        <button
          type="button"
          className="btn btn-icon sm"
          onClick={() => void setMode(mode === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button type="button" className="btn btn-primary sync-btn" onClick={() => void sync()}>
          <Upload size={14} />
          {document?.drive ? 'Sync' : 'Export'}
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setRightOpen(!rightOpen)}
          aria-label="Toggle notes panel"
        >
          <PanelRight size={18} />
        </button>
      </div>
    </header>
  )
}

function SyncBadge({
  status,
  online,
  progress,
  dirty,
}: {
  status?: string
  online: boolean
  progress: number | null
  dirty?: boolean
}) {
  if (progress != null) {
    return (
      <span className="badge pending">
        <Cloud size={12} /> Uploading {Math.round(progress * 100)}%
      </span>
    )
  }
  if (!online) {
    return (
      <span className="badge">
        <CloudOff size={12} /> Offline
      </span>
    )
  }
  if (status === 'conflict') return <span className="badge conflict">Conflict</span>
  if (status === 'pending' || dirty) return <span className="badge pending">Unsynced</span>
  if (status === 'synced') return <span className="badge synced">Synced</span>
  if (status === 'error') return <span className="badge conflict">Sync error</span>
  return <span className="badge">Local</span>
}
