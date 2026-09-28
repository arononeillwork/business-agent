import { Alert, Box, Grid, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PageHeader } from '../components/common'
import { GoogleMapsCard, InstagramCard } from '../components/Connections'
import { CheckAllButton, ServiceConnections, useConnectResult } from '../components/Connectors'
import { CalendarFeedCard } from '../components/CalendarFeed'

/** Admins: the business's own apps, like an AI's connectors. Each person's own connections live on My account. */
export function ConnectionsPage() {
  useConnectResult()
  return (
    <>
      <PageHeader eyebrow="Settings" title="Business connections" actions={<CheckAllButton />}
        subtitle="Connect the apps your business already uses: one sign-in each, and one app per kind (Gmail or Outlook, Drive or OneDrive). An app shows as connected only once it has really worked, and it's checked again every night." />
      <Alert severity="info" sx={{ mb: 3 }}>
        Personal connections (my shifts in my calendar, my music, AI assistants) are on <RouterLink to="/account">My account</RouterLink>; every team member sets up their own.
      </Alert>
      <ServiceConnections />
      <Box component="section" aria-label="Settings for connected apps" sx={{ mt: 4 }}>
        <Typography variant="h6" component="h2">Settings for connected apps</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>The team calendar link, your Google Maps listing and Instagram.</Typography>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Stack spacing={2.5}>
              <CalendarFeedCard scope="business" />
              <GoogleMapsCard />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}><InstagramCard /></Grid>
        </Grid>
      </Box>
    </>
  )
}
