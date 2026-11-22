import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import InstagramIcon from '@mui/icons-material/Instagram'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/MailOutlined'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useAction, useNotify } from '../../app/Notify'
import { ErrorBox, Loading, Tag } from '../../components/common'
import { formatLocal } from '../../../shared/time'
import { PROSPECT_KINDS, prospectStageLabel, type Prospect, type SalesMember } from '../../../shared/salesTeam'
import {
  LOGGED_KINDS, activityLabel, emailLink, fillTemplate, instagramMessageLink, whatsAppMessageLink, type ActivityKind, type SalesActivity,
} from '../../../shared/adminArea'
import { tokens } from '../../theme'
import { signUpLink, useAdmin, useAdminQuery } from './shared'
import { t } from '../../i18n'

const when = (at: string) => formatLocal(at, 'd MMM yyyy, HH:mm')

/**
 * A contact, opened: a message to send (a ready one with the business, the salesperson, their code and
 * link filled in; copied, or opened in Instagram, WhatsApp or email, which logs it), what happened
 * logged in a tap (a call, a visit, a note), when to follow up, and its history, newest first.
 */
export function ContactDialog({ prospect: p, team, onClose, onEdit }: { prospect: Prospect; team: SalesMember[]; onClose: () => void; onEdit: (p: Prospect) => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const notify = useNotify()
  const history = useAdminQuery('activity', tk => api.prospectActivity(tk, p.id), [p.id])
  const templates = useAdminQuery('templates', tk => api.salesTemplates(tk))
  const member = team.find(m => m.id === p.member_id) ?? null
  const [pick, setPick] = useState('')
  const [note, setNote] = useState('')
  const [followUp, setFollowUp] = useState(p.follow_up_on ?? '')
  const list = templates.data ?? []
  const chosen = list.find(x => x.id === pick) ?? list.find(x => (p.kind === 'partner') === /partner/i.test(x.title)) ?? list[0]
  const text = chosen ? fillTemplate(chosen.body, {
    business: p.name, me: member?.name ?? 'The Business Agent', code: member?.code ?? null,
    link: member?.code ? signUpLink(member.code) : location.origin,
  }) : ''

  const log = (kind: ActivityKind, words: string | null, done?: string) => run(() => api.logActivity(token, p.id, kind, words), done)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify(t('Copied'), 'success') } catch { notify(t('Select the message and copy it'), 'info') }
  }
  // Sent from here: copied too (Instagram's chat opens empty), and kept in the history.
  const sendBy = async (kind: 'instagram' | 'whatsapp' | 'email') => {
    try { await navigator.clipboard.writeText(text) } catch { /* the message is on screen to copy */ }
    void log(kind, chosen ? t('Sent “{title}”', { title: chosen.title }) : null)
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>{p.name}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
          <Tag>{t(prospectStageLabel(p.stage))}</Tag>
          <Tag fg={tokens.ubeDeep} bg={tokens.ubeSoft}>{t(PROSPECT_KINDS.find(k => k.id === (p.kind ?? 'customer'))!.label)}</Tag>
          <Tag>{member ? member.name : t('Nobody’s yet')}</Tag>
          {p.town && <Tag>{p.town}</Tag>}
        </Stack>

        <Box component="section" aria-label={t('Send a message')}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('Send a message')}</Typography>
          {!templates.data ? (templates.loading ? <Loading /> : <ErrorBox error={templates.error} />) : list.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No messages yet: add them in Settings.')}</Typography>
          ) : (
            <Stack spacing={1.25}>
              <TextField select size="small" label={t('Message')} value={chosen?.id ?? ''} onChange={e => setPick(e.target.value)}>
                {list.map(x => <MenuItem key={x.id} value={x.id}>{x.title}</MenuItem>)}
              </TextField>
              <TextField value={text} multiline minRows={3} slotProps={{ htmlInput: { readOnly: true, 'aria-label': t('The message, filled in') } }} />
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<CopyIcon />} onClick={() => void copy()}>{t('Copy')}</Button>
                {p.instagram && (
                  <Button size="small" startIcon={<InstagramIcon />} href={instagramMessageLink(p.instagram)} target="_blank" rel="noopener"
                    onClick={() => void sendBy('instagram')}>{t('Message on Instagram')}</Button>
                )}
                {p.phone && (
                  <Button size="small" startIcon={<WhatsAppIcon />} href={whatsAppMessageLink(p.phone, text)} target="_blank" rel="noopener"
                    onClick={() => void sendBy('whatsapp')}>{t('Send on WhatsApp')}</Button>
                )}
                {p.email && (
                  <Button size="small" startIcon={<EmailIcon />} href={emailLink(p.email, text)} onClick={() => void sendBy('email')}>{t('Send by email')}</Button>
                )}
              </Stack>
              {p.instagram && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Instagram opens the chat empty: the message is copied, to paste.')}</Typography>}
            </Stack>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box component="section" aria-label={t('What happened')}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('What happened')}</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.25 }}>
            {LOGGED_KINDS.filter(k => k.id !== 'note').map(k => (
              <Chip key={k.id} label={t(k.label)} variant="outlined" onClick={() => void log(k.id, note.trim() || null, t('{what} logged', { what: t(k.label) })).then(ok => ok && setNote(''))} />
            ))}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField size="small" label={t('A note')} value={note} onChange={e => setNote(e.target.value)} fullWidth multiline maxRows={4}
              placeholder={t('Who you spoke to, what they said')} />
            <Button variant="outlined" disabled={!note.trim()} onClick={() => void log('note', note.trim(), t('Note added')).then(ok => ok && setNote(''))}>{t('Add')}</Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
            <TextField size="small" type="date" label={t('Follow up on')} value={followUp} onChange={e => setFollowUp(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }} />
            <Button size="small" disabled={followUp === (p.follow_up_on ?? '')}
              onClick={() => void run(() => api.saveProspect(token, { id: p.id, follow_up_on: followUp || null }),
                followUp ? t('Follow up {date}', { date: formatLocal(`${followUp}T12:00:00Z`, 'd MMM') }) : t('No follow-up'))}>{t('Save')}</Button>
          </Stack>

          <ErrorBox error={history.error} />
          {history.data && (
            <Stack component="ol" aria-label={t('History')} spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2 }}>
              {history.data.map(a => <HistoryLine key={a.id} a={a} />)}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<EditIcon />} onClick={() => onEdit(p)} sx={{ mr: 'auto' }}>{t('Edit')}</Button>
        <Button onClick={onClose}>{t('Done')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function HistoryLine({ a }: { a: SalesActivity }) {
  const what = a.kind === 'stage' && a.stage ? t('Moved to {stage}', { stage: t(prospectStageLabel(a.stage)) }) : t(activityLabel(a.kind))
  return (
    <Box component="li" sx={{ borderLeft: 2, borderColor: a.kind === 'paid' || a.kind === 'signed_up' ? tokens.goodFg : 'divider', pl: 1.25 }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{what}</Typography>
      {a.note && <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{a.note}</Typography>}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{when(a.at)}</Typography>
    </Box>
  )
}
