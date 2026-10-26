import { useMemo, useState } from 'react'
import { StickyNote, Highlighter, Trash2, AlertTriangle } from 'lucide-react'
import { useReaderStore } from '@/store/reader'
import { useAppStore } from '@/store/app'
import { resolveConflict, type ConflictChoice } from '@/drive/sync'
import { HIGHLIGHT_COLORS, type HighlightColor } from '@/types'
import './Sidebar.css'

export function RightSidebar() {
  const annotations = useReaderStore((s) => s.annotations)
  const document = useReaderStore((s) => s.document)
  const deleteAnnotation = useReaderStore((s) => s.deleteAnnotation)
  const updateAnnotation = useReaderStore((s) => s.updateAnnotation)
  const reloadMeta = useReaderStore((s) => s.reloadMeta)
  const openDocument = useReaderStore((s) => s.openDocument)
  const showToast = useAppStore((s) => s.showToast)

  type AnnotationFilter = 'highlight' | 'note' | 'ink' | 'region'
  const [filter, setFilter] = useState<'all' | AnnotationFilter>('all')
  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')

  const filtered = useMemo(() => {
    return annotations.filter((a) => {
      if (filter !== 'all' && a.kind !== filter && !(filter === 'highlight' && (a.kind === 'underline' || a.kind === 'strikethrough'))) {
        return false
      }
      if (colorFilter !== 'all' && a.color !== colorFilter) return false
      return true
    })
  }, [annotations, filter, colorFilter])

  const goTo = (pageIndex: number) => {
    const pageEl = window.document.querySelector(`[data-page-index="${pageIndex}"]`)
    pageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const resolve = async (choice: ConflictChoice) => {
    if (!document) return
    const result = await resolveConflict(document.id, choice)
    await reloadMeta()
    if (result.ok) {
      showToast('Conflict resolved', 'success')
      await openDocument(document.id)
    } else {
      showToast(result.error ?? 'Resolve failed', 'error')
    }
  }

  return (
    <aside className="sidebar right panel panel-right scrollable" aria-label="Annotations">
      <div className="sidebar-header">
        <h2>Notes & marks</h2>
        <div className="filter-row">
          {(['all', 'highlight', 'note', 'ink', 'region'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="color-row" style={{ padding: '4px 0' }}>
          <button
            type="button"
            className={`filter-chip ${colorFilter === 'all' ? 'active' : ''}`}
            onClick={() => setColorFilter('all')}
          >
            All colors
          </button>
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`color-dot ${colorFilter === c ? 'active' : ''}`}
              style={{ background: HIGHLIGHT_COLORS[c] }}
              aria-label={c}
              onClick={() => setColorFilter(c)}
            />
          ))}
        </div>
      </div>

      {document?.syncStatus === 'conflict' && (
        <div className="conflict-box">
          <AlertTriangle size={16} />
          <div>
            <strong>Sync conflict</strong>
            <p>Local and Drive copies both changed.</p>
            <div className="conflict-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void resolve('keep-local')}>
                Keep local
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void resolve('keep-remote')}>
                Use Drive
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void resolve('save-copy')}>
                Save copy
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Highlighter size={28} strokeWidth={1.5} />
          <h3>No annotations yet</h3>
          <p>Select text to highlight, or use the pen to write.</p>
        </div>
      ) : (
        <ul className="ann-list">
          {filtered.map((a) => (
            <li key={a.id} className="ann-item">
              <button type="button" className="ann-main" onClick={() => goTo(a.pageIndex)}>
                <span
                  className="ann-swatch"
                  style={{
                    background:
                      (HIGHLIGHT_COLORS as Record<string, string>)[a.color] ?? a.color,
                  }}
                />
                <span className="ann-body">
                  <span className="ann-kind">
                    {a.kind === 'note' ? <StickyNote size={12} /> : <Highlighter size={12} />}
                    {a.kind} · p.{a.pageIndex + 1}
                  </span>
                  {a.text && <span className="ann-text">{a.text}</span>}
                  {a.note && <span className="ann-note">{a.note}</span>}
                </span>
              </button>
              <div className="ann-actions">
                <button
                  type="button"
                  className="btn btn-icon sm"
                  aria-label="Edit note"
                  onClick={() => {
                    setEditingId(a.id)
                    setEditNote(a.note ?? '')
                  }}
                >
                  <StickyNote size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon sm"
                  aria-label="Delete"
                  onClick={() => void deleteAnnotation(a.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {editingId === a.id && (
                <div className="ann-edit">
                  <textarea
                    className="textarea"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                  />
                  <div className="note-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void updateAnnotation(a.id, { note: editNote })
                        setEditingId(null)
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
