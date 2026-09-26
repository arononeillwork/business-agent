import { Alert, Avatar, Box, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import type { ReactNode } from 'react'
import { FLAG_LABELS } from '../../shared/types'
import { addDays, formatLocal } from '../../shared/time'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>{actions}</Stack>}
    </Stack>
  )
}

export function Loading() {
  return <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null
}

export function PersonAvatar({ name, colour, size = 32 }: { name: string; colour: string; size?: number }) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return <Avatar sx={{ bgcolor: colour, width: size, height: size, fontSize: size * 0.4 }}>{initials}</Avatar>
}

export function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  const sunday = addDays(monday, 6)
  return (
    <Stack direction="row" sx={{ alignItems: 'center' }}>
      <IconButton aria-label="Previous week" onClick={() => onChange(addDays(monday, -7))}><ChevronLeft /></IconButton>
      <Typography sx={{ minWidth: 150, textAlign: 'center', fontWeight: 600 }}>
        {formatLocal(`${monday}T12:00:00Z`, 'd MMM')} – {formatLocal(`${sunday}T12:00:00Z`, 'd MMM yyyy')}
      </Typography>
      <IconButton aria-label="Next week" onClick={() => onChange(addDays(monday, 7))}><ChevronRight /></IconButton>
    </Stack>
  )
}

const FLAG_COLOURS: Record<string, 'error' | 'warning' | 'default' | 'info'> = {
  missed_break: 'error', over_daily_limit: 'error', auto_clock_out: 'warning', unscheduled: 'warning',
  edited: 'default', early_override: 'info',
}

export function Flags({ flags }: { flags: string[] }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {flags.map(f => <Chip key={f} size="small" color={FLAG_COLOURS[f] ?? 'default'} label={FLAG_LABELS[f] ?? f} />)}
    </Stack>
  )
}

export function Hint({ title, children }: { title: string; children: ReactNode }) {
  return <Tooltip title={title} arrow><span>{children}</span></Tooltip>
}
