import { describe, it, expect } from 'vitest'
import { AnnotationHistory, applyUndo, applyRedo } from './history'
import type { AnnotationRecord } from '@/types'

const ann = (id: string): AnnotationRecord => ({
  id,
  documentId: 'd',
  pageIndex: 0,
  kind: 'highlight',
  color: 'yellow',
  createdAt: 1,
  updatedAt: 1,
  text: id,
})

describe('AnnotationHistory', () => {
  it('undoes and redoes adds', () => {
    const h = new AnnotationHistory()
    const a = ann('1')
    h.push({ type: 'add', annotations: [a] })
    expect(h.canUndo).toBe(true)
    const entry = h.undo()!
    const afterUndo = applyUndo(entry, [a], [])
    expect(afterUndo.annotations).toHaveLength(0)
    const redoEntry = h.redo()!
    const afterRedo = applyRedo(redoEntry, [], [])
    expect(afterRedo.annotations).toHaveLength(1)
  })
})
