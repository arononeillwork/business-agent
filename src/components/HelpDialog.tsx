// Help, from the account menu (AppShell.tsx): how to reach The Business Agent, the set-up guide (admins),
// asking an AI about the app (AI assistants), and the privacy policy and terms.
// Report a problem: something not working, a question or an idea, as a support ticket (the support_tickets
// migration, shared/supportTickets.ts), with the page they were on, the app's version and their browser. Your
// requests: what they sent, each with its status and HQ's reply. A notification about one of theirs opens Help
// there (?help=requests, useHelp()).
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import SetupIcon from '@mui/icons-material/RocketLaunchOutlined'
import AiIcon from '@mui/icons-material/SmartToyOutlined'
import ReportIcon from '@mui/icons-material/FeedbackOutlined'
import RequestsIcon from '@mui/icons-material/QuestionAnswerOutlined'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { draftHere } from '../app/supportReports'
import { LEGAL } from '../../shared/legal'
import { scrubPath } from '../../shared/appErrors'
import { SUPPORT, SUPPORT_KINDS, newTicketCheck, type SupportKind, type SupportStatus } from '../../shared/supportTickets'
import { locale, t, tc, tn } from '../i18n'
import { tokens } from '../theme'
import { Empty, ErrorBox, Loading } from './common'

export type HelpView = 'home' | 'report' | 'requests'

/**
 * Help, open or not, and at which part: the account menu opens it; a link with ?help=requests (a
 * notification about someone's own request) opens it at Your requests, and the address loses it again.
 */
export function useHelp() {
  const [view, setView] = useState<HelpView | null>(null)
  const [params, setParams] = useSearchParams()
  const asked = params.get('help')
  useEffect(() => {
    if (asked === null) return
    setView(asked === 'requests' ? 'requests' : asked === 'report' ? 'report' : 'home')
    setParams(p => { p.delete('help'); return p }, { replace: true })
  }, [asked, setParams])
  return [view, setView] as const
}

/** A request's status, as the person and HQ see it. */
export function supportStatusLabel(s: SupportStatus): string {
  switch (s) {
    case 'open': return tc('request', 'Open')
    case 'looking': return tc('request', 'Being looked at')
    case 'answered': return tc('request', 'Answered')
    default: return tc('request', 'Closed')
  }
}
const STATUS_COLOR: Record<SupportStatus, 'warning' | 'info' | 'success' | 'default'> = { open: 'warning', looking: 'info', answered: 'success', closed: 'default' }

export function SupportStatusChip({ status }: { status: SupportStatus }) {
  return <Chip size="small" variant="outlined" color={STATUS_COLOR[status]} label={supportStatusLabel(status)} />
}

export const supportKindLabel = (k: SupportKind) => t(SUPPORT_KINDS.find(x => x.key === k)?.label ?? k)
export const supportWhen = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function HelpDialog({ view: first = 'home', onClose }: { view?: HelpView; onClose: () => void }) {
  const [view, setView] = useState<HelpView>(first)
  // The page they were on when they opened Help, sent with a problem they report.
  const { pathname } = useLocation()
  const [page] = useState(pathname)
  const title = view === 'report' ? t('Report a problem') : view === 'requests' ? t('Your requests') : t('Help')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="help-title">
      <DialogTitle id="help-title">{title}</DialogTitle>
      {view === 'home' && <HelpHome onView={setView} onClose={onClose} />}
      {view === 'report' && <ReportProblem page={page} onSent={() => setView('requests')} onBack={() => setView('home')} />}
      {view === 'requests' && <YourRequests onReport={() => setView('report')} onBack={() => setView('home')} onClose={onClose} />}
    </Dialog>
  )
}

const row = { px: 1.5, borderRadius: '12px', alignItems: 'flex-start' }
const icon = { minWidth: 40, mt: 0.5, color: 'text.secondary' }

function HelpHome({ onView, onClose }: { onView: (v: HelpView) => void; onClose: () => void }) {
  const { api, isAdmin, permissions } = useApp()
  const mine = useAsync('my-support', () => api.mySupportTickets(), [])
  const n = mine.data?.length ?? 0
  return (
    <>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary', mb: 1 }}>{t('Questions, a problem or an idea? Here’s where to start.')}</Typography>
        <List disablePadding>
          <ListItemButton onClick={() => onView('report')} sx={row}>
            <ListItemIcon sx={icon}><ReportIcon /></ListItemIcon>
            <ListItemText primary={t('Report a problem')}
              secondary={t('Something not working, a question or an idea: tell us here, and we’ll answer you in the app.')} />
          </ListItemButton>
          <ListItemButton onClick={() => onView('requests')} sx={row}>
            <ListItemIcon sx={icon}><RequestsIcon /></ListItemIcon>
            <ListItemText primary={t('Your requests')}
              secondary={n ? tn(n, '{n} request, with its status and our answer', '{n} requests, with their status and our answers') : t('What you send us, and our answers.')} />
          </ListItemButton>
          <ListItem disableGutters sx={row}>
            <ListItemIcon sx={icon}><MailIcon /></ListItemIcon>
            <ListItemText primary={t('Write to The Business Agent')}
              secondary={<>
                <Link href={`mailto:${LEGAL.supportEmail}`} sx={{ display: 'inline-block', my: 0.25 }}>{LEGAL.supportEmail}</Link>
                <Box component="span" sx={{ display: 'block' }}>{t('We read every message, and answer as soon as we can.')}</Box>
              </>} />
          </ListItem>
          {isAdmin && (
            <ListItemButton component={RouterLink} to="/setup" onClick={onClose} sx={row}>
              <ListItemIcon sx={icon}><SetupIcon /></ListItemIcon>
              <ListItemText primary={t('Set-up guide')} secondary={t('Connect your apps and finish setting up, a step at a time.')} />
            </ListItemButton>
          )}
          {permissions.ai !== 'none' && (
            <ListItemButton component={RouterLink} to="/ai-assistants" onClick={onClose} sx={row}>
              <ListItemIcon sx={icon}><AiIcon /></ListItemIcon>
              <ListItemText primary={t('Ask an AI assistant')}
                secondary={t('Connect Claude, ChatGPT or another AI on AI assistants, then ask it how to do something in the app, or to do it for you.')} />
            </ListItemButton>
          )}
        </List>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2, px: 1.5 }}>
          <Link component={RouterLink} to="/privacy" variant="body2" underline="hover" onClick={onClose}>{t('Privacy policy')}</Link>
          <Link component={RouterLink} to="/terms" variant="body2" underline="hover" onClick={onClose}>{t('Terms of service')}</Link>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </>
  )
}

