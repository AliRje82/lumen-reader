import { FileText, Search, Cloud } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/app'
import { useReaderStore } from '@/store/reader'
import './Sidebar.css'

export function LeftSidebar() {
  const documents = useAppStore((s) => s.documents)
  const libraryQuery = useAppStore((s) => s.libraryQuery)
  const setLibraryQuery = useAppStore((s) => s.setLibraryQuery)
  const documentId = useReaderStore((s) => s.documentId)
  const bookmarks = useReaderStore((s) => s.bookmarks)
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage)
  const navigate = useNavigate()

  return (
    <aside className="sidebar left panel scrollable" aria-label="Library">
      <div className="sidebar-header">
        <h2>Library</h2>
        <div className="sidebar-search">
          <Search size={14} />
          <input
            className="input"
            placeholder="Search documents"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            aria-label="Search library"
          />
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Recent</h3>
        <ul className="doc-list">
          {documents.slice(0, 20).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={`doc-item ${d.id === documentId ? 'active' : ''}`}
                onClick={() => navigate(`/read/${d.id}`)}
              >
                <FileText size={16} />
                <span className="doc-item-text">
                  <span className="name">{d.name}</span>
                  <span className="meta">
                    {d.pageCount} pages
                    {d.drive ? (
                      <>
                        {' · '}
                        <Cloud size={10} /> Drive
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {documents.length === 0 && (
            <li className="empty-inline">No documents yet</li>
          )}
        </ul>
      </div>

      {bookmarks.length > 0 && (
        <div className="sidebar-section">
          <h3>Bookmarks</h3>
          <ul className="doc-list">
            {bookmarks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="doc-item"
                  onClick={() => {
                    setCurrentPage(b.pageIndex)
                    const el = window.document.querySelector('.reader-scroller')
                    if (el) {
                      const pageEl = window.document.querySelector(
                        `[data-page-index="${b.pageIndex}"]`,
                      )
                      pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                >
                  <span className="doc-item-text">
                    <span className="name">{b.title}</span>
                    <span className="meta">Page {b.pageIndex + 1}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
