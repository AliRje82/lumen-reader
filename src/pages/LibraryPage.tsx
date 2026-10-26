import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cloud,
  FileUp,
  FolderOpen,
  Moon,
  Search,
  Sun,
  Trash2,
  BookOpen,
  LogOut,
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { useThemeStore } from '@/store/theme'
import { importLocalPdf } from '@/storage/documents'
import { loadPdf } from '@/pdf/engine'
import { openDrivePicker } from '@/drive/picker'
import { openDrivePdf } from '@/drive/sync'
import { isGoogleConfigured } from '@/drive/auth'
import './LibraryPage.css'

export function LibraryPage() {
  const navigate = useNavigate()
  const documents = useAppStore((s) => s.documents)
  const libraryQuery = useAppStore((s) => s.libraryQuery)
  const setLibraryQuery = useAppStore((s) => s.setLibraryQuery)
  const refreshLibrary = useAppStore((s) => s.refreshLibrary)
  const removeDocument = useAppStore((s) => s.removeDocument)
  const connectDrive = useAppStore((s) => s.connectDrive)
  const disconnectDrive = useAppStore((s) => s.disconnectDrive)
  const auth = useAppStore((s) => s.auth)
  const googleConfigured = useAppStore((s) => s.googleConfigured)
  const online = useAppStore((s) => s.online)
  const showToast = useAppStore((s) => s.showToast)
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const importFile = async (file: File) => {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const loaded = await loadPdf(buf)
      const doc = await importLocalPdf(new Blob([buf]), file.name, loaded.pageCount)
      await refreshLibrary()
      navigate(`/read/${doc.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open PDF', 'error')
    } finally {
      setBusy(false)
    }
  }

  const openFromDrive = async () => {
    if (!auth) {
      await connectDrive()
    }
    setBusy(true)
    try {
      const picked = await openDrivePicker()
      if (!picked) return
      const doc = await openDrivePdf(picked.id, picked.name, picked.mimeType)
      await refreshLibrary()
      navigate(`/read/${doc.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Drive open failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="library-page">
      <header className="library-hero">
        <div className="library-hero-inner">
          <div className="brand-row">
            <BookOpen className="brand-mark" size={36} strokeWidth={1.5} />
            <div>
              <p className="brand-eyebrow">Local-first · Drive sync</p>
              <h1 className="brand-name">Lumen</h1>
            </div>
            <div className="hero-actions">
              <span className={`status-dot ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline'} />
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => void setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark')}
                aria-label="Toggle theme"
              >
                {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
          <p className="hero-tagline">
            Highlight, annotate, and write on PDFs — then sync the same file back to Google Drive.
          </p>
          <div className="hero-cta">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp size={16} />
              Open PDF
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !googleConfigured}
              onClick={() => void openFromDrive()}
              title={!googleConfigured ? 'Configure VITE_GOOGLE_CLIENT_ID first' : undefined}
            >
              <FolderOpen size={16} />
              From Drive
            </button>
            {auth ? (
              <button type="button" className="btn btn-ghost" onClick={() => void disconnectDrive()}>
                <LogOut size={16} />
                {auth.email ?? 'Disconnect'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!googleConfigured}
                onClick={() => void connectDrive()}
              >
                <Cloud size={16} />
                Connect Drive
              </button>
            )}
          </div>
          {!isGoogleConfigured() && (
            <p className="setup-hint">
              Google Drive is optional. Add <code>VITE_GOOGLE_CLIENT_ID</code> (and API key for Picker) —
              see <code>docs/GOOGLE_SETUP.md</code>. Local reading works without it.
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <section className="library-body">
        <div className="library-toolbar">
          <h2>Your documents</h2>
          <div className="library-search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search library & notes…"
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
            />
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="empty-state library-empty">
            <BookOpen size={40} strokeWidth={1.25} />
            <h3>Nothing here yet</h3>
            <p>Open a local PDF to start highlighting. Drive sync is available once configured.</p>
          </div>
        ) : (
          <ul className="library-grid">
            {documents.map((d) => (
              <li key={d.id}>
                <article className="doc-card">
                  <button type="button" className="doc-card-main" onClick={() => navigate(`/read/${d.id}`)}>
                    <div className="doc-thumb" aria-hidden>
                      <FileUp size={22} />
                    </div>
                    <div className="doc-info">
                      <h3>{d.name}</h3>
                      <p>
                        {d.pageCount} pages · {formatDate(d.lastOpenedAt)}
                        {d.drive ? ' · Drive' : ' · Local'}
                        {d.hasUnsyncedChanges ? ' · Unsynced' : ''}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon sm danger-hover"
                    aria-label={`Delete ${d.name}`}
                    onClick={() => {
                      if (d.hasUnsyncedChanges && !confirm('This document has unsynced changes. Delete anyway?')) {
                        return
                      }
                      void removeDocument(d.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
