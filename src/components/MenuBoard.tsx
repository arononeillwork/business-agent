import { Box, type SxProps, type Theme } from '@mui/material'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import logoUrl from '../assets/logo.png'
import {
  ALLERGEN_MARKS, MENU_TAGS, allergenNumber, marksOf, menuSections, otherVariants, priceColumns, priceIn, shownAllergens, sizeOf, type ItemMarks, type MenuDesign,
  type MenuItem, type MenuSection,
} from '../../shared/menu'
import { ALLERGENS, type Allergen, type MenuAllergens } from '../../shared/allergens'
import type { BrandColour } from '../../shared/types'
import { formatMoney } from '../../shared/time'
import { useGoogleFont } from '../lib/googleFont'
import { fonts } from '../theme'
import { t } from '../i18n'

// A menu as it's printed or shown on a screen: the design's image and (unless the image is the whole
// menu) the heading and every section's items with their prices, written from the menu itself so
// names and prices are always right. Classic writes one list over the image; boxed is laid out like
// the café's printed menus (its logo in a circle, a big heading, each section in a rounded box, hot
// and iced prices side by side, allergens as coloured letters, the image as a strip of illustrations
// at the bottom). Allergens and diet badges come from what goes into each item on Menu costing (the
// Allergens page): an item shows its allergens once every ingredient's are entered, and nothing while
// it has no ingredients there. Everything is sized from the board's own box (container units), so it looks the
// same as a thumbnail, a printed A3 or a TV; the more there is on it, the smaller the writing and
// the more columns. It starts generous and, once drawn, shrinks the writing until every item fits:
// nothing is ever cut off a menu.

export type BoardDesign = Pick<MenuDesign, 'size' | 'mode' | 'style' | 'categories' | 'title' | 'subtitle' | 'footer' | 'text_tone' | 'panel' | 'show_descriptions'
  | 'show_allergens'>
export interface BoardBrand {
  name: string
  logo?: string | null
  heading_font?: string | null
  body_font?: string | null
  /** The main colour (headings, the line under the title, the boxed menu's pink sections). */
  accent?: string | null
  /** A second colour, for the boxed menu's other tinted sections. */
  second?: string | null
}

/** The board's brand from the Brand page (or a screen's feed): its logo, fonts, main colour and an accent colour. */
export function boardBrand(name: string, b: { logo?: string | null; heading_font?: string | null; body_font?: string | null; colours?: BrandColour[] } | null | undefined): BoardBrand {
  const colours = b?.colours ?? []
  return { name, logo: b?.logo ?? null, heading_font: b?.heading_font, body_font: b?.body_font, accent: colours.find(c => c.role === 'primary')?.hex ?? null,
    second: colours.filter(c => c.role === 'accent').at(-1)?.hex ?? null }
}

/** A price as the menu shows it (nothing to pay: "free", like the milks). */
const priceText = (n: number) => (n === 0 ? t('free') : formatMoney(n))

/** The ways it's sold that aren't its section's price columns: its own label (Hot) and the other variants with their price changes. */
function extrasOf(i: MenuItem, columns: string[]) {
  const own = i.price_label && !columns.includes(i.price_label) ? [i.price_label] : []
  const others = otherVariants(i, columns).map(v => (v.price_change ? `${v.name} ${v.price_change > 0 ? '+' : '−'}${formatMoney(Math.abs(v.price_change))}` : v.name))
  return [...own, ...others].join(' · ')
}

interface Look {
  portrait: boolean
  light: boolean
  ink: string
  accent: string
  second: string
  heading: string
  /** A size in the board's writing unit (k × the unit, in % of the board's height). */
  u: (k: number) => string
  fit: number
}

