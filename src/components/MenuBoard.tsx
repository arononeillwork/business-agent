import { Box, type SxProps, type Theme } from '@mui/material'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ALLERGENS, DIETARY, allergenNumber, menuSections, sizeOf, type MenuDesign, type MenuItem } from '../../shared/menu'
import { formatMoney } from '../../shared/time'
import { useGoogleFont } from '../lib/googleFont'
import { fonts } from '../theme'
import { t } from '../i18n'

// A menu as it's printed or shown on a screen: the design's image and, over it (unless the image is
// the whole menu), the heading and every section's items with their prices, written from the menu
// itself so names and prices are always right. Everything is sized from the board's own box
// (container units), so it looks the same as a thumbnail, a printed A3 or a TV; the more there is on
// it, the smaller the writing and the more columns. It starts generous and, once drawn, shrinks the
// writing until every item fits: nothing is ever cut off a menu.

export type BoardDesign = Pick<MenuDesign, 'size' | 'mode' | 'categories' | 'title' | 'subtitle' | 'footer' | 'text_tone' | 'panel' | 'show_descriptions' | 'show_allergens'>
export interface BoardBrand { name: string; heading_font?: string | null; body_font?: string | null; accent?: string | null }

const variantsOf = (i: MenuItem) =>
  i.variants.map(v => (v.price_change ? `${v.name} ${v.price_change > 0 ? '+' : '−'}${formatMoney(Math.abs(v.price_change))}` : v.name)).join(' · ')

