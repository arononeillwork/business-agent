import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { Logo } from '../components/Logo'

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={2}>
            <Logo size={88} />
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
    <Panel title="Your account isn't active"
      action={<Button variant="outlined" onClick={() => api.signOut()}>Sign out</Button>}>
      You're signed in as {me?.email}, but this account isn't active: either it hasn't been invited yet or
      an admin has switched it off. Ask an admin at Easy Beans to invite this email or turn it back on.
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
