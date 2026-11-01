// A QR code as a file to download: a PNG at print size (1024 px, quiet zone included) or an SVG,
// drawn in the browser from shared/qrCodes.ts, with the brand's logo in the middle when it's wanted.
import { QUIET_ZONE, logoBox, qrModules, qrSvg } from '../../shared/qrCodes'
import { t } from '../i18n'

export interface QrLook { dark: string; light: string; /** The logo's address (data: or https), or none. */ logo?: string | null }

/** The logo as a data: URL, so a downloaded SVG carries it; its own address when it can't be fetched. */
async function inlined(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  try {
    const blob = await (await fetch(url, { mode: 'cors' })).blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  } catch { return url }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('The logo couldn’t be loaded. Turn off “Logo in the middle” and try again.')))
    img.src = src
  })
}

/** The code as an SVG file. */
export async function qrSvgBlob(payload: string, look: QrLook, title?: string): Promise<Blob> {
  const logo = look.logo ? await inlined(look.logo) : null
  const svg = qrSvg(payload, { ...look, logo, title, px: 1024 })
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' })
}

/** The code as a PNG, `size` pixels square (1024: sharp when printed at A4). */
export async function qrPngBlob(payload: string, look: QrLook, size = 1024): Promise<Blob> {
  const modules = qrModules(payload, !!look.logo)
  const n = modules.length
  const total = n + 2 * QUIET_ZONE
  const cell = size / total
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('This browser can’t draw the picture. Download the SVG instead.'))
  ctx.fillStyle = look.light
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = look.dark
  // Whole pixels for each module's edges, so neighbours meet without hairline gaps.
  const edge = (i: number) => Math.round((i + QUIET_ZONE) * cell)
  const box = look.logo ? logoBox(n) : null
  const covered = (r: number, c: number) => !!box && r >= box.at && r < box.at + box.side && c >= box.at && c < box.at + box.side
  modules.forEach((row, r) => row.forEach((dark, c) => {
    if (dark && !covered(r, c)) ctx.fillRect(edge(c), edge(r), edge(c + 1) - edge(c), edge(r + 1) - edge(r))
  }))
  if (box && look.logo) {
    const img = await loadImage(look.logo)
    const x = edge(box.at), w = edge(box.at + box.side) - x, pad = w * 0.08
    ctx.fillStyle = look.light
    ctx.beginPath()
    ctx.roundRect(x, x, w, w, w * 0.18)
    ctx.fill()
    const scale = Math.min((w - 2 * pad) / img.naturalWidth, (w - 2 * pad) / img.naturalHeight)
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale
    ctx.drawImage(img, x + (w - iw) / 2, x + (w - ih) / 2, iw, ih)
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error(t('This browser can’t draw the picture. Download the SVG instead.')))), 'image/png')
    } catch {
      // A logo from another site without permission to be copied taints the picture.
      reject(new Error(t('The logo couldn’t be loaded. Turn off “Logo in the middle” and try again.')))
    }
  })
}
