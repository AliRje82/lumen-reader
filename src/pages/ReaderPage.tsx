import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReaderStore } from '@/store/reader'
import { useAppStore } from '@/store/app'
import { ReaderToolbar } from '@/components/toolbar/ReaderToolbar'
import { MobileAnnotateBar } from '@/components/toolbar/MobileAnnotateBar'
import { LeftSidebar } from '@/components/sidebar/LeftSidebar'
import { RightSidebar } from '@/components/sidebar/RightSidebar'
import { ReaderView } from '@/components/reader/ReaderView'
import './ReaderPage.css'

export function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const openDocument = useReaderStore((s) => s.openDocument)
  const closeDocument = useReaderStore((s) => s.closeDocument)
  const loading = useReaderStore((s) => s.loading)
  const error = useReaderStore((s) => s.error)
  const document = useReaderStore((s) => s.document)
  const leftOpen = useAppStore((s) => s.leftOpen)
  const rightOpen = useAppStore((s) => s.rightOpen)
  const distractionFree = useReaderStore((s) => s.distractionFree)

  useEffect(() => {
    if (!id) {
      navigate('/')
      return
    }
    void openDocument(id)
    return () => closeDocument()
  }, [id, openDocument, closeDocument, navigate])

  return (
    <div className={`reader-page ${distractionFree ? 'focus' : ''}`}>
      <ReaderToolbar />
      <div className="reader-body">
        {leftOpen && !distractionFree && <LeftSidebar />}
        <main className="reader-main">
          {loading && (
            <div className="empty-state">
              <div className="status-dot syncing" />
              <p>Opening document…</p>
            </div>
          )}
          {error && (
            <div className="empty-state">
              <h3>Couldn’t open PDF</h3>
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
                Back to library
              </button>
            </div>
          )}
          {!loading && !error && document && <ReaderView />}
        </main>
        {rightOpen && !distractionFree && <RightSidebar />}
      </div>
      {!distractionFree && <MobileAnnotateBar />}
    </div>
  )
}
