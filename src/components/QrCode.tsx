// A QR code on screen and on paper (QR codes page and its print view): drawn as an SVG from
// shared/qrCodes.ts in the business's colours, with the brand's logo in the middle when it's wanted.
import { Box, Typography } from '@mui/material'
import QrIcon from '@mui/icons-material/QrCode2Outlined'
import { useMemo } from 'react'
import iconUrl from '../assets/icon.png'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { qrColours, qrSvg, type QrCode } from '../../shared/qrCodes'
import { tokens } from '../theme'
import { t } from '../i18n'

/** The logo that goes in the middle: the brand's mark (or logo), else Easy Beans' bundled cup for business 1; none for others without one. */
export function useQrLogo(): string | null {
  const { api, business } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  return brand.data?.logo_mark ?? brand.data?.logo ?? ((business?.id ?? 1) === 1 ? iconUrl : null)
}

/** How a code is drawn: its colours (the brand's dark one unless it has its own) and the logo when it's wanted. */
export function useQrLook() {
  const { api } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  const logo = useQrLogo()
  return (c: Pick<QrCode, 'dark_colour' | 'light_colour' | 'logo'>) => ({ ...qrColours(c, brand.data?.colours), logo: c.logo ? logo : null })
}

/**
 * The code itself, `size` across (any CSS length), or a dashed square saying what it still needs.
 * `label` is what a screen reader hears: "QR code for Menu".
 */
export function QrPicture({ payload, look, size, label, missing }: {
  payload: string | null; look: { dark: string; light: string; logo?: string | null }; size: number | string; label: string; missing?: string | null
}) {
  const drawn = useMemo(() => {
    if (!payload) return { svg: null, error: null }
    try { return { svg: qrSvg(payload, { dark: look.dark, light: look.light, logo: look.logo }), error: null } } catch (e) { return { svg: null, error: e instanceof Error ? e.message : String(e) } }
  }, [payload, look.dark, look.light, look.logo])
  if (!drawn.svg) {
    return (
      <Box role="img" aria-label={label} sx={{ width: size, height: size, flexShrink: 0, display: 'grid', placeItems: 'center', textAlign: 'center',
        border: `1.5px dashed ${tokens.lineStrong}`, borderRadius: 2, color: tokens.inkFaint, p: 1, bgcolor: tokens.surfaceAlt }}>
        <Box>
          <QrIcon sx={{ fontSize: 36 }} />
          {(drawn.error ?? missing) && <Typography variant="caption" component="div" sx={{ lineHeight: 1.3 }}>{t(drawn.error ?? missing ?? '')}</Typography>}
        </Box>
      </Box>
    )
  }
  return (
    <Box role="img" aria-label={label} sx={{ width: size, height: size, flexShrink: 0, lineHeight: 0, '& svg': { width: '100%', height: '100%', display: 'block' } }}
      dangerouslySetInnerHTML={{ __html: drawn.svg }} />
  )
}
