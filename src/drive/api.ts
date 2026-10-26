import { ensureAccessToken, refreshTokenInteractive } from './auth'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  md5Checksum?: string
  size?: string
  headRevisionId?: string
  webViewLink?: string
}

async function authFetch(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await ensureAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 && !retried) {
    await refreshTokenInteractive()
    return authFetch(url, init, true)
  }
  return res
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta> {
  const fields = 'id,name,mimeType,modifiedTime,md5Checksum,size,headRevisionId,webViewLink'
  const res = await authFetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`)
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status}`)
  return res.json()
}

export async function downloadFile(fileId: string, onProgress?: (ratio: number) => void): Promise<ArrayBuffer> {
  const res = await authFetch(
    `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  )
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  if (!res.body || !onProgress) return res.arrayBuffer()

  const total = Number(res.headers.get('Content-Length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total) onProgress(received / total)
  }
  const out = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out.buffer
}

export async function listAppFiles(pageSize = 50): Promise<DriveFileMeta[]> {
  const q = encodeURIComponent("mimeType='application/pdf' and trashed=false")
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink)')
  const res = await authFetch(
    `${DRIVE}/files?q=${q}&pageSize=${pageSize}&fields=${fields}&orderBy=modifiedTime desc&spaces=drive`,
  )
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)
  const data = await res.json()
  return data.files ?? []
}

/** Simple media upload for smaller files (<5MB). */
export async function updateFileMedia(
  fileId: string,
  data: ArrayBuffer,
  mimeType = 'application/pdf',
): Promise<DriveFileMeta> {
  const res = await authFetch(
    `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,md5Checksum,size,headRevisionId,webViewLink`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: data,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive update failed: ${res.status} ${text}`)
  }
  return res.json()
}

/** Resumable upload — preferred for reliability and larger PDFs. */
export async function updateFileResumable(
  fileId: string,
  data: ArrayBuffer,
  mimeType = 'application/pdf',
  onProgress?: (ratio: number) => void,
): Promise<DriveFileMeta> {
  const start = await authFetch(
    `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,md5Checksum,size,headRevisionId,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(data.byteLength),
      },
      body: JSON.stringify({ mimeType }),
    },
  )
  if (!start.ok) throw new Error(`Resumable init failed: ${start.status}`)
  const sessionUrl = start.headers.get('Location')
  if (!sessionUrl) throw new Error('Missing resumable upload session URL')

  const chunkSize = 256 * 1024 * 4 // 1 MiB aligned to 256KiB
  let offset = 0
  const total = data.byteLength

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total)
    const chunk = data.slice(offset, end)
    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk,
    })
    if (res.status === 308) {
      offset = end
      onProgress?.(offset / total)
      continue
    }
    if (res.status === 200 || res.status === 201) {
      onProgress?.(1)
      return res.json()
    }
    throw new Error(`Resumable upload failed: ${res.status}`)
  }

  throw new Error('Upload ended without completion')
}

export async function createFile(
  name: string,
  data: ArrayBuffer,
  mimeType = 'application/pdf',
): Promise<DriveFileMeta> {
  const metadata = { name, mimeType }
  const boundary = 'lumen_boundary_' + Math.random().toString(36).slice(2)
  const metaPart = JSON.stringify(metadata)
  const encoder = new TextEncoder()
  const metaBytes = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
  )
  const fileHeader = encoder.encode(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  )
  const closing = encoder.encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(metaBytes.length + fileHeader.length + data.byteLength + closing.length)
  body.set(metaBytes, 0)
  body.set(fileHeader, metaBytes.length)
  body.set(new Uint8Array(data), metaBytes.length + fileHeader.length)
  body.set(closing, metaBytes.length + fileHeader.length + data.byteLength)

  const res = await authFetch(
    `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,md5Checksum,size,headRevisionId,webViewLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`)
  return res.json()
}

export async function updateFileSmart(
  fileId: string,
  data: ArrayBuffer,
  onProgress?: (ratio: number) => void,
): Promise<DriveFileMeta> {
  if (data.byteLength < 4 * 1024 * 1024) {
    onProgress?.(0.5)
    const meta = await updateFileMedia(fileId, data)
    onProgress?.(1)
    return meta
  }
  return updateFileResumable(fileId, data, 'application/pdf', onProgress)
}
