import { Box } from '@mui/material'
import type { BoardBrand } from './MenuBoard'
import { useGoogleFont } from '../lib/googleFont'
import { offerDays, type ScreenOffer } from '../../shared/offers'
import { addDays, formatLocal, localDate, TZ } from '../../shared/time'
import { fonts } from '../theme'
import { t } from '../i18n'

// An offer as a screen shows it, filling whatever box it's in (the TV, or a preview on the Offers
// and Screens pages): its picture beside the writing on a wide screen and above it on an upright
// one, its name, details and price (with what it usually costs crossed out) and until when, in the
// brand's fonts and main colour. Sized from its own box (container units), like the menus.

export type BoardOffer = Pick<ScreenOffer, 'title' | 'details' | 'price' | 'was_price' | 'image_url' | 'starts_at' | 'ends_at'>

const CREAM = '#FBF6EF'
const INK = '#2B2522'

/** Dark writing on a light colour, white on a dark one. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#FFFFFF'
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? INK : '#FFFFFF'
}

const clock = (iso: string, tz: string) => formatLocal(iso, 'HH:mm', tz)
/** Ends at 23:59 (or midnight): the end of that day, so no time is said. */
const endOfDay = (iso: string, tz: string) => ['23:59', '00:00'].includes(clock(iso, tz))
/** Today, tomorrow, or the day's name and date ("Sunday 4 October"); `lower` in the middle of a sentence. */
function dayName(date: string, tz: string, now: number, lower = false) {
  const today = localDate(new Date(now), tz)
  if (date === today) return lower ? t('today') : t('Today')
  if (date === addDays(today, 1)) return lower ? t('tomorrow') : t('Tomorrow')
  return formatLocal(`${date}T12:00:00Z`, 'EEEE d MMMM', 'UTC')
}

/**
 * When an offer is on, in a few words for a screen, a story or a caption: "Until 18:00", "Today
 * only", "Until Sunday 4 October", "Tomorrow 15:00–17:00", "From tomorrow, 09:00 to Sunday 4 October".
 */
export function offerWhenText(o: Pick<ScreenOffer, 'starts_at' | 'ends_at'>, now = Date.now(), tz = TZ): string {
  const { first, last } = offerDays(o, tz)
  const allDay = endOfDay(o.ends_at, tz)
  const end = allDay ? dayName(last, tz, now, true) : `${dayName(last, tz, now, true)}, ${clock(o.ends_at, tz)}`
  if (now >= Date.parse(o.starts_at)) {
    // On now: until a time today, or the day it ends.
    if (last === localDate(new Date(now), tz)) return allDay ? t('Today only') : t('Until {time}', { time: clock(o.ends_at, tz) })
    return t('Until {when}', { when: end })
  }
  if (first === last) {
    return allDay ? t('{day} from {time}', { day: dayName(first, tz, now), time: clock(o.starts_at, tz) })
      : `${dayName(first, tz, now)} ${clock(o.starts_at, tz)}–${clock(o.ends_at, tz)}`
  }
  return t('From {start} to {end}', { start: `${dayName(first, tz, now, true)}, ${clock(o.starts_at, tz)}`, end })
}

export function OfferBoard({ offer: o, brand, now }: { offer: BoardOffer; brand: BoardBrand; now?: number }) {
  useGoogleFont(brand.heading_font)
  useGoogleFont(brand.body_font)
  const accent = brand.accent ?? '#A85A68'
  const onAccent = inkOn(accent)
  const heading = brand.heading_font ? `"${brand.heading_font}", ${fonts.display}` : fonts.display
  const body = brand.body_font ? `"${brand.body_font}", system-ui, sans-serif` : 'system-ui, -apple-system, "Segoe UI", sans-serif'
  const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) as const
  return (
    <Box role="img" aria-label={[o.title, o.price].filter(Boolean).join(' · ')}
      sx={{ position: 'absolute', inset: 0, containerType: 'size', overflow: 'hidden', bgcolor: CREAM, color: INK, fontFamily: body }}>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', '@container (orientation: landscape)': { flexDirection: 'row' } }}>
        {o.image_url && (
          <Box component="img" src={o.image_url} alt="" sx={{ flex: '0 0 45%', minHeight: 0, minWidth: 0, width: '100%', objectFit: 'cover',
            '@container (orientation: landscape)': { flex: '0 0 48%', height: '100%', width: 'auto' } }} />
        )}
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.4cqmin', p: '6cqmin',
          textAlign: o.image_url ? 'left' : 'center', alignItems: o.image_url ? 'flex-start' : 'center' }}>
          <Box sx={{ alignSelf: o.image_url ? 'flex-start' : 'center', px: '2.2cqmin', py: '0.8cqmin', borderRadius: 99, bgcolor: accent, color: onAccent,
            fontSize: '3cqmin', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('Special offer')}
          </Box>
          <Box sx={{ fontFamily: heading, fontWeight: 600, fontSize: o.title.length > 28 ? '7cqmin' : '9cqmin', lineHeight: 1.05, ...clamp(3) }}>{o.title}</Box>
          {o.details && <Box sx={{ fontSize: '3.6cqmin', lineHeight: 1.3, opacity: 0.85, maxWidth: '60ch', ...clamp(4) }}>{o.details}</Box>}
          {(o.price || o.was_price) && (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '2.4cqmin', flexWrap: 'wrap', justifyContent: o.image_url ? 'flex-start' : 'center' }}>
              {o.price && <Box sx={{ px: '3cqmin', py: '1cqmin', borderRadius: '2cqmin', bgcolor: accent, color: onAccent, fontFamily: heading, fontWeight: 600, fontSize: '7.5cqmin', lineHeight: 1.1 }}>{o.price}</Box>}
              {o.was_price && <Box component="s" aria-label={t('was {price}', { price: o.was_price })} sx={{ fontSize: '4.4cqmin', opacity: 0.55 }}>{o.was_price}</Box>}
            </Box>
          )}
          <Box sx={{ fontSize: '3.4cqmin', fontWeight: 600 }}>{offerWhenText(o, now)}</Box>
        </Box>
      </Box>
      <Box sx={{ position: 'absolute', right: '3cqmin', bottom: '3cqmin', display: 'flex', alignItems: 'center', gap: '1.2cqmin', fontSize: '2.6cqmin', opacity: 0.75 }}>
        {brand.logo && <Box component="img" src={brand.logo} alt="" sx={{ height: '5cqmin', objectFit: 'contain' }} />}
        {brand.name}
      </Box>
    </Box>
  )
}
