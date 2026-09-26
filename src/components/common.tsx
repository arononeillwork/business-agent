import { Alert, Avatar, Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import type { ReactNode } from 'react'
import { FLAG_LABELS } from '../../shared/types'
import { addDays, formatLocal, today, weekStart } from '../../shared/time'
import { tokens } from '../theme'

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}
      sx={{ mb: 3, alignItems: { md: 'flex-end' }, justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography variant="overline" sx={{ color: tokens.matcha }}>{eyebrow}</Typography>}
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
  const colour = tone === 'danger' ? tokens.danger : tone === 'warning' ? tokens.warning : tone === 'good' ? tokens.matcha : tokens.ink
  return (
    <Box sx={{ flex: '1 1 150px', minWidth: 0, p: 2, borderRadius: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.45rem', fontWeight: 800, color: colour, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>
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
    <Avatar sx={{ bgcolor: colour, width: size, height: size, fontSize: size * 0.38, fontWeight: 800 }}>{initials}</Avatar>
  )
}

export function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  const sunday = addDays(monday, 6)
  const thisWeek = weekStart(today())
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', pl: 0.5 }}>
      <IconButton size="small" aria-label="Previous week" onClick={() => onChange(addDays(monday, -7))}><ChevronLeft /></IconButton>
      <Typography sx={{ minWidth: 132, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatLocal(`${monday}T12:00:00Z`, 'd MMM')} – {formatLocal(`${sunday}T12:00:00Z`, 'd MMM')}
      </Typography>
      <IconButton size="small" aria-label="Next week" onClick={() => onChange(addDays(monday, 7))}><ChevronRight /></IconButton>
      <Button size="small" disabled={monday === thisWeek} onClick={() => onChange(thisWeek)}
        sx={{ borderLeft: 1, borderColor: 'divider', borderRadius: 0, px: 1.5 }}>This week</Button>
    </Stack>
  )
}

const FLAG_TONE: Record<string, { fg: string; bg: string }> = {
  missed_break: { fg: '#8a241a', bg: '#fbecea' },
  over_daily_limit: { fg: '#8a241a', bg: '#fbecea' },
  auto_clock_out: { fg: '#7a4f10', bg: '#fbf3e6' },
  unscheduled: { fg: '#7a4f10', bg: '#fbf3e6' },
  edited: { fg: tokens.inkSoft, bg: '#f0ece8' },
  early_override: { fg: '#1f4d70', bg: '#eef4f9' },
}

/** Soft status tag. */
export function Tag({ children, fg = tokens.inkSoft, bg = '#f0ece8' }: { children: ReactNode; fg?: string; bg?: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.25, borderRadius: 1.5,
      fontSize: '0.72rem', fontWeight: 700, color: fg, bgcolor: bg, whiteSpace: 'nowrap', lineHeight: 1.6 }}>
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
