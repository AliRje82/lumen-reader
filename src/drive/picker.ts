import {
  getGoogleApiKey,
  getGoogleAppId,
  loadGapiPicker,
  ensureAccessToken,
  isGoogleConfigured,
} from './auth'

export interface PickedFile {
  id: string
  name: string
  mimeType: string
}

export async function openDrivePicker(): Promise<PickedFile | null> {
  if (!isGoogleConfigured()) {
    throw new Error('Google client ID is not configured')
  }
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    throw new Error('VITE_GOOGLE_API_KEY is required for Google Picker')
  }

  await loadGapiPicker()
  const token = await ensureAccessToken()

  return new Promise((resolve, reject) => {
    try {
      const view = new window.google!.picker!.DocsView(window.google!.picker!.ViewId.PDFS)
      view.setMimeTypes('application/pdf')
      view.setIncludeFolders(true)

      const builder = new window.google!.picker!.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setTitle('Select a PDF')
        .setCallback((data) => {
          if (data.action === window.google!.picker!.Action.CANCEL) {
            resolve(null)
            return
          }
          if (data.action === window.google!.picker!.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0]
            resolve({ id: doc.id, name: doc.name, mimeType: doc.mimeType })
          }
        })

      const appId = getGoogleAppId()
      if (appId) builder.setAppId(appId)

      builder.build().setVisible(true)
    } catch (err) {
      reject(err)
    }
  })
}
