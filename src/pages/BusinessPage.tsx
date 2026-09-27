import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import MapIcon from '@mui/icons-material/MapOutlined'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle, Tag } from '../components/common'
import { DAY_KEYS, type Business, type DayKey } from '../../shared/types'
import { dayKey, formatLocal, hmToMinutes, localTime, today } from '../../shared/time'
import { tokens } from '../theme'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}
const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', slack: 'Slack', sms: 'Text message' }

function openStatus(b: Business) {
  const h = b.opening_hours[dayKey(today())]
  if (!h) return { open: false, text: 'Closed today' }
  const now = hmToMinutes(localTime(new Date()))
  if (now < hmToMinutes(h.open)) return { open: false, text: `Opens at ${h.open}` }
  if (now >= hmToMinutes(h.close)) return { open: false, text: `Closed now · today ${h.open}–${h.close}` }
  return { open: true, text: `Open now · closes at ${h.close}` }
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ color: tokens.inkFaint, pt: 0.25, display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
        <Box sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{children}</Box>
      </Box>
    </Stack>
  )
}

export function BusinessPage() {
  const { api, business: b, isAdmin } = useApp()
  const notes = useAsync('admin-notes', () => (isAdmin ? api.adminNotes() : Promise.resolve(null)), [isAdmin])
  const [editing, setEditing] = useState<'details' | 'notes' | null>(null)
  if (!b) return null
  const status = openStatus(b)
  const todayKey = dayKey(today())
  const edit = (what: typeof editing) => isAdmin && (
    <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(what)}>Edit</Button>
  )

  return (
    <>
      <PageHeader eyebrow="Business" title={b.name}
        subtitle={[b.business_type, b.address].filter(Boolean).join(' · ')}
        actions={<Tag fg={status.open ? tokens.goodFg : tokens.neutralFg} bg={status.open ? tokens.goodBg : tokens.neutralBg}>● {status.text}</Tag>} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={edit('details')}>Contact</SectionTitle>
              <InfoRow icon={<PlaceIcon fontSize="small" />} label="Address">
                {b.address ? <Link href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.address}</Link> : '—'}
              </InfoRow>
              <InfoRow icon={<PhoneIcon fontSize="small" />} label="Phone">{b.phone ?? '—'}</InfoRow>
              <InfoRow icon={<MailIcon fontSize="small" />} label="Email">{b.email ?? '—'}</InfoRow>
              <InfoRow icon={<InstagramIcon fontSize="small" />} label="Instagram">
                {b.instagram ? <Link href={`https://instagram.com/${b.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.instagram}</Link> : '—'}
              </InfoRow>
              <InfoRow icon={<ChatIcon fontSize="small" />} label="Team alerts go to">{b.team_channel ? CHANNEL[b.team_channel] : 'Not set yet'}</InfoRow>
              {b.towns_followed.length > 0 && (
                <InfoRow icon={<MapIcon fontSize="small" />} label="Nearby towns on the calendar">
                  <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>{b.towns_followed.map(t => <Tag key={t}>{t}</Tag>)}</Stack>
                </InfoRow>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={<Button size="small" component={RouterLink} to="/opening-hours">{isAdmin ? 'Change' : 'Details'}</Button>}>Opening hours</SectionTitle>
              <Box component="dl" sx={{ m: 0 }}>
                {DAY_KEYS.map(d => {
                  const h = b.opening_hours[d]
                  const isToday = d === todayKey
                  return (
                    <Stack key={d} direction="row" sx={{ justifyContent: 'space-between', py: 0.9, px: 1.25, mx: -1.25, borderRadius: 2,
                      bgcolor: isToday ? tokens.roseSoft : 'transparent' }}>
                      <Typography component="dt" sx={{ fontWeight: isToday ? 800 : 500 }}>{DAY_LABELS[d]}{isToday ? ' · today' : ''}</Typography>
                      <Typography component="dd" sx={{ m: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: h ? 'text.primary' : 'text.secondary' }}>
                        {h ? `${h.open} – ${h.close}` : 'Closed'}
                      </Typography>
                    </Stack>
                  )
                })}
              </Box>
              {b.peak_hours && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                  Busiest {b.peak_hours.start}–{b.peak_hours.end}. The rota flags when only one person is on then.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <SectionTitle action={edit('notes')}>Notes</SectionTitle>
                <Typography sx={{ whiteSpace: 'pre-wrap', color: b.notes ? 'text.primary' : 'text.secondary' }}>{b.notes || 'No notes.'}</Typography>
                {isAdmin && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: 2.5, bgcolor: tokens.warnBg }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: tokens.warnFg, mb: 0.5 }}>
                      <LockIcon sx={{ fontSize: 16 }} />
                      <Typography variant="subtitle2">Admin-only notes</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{notes.data || 'Nothing yet.'}</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 3 }}>
        Last updated {formatLocal(b.updated_at, 'd MMM yyyy, HH:mm')}
      </Typography>

      {editing === 'details' && <DetailsDialog onClose={() => setEditing(null)} />}
      {editing === 'notes' && <NotesDialog adminNotes={notes.data ?? ''} onClose={() => { setEditing(null); notes.reload() }} />}
    </>
  )
}

function useBusinessDraft() {
  const { business } = useApp()
  const [b, setB] = useState<Business | null>(business)
  useEffect(() => setB(business), [business])
  return [b!, setB as (b: Business) => void] as const
}

function EditDialog({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave: () => Promise<unknown>; children: ReactNode }) {
  const run = useAction()
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => { if (await run(onSave, 'Saved')) onClose() }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

const CURRENCIES: [string, string][] = [
  ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['USD', 'US dollar'], ['CHF', 'Swiss franc'], ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'], ['DKK', 'Danish krone'], ['PLN', 'Polish złoty'], ['CZK', 'Czech koruna'], ['HUF', 'Hungarian forint'],
  ['RON', 'Romanian leu'], ['TRY', 'Turkish lira'], ['MAD', 'Moroccan dirham'], ['AED', 'UAE dirham'], ['CAD', 'Canadian dollar'],
  ['AUD', 'Australian dollar'], ['NZD', 'New Zealand dollar'], ['JPY', 'Japanese yen'], ['MXN', 'Mexican peso'], ['BRL', 'Brazilian real'],
]

function DetailsDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const [b, setB] = useBusinessDraft()
  const field = (key: keyof Business, label: string) => (
    <TextField label={label} value={(b[key] as string) ?? ''} onChange={e => setB({ ...b, [key]: e.target.value })} />
  )
  return (
    <EditDialog title="Business details" onClose={onClose} onSave={async () => {
      const { updated_at: _u, ...patch } = b
      if (!patch.name?.trim()) throw new Error('The business needs a name')
      await api.updateBusiness(patch); await refresh()
    }}>
      {field('name', 'Name')}
      {field('business_type', 'Type')}
      {field('address', 'Address')}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{field('phone', 'Phone')}{field('email', 'Email')}</Stack>
      {field('instagram', 'Instagram')}
      <TextField select label="Currency" value={b.currency ?? 'EUR'} helperText="Pay, costs and totals are shown in this. It doesn't convert amounts."
        onChange={e => setB({ ...b, currency: e.target.value })}>
        {CURRENCIES.map(([code, name]) => <MenuItem key={code} value={code}>{code} · {name}</MenuItem>)}
      </TextField>
      <TextField select label="Team alerts go to" value={b.team_channel ?? ''}
        onChange={e => setB({ ...b, team_channel: (e.target.value || null) as Business['team_channel'] })}>
        <MenuItem value="">Not set</MenuItem>
        <MenuItem value="whatsapp">WhatsApp</MenuItem>
        <MenuItem value="slack">Slack</MenuItem>
        <MenuItem value="sms">Text message</MenuItem>
      </TextField>
      <TextField label="Nearby towns to follow" helperText="Comma separated" value={b.towns_followed.join(', ')}
        onChange={e => setB({ ...b, towns_followed: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
    </EditDialog>
  )
}


function NotesDialog({ adminNotes, onClose }: { adminNotes: string; onClose: () => void }) {
  const { api, refresh } = useApp()
  const [b, setB] = useBusinessDraft()
  const [secret, setSecret] = useState(adminNotes)
  return (
    <EditDialog title="Notes" onClose={onClose} onSave={async () => {
      await api.updateBusiness({ notes: b.notes }); await api.updateAdminNotes(secret); await refresh()
    }}>
      <TextField label="Notes for the whole team" multiline minRows={3} value={b.notes ?? ''} onChange={e => setB({ ...b, notes: e.target.value })} />
      <TextField label="Admin-only notes" helperText="Alarm code holder, kiosk wifi, landlord, gestor… Employees can't see this."
        multiline minRows={3} value={secret} onChange={e => setSecret(e.target.value)} />
    </EditDialog>
  )
}
