import { useAppStore } from '@/store/app'
import './Toast.css'

export function Toast() {
  const toast = useAppStore((s) => s.toast)
  const clearToast = useAppStore((s) => s.clearToast)
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
      <span>{toast.message}</span>
      <button type="button" className="toast-close" onClick={clearToast} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