export function MenuBoard({ design, items, image, brand, sx }: { design: BoardDesign; items: MenuItem[]; image: string | null; brand: BoardBrand; sx?: SxProps<Theme> }) {
  useGoogleFont(brand.heading_font)
  useGoogleFont(brand.body_font)
  const writing = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  // The brand's fonts can arrive after the first drawing, with letters of another width: fit again then.
  const [fonts_, setFonts] = useState(0)
  useEffect(() => {
    const loaded = () => setFonts(n => n + 1)
    document.fonts?.addEventListener?.('loadingdone', loaded)
    return () => document.fonts?.removeEventListener?.('loadingdone', loaded)
  }, [])
  // Something new to write: start from the generous size again…
  const content = JSON.stringify([design, items, fonts_])
  useLayoutEffect(() => setFit(1), [content])
  // …and shrink it a step at a time while it overflows (down, or into extra columns across).
  useLayoutEffect(() => {
    const el = writing.current
    if (el && fit > 0.3 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) setFit(f => f * 0.92)
  })
  const z = sizeOf(design.size)
  const portrait = z.height > z.width
  const light = design.text_tone === 'light'
  const ink = light ? '#FFFFFF' : '#2B2522'
  const accent = brand.accent ?? (light ? '#F7C5CA' : '#A85A68')
  const heading = brand.heading_font ? `"${brand.heading_font}", ${fonts.display}` : fonts.display
  const body = brand.body_font ? `"${brand.body_font}", system-ui, sans-serif` : 'system-ui, -apple-system, "Segoe UI", sans-serif'
  const base = {
    position: 'relative', width: '100%', aspectRatio: `${z.width} / ${z.height}`, containerType: 'size', overflow: 'hidden',
    bgcolor: light ? '#2B2522' : '#FBF6EF', color: ink, fontFamily: body, lineHeight: 1.25,
  } as const

  if (design.mode === 'full') {
    return (
      <Box sx={[base, ...(Array.isArray(sx) ? sx : [sx])]}>
        {image
          ? <Box component="img" src={image} alt={design.title ?? brand.name} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
          : <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: '8cqmin', textAlign: 'center', fontSize: '4cqmin', opacity: 0.7 }}>
              {t('This menu is one picture: create or upload it below.')}
            </Box>}
      </Box>
    )
  }

  const sections = menuSections(items, { only: design.categories })
  const used = ALLERGENS.filter(a => sections.some(s => s.items.some(i => i.allergens.includes(a.id))))
  // How much there is to write, in lines: each section's heading, each item, and its smaller lines.
  const lines = sections.reduce((n, s) => n + 1.7 + s.items.reduce((m, i) => m + 1 + (design.show_descriptions && i.description ? 0.8 : 0) + (i.variants.length ? 0.7 : 0), 0), 0)
  const columns = portrait ? (lines > 26 ? 2 : 1) : lines <= 9 ? 1 : lines <= 32 ? 2 : 3
  // The writing size (in % of the board's height): what fits in the room for the menu, within limits.
  const room = portrait ? 66 : 58
  const size = Math.min(portrait ? 2.4 : 4.6, room / ((lines / columns) * 1.1 + 1) / 1.25) * fit
  const u = (k: number) => `${(size * k).toFixed(3)}cqh`
  const title = design.title ?? brand.name

  return (
    <Box sx={[base, image ? { backgroundImage: `url("${image.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {},
      ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box sx={{
        position: 'absolute', inset: portrait ? '6cqw' : '5cqh 4cqw', display: 'flex', flexDirection: 'column', p: portrait ? '5cqw' : '3.5cqh 3cqw', borderRadius: '1.6cqmin',
        ...(design.panel ? { bgcolor: light ? 'rgba(24,19,17,0.66)' : 'rgba(255,253,250,0.88)', backdropFilter: 'blur(2px)' } : {}),
        textShadow: light && !design.panel ? '0 0.15cqmin 0.6cqmin rgba(0,0,0,0.55)' : 'none',
      }}>
        <Box sx={{ textAlign: 'center', mb: u(1.1) }}>
          <Box sx={{ fontFamily: heading, fontWeight: 600, fontSize: `min(${u(2.6)}, ${portrait ? 6 : 10}cqh, 7cqw)`, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{title}</Box>
          {design.subtitle && <Box sx={{ fontSize: u(0.95), opacity: 0.8, mt: u(0.35) }}>{design.subtitle}</Box>}
          <Box sx={{ width: '12cqmin', height: '0.35cqmin', bgcolor: accent, mx: 'auto', mt: u(0.7), borderRadius: 1 }} />
        </Box>
        {!sections.length && (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: u(1), opacity: 0.7 }}>{t('Add items on the Items tab to see them here.')}</Box>
        )}
        <Box ref={writing} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', columnCount: columns, columnGap: portrait ? '6cqw' : '4cqw', columnFill: 'balance' }}>
          {sections.map(s => (
            <Box key={s.category ?? '-'} sx={{ mb: u(0.9) }}>
              <Box component="h3" sx={{ m: 0, mb: u(0.45), fontFamily: heading, fontWeight: 600, fontSize: u(1.15), letterSpacing: '0.12em', textTransform: 'uppercase',
                color: accent, breakAfter: 'avoid' }}>
                {s.category ? t(s.category) : t('More')}
              </Box>
              {s.items.map(i => (
                <Box key={i.id} sx={{ breakInside: 'avoid', mb: u(0.45) }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(0.4), fontSize: u(1) }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {i.featured && <Box component="span" sx={{ color: accent, mr: u(0.3) }}>{'★'}</Box>}
                      {i.name}
                      {design.show_allergens && i.allergens.length > 0 && (
                        <Box component="sup" sx={{ fontWeight: 400, fontSize: '0.62em', ml: '0.25em', opacity: 0.75 }}>{i.allergens.map(allergenNumber).join('·')}</Box>
                      )}
                      {i.dietary.length > 0 && (
                        <Box component="span" sx={{ fontWeight: 500, fontSize: '0.62em', ml: '0.45em', color: accent, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                          {i.dietary.map(d => DIETARY.find(x => x.id === d)!.short).join(' ')}
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: '2cqw', borderBottom: `0.2cqmin dotted currentColor`, opacity: 0.35, transform: 'translateY(-0.25em)' }} />
                    {i.sell_price !== null && <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMoney(i.sell_price)}</Box>}
                  </Box>
                  {design.show_descriptions && i.description && <Box sx={{ fontSize: u(0.78), opacity: 0.78, mt: u(0.1) }}>{i.description}</Box>}
                  {i.variants.length > 0 && <Box sx={{ fontSize: u(0.72), opacity: 0.7, mt: u(0.1) }}>{variantsOf(i)}</Box>}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        {(design.footer || (design.show_allergens && used.length > 0)) && (
          <Box sx={{ textAlign: 'center', fontSize: u(0.7), opacity: 0.78, mt: u(0.6), lineHeight: 1.35 }}>
            {design.footer && <Box>{design.footer}</Box>}
            {design.show_allergens && used.length > 0 && (
              <Box>{`${t('Allergens')}: ${used.map(a => `${allergenNumber(a.id)} ${t(a.label)}`).join(' · ')}`}</Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
