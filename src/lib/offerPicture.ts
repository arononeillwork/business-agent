// An offer drawn as a picture for its story (1080 × 1920, upright) or post (1080 × 1350, Instagram's
// 4:5), as a JPEG ready to post: its photo across the top, then its name, details, price (with what
// it usually costs crossed out) and until when, in the brand's fonts and main colour, as the screens
// show it (components/OfferBoard). A photo from somewhere that doesn't allow it to be drawn is left
// out, and the picture is made without it.
import type { BoardBrand } from '../components/MenuBoard'
import { inkOn, type BoardOffer } from '../components/OfferBoard'
import { t } from '../i18n'

const CREAM = '#FBF6EF'
const INK = '#2B2522'
const W = 1080

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** The brand's font, once it has loaded (a few seconds at most), else the usual ones. */
async function fontFor(family: string | null | undefined, fallback: string): Promise<string> {
  if (!family || !document.fonts) return fallback
  const loaded = document.fonts.load(`600 64px "${family}"`).then(f => f.length > 0, () => false)
  const ok = await Promise.race([loaded, new Promise<boolean>(r => setTimeout(() => r(false), 3000))])
  return ok ? `"${family}", ${fallback}` : fallback
}

/** The words in lines no wider than `width`, at most `max` lines (the last one cut short with …). */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width <= width || !line) { line = next; continue }
    lines.push(line)
    line = word
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  let last = lines[max - 1]
  while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  return [...lines.slice(0, max - 1), `${last.trimEnd()}…`]
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}

function draw(o: BoardOffer, brand: BoardBrand, when: string, h: number, img: HTMLImageElement | null, heading: string, body: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = h
  const g = canvas.getContext('2d')!
  const accent = brand.accent ?? '#A85A68'
  const onAccent = inkOn(accent)
  const pad = 88
  const width = W - pad * 2
  g.fillStyle = CREAM
  g.fillRect(0, 0, W, h)

  // The photo across the top half, cropped from its middle to fill it.
  const photoH = img ? Math.round(h * 0.48) : 0
  if (img) {
    const scale = Math.max(W / img.width, photoH / img.height)
    const sw = W / scale, sh = photoH / scale
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, photoH)
  }

  // What's written, measured first so it can sit in the middle of what's left.
  const titleSize = o.title.length > 28 ? 92 : 112
  g.font = `600 ${titleSize}px ${heading}`
  const title = wrap(g, o.title, width, 3)
  g.font = `400 46px ${body}`
  const details = o.details ? wrap(g, o.details, width, img ? 4 : 6) : []
  const gap = 44
  const blocks = [64, title.length * titleSize * 1.08, details.length ? details.length * 46 * 1.35 : 0, o.price || o.was_price ? 130 : 0, 56]
  const used = blocks.reduce((a, b) => a + b, 0) + gap * (blocks.filter(Boolean).length - 1)
  let y = photoH + Math.max(pad, (h - photoH - 120 - used) / 2)

  // "Special offer", on the brand's colour.
  g.font = `600 32px ${body}`
  const label = t('Special offer').toUpperCase()
  const labelW = g.measureText(label).width + 56
  g.fillStyle = accent
  roundRect(g, pad, y, labelW, 64, 32)
  g.fillStyle = onAccent
  g.textBaseline = 'middle'
  g.fillText(label, pad + 28, y + 33)
  y += 64 + gap

  g.textBaseline = 'top'
  g.fillStyle = INK
  g.font = `600 ${titleSize}px ${heading}`
  for (const line of title) { g.fillText(line, pad, y); y += titleSize * 1.08 }
  y += gap

  if (details.length) {
    g.font = `400 46px ${body}`
    g.fillStyle = 'rgba(43, 37, 34, 0.85)'
    for (const line of details) { g.fillText(line, pad, y); y += 46 * 1.35 }
    y += gap
  }

  if (o.price || o.was_price) {
    let x = pad
    if (o.price) {
      g.font = `600 84px ${heading}`
      const pw = g.measureText(o.price).width + 72
      g.fillStyle = accent
      roundRect(g, x, y, pw, 130, 28)
      g.fillStyle = onAccent
      g.textBaseline = 'middle'
      g.fillText(o.price, x + 36, y + 68)
      x += pw + 36
    }
    if (o.was_price) {
      g.font = `400 56px ${body}`
      g.fillStyle = 'rgba(43, 37, 34, 0.55)'
      g.textBaseline = 'middle'
      g.fillText(o.was_price, x, y + 68)
      const ww = g.measureText(o.was_price).width
      g.fillRect(x, y + 66, ww, 4)
    }
    g.textBaseline = 'top'
    y += 130 + gap
  }

  g.font = `600 48px ${body}`
  g.fillStyle = INK
  g.fillText(when, pad, y)

  // The business's name at the bottom.
  g.font = `400 36px ${body}`
  g.fillStyle = 'rgba(43, 37, 34, 0.7)'
  g.textBaseline = 'alphabetic'
  g.textAlign = 'right'
  g.fillText(brand.name, W - pad, h - 64)
  return canvas
}

const toJpeg = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve, reject) => {
  try { canvas.toBlob(resolve, 'image/jpeg', 0.9) } catch (e) { reject(e) }
})

/** The offer as a story or post picture (JPEG). `when`: until when it's on, as the story says it. */
export async function offerPicture(o: BoardOffer, brand: BoardBrand, kind: 'story' | 'post', when: string): Promise<File> {
  const h = kind === 'story' ? 1920 : 1350
  const [img, heading, body] = await Promise.all([
    o.image_url ? loadImage(o.image_url) : Promise.resolve(null),
    fontFor(brand.heading_font, '"Poppins", system-ui, sans-serif'),
    fontFor(brand.body_font, 'system-ui, -apple-system, "Segoe UI", sans-serif'),
  ])
  // A photo from a site that doesn't allow drawing it makes the picture unreadable: without it, then.
  let blob = await toJpeg(draw(o, brand, when, h, img, heading, body)).catch(() => null)
  if (!blob && img) blob = await toJpeg(draw(o, brand, when, h, null, heading, body)).catch(() => null)
  if (!blob) throw new Error(t('The picture couldn’t be made here. Try again, or add a photo of your own.'))
  const name = o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'offer'
  return new File([blob], `${name}-${kind}.jpg`, { type: 'image/jpeg' })
}
