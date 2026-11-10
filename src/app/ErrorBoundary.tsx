// When something in the app breaks while it draws a page: a calm screen with a Reload button instead of a
// blank page, and The Business Agent told about it (errorReports.ts). Around the whole app (App.tsx), and
// around each page inside the menu (AppShell.tsx), so a page that breaks leaves the menu to go elsewhere.
import { Box, Button, Link, Typography } from '@mui/material'
import { Component, type ReactNode } from 'react'
import { LEGAL } from '../../shared/legal'
import type { ClientErrorKind } from '../../shared/appErrors'
import { t, tr } from '../i18n'
import { reportClientError } from './errorReports'

/** The screen in place of what broke. `inPage`: inside the menu, where the page would be. */
export function ErrorScreen({ inPage = false }: { inPage?: boolean }) {
  return (
    <Box component={inPage ? 'div' : 'main'} sx={{ minHeight: inPage ? '50vh' : '100vh', display: 'grid', placeItems: 'center', px: 2, py: 4,
      bgcolor: inPage ? 'transparent' : 'background.default' }}>
      <Box sx={{ maxWidth: 440, textAlign: 'center' }}>
        <Typography variant="h5" component="h1">{t('Something went wrong')}</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1.5, mb: 3, lineHeight: 1.6 }}>
          {t('The app ran into a problem showing this. We’ve been told about it, and reloading usually sorts it out.')}
        </Typography>
        <Button variant="contained" onClick={() => location.reload()}>{t('Reload')}</Button>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3 }}>
          {tr('Still stuck? Write to us at {email}.', { email: <Link href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</Link> })}
        </Typography>
      </Box>
    </Box>
  )
}

interface Props {
  children: ReactNode
  inPage?: boolean
  /** When it changes (another page opened), what broke is tried again. */
  resetKey?: string
  /** Where what it catches goes (tests say). */
  report?: (err: unknown, kind: ClientErrorKind) => void
}

export class AppErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    (this.props.report ?? reportClientError)(err, 'render')
  }

  componentDidUpdate(before: Props) {
    if (this.state.failed && before.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? <ErrorScreen inPage={this.props.inPage} /> : this.props.children
  }
}
