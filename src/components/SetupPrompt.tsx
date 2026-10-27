import { Alert, AlertTitle, Button } from '@mui/material'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { t } from '../i18n'

/**
 * On Today, for an admin of a business that hasn't been through the set-up guide: a nudge to
 * connect its apps. Gone once the guide is finished or skipped, or once a few apps are connected.
 */
export function SetupPrompt() {
  const { api } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  const connected = data.data?.integrations.filter(i => i.status === 'connected').length ?? 0
  if (!data.data || connected >= 2) return null
  return (
    <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} to="/setup" color="inherit">{t('Start')}</Button>}>
      <AlertTitle>{t('Connect your apps')}</AlertTitle>
      {t('Your till, socials and files, in about three minutes, so your agent can help.')}
    </Alert>
  )
}
