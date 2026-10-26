import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Minimal crypto.subtle for Node/jsdom environments that lack it in some builds
if (!globalThis.crypto?.subtle) {
  // vitest/jsdom usually has webcrypto; leave as-is if present
}
