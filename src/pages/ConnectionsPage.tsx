import { Box, Card, CardContent, Grid, Typography } from '@mui/material'
import { PageHeader, SectionTitle } from '../components/common'
import { ConnectionsCard, InstagramCard } from '../components/Connections'
import { tokens } from '../theme'

export function ConnectionsPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Connections"
        subtitle="Google Maps, WhatsApp, Instagram and Spotify, plus the AI connector for Claude." />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}><ConnectionsCard /></Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <SectionTitle>Talk to it with AI</SectionTitle>
              <Typography variant="body2">In Claude, open Settings → Connectors → <b>Add custom connector</b> and paste:</Typography>
              <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' }}>
                {location.origin}/mcp
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                Sign in with your team account. Claude can then do what you can do here; each change is logged as made via AI.
              </Typography>
            </CardContent>
          </Card>
          <InstagramCard />
        </Grid>
      </Grid>
    </>
  )
}