const LABEL: Record<SupportKind, () => string> = {
  not_working: () => t('What happened?'),
  question: () => t('Your question'),
  idea: () => t('Your idea'),
}

/** Report a problem: what kind, and what happened. The limits are checked here first, as the database does. */
function ReportProblem({ page, onSent, onBack }: { page: string; onSent: () => void; onBack: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const mine = useAsync('my-support', () => api.mySupportTickets(), [])
  const [kind, setKind] = useState<SupportKind>('not_working')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const check = newTicketCheck(mine.data ?? [], text)
  const short = text.trim().length < SUPPORT.MIN_LENGTH
  const full = check.full && check.duplicate === null
  const send = async () => {
    setBusy(true)
    const sent = { duplicate: false }
    const ok = await run(async () => {
      // What the database says when it refuses one, in the person's language.
      const r = await api.reportProblem(draftHere(kind, text, page)).catch((e: unknown) => { throw new Error(t(e instanceof Error ? e.message : String(e))) })
      sent.duplicate = r.duplicate
    })
    setBusy(false)
    if (!ok) return
    notify(sent.duplicate ? t('You already sent us this today: it’s under Your requests.') : t('Sent. We’ll answer you here, under Your requests.'), 'success')
    onSent()
  }
  const hint = full ? t('You’ve sent us 5 requests today, the most there can be in a day. Send more tomorrow, or write to us by email.')
    : check.duplicate !== null ? t('You already sent us this today.')
      : text.trim() && short ? t('Say a little more: at least 10 characters')
        : ' '
  return (
    <>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Tell us what happened, what you’d like to know, or what would make the app better. We answer you here, under Your requests.')}
        </Typography>
        <RadioGroup value={kind} onChange={e => setKind(e.target.value as SupportKind)} aria-label={t('What is it?')}>
          {SUPPORT_KINDS.map(k => <FormControlLabel key={k.key} value={k.key} control={<Radio size="small" />} label={t(k.label)} />)}
        </RadioGroup>
        <TextField fullWidth multiline minRows={4} sx={{ mt: 1.5 }} label={LABEL[kind]()} value={text} onChange={e => setText(e.target.value)}
          error={full} helperText={hint} slotProps={{ htmlInput: { maxLength: SUPPORT.MAX_LENGTH } }} />
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
          {t('The page you were on ({page}), the app’s version and your browser go with it, to help us look into it.', { page: scrubPath(page) })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onBack} disabled={busy}>{t('Back')}</Button>
        <Button variant="contained" onClick={() => void send()} disabled={busy || short || full}>{t('Send')}</Button>
      </DialogActions>
    </>
  )
}

/** Your requests: each with its kind, when, its status and, once there is one, HQ's reply. */
function YourRequests({ onReport, onBack, onClose }: { onReport: () => void; onBack: () => void; onClose: () => void }) {
  const { api } = useApp()
  const { data, error } = useAsync('my-support', () => api.mySupportTickets(), [])
  const list = data ?? []
  return (
    <>
      <DialogContent>
        <ErrorBox error={error} />
        {!data && !error && <Loading />}
        {data && !list.length && <Empty>{t('You haven’t sent us anything yet.')}</Empty>}
        {!!list.length && (
          <Stack component="ul" spacing={1.5} aria-label={t('Your requests')} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {list.map(r => (
              <Box component="li" key={r.id} sx={{ p: 1.5, border: `1px solid ${tokens.line}`, borderRadius: 2 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                  <SupportStatusChip status={r.status} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{supportKindLabel(r.kind)} · {supportWhen(r.created_at)}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.message}</Typography>
                {r.reply && (
                  <Box sx={{ mt: 1, p: 1.25, borderRadius: 1.5, bgcolor: tokens.surfaceAlt }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      {r.replied_at ? t('The Business Agent answered, {date}', { date: supportWhen(r.replied_at) }) : t('The Business Agent answered')}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.reply}</Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        )}
        {data && list.length > 0 && !list.some(r => r.reply) && (
          <Alert severity="info" sx={{ mt: 2 }}>{t('We answer here, and you get a notification when we do.')}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onBack}>{t('Back')}</Button>
        <Button onClick={onReport}>{t('Report a problem')}</Button>
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </>
  )
}
