# Remaining limitations

## Google Drive / OAuth

- Requires `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` (for Picker). Without them, local mode works fully.
- Uses `drive.file` scope: only files opened via Picker or created by the app are accessible.
- Access tokens are stored in IndexedDB; expiry triggers interactive re-auth.
- Real OAuth/Picker flows must be verified manually with your Cloud project; automated tests mock Drive API.

## PDF annotations & export

- Editable state lives in IndexedDB. Export burns marks into page content for visual fidelity.
- Native PDF annotation dictionaries / XFDF round-trip is not implemented.
- Opening an exported PDF in another app shows burned-in marks; reopening in Lumen restores editable data from local storage when the same document ID exists.
- No OCR: scanned PDFs use the region-highlight fallback.

## Sync & concurrency

- Conflict detection uses Drive revision / md5 / modifiedTime; it does not merge concurrent edits.
- Concurrent editing across devices is last-writer-with-conflict-UI, not CRDT merge.
- Pending uploads retry when the app is online/visible; Background Sync is not relied upon.

## PWA / mobile

- iOS Safari: limited background sync, storage eviction possible under pressure; install as Home Screen app for best UX.
- Service worker caches the app shell; PDF blobs remain in IndexedDB (not the SW cache).
- Virtual keyboard may still require scrolling on very small screens when editing notes.

## Performance

- Very large PDFs are constrained by browser memory and IndexedDB quota.
- Pages are lazily rendered near the viewport; extreme zoom on huge pages can still be expensive.
