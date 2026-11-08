// What HQ's admins do for one business on the Businesses page, each asked again before it's done:
// - make it complimentary (the founding account, or friends & family) with a note saying who it's for,
//   or end that (public.hq_set_complimentary() / hq_end_complimentary(), the hq_actions migration);
// - give its free trial 7, 14 or 30 days more (worker/hq.ts, through Stripe).
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, ListItemText, Menu, MenuItem, Radio, RadioGroup,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import MoreIcon from '@mui/icons-material/MoreVert'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { COMPLIMENTARY_LABEL, type Complimentary } from '../../shared/plans'
import { TRIAL_EXTENSIONS, complimentaryBlock, type TrialExtension } from '../../shared/hqActions'
import { canStillKeep } from '../../shared/accountClosing'
import { formatLocal } from '../../shared/time'
import type { HqBusiness, HqClosure } from '../data/api'
import { t } from '../i18n'

const date = (iso: string) => formatLocal(iso, 'd MMMM yyyy')

/** A closing business's chip: when it closes, or that it has and its data is to be deleted. */
export function closingLabel(c: HqClosure, now = Date.now()): { label: string; closed: boolean } {
  const closed = !canStillKeep(c.closing_requested_at, now)
  return closed ? { label: t('Closed {date}: delete its data', { date: date(c.closes_at) }), closed }
    : { label: t('Closes {date}', { date: date(c.closes_at) }), closed }
}

type Open = 'complimentary' | 'end' | 'trial' | null

export function HqBusinessActions({ business: b, onDone }: { business: HqBusiness; onDone: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [kind, setKind] = useState<Complimentary>('friends_family')
  const [note, setNote] = useState('')
  const [days, setDays] = useState<TrialExtension>(14)
  const [busy, setBusy] = useState(false)
  const blocked = complimentaryBlock(b)
  const show = (o: Open) => { setMenu(null); setOpen(o) }
  const close = () => { if (!busy) setOpen(null) }
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    const ok = await run(fn, done)
    setBusy(false)
    if (ok) { setOpen(null); setNote(''); onDone() }
  }
  const newEnd = b.trial_ends_at ? new Date(Math.max(Date.parse(b.trial_ends_at), Date.now()) + days * 86_400_000).toISOString() : null

  return (
    <>
      <IconButton size="small" aria-label={t('Actions for {name}', { name: b.name })} onClick={e => setMenu(e.currentTarget)}><MoreIcon fontSize="small" /></IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {b.status === 'comped' && !b.is_hq
          ? <MenuItem onClick={() => show('end')}>{t('End complimentary…')}</MenuItem>
          : <MenuItem disabled={!!blocked} onClick={() => show('complimentary')}>
              <ListItemText primary={t('Make complimentary…')} secondary={blocked ? t(blocked) : undefined}
                slotProps={{ secondary: { sx: { whiteSpace: 'normal', maxWidth: 280 } } }} />
            </MenuItem>}
        {b.status === 'trialing' && <MenuItem onClick={() => show('trial')}>{t('Extend free trial…')}</MenuItem>}
      </Menu>

      <Dialog open={open === 'complimentary'} onClose={close} fullWidth maxWidth="xs" aria-labelledby="hq-comp-title">
        <DialogTitle id="hq-comp-title">{t('Make {name} complimentary', { name: b.name })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('Every feature of the top plan, free, with nothing to pay and no card, until you end it.')}
          </Typography>
          <RadioGroup value={kind} onChange={e => setKind(e.target.value as Complimentary)} aria-label={t('Kind of complimentary account')}>
            {(Object.keys(COMPLIMENTARY_LABEL) as Complimentary[]).map(k => (
              <FormControlLabel key={k} value={k} control={<Radio size="small" />} label={t(COMPLIMENTARY_LABEL[k])} />
            ))}
          </RadioGroup>
          <TextField fullWidth multiline minRows={2} sx={{ mt: 1.5 }} label={t('Note')} value={note} onChange={e => setNote(e.target.value)}
            helperText={t('Who it’s for, and why')} slotProps={{ htmlInput: { maxLength: 200 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>{t('Cancel')}</Button>
          <Button variant="contained" disabled={busy || !note.trim()}
            onClick={() => void act(() => api.hqSetComplimentary(b.id, kind, note.trim()), t('{name} is complimentary now', { name: b.name }))}>
            {t('Make complimentary')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open === 'end'} onClose={close} fullWidth maxWidth="xs" aria-labelledby="hq-end-title">
        <DialogTitle id="hq-end-title">{t('End {name}’s complimentary account?', { name: b.name })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('It goes back to the Free plan straight away, and paid features pause. Nothing is deleted. If it has a Stripe subscription, that plan comes back.')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>{t('Cancel')}</Button>
          <Button variant="contained" color="error" disabled={busy}
            onClick={() => void act(() => api.hqEndComplimentary(b.id), t('{name} is on Free now', { name: b.name }))}>
            {t('End complimentary')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open === 'trial'} onClose={close} fullWidth maxWidth="xs" aria-labelledby="hq-trial-title">
        <DialogTitle id="hq-trial-title">{t('Extend {name}’s free trial', { name: b.name })}</DialogTitle>
        <DialogContent>
          <ToggleButtonGroup exclusive size="small" value={days} onChange={(_, v: TrialExtension | null) => v && setDays(v)} aria-label={t('Days more')}>
            {TRIAL_EXTENSIONS.map(n => <ToggleButton key={n} value={n}>{t('{n} days', { n })}</ToggleButton>)}
          </ToggleButtonGroup>
          <Stack spacing={0.5} sx={{ mt: 2 }}>
            {b.trial_ends_at && <Typography variant="body2">{t('Ends now on {date}.', { date: date(b.trial_ends_at) })}</Typography>}
            {newEnd && <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Will end on {date}.', { date: date(newEnd) })}</Typography>}
            <Typography variant="body2" color="text.secondary">{t('Stripe moves the first payment to then. Nothing is charged for the extra days.')}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>{t('Cancel')}</Button>
          <Button variant="contained" disabled={busy}
            onClick={() => void act(() => api.hqExtendTrial(b.id, days), t('{name}’s trial now ends on {date}', { name: b.name, date: newEnd ? date(newEnd) : '' }))}>
            {t('Extend trial')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
