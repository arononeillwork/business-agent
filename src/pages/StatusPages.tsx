import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { Logo } from '../components/Logo'
import { AgentMark } from './marketing/site'
import { t, tr } from '../i18n'

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

/**
 * Signed in, but switched off by an admin of their business (someone in no business yet creates
 * theirs instead: NewBusinessPage). Shown in Business Agent's own look: until an admin lets them back
 * in, they aren't in any business's app.
 */
export function NotActive() {
  const { api, me } = useApp()
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: '#F5F6FA', color: '#12141A', colorScheme: 'light',
      backgroundImage: 'radial-gradient(900px 420px at 85% -120px, rgba(79,70,229,0.14), transparent 70%)' }}>
      <Box sx={{ width: '100%', maxWidth: 460, p: { xs: 3, sm: 4 }, borderRadius: '24px', bgcolor: '#fff', border: '1px solid #E4E7EE',
        boxShadow: '0 24px 60px -30px rgba(18,20,26,0.35)' }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <AgentMark />
            <Typography sx={{ fontFamily: '"Poppins", system-ui, sans-serif', fontWeight: 500 }}>{'Business Agent'}</Typography>
          </Stack>
          <Typography variant="h5" component="h1" sx={{ fontFamily: '"Poppins", system-ui, sans-serif', fontWeight: 500 }}>
            {me?.full_name ? t("You're registered, {name}", { name: me.full_name.split(' ')[0] }) : t("You're registered")}
          </Typography>
          <Typography sx={{ color: '#4B5160' }}>
            {t("Your account ({email}) isn't linked to a business yet, or it has been switched off.", { email: me?.email ?? '' })}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: '#4B5160', '& li': { mb: 0.75 } }}>
            <li><b>{t('Joining a team?')}</b> {tr("Ask your manager to add {email} on their Team page. You'll get straight in next time you sign in.", { email: <b>{me?.email}</b> })}</li>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => location.reload()} sx={{ bgcolor: '#4F46E5', color: '#fff', '&:hover': { bgcolor: '#3730A3' } }}>{t('Check again')}</Button>
            <Button variant="outlined" onClick={() => api.signOut()} sx={{ borderColor: '#E4E7EE', color: '#12141A' }}>{t('Sign out')}</Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}

/** Signed in, but the business's details didn't load: try again, or sign out to use another account. */
export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  const { api } = useApp()
  return (
    <Panel title={t('Your business didn’t load')}
      action={<Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={retry}>{t('Try again')}</Button>
        <Button variant="outlined" onClick={() => void api.signOut()}>{t('Sign out')}</Button>
      </Stack>}>
      {t('You’re signed in, but the business’s details couldn’t be loaded. Try again, or sign out to use another account. ({message})', { message })}
    </Panel>
  )
}

/** The app couldn't start (server unreachable or misconfigured). Never falls back to sample data. */
export function StartError({ message }: { message: string }) {
  return (
    <Panel title={t("Can't reach the app")}
      action={<Button variant="contained" onClick={() => location.reload()}>{t('Try again')}</Button>}>
      {t('Check your internet connection and try again. ({message})', { message })}
    </Panel>
  )
}
