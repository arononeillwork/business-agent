// The back-office's support tickets (the Businesses page, HQ's admins only, above Errors): what people in
// every business reported, asked or suggested from Help or the error screen (public.hq_support_tickets(), the
// support_tickets migration), open ones first, with filters by status and kind. Each shows the business, the
// person, when, the page and what they wrote, and its error when it came from the error screen (a link down to
// it under Errors); HQ sets its status and writes a reply, and the person gets a notification for a reply or
// its closing (public.hq_answer_support_ticket()).
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SUPPORT, SUPPORT_KINDS, STATUS_ORDER, hqOrder, type HqSupportTicket, type SupportKind, type SupportStatus } from '../../shared/supportTickets'
import { t, tn } from '../i18n'
import { tokens } from '../theme'
import { Empty, ErrorBox, SectionTitle } from './common'
import { SupportStatusChip, supportKindLabel, supportStatusLabel, supportWhen } from './HelpDialog'

const who = (s: HqSupportTicket) => [s.person ?? t('Someone who has left'), s.business_name ?? `#${s.business_id}`].join(', ')

export function HqSupport() {
  const { api } = useApp()
  const { data, error } = useAsync('hq-support', () => api.hqSupportTickets(), [])
  // The errors listed under Errors, to link a ticket from the error screen to its own.
  const errors = useAsync('hq-errors', () => api.hqErrors(), [])
  const [status, setStatus] = useState<SupportStatus | 'all'>('all')
  const [kind, setKind] = useState<SupportKind | 'all'>('all')
  const [answering, setAnswering] = useState<HqSupportTicket | null>(null)
  const all = hqOrder(data ?? [])
  const list = all.filter(s => (status === 'all' || s.status === status) && (kind === 'all' || s.kind === kind))
  const open = all.filter(s => s.status === 'open').length
  const listed = new Set((errors.data ?? []).map(e => e.fingerprint))
  // HQ's notification about problem reports opens the page here (#support).
  const { hash } = useLocation()
  const loaded = !!data
  useEffect(() => {
    if (hash === '#support' && loaded) document.getElementById('support')?.scrollIntoView({ block: 'start' })
  }, [hash, loaded])
  return (
    <Box component="section" aria-label={t('Support')} id="support" sx={{ mt: 4 }}>
      <SectionTitle action={open > 0 ? <Chip size="small" color="warning" label={tn(open, '{n} open request', '{n} open requests')} /> : undefined}>
        {t('Support')}
      </SectionTitle>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 760 }}>
        {t('What people reported, asked or suggested from Help, open ones first. HQ’s admins get a notification for “Something isn’t working”, at most one every 15 minutes; questions and ideas just wait here. Whoever sent one hears when you reply or close it.')}
      </Typography>
      <ErrorBox error={error} />
      {!!all.length && (
        <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <TextField select size="small" label={t('Status')} value={status} onChange={e => setStatus(e.target.value as SupportStatus | 'all')} sx={{ minWidth: 180 }}>
            <MenuItem value="all">{t('All')}</MenuItem>
            {STATUS_ORDER.map(s => <MenuItem key={s} value={s}>{supportStatusLabel(s)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('Kind')} value={kind} onChange={e => setKind(e.target.value as SupportKind | 'all')} sx={{ minWidth: 220 }}>
            <MenuItem value="all">{t('All')}</MenuItem>
            {SUPPORT_KINDS.map(k => <MenuItem key={k.key} value={k.key}>{t(k.label)}</MenuItem>)}
          </TextField>
        </Stack>
      )}
      {data && !all.length && <Empty>{t('Nobody has sent a request yet.')}</Empty>}
      {!!all.length && !list.length && <Empty>{t('None like that.')}</Empty>}
      {!!list.length && (
        <Stack component="ul" spacing={1.5} aria-label={t('Support requests')} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {list.map(s => (
            <Box component="li" key={s.id} aria-label={who(s)} sx={{ p: 2, border: `1px solid ${tokens.line}`, borderRadius: 3, bgcolor: tokens.surface }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <SupportStatusChip status={s.status} />
                <Chip size="small" label={supportKindLabel(s.kind)} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{who(s)}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>{supportWhen(s.created_at)}</Typography>
              </Stack>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.message}</Typography>
              <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', mt: 1, color: 'text.secondary', fontSize: '0.8rem' }}>
                {s.page && <span>{t('Page')}: <Box component="code" sx={{ fontSize: '0.8rem' }}>{s.page}</Box></span>}
                {s.email && <Link href={`mailto:${s.email}`} underline="hover">{s.email}</Link>}
                {s.app_version && <span title={s.browser ?? undefined}>{t('Version')}: {s.app_version}</span>}
                {s.error_fingerprint && (listed.has(s.error_fingerprint)
                  ? <Link component={RouterLink} to={{ hash: `error-${s.error_fingerprint}` }} underline="hover">{t('See its error')}</Link>
                  : <span>{t('From the error screen (its error isn’t under Errors any more)')}</span>)}
              </Stack>
              {s.reply && (
                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {t('Answered by {name}, {date}', { name: s.replied_by_name ?? t('HQ'), date: s.replied_at ? supportWhen(s.replied_at) : '' })}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.reply}</Typography>
                </Box>
              )}
              <Box sx={{ mt: 1.5 }}>
                <Button size="small" variant="outlined" onClick={() => setAnswering(s)} aria-label={t('Answer {name}', { name: who(s) })}>
                  {s.reply ? t('Change') : t('Answer')}
                </Button>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
      {answering && <AnswerDialog key={answering.id} ticket={answering} onClose={() => setAnswering(null)} />}
    </Box>
  )
}

/** Its status and HQ's reply. A reply on an open ticket makes it Answered, unless another status is chosen after. */
function AnswerDialog({ ticket: s, onClose }: { ticket: HqSupportTicket; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [status, setStatus] = useState<SupportStatus>(s.status)
  const [reply, setReply] = useState(s.reply ?? '')
  const [busy, setBusy] = useState(false)
  const needsReply = status === 'answered' && !reply.trim()
  const save = async () => {
    setBusy(true)
    const ok = await run(() => api.hqAnswerSupportTicket(s.id, status, reply.trim() || null), t('Saved'))
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="hq-answer-title">
      <DialogTitle id="hq-answer-title">{t('Answer {name}', { name: who(s) })}</DialogTitle>
      <DialogContent>
        <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: tokens.surfaceAlt }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{supportKindLabel(s.kind)} · {supportWhen(s.created_at)}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.message}</Typography>
        </Box>
        <TextField select fullWidth size="small" label={t('Status')} value={status} onChange={e => setStatus(e.target.value as SupportStatus)}>
          {STATUS_ORDER.map(x => <MenuItem key={x} value={x}>{supportStatusLabel(x)}</MenuItem>)}
        </TextField>
        <TextField fullWidth multiline minRows={4} sx={{ mt: 2 }} label={t('Your reply')} value={reply}
          onChange={e => {
            setReply(e.target.value)
            if (e.target.value.trim() && (status === 'open' || status === 'looking')) setStatus('answered')
          }}
          helperText={needsReply ? t('Write a reply before marking it answered') : t('They see it under Help → Your requests, and get a notification. Closing it tells them too.')}
          error={needsReply} slotProps={{ htmlInput: { maxLength: SUPPORT.REPLY_MAX } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || needsReply}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
