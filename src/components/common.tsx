import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import type { ReactNode } from 'react'
import { FLAG_LABELS } from '../../shared/types'
import { addDays, formatLocal, today, weekStart } from '../../shared/time'
import { fonts, tokens } from '../theme'

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}
      sx={{ mb: 3, alignItems: { md: 'flex-end' }, justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography variant="overline" sx={{ color: tokens.roseDeep }}>{eyebrow}</Typography>}
        <Typography variant="h4" component="h1">{title}</Typography>
        {subtitle && <Typography sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 640 }}>{subtitle}</Typography>}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>{actions}</Stack>
      )}
    </Stack>
  )
}

/** A small headline figure: label, value and an optional note. */
export function Stat({ label, value, note, tone }: {
  label: string; value: ReactNode; note?: ReactNode; tone?: 'danger' | 'warning' | 'good'
}) {
  const colour = tone === 'danger' ? tokens.danger : tone === 'warning' ? tokens.roseDeep : tone === 'good' ? tokens.matchaDeep : tokens.ink
  return (
    <Box sx={{ flex: '1 1 150px', minWidth: 0, p: 2.25, borderRadius: '18px', bgcolor: 'background.paper', border: 1, borderColor: 'divider',
      boxShadow: '0 12px 28px -20px rgba(120,72,60,0.25)', position: 'relative', overflow: 'hidden',
      '&::before': { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 3, bgcolor: tone === 'danger' ? tokens.danger : tone === 'warning' ? tokens.rose : tone === 'good' ? tokens.matcha : 'transparent' } }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
      <Typography sx={{ fontFamily: fonts.display, fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.02em', color: colour, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>
        {value}
      </Typography>
      {note && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{note}</Typography>}
    </Box>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', mb: 3 }}>{children}</Stack>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1 }}>
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
    <Box sx={{ py: 3, px: 2, textAlign: 'center', color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
      {children}
    </Box>
  )
}

export function PersonAvatar({ name, colour, size = 32 }: { name: string; colour: string; size?: number }) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Avatar sx={{ bgcolor: colour, color: '#fff', width: size, height: size, fontSize: size * 0.38, fontWeight: 600, fontFamily: fonts.display }}>{initials}</Avatar>
  )
}

export function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  const sunday = addDays(monday, 6)
  const thisWeek = weekStart(today())
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', pl: 0.5 }}>
      <IconButton size="small" aria-label="Previous week" onClick={() => onChange(addDays(monday, -7))}><ChevronLeft /></IconButton>
      <Typography sx={{ minWidth: 132, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatLocal(`${monday}T12:00:00Z`, 'd MMM')} – {formatLocal(`${sunday}T12:00:00Z`, 'd MMM')}
      </Typography>
      <IconButton size="small" aria-label="Next week" onClick={() => onChange(addDays(monday, 7))}><ChevronRight /></IconButton>
      <Button size="small" disabled={monday === thisWeek} onClick={() => onChange(thisWeek)}
        sx={{ borderLeft: 1, borderColor: 'divider', borderRadius: 0, px: 1.5 }}>This week</Button>
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
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.25, borderRadius: 1.5,
      fontSize: '0.72rem', fontWeight: 600, color: fg, bgcolor: bg, whiteSpace: 'nowrap', lineHeight: 1.6 }}>
      {children}
    </Box>
  )
}

export function Flags({ flags }: { flags: string[] }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {flags.map(f => <Tag key={f} {...(FLAG_TONE[f] ?? {})}>{FLAG_LABELS[f] ?? f}</Tag>)}
    </Stack>
  )
}

export function Hint({ title, children }: { title: string; children: ReactNode }) {
  return <Tooltip title={title} arrow><span>{children}</span></Tooltip>
}
