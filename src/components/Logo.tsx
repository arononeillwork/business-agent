import agentLogoUrl from '../assets/business-agent-logo.png'
import agentMarkUrl from '../assets/business-agent-mark.png'
import easyBeansLogoUrl from '../assets/easy-beans-logo.png'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { businessConfig } from '../../shared/business.config'

/**
 * The Business Agent's logo: the robot on its own below 80px, the robot over the name from 80px up.
 * Always on white: its dark suit and lettering don't show on a dark background.
 */
export function Logo({ size = 28 }: { size?: number }) {
  const full = size >= 80
  return (
    <img src={full ? agentLogoUrl : agentMarkUrl} width={size} height={size} alt={full ? 'The Business Agent' : ''}
      style={{ display: 'block', borderRadius: full ? 16 : 8, background: '#FFFFFF', flexShrink: 0 }} />
  )
}

/**
 * The business's logo as set on the Brand page (falls back to the bundled one), on its own:
 * used top-left in the app instead of a name, so it always matches the uploaded file.
 */
export function BrandLogo({ height }: { height: number }) {
  const { api, business } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  // The bundled lockup is Easy Beans' (the first business); any other business without a logo yet gets The Business Agent's robot.
  const src = brand.data?.logo ?? ((business?.id ?? 1) === 1 ? easyBeansLogoUrl : agentMarkUrl)
  return (
    <img src={src} alt={business?.name ?? businessConfig.name} height={height}
      style={{ display: 'block', height, width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: 10 }} />
  )
}
