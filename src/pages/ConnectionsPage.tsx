import { Alert, Box, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PageHeader } from '../components/common'
import { GoogleMapsCard } from '../components/Connections'
import { CheckAllButton, ServiceConnections, useConnectResult } from '../components/Connectors'
import { CalendarFeedCard } from '../components/CalendarFeed'
import { RefreshSchedule } from '../components/Freshness'
import { t, tr } from '../i18n'

/** Admins: the business's own apps, like an AI's connectors. Each person's own connections live on My account. */
export function ConnectionsPage() {
  useConnectResult()
  return (
    <>
      <PageHeader eyebrow={t('Settings')} title={t('Business connections')} actions={<CheckAllButton />} />
      <Alert severity="info" sx={{ mb: 3 }}>
        {tr('Personal connections (my shifts in my calendar, my music, AI assistants) are on {account}; every team member sets up their own.', { account: <RouterLink to="/account">{t('My account')}</RouterLink> })}
      </Alert>
      <ServiceConnections />
      <Box component="section" aria-label={t('Settings for connected apps')} sx={{ mt: 4 }}>
        <Typography variant="h6" component="h2">{t('Settings for connected apps')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('The team calendar link and your Google Maps listing.')}</Typography>
        <Stack spacing={2.5}>
          <CalendarFeedCard scope="business" />
          <GoogleMapsCard />
        </Stack>
      </Box>
      <RefreshSchedule />
    </>
  )
}
