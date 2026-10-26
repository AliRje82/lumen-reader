import type { AnnotationRecord, HistoryEntry, InsertedPage } from '@/types'

const MAX_HISTORY = 80

export class AnnotationHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(entry)
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push(entry)
    return entry
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

export function applyUndo(
  entry: HistoryEntry,
  annotations: AnnotationRecord[],
  insertedPages: InsertedPage[],
): { annotations: AnnotationRecord[]; insertedPages: InsertedPage[] } {
  let next = [...annotations]
  let pages = [...insertedPages]

  if (entry.type === 'add') {
    const ids = new Set(entry.annotations.map((a) => a.id))
    next = next.filter((a) => !ids.has(a.id))
  } else if (entry.type === 'remove') {
    next = [...next, ...entry.annotations]
  } else if (entry.type === 'update' && entry.previous) {
    const map = new Map(entry.previous.map((a) => [a.id, a]))
    next = next.map((a) => map.get(a.id) ?? a)
  } else if (entry.type === 'batch') {
    if (entry.previous) {
      const ids = new Set(entry.annotations.map((a) => a.id))
      next = next.filter((a) => !ids.has(a.id))
      next = [...next, ...entry.previous]
    }
    if (entry.previousInsertedPages) {
      pages = [...entry.previousInsertedPages]
    }
  }

  if (entry.previousInsertedPages && entry.type !== 'batch') {
    pages = [...entry.previousInsertedPages]
  } else if (entry.insertedPages && entry.type === 'add') {
    const ids = new Set(entry.insertedPages.map((p) => p.id))
    pages = pages.filter((p) => !ids.has(p.id))
  }

  return { annotations: next, insertedPages: pages }
}

export function applyRedo(
  entry: HistoryEntry,
  annotations: AnnotationRecord[],
  insertedPages: InsertedPage[],
): { annotations: AnnotationRecord[]; insertedPages: InsertedPage[] } {
  let next = [...annotations]
  let pages = [...insertedPages]

  if (entry.type === 'add') {
    next = [...next, ...entry.annotations]
    if (entry.insertedPages) pages = [...pages, ...entry.insertedPages]
  } else if (entry.type === 'remove') {
    const ids = new Set(entry.annotations.map((a) => a.id))
    next = next.filter((a) => !ids.has(a.id))
  } else if (entry.type === 'update') {
    const map = new Map(entry.annotations.map((a) => [a.id, a]))
    next = next.map((a) => map.get(a.id) ?? a)
  } else if (entry.type === 'batch') {
    if (entry.previous) {
      const ids = new Set(entry.previous.map((a) => a.id))
      next = next.filter((a) => !ids.has(a.id))
    }
    next = [...next, ...entry.annotations]
    if (entry.insertedPages) pages = [...entry.insertedPages]
  }

  return { annotations: next, insertedPages: pages }
}
