import { describe, it, expect } from 'vitest'
import { mergeCloseRects, pointInRect, smoothStroke, hitTestAnnotation } from './geometry'

describe('geometry helpers', () => {
  it('merges adjacent same-line rects', () => {
    const merged = mergeCloseRects([
      { x: 0.1, y: 0.2, w: 0.1, h: 0.02 },
      { x: 0.2, y: 0.2, w: 0.1, h: 0.02 },
      { x: 0.1, y: 0.3, w: 0.2, h: 0.02 },
    ])
    expect(merged.length).toBe(2)
    expect(merged[0]!.w).toBeGreaterThan(0.19)
  })

  it('hit-tests quads and strokes', () => {
    expect(pointInRect(0.15, 0.15, { x: 0.1, y: 0.1, w: 0.1, h: 0.1 })).toBe(true)
    expect(
      hitTestAnnotation(0.12, 0.12, { rects: [{ x: 0.1, y: 0.1, w: 0.05, h: 0.05 }] }),
    ).toBe(true)
    expect(
      hitTestAnnotation(0.5, 0.5, undefined, undefined, [{ x: 0.5, y: 0.5 }]),
    ).toBe(true)
  })

  it('smooths stroke points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 0 },
    ]
    const smoothed = smoothStroke(pts, 3)
    expect(smoothed).toHaveLength(3)
    expect(smoothed[1]!.y).toBeLessThan(10)
  })
})
