import {
  Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, InputAdornment, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader } from '../components/common'
import { DAY_KEYS, type Business, type Settings } from '../../shared/types'
import { formatLocal } from '../../shared/time'

const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

export function BusinessPage() {
  const { api, business, settings, refresh } = useApp()
  const run = useAction()
  const [b, setB] = useState<Business | null>(business)
  const [s, setS] = useState<Settings | null>(settings)
  const notes = useAsync(() => api.adminNotes(), [])
  const [adminNotes, setAdminNotes] = useState('')
  useEffect(() => setB(business), [business])
  useEffect(() => setS(settings), [settings])
  useEffect(() => setAdminNotes(notes.data ?? ''), [notes.data])
  if (!b || !s) return null

  const field = (key: keyof Business, label: string) => (
    <TextField label={label} value={(b[key] as string) ?? ''} onChange={e => setB({ ...b, [key]: e.target.value })} />
  )
  const num = (key: keyof Settings, label: string, unit: string) => (
    <TextField type="number" label={label} value={s[key] as number}
      onChange={e => setS({ ...s, [key]: Number(e.target.value) })}
      slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }} />
  )

  return (
    <>
      <PageHeader title="Business" subtitle={`Last updated ${formatLocal(b.updated_at, 'd MMM yyyy HH:mm')}. Alerts, exports and the AI connector read from here.`} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Details</Typography>
              <Stack spacing={2}>
                {field('name', 'Name')}
                {field('business_type', 'Type')}
                {field('address', 'Address')}
                <Stack direction="row" spacing={1}>{field('phone', 'Phone')}{field('email', 'Email')}</Stack>
                {field('instagram', 'Instagram')}
                <TextField select label="Team channel (where alerts go)" value={b.team_channel ?? ''}
                  onChange={e => setB({ ...b, team_channel: (e.target.value || null) as Business['team_channel'] })}>
                  <MenuItem value="">Not set</MenuItem>
                  <MenuItem value="whatsapp">WhatsApp</MenuItem>
                  <MenuItem value="slack">Slack</MenuItem>
                  <MenuItem value="sms">Text message</MenuItem>
                </TextField>
                <TextField label="Nearby towns to follow (comma separated)" value={b.towns_followed.join(', ')}
                  onChange={e => setB({ ...b, towns_followed: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
                <TextField label="Notes (visible to the team)" multiline minRows={2} value={b.notes ?? ''}
                  onChange={e => setB({ ...b, notes: e.target.value })} />
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Opening hours</Typography>
                  {DAY_KEYS.map(d => {
                    const h = b.opening_hours[d]
                    return (
                      <Stack key={d} direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                        <FormControlLabel sx={{ width: 150 }} label={DAY_LABELS[d]} control={
                          <Checkbox checked={!!h} onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours,
                            [d]: e.target.checked ? { open: '09:00', close: '17:00' } : null } })} />} />
                        {h && <>
                          <TextField type="time" value={h.open} onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours, [d]: { ...h, open: e.target.value } } })} />
                          <TextField type="time" value={h.close} onChange={e => setB({ ...b, opening_hours: { ...b.opening_hours, [d]: { ...h, close: e.target.value } } })} />
                        </>}
                        {!h && <Typography color="text.secondary">Closed</Typography>}
                      </Stack>
                    )
                  })}
                </Box>
                <Button variant="contained" onClick={() => run(async () => {
                  const { updated_at: _u, ...patch } = b
                  await api.updateBusiness(patch); await refresh()
                }, 'Business details saved')}>Save details</Button>
              </Stack>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Admin-only notes</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Alarm code holder, kiosk wifi, landlord, gestor… Employees can't see this.</Typography>
              <TextField multiline minRows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} />
              <Button sx={{ mt: 1.5 }} variant="outlined" onClick={() => run(() => api.updateAdminNotes(adminNotes), 'Notes saved')}>Save notes</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Clock-in rules</Typography>
              <Stack spacing={2}>
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
                  <MenuItem value="near_cafe">Only near the café (phase 3)</MenuItem>
                  <MenuItem value="off">Off: tablet only</MenuItem>
                </TextField>
              </Stack>
              <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>Working-time limits</Typography>
              <Alert severity="info" sx={{ mb: 2 }}>Spanish defaults (Estatuto de los Trabajadores). Check your convenio with the gestor; it can be stricter.</Alert>
              <Grid container spacing={2}>
                <Grid size={6}>{num('break_after_hours', 'Break needed after', 'h')}</Grid>
                <Grid size={6}>{num('min_break_minutes', 'Minimum break', 'min')}</Grid>
                <Grid size={6}>{num('max_daily_hours', 'Max per day', 'h')}</Grid>
                <Grid size={6}>{num('max_weekly_hours', 'Max per week', 'h')}</Grid>
                <Grid size={6}>{num('min_rest_hours', 'Rest between shifts', 'h')}</Grid>
                <Grid size={6}>{num('employer_cost_multiplier', 'Employer cost ×', '×')}</Grid>
              </Grid>
              <Button sx={{ mt: 2 }} variant="contained" onClick={() => run(async () => {
                await api.updateSettings(s); await refresh()
              }, 'Rules saved')}>Save rules</Button>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>AI connector</Typography>
              <Typography variant="body2" color="text.secondary">
                Add <b>{location.origin}/mcp</b> as a custom connector in Claude (Settings → Connectors). You sign in with your
                team account and Claude acts with your permissions: every change is logged as “via AI”.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}
