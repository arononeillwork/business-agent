import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, InputAdornment, Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle, Tag } from '../components/common'
import { DAY_KEYS, type Business, type DayKey, type Settings } from '../../shared/types'
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
  if (now >= hmToMinutes(h.close)) return { open: false, text: `Closed · opened ${h.open}–${h.close}` }
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
  const { api, business: b, settings: s, isAdmin } = useApp()
  const notes = useAsync('admin-notes', () => (isAdmin ? api.adminNotes() : Promise.resolve(null)), [isAdmin])
  const [editing, setEditing] = useState<'details' | 'hours' | 'rules' | 'notes' | null>(null)
  if (!b || !s) return null
  const status = openStatus(b)
  const todayKey = dayKey(today())
  const edit = (what: typeof editing) => isAdmin && (
    <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(what)}>Edit</Button>
  )

  return (
    <>
      <PageHeader eyebrow="Business" title={b.name}
        subtitle={[b.business_type, b.address].filter(Boolean).join(' · ')}
        actions={<Tag fg={status.open ? '#2f5a2b' : tokens.inkSoft} bg={status.open ? tokens.matchaSoft : '#f0ece8'}>● {status.text}</Tag>} />

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
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={edit('hours')}>Opening hours</SectionTitle>
              <Box component="dl" sx={{ m: 0 }}>
                {DAY_KEYS.map(d => {
                  const h = b.opening_hours[d]
                  const isToday = d === todayKey
                  return (
                    <Stack key={d} direction="row" sx={{ justifyContent: 'space-between', py: 0.9, px: 1.25, mx: -1.25, borderRadius: 2,
                      bgcolor: isToday ? tokens.matchaSoft : 'transparent' }}>
                      <Typography component="dt" sx={{ fontWeight: isToday ? 800 : 500 }}>{DAY_LABELS[d]}{isToday ? ' · today' : ''}</Typography>
                      <Typography component="dd" sx={{ m: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: h ? 'text.primary' : 'text.secondary' }}>
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

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle>Suppliers</SectionTitle>
              {b.suppliers.length === 0 && <Typography sx={{ color: 'text.secondary' }}>None added yet.</Typography>}
              <Stack spacing={1.5}>
                {b.suppliers.map(sp => (
                  <Box key={sp.name} sx={{ p: 1.5, borderRadius: 2.5, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>{sp.name}</Typography>
                      {sp.type && <Tag>{sp.type}</Tag>}
                    </Stack>
                    {sp.notes && <Typography variant="body2" sx={{ mt: 0.5 }}>{sp.notes}</Typography>}
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      {[sp.phone, sp.email].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                ))}
              </Stack>
              {b.towns_followed.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 1 }}>Nearby towns on the calendar</Typography>
                  <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>{b.towns_followed.map(t => <Tag key={t}>{t}</Tag>)}</Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <SectionTitle action={edit('rules')}>House rules for clocking in</SectionTitle>
              <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 1 }, maxWidth: 720 }}>
                <li>You can clock in up to <b>{s.early_clock_in_minutes} minutes</b> before your shift.</li>
                <li>Clocking in without a shift is <b>{s.unscheduled_clock_in === 'flag' ? 'allowed, and flagged for the manager' : 'blocked'}</b>.</li>
                <li>Forgot to clock out? You're clocked out automatically <b>{s.auto_clock_out_minutes} minutes</b> after your shift ends, and the manager reviews it.</li>
                <li>{s.auto_timecards_from_rota
                  ? <>If someone on the rota doesn't clock in, their timecard is <b>filled from the rota overnight</b> and marked for a manager to check.</>
                  : <>Missing clock-ins are <b>not</b> filled in automatically; the manager adds them by hand.</>}</li>
                <li>Clocking in from your phone is <b>{s.phone_clock_in === 'off' ? 'off: use the café tablet' : s.phone_clock_in === 'near_cafe' ? 'allowed near the café' : 'allowed'}</b>.</li>
                <li>Shifts over <b>{s.break_after_hours} hours</b> need a break of at least <b>{s.min_break_minutes} minutes</b>.</li>
                <li>Limits: <b>{s.max_daily_hours}h a day</b>, <b>{s.max_weekly_hours}h a week</b>, and <b>{s.min_rest_hours}h rest</b> between shifts.</li>
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                Spanish defaults (Estatuto de los Trabajadores). Your convenio can be stricter; check with the gestor.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <SectionTitle action={edit('notes')}>Notes</SectionTitle>
                <Typography sx={{ whiteSpace: 'pre-wrap', color: b.notes ? 'text.primary' : 'text.secondary' }}>{b.notes || 'No notes.'}</Typography>
                {isAdmin && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: 2.5, bgcolor: '#fbf3e6' }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: '#7a4f10', mb: 0.5 }}>
                      <LockIcon sx={{ fontSize: 16 }} />
                      <Typography variant="subtitle2">Admin-only notes</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{notes.data || 'Nothing yet.'}</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
            {isAdmin && (
              <Card>
                <CardContent>
                  <SectionTitle>Talk to it with AI</SectionTitle>
                  <Typography variant="body2">
                    In Claude, open Settings → Connectors → <b>Add custom connector</b> and paste:
                  </Typography>
                  <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' }}>
                    {location.origin}/mcp
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                    Sign in with your team account. Claude can then do what you can do here; each change is logged as made via AI.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Grid>
      </Grid>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 3 }}>
        Last updated {formatLocal(b.updated_at, 'd MMM yyyy, HH:mm')}
      </Typography>

      {editing === 'details' && <DetailsDialog onClose={() => setEditing(null)} />}
      {editing === 'hours' && <HoursDialog onClose={() => setEditing(null)} />}
      {editing === 'rules' && <RulesDialog onClose={() => setEditing(null)} />}
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

function DetailsDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const [b, setB] = useBusinessDraft()
  const field = (key: keyof Business, label: string) => (
    <TextField label={label} value={(b[key] as string) ?? ''} onChange={e => setB({ ...b, [key]: e.target.value })} />
  )
  return (
    <EditDialog title="Business details" onClose={onClose} onSave={async () => {
      const { updated_at: _u, ...patch } = b
      await api.updateBusiness(patch); await refresh()
    }}>
      {field('name', 'Name')}
      {field('business_type', 'Type')}
      {field('address', 'Address')}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{field('phone', 'Phone')}{field('email', 'Email')}</Stack>
      {field('instagram', 'Instagram')}
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

function HoursDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const [b, setB] = useBusinessDraft()
  return (
    <EditDialog title="Opening hours" onClose={onClose} onSave={async () => {
      await api.updateBusiness({ opening_hours: b.opening_hours }); await refresh()
    }}>
      {DAY_KEYS.map(d => {
        const h = b.opening_hours[d]
        return (
          <Stack key={d} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FormControlLabel sx={{ width: 150, flexShrink: 0 }} label={DAY_LABELS[d]} control={
              <Checkbox checked={!!h} onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours,
                [d]: e.target.checked ? { open: '09:00', close: '17:00' } : null } })} />} />
            {h ? <>
              <TextField type="time" label="Opens" value={h.open} slotProps={{ inputLabel: { shrink: true } }}
                onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours, [d]: { ...h, open: e.target.value } } })} />
              <TextField type="time" label="Closes" value={h.close} slotProps={{ inputLabel: { shrink: true } }}
                onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours, [d]: { ...h, close: e.target.value } } })} />
            </> : <Typography sx={{ color: 'text.secondary' }}>Closed</Typography>}
          </Stack>
        )
      })}
    </EditDialog>
  )
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const { api, settings, refresh } = useApp()
  const [s, setS] = useState<Settings>(settings!)
  const num = (key: keyof Settings, label: string, unit: string) => (
    <TextField type="number" label={label} value={s[key] as number} onChange={e => setS({ ...s, [key]: Number(e.target.value) })}
      slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }} />
  )
  return (
    <EditDialog title="Clock-in rules" onClose={onClose} onSave={async () => { await api.updateSettings(s); await refresh() }}>
      {num('early_clock_in_minutes', 'Earliest clock-in before shift', 'min')}
      <TextField select label="Clock-in without a shift" value={s.unscheduled_clock_in}
        onChange={e => setS({ ...s, unscheduled_clock_in: e.target.value as Settings['unscheduled_clock_in'] })}>
        <MenuItem value="flag">Allow, flag on timecard</MenuItem>
        <MenuItem value="block">Block</MenuItem>
      </TextField>
      {num('auto_clock_out_minutes', 'Auto clock-out after shift end', 'min')}
      {num('forgot_clock_out_grace_minutes', 'No shift: close after closing time +', 'min')}
      <TextField select label="Clock in from phones" value={s.phone_clock_in}
        onChange={e => setS({ ...s, phone_clock_in: e.target.value as Settings['phone_clock_in'] })}>
        <MenuItem value="anywhere">Allowed</MenuItem>
        <MenuItem value="near_cafe">Only near the café (coming later)</MenuItem>
        <MenuItem value="off">Off: tablet only</MenuItem>
      </TextField>
      <FormControlLabel control={<Checkbox checked={s.auto_timecards_from_rota}
        onChange={e => setS({ ...s, auto_timecards_from_rota: e.target.checked })} />}
        label="Fill missing timecards from the rota every night (marked for review)" />
      <Alert severity="info">Spanish defaults. Check your convenio with the gestor; it can be stricter.</Alert>
      <Grid container spacing={2}>
        <Grid size={6}>{num('break_after_hours', 'Break needed after', 'h')}</Grid>
        <Grid size={6}>{num('min_break_minutes', 'Minimum break', 'min')}</Grid>
        <Grid size={6}>{num('max_daily_hours', 'Max per day', 'h')}</Grid>
        <Grid size={6}>{num('max_weekly_hours', 'Max per week', 'h')}</Grid>
        <Grid size={6}>{num('min_rest_hours', 'Rest between shifts', 'h')}</Grid>
        <Grid size={6}>{num('employer_cost_multiplier', 'Employer cost', '×')}</Grid>
      </Grid>
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
