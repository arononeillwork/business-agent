import { Alert, Box, Button, ButtonBase, Dialog, Grid, Stack, Typography } from '@mui/material'
import BackspaceIcon from '@mui/icons-material/BackspaceOutlined'
import CheckIcon from '@mui/icons-material/CheckCircle'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { PersonAvatar } from '../components/common'
import type { KioskResult } from '../data/api'
import { businessConfig } from '../../shared/business.config'
import { formatDuration, formatLocal, localTime, minutesBetween } from '../../shared/time'
import type { KioskPerson } from '../../shared/types'
import { Logo } from '../components/Logo'

type Action = KioskResult['action']
const ACTION_LABEL: Record<Action, string> = { in: 'Clock in', out: 'Clock out', break_start: 'Start break', break_end: 'End break' }

export function KioskPage() {
  const { api, me, breakTypes } = useApp()
  useTick(15000)
  const roster = useAsync('kiosk-roster', () => api.kioskRoster(), [], { refetchInterval: 30_000 })
  const [person, setPerson] = useState<KioskPerson | null>(null)
  const [action, setAction] = useState<{ action: Action; breakTypeId?: number } | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<KioskResult | null>(null)

  const reset = () => { setPerson(null); setAction(null); setPin(''); setError(null) }

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 5000)
    return () => clearTimeout(t)
  }, [done])

  useEffect(() => {
    if (pin.length !== 4 || !person || !action) return
    api.kioskPunch(person.id, pin, action.action, null, action.breakTypeId ?? null)
      .then(r => { reset(); setDone(r); roster.reload() })
      .catch(e => { setError(e instanceof Error ? e.message : String(e)); setPin('') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const choices = (p: KioskPerson): { action: Action; breakTypeId?: number; label: string }[] =>
    p.status === 'out' ? [{ action: 'in', label: 'Clock in' }]
      : p.status === 'break' ? [{ action: 'break_end', label: 'End break' }]
      : [...breakTypes.map(t => ({ action: 'break_start' as Action, breakTypeId: t.id, label: `Break: ${t.name}` })),
        ...(breakTypes.length ? [] : [{ action: 'break_start' as Action, label: 'Start break' }]),
        { action: 'out' as Action, label: 'Clock out' }]

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'primary.main', color: '#fff', p: { xs: 2, md: 4 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 3 }}>
        <Logo size={44} />
        <Box sx={{ ml: 1.5, flex: 1 }}>
          <Typography variant="h5">{businessConfig.name}</Typography>
          <Typography sx={{ opacity: 0.8, textTransform: 'capitalize' }}>{formatLocal(new Date(), 'EEEE d MMMM')}</Typography>
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatLocal(new Date(), 'HH:mm')}</Typography>
      </Stack>
      {me?.role === 'admin' && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} to="/" color="inherit">Exit</Button>}>
          Preview. On the café tablet, sign in with the kiosk account so it only shows this screen.
        </Alert>
      )}
      {roster.error && <Alert severity="error">{roster.error}</Alert>}
      <Typography variant="h6" sx={{ mb: 2, opacity: 0.9 }}>Tap your name</Typography>
      <Grid container spacing={2}>
        {(roster.data ?? []).map(p => (
          <Grid key={p.id} size={{ xs: 6, sm: 4, md: 3 }}>
            <ButtonBase onClick={() => { setPerson(p); setAction(choices(p).length === 1 ? choices(p)[0] : null) }}
              sx={{ width: '100%', bgcolor: '#ffffff14', borderRadius: 3, p: 2, display: 'flex', flexDirection: 'column',
                gap: 1, border: 2, borderColor: p.status === 'in' ? 'success.light' : p.status === 'break' ? 'warning.light' : 'transparent' }}>
              <PersonAvatar name={p.full_name} colour={p.colour} size={64} />
              <Typography variant="h6">{p.full_name.split(' ')[0]}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {p.status === 'in' && p.since ? `In since ${localTime(p.since)}` : p.status === 'break' && p.since
                  ? `On break · ${formatDuration(minutesBetween(p.since, new Date().toISOString()))}` : 'Not in'}
              </Typography>
            </ButtonBase>
          </Grid>
        ))}
      </Grid>

      <Dialog open={!!person} onClose={reset} fullWidth maxWidth="xs">
        {person && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}><PersonAvatar name={person.full_name} colour={person.colour} size={56} /></Box>
            <Typography variant="h5" sx={{ mt: 1 }}>{person.full_name}</Typography>
            {!person.has_pin && <Alert severity="warning" sx={{ mt: 2 }}>No PIN set yet. Set one in the app under My account, or ask an admin.</Alert>}
            {!action && (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {choices(person).map(c => (
                  <Button key={c.label} size="large" variant={c.action === 'out' ? 'contained' : 'outlined'}
                    color={c.action === 'out' ? 'error' : 'primary'} onClick={() => setAction(c)}>{c.label}</Button>
                ))}
              </Stack>
            )}
            {action && (
              <>
                <Typography sx={{ mt: 1 }} color="text.secondary">{ACTION_LABEL[action.action]}: enter your PIN</Typography>
                <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', my: 2 }}>
                  {[0, 1, 2, 3].map(i => (
                    <Box key={i} sx={{ width: 18, height: 18, borderRadius: '50%', border: 2, borderColor: 'primary.main',
                      bgcolor: i < pin.length ? 'primary.main' : 'transparent' }} />
                  ))}
                </Stack>
                {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
                <Grid container spacing={1}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
                    <Grid key={k} size={4}>
                      <Button fullWidth variant="outlined" sx={{ py: 2, fontSize: 24, height: 76 }} aria-label={k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k}
                        onClick={() => {
                          setError(null)
                          if (k === 'C') setPin('')
                          else if (k === '⌫') setPin(p => p.slice(0, -1))
                          else setPin(p => (p.length < 4 ? p + k : p))
                        }}>
                        {k === '⌫' ? <BackspaceIcon /> : k}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}
            <Button sx={{ mt: 2 }} onClick={reset}>Cancel</Button>
          </Box>
        )}
      </Dialog>

      <Dialog open={!!done} onClose={() => setDone(null)} fullWidth maxWidth="xs">
        {done && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CheckIcon color="success" sx={{ fontSize: 72 }} />
            <Typography variant="h5">{ACTION_LABEL[done.action]}</Typography>
            <Typography variant="h6" color="text.secondary">{done.full_name} · {localTime(done.at)}</Typography>
            {done.summary && (
              <Typography sx={{ mt: 2 }}>
                Today: {localTime(done.summary.clock_in)}–{done.summary.clock_out ? localTime(done.summary.clock_out) : ''} ·{' '}
                <b>{formatDuration(done.summary.paid_minutes)} paid</b>
                {done.summary.flags.includes('missed_break') && <Alert severity="warning" sx={{ mt: 1 }}>No 15-min break recorded</Alert>}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>Closing in 5 seconds</Typography>
          </Box>
        )}
      </Dialog>
    </Box>
  )
}
