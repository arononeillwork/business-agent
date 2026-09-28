import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { SectionTitle } from './common'
import { CalendarFeedCard } from './CalendarFeed'
import { AiAssistants } from './AiAssistants'

function MusicStatusCard() {
  const { api } = useApp()
  const mine = useAsync('my-music', () => api.myMusic(), [])
  const names = { spotify: 'Spotify', youtube: 'YouTube Music' } as const
  return (
    <Card component="section" aria-label="My music">
      <CardContent>
        <SectionTitle action={<Button component={RouterLink} to="/music" size="small">Open Music</Button>}>My music</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          Your own Spotify or YouTube Music, for the Music page. Nobody else can see or use your accounts.
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {mine.data?.accounts.length === 0 && <Chip label="Not connected" variant="outlined" />}
          {mine.data?.accounts.map(a => <Chip key={a.provider} color="success" variant="outlined" label={`${names[a.provider]} connected`} />)}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Per person: everything this person connects for themselves (the business's own connections are admin-only). */
export function MyConnections() {
  return (
    <Box component="section" aria-labelledby="my-connections" sx={{ mt: 3 }}>
      <Typography id="my-connections" variant="h6" sx={{ mb: 0.5 }}>My connections</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Just for you. The café's own accounts (Google Maps, WhatsApp number, Instagram, café Spotify) are under Connections, for admins.
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><CalendarFeedCard scope="me" /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><MusicStatusCard /></Grid>
        <Grid size={12}><AiAssistants /></Grid>
      </Grid>
    </Box>
  )
}
