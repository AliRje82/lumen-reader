# Lumen Reader

A premium Progressive Web App for reading, highlighting, annotating, handwriting on, and organizing PDFs — with optional Google Drive sync and **no custom backend**.

## Features

- Fast PDF reading (PDF.js) with continuous scroll, zoom, fit-width, search, and keyboard shortcuts
- One-tap text highlighting with a contextual selection toolbar and multi-color palette
- Underline, strikethrough, sticky notes, region highlights (for scanned pages)
- Pen / ink highlighter / eraser with pointer + pressure support
- Insert blank study pages and write on them
- Local-first IndexedDB storage; works offline after a document is loaded
- Export annotated PDFs via `pdf-lib` (appearance preserved)
- Google Drive: connect → pick PDF → edit → sync back to the **same** file ID
- Conflict detection and safe resolution (keep local / use Drive / save copy)
- Installable PWA with offline app shell

## Quick start

```bash
pnpm install
cp .env.example .env   # optional — Drive needs Google credentials
pnpm dev
```

Open http://localhost:5173 and use **Open PDF**. Drive is optional.

### Google Drive

See [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) for Cloud Console steps. Required env vars:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_API_KEY` (Picker)
- `VITE_GOOGLE_APP_ID` (optional project number)

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Typecheck + production build |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run Vitest suite |
| `pnpm typecheck` | TypeScript project build |
| `pnpm lint` | Oxlint |

## Architecture

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for storage, annotation/export design, and Drive sync.

## Limitations

- **OAuth**: Must configure a Google Cloud Web client ID; without it, local mode still works.
- **`drive.file` scope**: Only files opened via Picker (or created by the app) are accessible — not full Drive browse.
- **Export**: Annotations are burned into page content for fidelity; native PDF annotation objects are not fully round-tripped.
- **OCR**: Not included; use the region tool on scanned pages.
- **iOS PWA**: Background sync and persistent storage are limited; sync when the app is open.
- **Concurrent editing**: Last-writer conflict UI protects data but does not merge page-level edits.
- **Large PDFs**: Pages are virtualized, but very large files are still constrained by browser IndexedDB quotas.

## License

MIT
