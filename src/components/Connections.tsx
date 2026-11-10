import { Alert, Box, Button, Card, CardContent, Link, Stack, Typography } from '@mui/material'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { useEffect, useRef } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle, Tag } from './common'
import { formatLocal } from '../../shared/time'
import type { GoogleListing } from '../../shared/types'
import { likelyListing, sameListing } from '../../shared/googleListings'
import { tokens } from '../theme'
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
  const listings = g?.external.locations ?? []
  // Several listings kept from before Google's word on each was read: read them again once (the connection's check does).
  const asked = useRef(false)
  const unread = listings.length > 1 && listings.every(l => l.verified === undefined)
  useEffect(() => {
    if (!unread || asked.current) return
    asked.current = true
    api.checkConnection('google_business').then(() => data.reload(), () => {})
  }, [unread, api, data])
  if (g?.status !== 'connected' && g?.status !== 'error') return null
  const likely = likelyListing(listings)

  return (
    <Card component="section" aria-label={t('Google Maps settings')}>
      <CardContent>
        <SectionTitle>{'Google Maps'}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {g.account_label}{g.last_sync_at ? ` · ${t('last updated {when}', { when: formatLocal(g.last_sync_at, 'd MMM, HH:mm') })}` : ''}
        </Typography>
        {(g.external.location || listings.length < 2) && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: listings.length > 1 ? 1.5 : 0 }}>
            {tr('Your opening hours keep this listing up to date by themselves; whether you close on public holidays is on {hours}.', {
              hours: <RouterLink to="/opening-hours">{t('Opening hours')}</RouterLink> })}
          </Typography>
        )}
        {listings.length > 1 && <>
          {!g.external.location && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {t('This Google account manages {n} listings. Nothing is sent to Google until you choose the café’s: the one Google has verified for you, with your reviews. Another one at the same address is a duplicate to remove on Google Business Profile.', { n: listings.length })}
            </Alert>
          )}
          <Box component="ul" aria-label={t('Listings')} sx={{ m: 0, p: 0, listStyle: 'none', border: `1px solid ${tokens.line}`, borderRadius: 2.5, overflow: 'hidden' }}>
            {listings.map(l => <ListingRow key={l.name} listing={l} listings={listings} chosen={g.external.location === l.name} likely={likely?.name === l.name}
              onChoose={() => run(async () => { await api.chooseGoogleListing(l.name); await data.reload() }, t('Listing chosen'))} />)}
          </Box>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
            {t('Choosing one sends it your opening hours and phone from the app straight away.')}
          </Typography>
        </>}
      </CardContent>
    </Card>
  )
}

/** One of the account's listings: its name and address, what Google says of it, its page on Maps, and choosing it. */
function ListingRow({ listing: l, listings, chosen, likely, onChoose }: {
  listing: GoogleListing; listings: GoogleListing[]; chosen: boolean; likely: boolean; onChoose: () => void
}) {
  const twin = !!l.duplicate_of && listings.some(x => x.name !== l.name && sameListing(x.name, l.duplicate_of!))
  return (
    <Stack component="li" aria-label={l.address ? `${l.title}, ${l.address}` : l.title} direction={{ xs: 'column', sm: 'row' }}
      sx={{ gap: 1.5, px: 2, py: 1.5, alignItems: { sm: 'center' }, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 },
        ...(chosen && { bgcolor: tokens.surfaceAlt }) }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{l.title}</Typography>
        {l.address && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{l.address}</Typography>}
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {l.verified === true && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Verified')}</Tag>}
          {l.verified === false && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Not verified')}</Tag>}
          {l.duplicate_of && <Tag fg={tokens.badFg} bg={tokens.badBg}>{twin ? t('Google says it duplicates the other one') : t('Google says it’s a duplicate')}</Tag>}
          {l.closed && <Tag fg={tokens.badFg} bg={tokens.badBg}>{l.closed === 'permanently' ? t('Closed permanently') : t('Closed for now')}</Tag>}
          {likely && !chosen && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Most likely the café’s')}</Tag>}
          {l.maps_url && (
            <Link href={l.maps_url} target="_blank" rel="noopener" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {t('See it on Google Maps')}<OpenIcon sx={{ fontSize: 14 }} />
            </Link>
          )}
        </Stack>
      </Box>
      {chosen
        ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Kept up to date')}</Tag>
        : <Button size="small" variant={likely ? 'contained' : 'outlined'} onClick={onChoose} sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
            aria-label={t('Use {listing}', { listing: l.address ? `${l.title}, ${l.address}` : l.title })}>{t('Use this listing')}</Button>}
    </Stack>
  )
}
