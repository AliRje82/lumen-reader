import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAppStore } from '@/store/app'
import { useThemeStore } from '@/store/theme'
import { LibraryPage } from '@/pages/LibraryPage'
import { ReaderPage } from '@/pages/ReaderPage'
import { Toast } from '@/components/Toast'

export default function App() {
  const initApp = useAppStore((s) => s.init)
  const ready = useAppStore((s) => s.ready)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    void initTheme()
    void initApp()
  }, [initApp, initTheme])

  if (!ready) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div className="status-dot syncing" />
        <p>Starting Lumen…</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  )
}
