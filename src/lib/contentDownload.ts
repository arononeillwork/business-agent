// Downloading Content's photos and videos, as Google Photos does: one as its own file, several as one ZIP
// (a browser stops a page saving many files one after another). Each is fetched from its own address.
import { downloadNames, type ContentItem } from '../../shared/content'
import { zipStore } from './zip'
import { t } from '../i18n'

/** The most one download gathers (the ZIP is made in the browser's memory). */
export const MAX_DOWNLOAD_BYTES = 1_000_000_000

/** Hand the browser a file to save. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function fetchFile(i: Pick<ContentItem, 'url'>, name: string): Promise<Blob> {
  const res = await fetch(i.url).catch(() => null)
  if (!res?.ok) throw new Error(t('{name} didn’t download. Try again.', { name }))
  return res.blob()
}

/** Save these: one as itself, several as `zipName` (`onProgress`: how many are fetched so far). */
export async function downloadContent(items: readonly ContentItem[], zipName: string, onProgress?: (done: number) => void) {
  const names = downloadNames(items)
  if (items.length === 1) {
    save(await fetchFile(items[0], names[0]), names[0])
    return
  }
  const files: { name: string; data: Uint8Array; date?: Date }[] = []
  let total = 0
  for (const [n, item] of items.entries()) {
    const data = new Uint8Array(await (await fetchFile(item, names[n])).arrayBuffer())
    total += data.length
    if (total > MAX_DOWNLOAD_BYTES) throw new Error(t('That’s more than 1 GB: choose fewer at a time.'))
    const when = item.taken_at ?? item.created_at
    files.push({ name: names[n], data, date: when ? new Date(when) : undefined })
    onProgress?.(n + 1)
  }
  save(zipStore(files), zipName)
}
