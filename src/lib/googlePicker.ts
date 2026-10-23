// Google's own file picker (the Google Picker API), for choosing files in the café's Google Drive on
// the Legal page. Business Agent has Drive's drive.file permission: a file chosen here becomes one it
// may open, and the rest of the Drive stays out of its reach. Loaded from Google only when first used.
import { MAX_PICK } from '../../shared/legalDocs'

// The little of the picker's API used here.
interface PickerBuilder {
  addView(v: unknown): PickerBuilder
  enableFeature(f: string): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setLocale(l: string): PickerBuilder
  setTitle(t: string): PickerBuilder
  setMaxItems(n: number): PickerBuilder
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilder
  build(): { setVisible(v: boolean): void; dispose(): void }
}
interface DocsView {
  setIncludeFolders(b: boolean): DocsView
  setSelectFolderEnabled(b: boolean): DocsView
  setMode(m: string): DocsView
}
interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: string) => DocsView
  ViewId: { DOCS: string }
  DocsViewMode: { LIST: string }
  Feature: { MULTISELECT_ENABLED: string }
  Action: { PICKED: string; CANCEL: string }
  Response: { ACTION: string; DOCUMENTS: string }
  Document: { ID: string }
}
declare global {
  interface Window {
    gapi?: { load(name: string, done: () => void): void }
    google?: { picker?: PickerApi }
  }
}

let loading: Promise<PickerApi> | null = null
function load(): Promise<PickerApi> {
  return loading ??= new Promise<PickerApi>((resolve, reject) => {
    const ready = () => window.gapi!.load('picker', () => resolve(window.google!.picker!))
    if (window.gapi) return ready()
    // Above the app's own bars and dialogs (Google gives its picker a lower z-index).
    const style = document.createElement('style')
    style.textContent = '.picker-dialog-bg{z-index:20000!important}.picker-dialog{z-index:20001!important}'
    document.head.appendChild(style)
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = ready
    script.onerror = () => { loading = null; reject(new Error('Google’s file picker couldn’t load. Check the internet connection and try again.')) }
    document.head.appendChild(script)
  })
}

/** Open Google's picker over the page; resolves with the ids of the files chosen (none when it's closed). */
export async function pickFromGoogleDrive(o: { token: string; key: string; appId: string; title: string; language: string }): Promise<string[]> {
  const gp = await load()
  return new Promise(resolve => {
    const view = new gp.DocsView(gp.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(gp.DocsViewMode.LIST)
    const picker = new gp.PickerBuilder()
      .addView(view)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setMaxItems(MAX_PICK)
      .setOAuthToken(o.token)
      .setDeveloperKey(o.key)
      // The Google Cloud project's number: what makes a chosen file openable by Business Agent afterwards.
      .setAppId(o.appId)
      .setLocale(o.language)
      .setTitle(o.title)
      .setCallback(data => {
        const action = data[gp.Response.ACTION]
        if (action === gp.Action.PICKED) {
          resolve((data[gp.Response.DOCUMENTS] as Record<string, string>[]).map(d => d[gp.Document.ID]))
          picker.dispose()
        } else if (action === gp.Action.CANCEL) {
          resolve([])
          picker.dispose()
        }
      })
      .build()
    picker.setVisible(true)
  })
}
