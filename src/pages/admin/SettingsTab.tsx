import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import KeyIcon from '@mui/icons-material/PasswordOutlined'
import GroupIcon from '@mui/icons-material/GroupsOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import CheckIcon from '@mui/icons-material/Check'
import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { ErrorBox, Loading, SectionTitle } from '../../components/common'
import { isAdminPin, type SalesMember } from '../../../shared/salesTeam'
import type { SalesTemplate } from '../../../shared/adminArea'
import { useAdmin, useAdminQuery } from './shared'
import { t } from '../../i18n'

/** Settings: the PIN, who's on the sales team, and the messages to send. */
export function SettingsTab() {
  const { api } = useApp()
  const board = useAdminQuery('sales', tk => api.salesBoard(tk))
  const templates = useAdminQuery('templates', tk => api.salesTemplates(tk))
  const [team, setTeam] = useState(false)
  const [pin, setPin] = useState(false)
  const [editing, setEditing] = useState<Partial<SalesTemplate> | null>(null)
  return (
    <Stack spacing={3}>
      <Box component="section" aria-labelledby="settings-access">
        <SectionTitle><span id="settings-access">{t('Getting in')}</span></SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('The admin area opens with its PIN, on each device for 12 hours or until Lock. A new PIN locks everyone else out.')}
        </Typography>
        <Button variant="outlined" startIcon={<KeyIcon />} onClick={() => setPin(true)}>{t('Change PIN')}</Button>
      </Box>
      <Box component="section" aria-labelledby="settings-team">
        <SectionTitle><span id="settings-team">{t('Sales team')}</span></SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('A lane each on the sales board, and a rep code each, so a café that signs up with it moves along by itself.')}
        </Typography>
        <Button variant="outlined" startIcon={<GroupIcon />} onClick={() => setTeam(true)} disabled={!board.data}>{t('Sales team')}</Button>
      </Box>
      <Box component="section" aria-labelledby="settings-messages">
        <SectionTitle action={<Button startIcon={<AddIcon />} onClick={() => setEditing({ title: '', body: '' })}>{t('Add a message')}</Button>}>
          <span id="settings-messages">{t('Messages to send')}</span>
        </SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Ready to send from a contact: {business}, {me}, {code} and {link} are filled in with the business, the salesperson, their code and their sign-up link.')}
        </Typography>
        <ErrorBox error={templates.error} />
        {!templates.data ? (templates.loading ? <Loading /> : null) : (
          <Stack spacing={1} role="list" aria-label={t('Messages to send')}>
            {templates.data.map(m => (
              <Card key={m.id} role="listitem" aria-label={m.title} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 }, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{m.title}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{m.body}</Typography>
                  </Box>
                  <IconButton onClick={() => setEditing(m)} aria-label={t('Edit {name}', { name: m.title })}><EditIcon fontSize="small" /></IconButton>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
      {team && board.data && <TeamDialog team={board.data.team} onClose={() => setTeam(false)} />}
      {pin && <PinDialog onClose={() => setPin(false)} />}
      {editing && <TemplateDialog start={editing} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

/** A message to send: its name and words; changed, or taken away. */
function TemplateDialog({ start, onClose }: { start: Partial<SalesTemplate>; onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const [title, setTitle] = useState(start.title ?? '')
  const [body, setBody] = useState(start.body ?? '')
  const save = async () => {
    if (await run(() => api.saveSalesTemplate(token, { id: start.id, title, body }), t('{name} saved', { name: title.trim() }))) onClose()
  }
  const remove = async () => {
    if (await run(() => api.deleteSalesTemplate(token, start.id!), t('{name} is gone', { name: start.title ?? '' }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{start.id ? t('Edit {name}', { name: start.title ?? '' }) : t('Add a message')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <TextField label={t('Message')} value={body} onChange={e => setBody(e.target.value)} multiline minRows={4}
            helperText={t('{business}, {me}, {code} and {link} are filled in when it’s sent.')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {start.id && <Button color="error" startIcon={<DeleteIcon />} onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Delete')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!title.trim() || !body.trim()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Who's on the sales team: a lane each. Someone renamed, added, or taken off (their businesses stay, in nobody's lane). */
export function TeamDialog({ team, onClose }: { team: SalesMember[]; onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(team.map(m => [m.id, m.name])))
  const [adding, setAdding] = useState('')
  useEffect(() => setNames(n => ({ ...Object.fromEntries(team.map(m => [m.id, m.name])), ...n })), [team])
  const add = async () => {
    if (await run(() => api.addSalesMember(token, adding), t('{name} has a lane now', { name: adding.trim() }))) setAdding('')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Sales team')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {team.map(m => {
            const v = names[m.id] ?? m.name
            const changed = v.trim() !== m.name && !!v.trim()
            return (
              <Stack key={m.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField size="small" label={t('Name')} value={v} onChange={e => setNames(n => ({ ...n, [m.id]: e.target.value }))} fullWidth
                  helperText={m.code ? t('Code {code}', { code: m.code }) : undefined}
                  slotProps={{ htmlInput: { 'aria-label': t('Name of {name}', { name: m.name }) } }} />
                {changed && (
                  <IconButton onClick={() => void run(() => api.updateSalesMember(token, m.id, { name: v }), t('Saved'))} aria-label={t('Save the name of {name}', { name: m.name })}>
                    <CheckIcon />
                  </IconButton>
                )}
                <IconButton onClick={() => void run(() => api.deleteSalesMember(token, m.id), t('{name} is off the sales team', { name: m.name }))}
                  aria-label={t('Take {name} off the sales team', { name: m.name })}>
                  <DeleteIcon />
                </IconButton>
              </Stack>
            )
          })}
          <Stack component="form" direction="row" spacing={1} sx={{ alignItems: 'center', pt: 1 }} onSubmit={e => { e.preventDefault(); if (adding.trim()) void add() }}>
            <TextField size="small" label={t('Someone new')} value={adding} onChange={e => setAdding(e.target.value)} fullWidth />
            <Button type="submit" variant="outlined" disabled={!adding.trim()}>{t('Add')}</Button>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Someone taken off leaves their businesses on the board, in nobody’s lane, to give to someone else.')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Done')}</Button></DialogActions>
    </Dialog>
  )
}

/** A new PIN: the one in use typed again, the new one twice. Everyone else is locked out until they type it. */
export function PinDialog({ onClose }: { onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12)
  const field = { type: 'password', autoComplete: 'off', slotProps: { htmlInput: { inputMode: 'numeric' as const, pattern: '[0-9]*' } } }
  const mismatch = !!again && again !== next
  const save = async () => {
    if (await run(() => api.adminChangePin(token, current, next), t('The PIN is changed. Everyone else types the new one.'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Change PIN')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('PIN in use now')} value={current} onChange={e => setCurrent(digits(e.target.value))} autoFocus {...field} />
          <TextField label={t('New PIN')} value={next} onChange={e => setNext(digits(e.target.value))} helperText={t('4 to 12 digits')} {...field} />
          <TextField label={t('New PIN again')} value={again} onChange={e => setAgain(digits(e.target.value))} error={mismatch}
            helperText={mismatch ? t('The two aren’t the same') : undefined} {...field} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Anyone else with the admin area open is locked out, and opens it with the new PIN.')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!current || !isAdminPin(next) || next !== again}>{t('Change PIN')}</Button>
      </DialogActions>
    </Dialog>
  )
}
