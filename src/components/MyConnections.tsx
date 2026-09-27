import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { SectionTitle } from './common'
import { CalendarFeedCard } from './CalendarFeed'
import { tokens } from '../theme'

/** Talk to the app from Claude: each person signs in with their own account and gets their own tools. */
export function AiConnectorCard() {
  return (
    <Card component="section" aria-label="AI connector">
      <CardContent>
        <SectionTitle>Claude (AI connector)</SectionTitle>
        <Typography variant="body2">In Claude, open Settings → Connectors → <b>Add custom connector</b> and paste:</Typography>
        <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' }}>
          {location.origin}/mcp
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Sign in with your own team account. Claude can then do what you can do here, nothing more; each change is logged as made via AI.
        </Typography>
      </CardContent>
    </Card>
  )
}

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
        <Grid size={{ xs: 12, md: 6 }}><Stack spacing={2}><MusicStatusCard /><AiConnectorCard /></Stack></Grid>
      </Grid>
    </Box>
  )
}
