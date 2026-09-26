import logoUrl from '../assets/logo.png'
import iconUrl from '../assets/icon.png'

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
