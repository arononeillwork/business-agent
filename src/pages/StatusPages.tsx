import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { Logo } from '../components/Logo'

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={2}>
            <Logo size={40} />
            <Typography variant="h6">{title}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>{children}</Typography>
            {action}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

/** Signed in, but not invited or switched off by an admin. */
export function NotActive() {
  const { api, me } = useApp()
  return (
    <Panel title="Your account isn't active yet"
      action={<Button variant="outlined" onClick={() => api.signOut()}>Sign out</Button>}>
      You're signed in as {me?.email}, but this account hasn't been invited to the team. Ask the owner to
      send an invite to this email, then sign in again.
    </Panel>
  )
}

/** The app couldn't start (server unreachable or misconfigured). Never falls back to sample data. */
export function StartError({ message }: { message: string }) {
  return (
    <Panel title="Can't reach the app"
      action={<Button variant="contained" onClick={() => location.reload()}>Try again</Button>}>
      Check your internet connection and try again. ({message})
    </Panel>
  )
}
