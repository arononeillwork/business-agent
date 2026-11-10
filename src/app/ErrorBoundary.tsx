// When something in the app breaks while it draws a page: a calm screen with a Reload button instead of a
// blank page, and The Business Agent told about it (errorReports.ts). Around the whole app (App.tsx), and
// around each page inside the menu (AppShell.tsx), so a page that breaks leaves the menu to go elsewhere.
// "Tell us what you were doing" sends a problem report (a support ticket, supportReports.ts) linked to the
// error by its fingerprint, so HQ sees what the person says beside the error itself.
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material'
import { Component, useState, type FormEvent, type ReactNode } from 'react'
import { LEGAL } from '../../shared/legal'
import { appErrorFingerprint, type ClientErrorKind } from '../../shared/appErrors'
import { SUPPORT } from '../../shared/supportTickets'
import { t, tr } from '../i18n'
import { reportClientError } from './errorReports'
import { canSendSupport, draftHere, sendSupport } from './supportReports'
import { queryClient, refreshAll } from './query'

/** The screen in place of what broke. `inPage`: inside the menu, where the page would be. `error`: what broke. */
export function ErrorScreen({ inPage = false, error }: { inPage?: boolean; error?: unknown }) {
  return (
    <Box component={inPage ? 'div' : 'main'} sx={{ minHeight: inPage ? '50vh' : '100vh', display: 'grid', placeItems: 'center', px: 2, py: 4,
      bgcolor: inPage ? 'transparent' : 'background.default' }}>
      <Box sx={{ maxWidth: 440, textAlign: 'center' }}>
        <Typography variant="h5" component="h1">{t('Something went wrong')}</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1.5, mb: 3, lineHeight: 1.6 }}>
          {t('The app ran into a problem showing this. We’ve been told about it, and reloading usually sorts it out.')}
        </Typography>
        <Button variant="contained" onClick={() => location.reload()}>{t('Reload')}</Button>
        <TellUs error={error} />
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3 }}>
          {tr('Still stuck? Write to us at {email}.', { email: <Link href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</Link> })}
        </Typography>
      </Box>
    </Box>
  )
}

/** "Tell us what you were doing": a problem report linked to this error, once the app can send one. */
function TellUs({ error }: { error?: unknown }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'writing' | 'sending' | 'sent' | 'already'>('writing')
  const [problem, setProblem] = useState<string | null>(null)
  if (!canSendSupport()) return null
  if (state === 'sent' || state === 'already') {
    return (
      <Alert severity="success" sx={{ mt: 3, textAlign: 'left' }}>
        {state === 'sent' ? t('Thanks. We’ll look into it, and answer you in Help, under Your requests.')
          : t('You already sent us this today: it’s in Help, under Your requests.')}
      </Alert>
    )
  }
  if (!open) return <Box sx={{ mt: 1.5 }}><Button onClick={() => setOpen(true)}>{t('Tell us what you were doing')}</Button></Box>
  const short = text.trim().length < SUPPORT.MIN_LENGTH
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (short) return
    setState('sending')
    setProblem(null)
    try {
      const fingerprint = error === undefined ? null : await appErrorFingerprint(error).catch(() => null)
      const sent = await sendSupport(draftHere('not_working', text, location.pathname, fingerprint))
      setState(sent.duplicate ? 'already' : 'sent')
      // Help's Your requests (and HQ's Support) show it next time they're open.
      void refreshAll(queryClient)
    } catch (err) {
      setProblem(t(err instanceof Error ? err.message : String(err)))
      setState('writing')
    }
  }
  return (
    <Box component="form" onSubmit={send} aria-label={t('Tell us what you were doing')} sx={{ mt: 3, textAlign: 'left' }}>
      <TextField fullWidth multiline minRows={3} autoFocus label={t('What were you doing?')} value={text} onChange={e => setText(e.target.value)}
        helperText={text.trim() && short ? t('Say a little more: at least 10 characters')
          : t('What you opened, pressed or typed just before. It reaches The Business Agent with this error.')}
        slotProps={{ htmlInput: { maxLength: SUPPORT.MAX_LENGTH } }} />
      {problem && <Alert severity="error" sx={{ mt: 1.5 }}>{problem}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
        <Button onClick={() => setOpen(false)} disabled={state === 'sending'}>{t('Cancel')}</Button>
        <Button type="submit" variant="outlined" disabled={short || state === 'sending'}>{t('Send')}</Button>
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

export class AppErrorBoundary extends Component<Props, { failed: boolean; error?: unknown }> {
  state: { failed: boolean; error?: unknown } = { failed: false }

  static getDerivedStateFromError(error?: unknown) {
    return { failed: true, error }
  }

  componentDidCatch(err: unknown) {
    (this.props.report ?? reportClientError)(err, 'render')
  }

  componentDidUpdate(before: Props) {
    if (this.state.failed && before.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? <ErrorScreen inPage={this.props.inPage} error={this.state.error} /> : this.props.children
  }
}
