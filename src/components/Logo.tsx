import logoUrl from '../assets/logo.png'
import iconUrl from '../assets/icon.png'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { businessConfig } from '../../shared/business.config'

/**
 * The Easy Beans mark, from the approved files (Drive › Font & logo). Per the brand guidelines:
 * the full lockup (rose pink circle) from 80px up; below that, the cup icon on its own.
 * Never recoloured, stretched or redrawn.
 */
export function Logo({ size = 28 }: { size?: number }) {
  const full = size >= 80
  return (
    <img src={full ? logoUrl : iconUrl} width={size} height={size} alt={full ? 'Easy Beans Coffee' : ''}
      style={{ display: 'block', borderRadius: full ? '50%' : 8, flexShrink: 0 }} />
  )
}

/**
 * The business's logo as set on the Brand page (falls back to the bundled one), on its own:
 * used top-left in the app instead of a name, so it always matches the uploaded file.
 */
export function BrandLogo({ height }: { height: number }) {
  const { api } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  const src = brand.data?.logo ?? logoUrl
  return (
    <img src={src} alt={businessConfig.name} height={height}
      style={{ display: 'block', height, width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: 10 }} />
  )
}

/** Images up to 800px, re-encoded as PNG (SVGs are kept as they are). */
export async function readLogo(file: File): Promise<string> {
  if (file.size > 5_000_000) throw new Error('That file is over 5 MB. Use a smaller logo file.')
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read that file')); r.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml') {
    if (raw.length > 600_000) throw new Error('That SVG is too big. Try a simpler or smaller file.')
    return raw
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not an image we can read')); i.src = raw
  })
  const scale = Math.min(1, 800 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
