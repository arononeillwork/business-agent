import { Alert, Grid, Stack } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PageHeader } from '../components/common'
import { ConnectionsCard, InstagramCard } from '../components/Connections'
import { CalendarFeedCard } from '../components/CalendarFeed'

/** Admins: the business's own accounts. Each person's own connections live on My account. */
export function ConnectionsPage() {
  return (
    <>
      <PageHeader eyebrow="Whole business" title="Business connections"
        subtitle="The café's own accounts: Google Maps listing, WhatsApp number, Instagram and the café Spotify, plus the team calendar. Admins only." />
      <Alert severity="info" sx={{ mb: 2.5 }}>
        Personal connections (my shifts in my calendar, my music, Claude) are on <RouterLink to="/account">My account</RouterLink>; every team member sets up their own.
      </Alert>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}><ConnectionsCard /></Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2.5}>
            <CalendarFeedCard scope="business" />
            <InstagramCard />
          </Stack>
        </Grid>
      </Grid>
    </>
  )
}