export function MenuBoard({ design, items, allergens, image, brand, order, sx }: {
  design: BoardDesign; items: MenuItem[]; allergens: MenuAllergens | null | undefined; image: string | null; brand: BoardBrand; order?: readonly string[]
  sx?: SxProps<Theme>
}) {
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
  const content = JSON.stringify([design, items, allergens, order, image, fonts_])
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
  const own = Array.isArray(sx) ? sx : [sx]

  if (design.mode === 'full') {
    return (
      <Box sx={[base, ...own]}>
        {image
          ? <Box component="img" src={image} alt={design.title ?? brand.name} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
          : <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: '8cqmin', textAlign: 'center', fontSize: '4cqmin', opacity: 0.7 }}>
              {t('This menu is one picture: create or upload it below.')}
            </Box>}
      </Box>
    )
  }

  const sections = menuSections(items, { only: design.categories, order })
  const marks = new Map(items.map(i => [i.id, marksOf(i.id, allergens)]))
  const markOf = (i: MenuItem) => marks.get(i.id)!
  const look = (size: number): Look => ({ portrait, light, ink, accent, second: brand.second ?? '#6B8E4E', heading, fit, u: k => `${(size * fit * k).toFixed(3)}cqh` })
  if (design.style === 'boxed') {
    return (
      <Box sx={[base, ...own]}>
        <Boxed design={design} sections={sections} markOf={markOf} image={image} brand={brand} look={look} writing={writing} />
      </Box>
    )
  }
  return (
    <Box sx={[base, image ? { backgroundImage: `url("${image.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}, ...own]}>
      <Classic design={design} sections={sections} markOf={markOf} brand={brand} look={look} writing={writing} />
    </Box>
  )
}

interface BodyProps {
  design: BoardDesign; sections: MenuSection[]; markOf: (i: MenuItem) => ItemMarks; brand: BoardBrand; look: (size: number) => Look; writing: RefObject<HTMLDivElement | null>
}

/** The allergens on the menu, in the Annex's order, for its key. */
const usedOn = (sections: MenuSection[], markOf: (i: MenuItem) => ItemMarks) =>
  ALLERGENS.filter(a => sections.some(s => s.items.some(i => shownAllergens(markOf(i)).includes(a.id))))

/** The prices on an item's line: one, or one in each of its section's columns (— where it isn't sold that way). */
function Prices({ item: i, columns }: { item: MenuItem; columns: string[] }) {
  const cell = { fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' } as const
  if (!columns.length) return i.sell_price === null ? null : <Box component="span" sx={cell}>{priceText(i.sell_price)}</Box>
  return columns.map(c => {
    const p = priceIn(i, c, columns)
    return <Box component="span" key={c} sx={{ ...cell, width: '4.6em', textAlign: 'right', flexShrink: 0, ...(p === null ? { opacity: 0.4 } : {}) }}>{p === null ? '—' : priceText(p)}</Box>
  })
}

/** The column headings over a section's prices (hot, iced). */
function ColumnHeads({ columns, gap, lower }: { columns: string[]; gap: string; lower?: boolean }) {
  if (!columns.length) return null
  return (
    <Box aria-hidden sx={{ display: 'flex', justifyContent: 'flex-end', gap, opacity: 0.7 }}>
      {columns.map(c => <Box key={c} component="span" sx={{ width: '4.6em', textAlign: 'right', fontSize: '0.74em', ...(lower ? { textTransform: 'lowercase' } : {}) }}>{c}</Box>)}
    </Box>
  )
}

function Classic({ design, sections, markOf, brand, look, writing }: BodyProps) {
  const z = sizeOf(design.size)
  const portrait = z.height > z.width
  const used = usedOn(sections, markOf)
  const columnsOf = new Map(sections.map(s => [s, priceColumns(s.items)]))
  // How much there is to write, in lines: each section's heading, each item, and its smaller lines.
  const lines = sections.reduce((n, s) => n + 1.7 + (columnsOf.get(s)!.length ? 0.7 : 0)
    + s.items.reduce((m, i) => m + 1 + (design.show_descriptions && i.description ? 0.8 : 0) + (extrasOf(i, columnsOf.get(s)!) ? 0.7 : 0), 0), 0)
  const columns = portrait ? (lines > 26 ? 2 : 1) : lines <= 9 ? 1 : lines <= 32 ? 2 : 3
  // The writing size (in % of the board's height): what fits in the room for the menu, within limits.
  const room = portrait ? 66 : 58
  const { u, light, accent, heading } = look(Math.min(portrait ? 2.4 : 4.6, room / ((lines / columns) * 1.1 + 1) / 1.25))
  const title = design.title ?? brand.name
  return (
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
        {sections.map(s => {
          const cols = columnsOf.get(s)!
          return (
            <Box key={s.category ?? '-'} sx={{ mb: u(0.9) }}>
              <Box component="h3" sx={{ m: 0, mb: u(0.45), fontFamily: heading, fontWeight: 600, fontSize: u(1.15), letterSpacing: '0.12em', textTransform: 'uppercase',
                color: accent, breakAfter: 'avoid' }}>
                {s.category ? t(s.category) : t('More')}
              </Box>
              <Box sx={{ fontSize: u(1), breakAfter: 'avoid' }}><ColumnHeads columns={cols} gap={u(0.4)} /></Box>
              {s.items.map(i => {
                const extras = extrasOf(i, cols)
                return (
                  <Box key={i.id} sx={{ breakInside: 'avoid', mb: u(0.45) }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(0.4), fontSize: u(1) }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {i.featured && <Box component="span" sx={{ color: accent, mr: u(0.3) }}>{'★'}</Box>}
                        {i.name}
                        {design.show_allergens && shownAllergens(markOf(i)).length > 0 && (
                          <Box component="sup" sx={{ fontWeight: 400, fontSize: '0.62em', ml: '0.25em', opacity: 0.75 }}>{shownAllergens(markOf(i)).map(allergenNumber).join('·')}</Box>
                        )}
                        <Dietary marks={markOf(i)} colour={accent} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: '2cqw', borderBottom: `0.2cqmin dotted currentColor`, opacity: 0.35, transform: 'translateY(-0.25em)' }} />
                      <Prices item={i} columns={cols} />
                    </Box>
                    {design.show_descriptions && i.description && <Box sx={{ fontSize: u(0.78), opacity: 0.78, mt: u(0.1) }}>{i.description}</Box>}
                    {extras && <Box sx={{ fontSize: u(0.72), opacity: 0.7, mt: u(0.1) }}>{extras}</Box>}
                  </Box>
                )
              })}
            </Box>
          )
        })}
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
  )
}

/** Its diet badges (V, VG, GF, DF), only what its ingredients say it is. */
function Dietary({ marks, colour }: { marks: ItemMarks; colour: string }) {
  if (!marks.tags.length) return null
  return (
    <Box component="span" sx={{ fontWeight: 500, fontSize: '0.62em', ml: '0.45em', color: colour, letterSpacing: '0.04em', whiteSpace: 'nowrap', textTransform: 'none' }}>
      {marks.tags.map(d => MENU_TAGS.find(x => x.id === d)!.short).join(' ')}
    </Box>
  )
}

/** An allergen as the printed menus mark it: its letter in a coloured dot. */
function Mark({ allergen: a }: { allergen: Allergen }) {
  const m = ALLERGEN_MARKS[a]
  return (
    <Box component="span" title={t(ALLERGENS.find(x => x.id === a)!.label)} sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.3em', height: '1.3em',
      borderRadius: '50%', bgcolor: m.colour, color: '#fff', fontWeight: 700, lineHeight: 1, letterSpacing: 0, verticalAlign: '-0.2em', ml: '0.3em',
      fontSize: '0.86em', '& > span': { fontSize: m.code.length > 1 ? '0.5em' : '0.62em' } }}>
      <span>{m.code}</span>
    </Box>
  )
}

/** Like the café's printed menus: logo, big heading, each section in a rounded box, the image as a strip along the bottom. */
function Boxed({ design, sections, markOf, image, brand, look, writing }: BodyProps & { image: string | null }) {
  const z = sizeOf(design.size)
  const portrait = z.height > z.width
  const used = usedOn(sections, markOf)
  const key = design.show_allergens && used.length > 0
  const columnsOf = new Map(sections.map(s => [s, priceColumns(s.items)]))
  // How much there is to write, in units of the writing size: each section's heading and box, each item and its smaller lines.
  const units = sections.reduce((n, s) => n + 4.8 + (columnsOf.get(s)!.length ? 1 : 0)
    + s.items.reduce((m, i) => m + 1.7 + (design.show_descriptions && i.description ? 1.05 : 0) + (extrasOf(i, columnsOf.get(s)!) ? 0.9 : 0), 0), 0)
  const columns = portrait ? (units > 30 ? 2 : 1) : units <= 22 ? 1 : units <= 70 ? 2 : 3
  // The room for the boxes (in % of the board's height): what the heading, the strip and the bottom lines leave.
  const room = 100 - (portrait ? 33 : 34) - (image ? (portrait ? 13 : 15) : 0) - (key ? 3 : 0) - (design.footer ? 3 : 0)
  const { u, light, ink, accent, second, heading, fit } = look(Math.min(portrait ? 1.75 : 3.2, room / ((units / columns) * 0.9 + 1)))
  const title = design.title ?? brand.name
  const paper = light ? '#2B2522' : '#FFFFFF'
  const deep = (c: string) => `color-mix(in srgb, ${c} 82%, ${ink})`
  // Sections take turns: plain, in the second colour, in the main colour (one colour at a time).
  const tones = [
    { head: ink, line: ink, fill: light ? 'rgba(255,255,255,0.05)' : paper },
    { head: deep(second), line: ink, fill: `color-mix(in srgb, ${second} 15%, ${paper})` },
    { head: deep(accent), line: accent, fill: `color-mix(in srgb, ${accent} 16%, ${paper})` },
  ]
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', p: portrait ? '5.5cqw 7cqw 3.5cqw' : '3.5cqh 4cqw 2.5cqh' }}>
      <Box sx={{ textAlign: 'center', mb: u(1.3) }}>
        <Box component="img" src={brand.logo || logoUrl} alt="" sx={{ display: 'block', mx: 'auto', width: `min(${u(9)}, ${portrait ? 13 : 15}cqh)`, aspectRatio: '1',
          objectFit: 'contain', borderRadius: '50%' }} />
        <Box sx={{ fontFamily: heading, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1, letterSpacing: '0.01em', mt: u(0.7),
          fontSize: `min(${u(4.6)}, ${portrait ? 7.5 : 10}cqh, 14cqw)` }}>{title}</Box>
        {design.subtitle && <Box sx={{ fontSize: u(0.82), opacity: 0.75, mt: u(0.45) }}>{design.subtitle}</Box>}
      </Box>
      {!sections.length && (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: u(1), opacity: 0.7 }}>{t('Add items on the Items tab to see them here.')}</Box>
      )}
      <Box ref={writing} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', columnCount: columns, columnGap: portrait ? '4.5cqw' : '2.5cqw', columnFill: 'balance',
        display: sections.length ? 'block' : 'none' }}>
        {sections.map((s, n) => {
          const cols = columnsOf.get(s)!
          const tone = tones[n % tones.length]
          return (
            <Box key={s.category ?? '-'} component="section" sx={{ breakInside: 'avoid', pb: u(1.1) }}>
              <Box component="h3" sx={{ m: 0, mb: u(0.5), fontFamily: heading, fontWeight: 700, fontSize: u(1.45), lineHeight: 1.15, textTransform: 'uppercase',
                letterSpacing: '0.02em', color: tone.head }}>
                {s.category ? t(s.category) : t('More')}
              </Box>
              <Box sx={{ border: `0.28cqmin solid ${tone.line}`, borderRadius: u(1), bgcolor: tone.fill, p: `${u(0.75)} ${u(1)}`, fontSize: u(0.88) }}>
                <ColumnHeads columns={cols} gap={u(0.5)} lower />
                {s.items.map(i => {
                  const extras = extrasOf(i, cols)
                  return (
                    <Box key={i.id} sx={{ py: u(0.28) }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(0.5) }}>
                        <Box sx={{ flex: 1, minWidth: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {i.featured && <Box component="span" sx={{ color: deep(accent), mr: '0.3em' }}>{'★'}</Box>}
                          {i.name}
                          {design.show_allergens && shownAllergens(markOf(i)).map(a => <Mark key={a} allergen={a} />)}
                          <Dietary marks={markOf(i)} colour={deep(second)} />
                        </Box>
                        <Prices item={i} columns={cols} />
                      </Box>
                      {design.show_descriptions && i.description && <Box sx={{ fontSize: '0.82em', opacity: 0.72, mt: '0.15em', lineHeight: 1.3 }}>{i.description}</Box>}
                      {extras && <Box sx={{ fontSize: '0.78em', opacity: 0.7, mt: '0.1em' }}>{extras}</Box>}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
      </Box>
      {image && (
        <Box component="img" src={image} alt="" sx={{ display: 'block', mx: 'auto', maxWidth: '100%', objectFit: 'contain', mt: u(0.5),
          height: `${((portrait ? 12 : 14) * Math.max(0.6, fit)).toFixed(2)}cqh` }} />
      )}
      {key && (
        <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.2em 0', fontSize: u(0.72), mt: u(0.7) }}>
          {used.map((a, k) => (
            <Box key={a.id} component="span" sx={{ whiteSpace: 'nowrap' }}>
              {k > 0 && <Box component="span" sx={{ opacity: 0.35, mx: '0.8em' }}>{'/'}</Box>}
              <Mark allergen={a.id} />
              <Box component="span" sx={{ ml: '0.35em' }}>{t(a.label)}</Box>
            </Box>
          ))}
        </Box>
      )}
      {design.footer && <Box sx={{ textAlign: 'center', fontSize: u(0.8), color: deep(accent), fontWeight: 500, mt: u(0.5) }}>{design.footer}</Box>}
    </Box>
  )
}
