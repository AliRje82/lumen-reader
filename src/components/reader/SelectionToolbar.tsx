import { Highlighter, Underline, Strikethrough, StickyNote, X } from 'lucide-react'
import type { HighlightColor } from '@/types'
import { HIGHLIGHT_COLORS } from '@/types'
import './SelectionToolbar.css'

interface SelectionToolbarProps {
  x: number
  y: number
  color: HighlightColor
  onHighlight: () => void
  onUnderline: () => void
  onStrike: () => void
  onNote: () => void
  onColor: (c: HighlightColor) => void
  onClose: () => void
}

const COLORS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]

export function SelectionToolbar({
  x,
  y,
  color,
  onHighlight,
  onUnderline,
  onStrike,
  onNote,
  onColor,
  onClose,
}: SelectionToolbarProps) {
  return (
    <div
      className="selection-toolbar"
      style={{ left: x, top: y }}
      role="toolbar"
      aria-label="Text annotation"
    >
      <button type="button" className="st-primary" onClick={onHighlight} title="Highlight (H)">
        <Highlighter size={16} />
        Highlight
      </button>
      <button type="button" className="st-btn" onClick={onUnderline} title="Underline">
        <Underline size={16} />
      </button>
      <button type="button" className="st-btn" onClick={onStrike} title="Strikethrough">
        <Strikethrough size={16} />
      </button>
      <button type="button" className="st-btn" onClick={onNote} title="Add note">
        <StickyNote size={16} />
      </button>
      <div className="st-colors" role="group" aria-label="Highlight color">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`st-swatch ${c === color ? 'active' : ''}`}
            style={{ background: HIGHLIGHT_COLORS[c] }}
            aria-label={c}
            aria-pressed={c === color}
            onClick={() => onColor(c)}
          />
        ))}
      </div>
      <button type="button" className="st-btn" onClick={onClose} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  )
}
