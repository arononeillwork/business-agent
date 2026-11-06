// Logos and app icons as the Brand page keeps them: data: URLs, raster images re-encoded as PNG no
// bigger than `max` px (800 for a logo, 256 for the app icon); SVGs are kept as they are.
import { t } from '../i18n'

/** A data: URL (an upload, or a logo the set-up guide found on the website) fitted for the Brand page. */
export async function fitLogo(raw: string, max = 800): Promise<string> {
  if (raw.startsWith('data:image/svg+xml')) {
    if (raw.length > 600_000) throw new Error(t('That SVG is too big. Try a simpler or smaller file.'))
    return raw
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(t('That file is not an image we can read'))); i.src = raw
  })
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** A logo file someone chose, read and fitted (up to 5 MB). */
export async function readLogo(file: File, max = 800): Promise<string> {
  if (file.size > 5_000_000) throw new Error(t('That file is over 5 MB. Use a smaller logo file.'))
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error(t('Could not read that file'))); r.readAsDataURL(file)
  })
  return fitLogo(raw, max)
}
