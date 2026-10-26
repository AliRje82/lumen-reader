# Lumen Reader — project context

Premium local-first PDF reader PWA: highlight, note, handwriting, blank pages, and Google Drive sync — no custom backend.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript + Vite 8 |
| State | Zustand |
| PDF render | Mozilla PDF.js (`pdfjs-dist`) |
| PDF write | `pdf-lib` |
| Storage | IndexedDB via Dexie |
| Icons | lucide-react |
| PWA | vite-plugin-pwa + Workbox |
| Drive | GIS token client + Drive REST + Google Picker |
| Tests | Vitest + Testing Library + fake-indexeddb |

Package manager: **pnpm** (npm had peer-resolution issues in this environment).

## Architecture

```
src/
  annotations/   geometry, undo/redo history
  components/    reader, toolbar, sidebar, toast
  drive/         auth, api, picker, sync + conflicts
  pages/         LibraryPage, ReaderPage
  pdf/           engine (PDF.js), export (pdf-lib)
  storage/       Dexie schema + document helpers
  store/         app, reader, theme
  styles/        design tokens + global CSS
  types/         shared domain types
```

### Storage model

IndexedDB database `lumen-reader`:

- `documents` — metadata, reading position, Drive meta, inserted pages, sync flags
- `blobs` — `original` PDF bytes + optional `exported` annotated PDF
- `annotations` — highlights, notes, ink strokes, regions (normalized geometry)
- `bookmarks`, `folders`, `pendingUploads`, `meta` (auth session, settings, theme)

Edits always land in IndexedDB first. Sync uploads an **exported** PDF built from the original + editable annotation state.

### Annotation design

- Text markup uses **normalized page rectangles** (0–1, top-left origin) from selection client rects — not string matching alone.
- Ink strokes store smoothed pointer points with pressure when available.
- Scanned PDFs: use **region** tool (no paid OCR).
- Undo/redo via in-memory history mirrored to IndexedDB on each change.

### PDF export strategy

`exportAnnotatedPdf`:

1. Load original PDF with pdf-lib.
2. Insert blank pages at recorded working indices.
3. Draw highlights / underlines / strikethroughs / ink / note markers as page content.
4. Editable metadata remains in IndexedDB; export is the shareable/sync artifact.

Limitations: native PDF annotation dictionaries are not round-tripped as editable XFDF; appearance is preserved by burning into page content. Re-opening in Lumen uses IndexedDB state when available; opening only the exported file elsewhere shows the burned-in marks.

### Google Drive sync

- Scope: `drive.file` (+ openid/email/profile).
- Open via Picker → download → store file ID.
- Sync: conflict check (revision / md5 / modifiedTime) → export → resumable/media upload to **same file ID**.
- Conflicts: keep local, use remote, or save as new Drive copy.
- Pending uploads survive reload; flushed on online / visibility.

### Development commands

```bash
pnpm install
cp .env.example .env   # optional Drive
pnpm dev               # http://localhost:5173
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

## Design system

- Display: Fraunces · UI: Source Sans 3 · Mono: JetBrains Mono
- Brand green `#2d6a4f` / dark `#52b788`
- Tokens in `src/styles/tokens.css` (light / dark / system)
- Desktop: left library · center canvas · right notes
- Mobile: compact top bar + bottom annotation bar
