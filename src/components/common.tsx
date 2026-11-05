import { Alert, Avatar, Box, Button, Card, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import type { SxProps, TextFieldProps, Theme } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FLAG_LABELS } from '../../shared/types'
import { addDays, formatLocal, today, weekStart } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t } from '../i18n'

/**
 * Where a page's title goes on a computer: the top row of the app, beside the round buttons at the top
 * right (the app shell provides it). Elsewhere (phones, public pages) the title stays in the page.
 */
export const TitleSlot = createContext<HTMLElement | null>(null)

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  const slot = useContext(TitleSlot)
  const heading = (
    <Box sx={{ minWidth: { md: 280 }, flex: { md: '1 1 auto' } }}>
      {eyebrow && <Typography variant="overline" sx={{ color: tokens.roseDeep }}>{eyebrow}</Typography>}
      <Typography variant="h4" component="h1">{title}</Typography>
    </Box>
  )
  // The page's own buttons: on the right, in a row of their own under the top row (not beside the round
  // buttons at the top right); they wrap when there are many. On a phone, under the title.
  const buttons = actions && (
    <Stack direction="row" useFlexGap spacing={1} role="group" aria-label={t('Page actions')}
      sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: { md: 'flex-end' }, minWidth: 0 }}>{actions}</Stack>
  )
  if (slot) return <>{createPortal(heading, slot)}{buttons && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1, mb: 2.5 }}>{buttons}</Box>}</>
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { md: 'flex-start' }, justifyContent: 'space-between' }}>
      {heading}
      {buttons && <Box sx={{ pt: { md: eyebrow ? 3.25 : 0.25 } }}>{buttons}</Box>}
    </Stack>
  )
}

/**
 * A row under the page's title, for what would crowd the top row: a line or the page's tabs on the left,
 * its own buttons and pickers on the right (they wrap under it on a phone).
 */
export function PageToolbar({ children, actions, label, sx }: { children?: ReactNode; actions?: ReactNode; label?: string; sx?: SxProps<Theme> }) {
  return (
    <Box role={label ? 'toolbar' : undefined} aria-label={label} sx={[{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1.25, mb: 2.5 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {/* Its own width to start with: when the buttons don't fit beside it, they go under it, on the right. */}
      <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{children}</Box>
      {actions && (
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', ml: 'auto', maxWidth: '100%' }}>
          {actions}
        </Stack>
      )}
    </Box>
  )
}

/** A small headline figure: label, value and an optional note. */
/** One figure in an "at a glance" list: what it is on the left, the number on the right. */
export function Stat({ label, value, note, tone }: {
  label: string; value: ReactNode; note?: ReactNode; tone?: 'danger' | 'warning' | 'good'
}) {
  const colour = tone === 'danger' ? tokens.danger : tone === 'warning' ? tokens.roseDeep : tone === 'good' ? tokens.matchaDeep : tokens.ink
  return (
    <Box role="listitem" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, sm: 2.75 }, py: 1.75,
      borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography>{label}</Typography>
        {note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{note}</Typography>}
      </Box>
      <Typography sx={{ fontFamily: fonts.display, fontSize: '1.45rem', fontWeight: 400, letterSpacing: '-0.01em', color: colour,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, textAlign: 'right', flexShrink: 0 }}>
        {value}
      </Typography>
    </Box>
  )
}

/** Figures at the top of a page, one under the other in a single card. */
export function StatRow({ children }: { children: ReactNode }) {
  return <Card role="list" aria-label={t('At a glance')} sx={{ mb: 3 }}>{children}</Card>
}

/** Headline figures as compact tiles side by side: two across on a phone, four in a row on a computer. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <Box role="list" aria-label={t('At a glance')} sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
      {children}
    </Box>
  )
}

/** One tile in a StatGrid. */
export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card role="listitem" sx={{ px: 2, py: 1.5, minWidth: 0 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{label}</Typography>
      <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.25rem', lg: '1.45rem' }, fontWeight: 400, letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, mt: 0.25, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      {note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>{note}</Typography>}
    </Card>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.75, gap: 1.5 }}>
      <Typography variant="h6" component="h2">{children}</Typography>
      {action}
    </Stack>
  )
}

