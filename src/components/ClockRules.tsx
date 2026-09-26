import {
  Alert, Box, Button, Card, CardContent, Checkbox, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import type { Settings } from '../../shared/types'

/** The house rules for clocking in, in plain sentences; admins can edit them. */
export function ClockRulesCard() {
  const { settings: s, isAdmin } = useApp()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  if (!s) return null
  return (
    <Card sx={{ mb: 2.5 }}>
      <CardContent>
        <SectionTitle action={
          <Stack direction="row" spacing={1}>
            {isAdmin && <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)}>Edit rules</Button>}
            <Button size="small" endIcon={<ExpandIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Show'}</Button>
          </Stack>
        }>Clock-in rules</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Clock in up to {s.early_clock_in_minutes} min early · break of {s.min_break_minutes} min after {s.break_after_hours}h ·
          max {s.max_daily_hours}h a day
        </Typography>
        <Collapse in={open}>
          <Box component="ul" sx={{ m: 0, mt: 1.5, pl: 2.5, '& li': { mb: 1 }, maxWidth: 760 }}>
            <li>You can clock in up to <b>{s.early_clock_in_minutes} minutes</b> before your shift.</li>
            <li>Clocking in without a shift is <b>{s.unscheduled_clock_in === 'flag' ? 'allowed, and flagged for the manager' : 'blocked'}</b>.</li>
            <li>Forgot to clock out? You're clocked out automatically <b>{s.auto_clock_out_minutes} minutes</b> after your shift ends, and the manager reviews it.</li>
            <li>{s.auto_timecards_from_rota
              ? <>If someone on the rota doesn't clock in, their timecard is <b>filled from the rota overnight</b> and marked for a manager to check.</>
              : <>Missing clock-ins are <b>not</b> filled in automatically; the manager adds them by hand.</>}</li>
            <li>Clocking in from your phone is <b>{s.phone_clock_in === 'off' ? 'off: use the café tablet' : s.phone_clock_in === 'near_cafe' ? 'allowed near the café' : 'allowed'}</b>.</li>
            <li>Shifts over <b>{s.break_after_hours} hours</b> need a break of at least <b>{s.min_break_minutes} minutes</b>.</li>
            <li>Holiday allowance: <b>{s.vacation_days_per_year} calendar days a year</b>. Request it under Time off.</li>
            <li>Limits: <b>{s.max_daily_hours}h a day</b>, <b>{s.max_weekly_hours}h a week</b>, and <b>{s.min_rest_hours}h rest</b> between shifts.</li>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            Spanish defaults (Estatuto de los Trabajadores). Your convenio can be stricter; check with the gestor.
          </Typography>
        </Collapse>
      </CardContent>
      {editing && <RulesDialog onClose={() => setEditing(false)} />}
    </Card>
  )
}

function RulesEditDialog({ onClose, onSave, children }: { onClose: () => void; onSave: () => Promise<unknown>; children: ReactNode }) {
  const run = useAction()
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Clock-in rules</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => { if (await run(onSave, 'Saved')) onClose() }}>Save</Button>
      </DialogActions>
    </Dialog>
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
    <RulesEditDialog onClose={onClose} onSave={async () => { await api.updateSettings(s); await refresh() }}>
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
        <Grid size={6}>{num('vacation_days_per_year', 'Holiday per year', 'days')}</Grid>
      </Grid>
    </RulesEditDialog>
  )
}

