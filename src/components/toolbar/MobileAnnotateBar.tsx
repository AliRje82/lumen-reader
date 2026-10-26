import {
  Eraser,
  Highlighter,
  MousePointer2,
  PenTool,
  StickyNote,
  Upload,
} from 'lucide-react'
import { useReaderStore } from '@/store/reader'
import { useAppStore } from '@/store/app'
import { syncDocumentToDrive, buildExportBuffer } from '@/drive/sync'
import type { ToolMode } from '@/types'
import './MobileAnnotateBar.css'

export function MobileAnnotateBar() {
  const tool = useReaderStore((s) => s.tool)
  const setTool = useReaderStore((s) => s.setTool)
  const document = useReaderStore((s) => s.document)
  const setSyncProgress = useReaderStore((s) => s.setSyncProgress)
  const reloadMeta = useReaderStore((s) => s.reloadMeta)
  const showToast = useAppStore((s) => s.showToast)
  const auth = useAppStore((s) => s.auth)

  const tools: Array<{ id: ToolMode; icon: typeof PenTool; label: string }> = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'highlight', icon: Highlighter, label: 'Highlight' },
    { id: 'pen', icon: PenTool, label: 'Pen' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'note', icon: StickyNote, label: 'Note' },
  ]

  const sync = async () => {
    if (!document) return
    if (!document.drive?.fileId) {
      const buf = await buildExportBuffer(document.id)
      const blob = new Blob([buf], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document.name.replace(/\.pdf$/i, '') + '-annotated.pdf'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Exported PDF', 'success')
      return
    }
    if (!auth) {
      showToast('Connect Google Drive first', 'info')
      return
    }
    setSyncProgress(0)
    const result = await syncDocumentToDrive(document.id, (r) => setSyncProgress(r))
    setSyncProgress(null)
    await reloadMeta()
    showToast(result.ok ? 'Synced' : result.error ?? 'Sync failed', result.ok ? 'success' : 'error')
  }

  return (
    <nav className="mobile-annotate-bar" aria-label="Annotation tools">
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          className={`mab-btn ${tool === id ? 'active' : ''}`}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => setTool(id)}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" className="mab-btn sync" aria-label="Sync or export" onClick={() => void sync()}>
        <Upload size={20} />
        <span>{document?.drive ? 'Sync' : 'Save'}</span>
      </button>
    </nav>
  )
}
