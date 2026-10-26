import type { NormRect, TextQuad } from '@/types'

/** Convert DOMClientRect relative to a page element into normalized coords. */
export function clientRectsToNorm(
  rects: DOMRectList | DOMRect[],
  pageEl: HTMLElement,
): NormRect[] {
  const pageBox = pageEl.getBoundingClientRect()
  const pw = pageBox.width || 1
  const ph = pageBox.height || 1
  const list = Array.from(rects)
  return list
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: (r.left - pageBox.left) / pw,
      y: (r.top - pageBox.top) / ph,
      w: r.width / pw,
      h: r.height / ph,
    }))
}

export function buildQuadFromSelection(pageEl: HTMLElement): TextQuad | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  if (!pageEl.contains(range.commonAncestorContainer)) return null

  const rects = range.getClientRects()
  const norm = clientRectsToNorm(rects, pageEl)
  if (norm.length === 0) return null

  return { rects: mergeCloseRects(norm) }
}

/** Merge nearly-adjacent rects on the same line to reduce fragment count. */
export function mergeCloseRects(rects: NormRect[], yTol = 0.004, xGap = 0.01): NormRect[] {
  if (rects.length <= 1) return rects
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: NormRect[] = []
  let cur = { ...sorted[0]! }

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!
    const sameLine = Math.abs(r.y - cur.y) < yTol && Math.abs(r.h - cur.h) < yTol * 2
    const adjacent = r.x <= cur.x + cur.w + xGap
    if (sameLine && adjacent) {
      const right = Math.max(cur.x + cur.w, r.x + r.w)
      const bottom = Math.max(cur.y + cur.h, r.y + r.h)
      cur = {
        x: Math.min(cur.x, r.x),
        y: Math.min(cur.y, r.y),
        w: right - Math.min(cur.x, r.x),
        h: bottom - Math.min(cur.y, r.y),
      }
    } else {
      out.push(cur)
      cur = { ...r }
    }
  }
  out.push(cur)
  return out
}

export function pointInRect(x: number, y: number, r: NormRect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function hitTestAnnotation(
  x: number,
  y: number,
  quads?: TextQuad,
  region?: NormRect,
  strokePoints?: Array<{ x: number; y: number }>,
  strokeHitRadius = 0.015,
): boolean {
  if (region && pointInRect(x, y, region)) return true
  if (quads) {
    for (const r of quads.rects) {
      if (pointInRect(x, y, r)) return true
    }
  }
  if (strokePoints) {
    for (const p of strokePoints) {
      const dx = p.x - x
      const dy = p.y - y
      if (dx * dx + dy * dy < strokeHitRadius * strokeHitRadius) return true
    }
  }
  return false
}

/** Smooth stroke points with a simple moving average. */
export function smoothStroke<T extends { x: number; y: number }>(points: T[], window = 3): T[] {
  if (points.length < 3 || window < 2) return points
  const out: T[] = []
  const half = Math.floor(window / 2)
  for (let i = 0; i < points.length; i++) {
    let sx = 0
    let sy = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      sx += points[j]!.x
      sy += points[j]!.y
      n++
    }
    out.push({ ...points[i]!, x: sx / n, y: sy / n })
  }
  return out
}
