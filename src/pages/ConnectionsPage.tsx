import { Alert, Box, Grid, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PageHeader } from '../components/common'
import { ConnectionsCard, InstagramCard } from '../components/Connections'
import { ServiceConnections } from '../components/Connectors'
import { CalendarFeedCard } from '../components/CalendarFeed'

/** Admins: the business's own accounts, grouped by what they do. Each person's own connections live on My account. */
export function ConnectionsPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Business connections"
        subtitle="Connect the apps your business already uses. Each one is a single sign-in with that app; you can disconnect any time. Admins only." />
      <Alert severity="info" sx={{ mb: 3 }}>
        Personal connections (my shifts in my calendar, my music, Claude) are on <RouterLink to="/account">My account</RouterLink>; every team member sets up their own.
      </Alert>
      <ServiceConnections />
      <Box component="section" aria-label="Details and settings" sx={{ mt: 4 }}>
        <Typography variant="h6" component="h2">Details and settings</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Google Maps listing, WhatsApp test, Instagram, the café playlist and the team calendar link.</Typography>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 7 }}><ConnectionsCard /></Grid>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={2.5}>
              <CalendarFeedCard scope="business" />
              <InstagramCard />
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </>
  )
}