export function Loading() {
  return <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ py: 3.5, px: { xs: 2, sm: 3 }, textAlign: 'center', color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 3, lineHeight: 1.6 }}>
      {children}
    </Box>
  )
}

export function PersonAvatar({ name, colour, size = 32 }: { name: string; colour: string; size?: number }) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Avatar sx={{ bgcolor: colour, color: '#fff', width: size, height: size, fontSize: size * 0.38, fontWeight: 500, fontFamily: fonts.display }}>{initials}</Avatar>
  )
}

export function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  const sunday = addDays(monday, 6)
  const thisWeek = weekStart(today())
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', pl: 0.5 }}>
      <IconButton size="small" aria-label={t('Previous week')} onClick={() => onChange(addDays(monday, -7))}><ChevronLeft /></IconButton>
      <Typography sx={{ minWidth: 132, textAlign: 'center', fontWeight: 500, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatLocal(`${monday}T12:00:00Z`, 'd MMM')} – {formatLocal(`${sunday}T12:00:00Z`, 'd MMM')}
      </Typography>
      <IconButton size="small" aria-label={t('Next week')} onClick={() => onChange(addDays(monday, 7))}><ChevronRight /></IconButton>
      <Button size="small" disabled={monday === thisWeek} onClick={() => onChange(thisWeek)}
        sx={{ borderLeft: 1, borderColor: 'divider', borderRadius: 0, px: 1.5 }}>{t('This week')}</Button>
    </Stack>
  )
}

const FLAG_TONE: Record<string, { fg: string; bg: string }> = {
  missed_break: { fg: tokens.badFg, bg: tokens.badBg },
  over_daily_limit: { fg: tokens.badFg, bg: tokens.badBg },
  auto_clock_out: { fg: tokens.warnFg, bg: tokens.warnBg },
  unscheduled: { fg: tokens.warnFg, bg: tokens.warnBg },
  edited: { fg: tokens.neutralFg, bg: tokens.neutralBg },
  early_override: { fg: tokens.infoFg, bg: tokens.infoBg },
}

/** Soft status tag. */
export function Tag({ children, fg = tokens.neutralFg, bg = tokens.neutralBg }: { children: ReactNode; fg?: string; bg?: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1.1, py: 0.25, borderRadius: 1.5,
      fontSize: '0.72rem', fontWeight: 500, color: fg, bgcolor: bg, whiteSpace: 'nowrap', lineHeight: 1.6 }}>
      {children}
    </Box>
  )
}

export function Flags({ flags }: { flags: string[] }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {flags.map(f => <Tag key={f} {...(FLAG_TONE[f] ?? {})}>{FLAG_LABELS[f] ? t(FLAG_LABELS[f]) : f}</Tag>)}
    </Stack>
  )
}

export function Hint({ title, children }: { title: string; children: ReactNode }) {
  return <Tooltip title={title} arrow><span>{children}</span></Tooltip>
}

/** The number typed in a field ("2,90", "−18"), or null when it's empty. */
export const typedNumber = (text: string) => (text.trim() === '' ? null : Number(text.replace(',', '.').replace('−', '-')))

/**
 * A number typed in (a price, an amount, a temperature): what's typed stays as typed while it's the same
 * number ("2." on the way to "2.90", "2,9", "-" before "-18"), so the decimal point isn't lost as you type
 * it, as it was when the field showed the stored number back after every key. `onNumber` gets the number
 * (null when empty); `blank` is the number an empty field stands for, if any, so it stays empty.
 */
export function DecimalField({ value, onNumber, blank, ...props }: Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: number | null | undefined; onNumber: (n: number | null) => void; blank?: number
}) {
  const v = value ?? null
  const [text, setText] = useState(v === null ? '' : String(v))
  const shown = text.trim() === '' && blank !== undefined && v === blank ? '' : Object.is(typedNumber(text), v) ? text : v === null ? '' : String(v)
  return (
    <TextField inputMode="decimal" {...props} value={shown}
      onChange={e => { setText(e.target.value); onNumber(typedNumber(e.target.value)) }} />
  )
}
