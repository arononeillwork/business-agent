import { Card, CardContent, MenuItem, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import { formatLocal } from '../../shared/time'
import { t, tr } from '../i18n'

/**
 * Google Maps once it's connected: which listing to keep in step. The hours look after themselves
 * (the Opening hours page, with the public holidays choice); nothing to push or compare here.
 */
export function GoogleMapsCard() {
  const { api } = useApp()
  const run = useAction()
  const data = useAsync('integrations', () => api.integrations(), [])
  const g = data.data?.integrations.find(i => i.provider === 'google_business')
  if (g?.status !== 'connected' && g?.status !== 'error') return null

  return (
    <Card component="section" aria-label={t('Google Maps settings')}>
      <CardContent>
        <SectionTitle>{'Google Maps'}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {g.account_label}{g.last_sync_at ? ` · ${t('last updated {when}', { when: formatLocal(g.last_sync_at, 'd MMM, HH:mm') })}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: (g.external.locations?.length ?? 0) > 1 ? 1.5 : 0 }}>
          {tr('Your opening hours keep this listing up to date by themselves; whether you close on public holidays is on {hours}.', {
            hours: <RouterLink to="/opening-hours">{t('Opening hours')}</RouterLink> })}
        </Typography>
        {(g.external.locations?.length ?? 0) > 1 && (
          <TextField select size="small" label={t('Listing')} value={g.external.location ?? ''} sx={{ minWidth: 220, width: 'auto' }}
            helperText={t('This Google account manages more than one listing: choose the café’s.')}
            onChange={e => run(async () => { await api.chooseGoogleListing(e.target.value); await data.reload() }, t('Listing chosen'))}>
            {g.external.locations!.map(l => <MenuItem key={l.name} value={l.name}>{l.title}{l.address ? ` · ${l.address}` : ''}</MenuItem>)}
          </TextField>
        )}
      </CardContent>
    </Card>
  )
}
