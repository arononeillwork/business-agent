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
