import {
  Alert, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import { DAY_KEYS, type OpeningHours } from '../../shared/types'
import { addDays, formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** Google Maps settings once it's connected: which listing, push hours, compare with Google. */
export function GoogleMapsCard() {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const data = useAsync('integrations', () => api.integrations(), [])
  const [compare, setCompare] = useState<OpeningHours | null>(null)
  const g = data.data?.integrations.find(i => i.provider === 'google_business')
  const waiting = data.data?.queue.filter(q => q.status === 'pending').length ?? 0
  const failing = data.data?.queue.filter(q => q.status !== 'pending').length ?? 0
  if (g?.status !== 'connected' && g?.status !== 'error') return null

  return (
    <Card component="section" aria-label={t('Google Maps settings')}>
      <CardContent>
        <SectionTitle>{'Google Maps'}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {g.account_label}{g.last_sync_at ? ` · ${t('last updated {when}', { when: formatLocal(g.last_sync_at, 'd MMM, HH:mm') })}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Opening hours stay the same in both: changes here reach Google in a minute, changes made on Google Maps come in within 15 minutes.')}
        </Typography>
        {(waiting > 0 || failing > 0) && (
          <Alert severity={failing ? 'warning' : 'info'} sx={{ mb: 1.5 }}>
            {waiting > 0 && `${tn(waiting, '{n} update waiting to send.', '{n} updates waiting to send.')} `}
            {failing > 0 && t('{n} failed and will be retried automatically.', { n: failing })}
          </Alert>
        )}
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {(g.external.locations?.length ?? 0) > 1 && (
            <TextField select size="small" label={t('Listing')} value={g.external.location ?? ''} sx={{ minWidth: 220, width: 'auto' }}
              onChange={e => run(async () => { await api.chooseGoogleListing(e.target.value); await data.reload() }, t('Listing chosen'))}>
              {g.external.locations!.map(l => <MenuItem key={l.name} value={l.name}>{l.title}{l.address ? ` · ${l.address}` : ''}</MenuItem>)}
            </TextField>
          )}
          <Button size="small" variant="contained" onClick={() => run(async () => { await api.syncGoogleNow(); await data.reload() }, t('Google updated with the app’s hours'))}>
            {t('Push hours to Google')}
          </Button>
          <Button size="small" variant="outlined" onClick={() => run(async () => setCompare(await api.googleHours()))}>{t('Compare with Google')}</Button>
          <FormControlLabel sx={{ ml: 0 }} control={<Checkbox size="small" checked={!!g.external.closed_on_holidays}
            onChange={e => run(async () => { await api.chooseGoogleListing(null, e.target.checked); await data.reload() }, t('Saved'))} />}
            label={<Typography variant="body2">{t('We close on public holidays')}</Typography>} />
        </Stack>
      </CardContent>

      <Dialog open={!!compare} onClose={() => setCompare(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t('Opening hours: app vs Google')}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead><TableRow><TableCell>{t('Day')}</TableCell><TableCell>{t('In the app')}</TableCell><TableCell>{t('On Google')}</TableCell></TableRow></TableHead>
            <TableBody>
              {DAY_KEYS.map(d => {
                const a = business?.opening_hours[d]; const b = compare?.[d]
                const fmt = (h?: { open: string; close: string } | null) => (h ? `${h.open}–${h.close}` : t('Closed'))
                const differs = fmt(a) !== fmt(b)
                return (
                  <TableRow key={d} sx={{ bgcolor: differs ? tokens.warnBg : undefined }}>
                    <TableCell sx={{ textTransform: 'capitalize', fontWeight: 500 }}>{formatLocal(`${addDays('2026-01-05', DAY_KEYS.indexOf(d))}T12:00:00Z`, 'EEEE') /* a Monday onwards: the day's name */}</TableCell>
                    <TableCell>{fmt(a)}</TableCell>
                    <TableCell sx={{ fontWeight: differs ? 800 : 400 }}>{fmt(b)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setCompare(null)}>{t('Close')}</Button>
          <Button variant="outlined" onClick={() => run(async () => {
            await api.updateBusiness({ opening_hours: compare! }); await refresh(); setCompare(null)
          }, t('App now uses Google’s hours'))}>{t('Use Google’s hours in the app')}</Button>
          <Button variant="contained" onClick={() => run(async () => { await api.syncGoogleNow(); setCompare(null); await data.reload() },
            t('Google updated with the app’s hours'))}>{t('Put the app’s hours on Google')}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
