import {
  Alert, Box, Button, Card, CardContent, Checkbox, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { FEATURES } from '../app/features'
import EditIcon from '@mui/icons-material/EditOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import type { Settings } from '../../shared/types'
import { t, tr } from '../i18n'

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
            {isAdmin && <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)}>{t('Edit rules')}</Button>}
            <Button size="small" endIcon={<ExpandIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? t('Hide') : t('Show')}</Button>
          </Stack>
        }>{t('Clock-in rules')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('Clock in up to {early} min early · break of {brk} min after {after}h · max {daily}h a day', {
            early: s.early_clock_in_minutes, brk: s.min_break_minutes, after: s.break_after_hours, daily: s.max_daily_hours })}
        </Typography>
        <Collapse in={open}>
          <Box component="ul" sx={{ m: 0, mt: 1.5, pl: 2.5, '& li': { mb: 1 }, maxWidth: 760 }}>
            <li>{tr('You can clock in up to {minutes} before your shift.', { minutes: <b>{t('{n} minutes', { n: s.early_clock_in_minutes })}</b> })}</li>
            <li>{tr('Clocking in without a shift is {how}.', { how: <b>{s.unscheduled_clock_in === 'flag' ? t('allowed, and flagged for the manager') : t('blocked')}</b> })}</li>
            <li>{tr("Forgot to clock out? You're clocked out automatically {minutes} after your shift ends, and the manager reviews it.", { minutes: <b>{t('{n} minutes', { n: s.auto_clock_out_minutes })}</b> })}</li>
            <li>{s.auto_timecards_from_rota
              ? tr("If someone on the rota doesn't clock in, their timecard is {filled} and marked for a manager to check.", { filled: <b>{t('filled from the rota overnight')}</b> })
              : tr('Missing clock-ins are {not} filled in automatically; the manager adds them by hand.', { not: <b>{t('not')}</b> })}</li>
            <li>{tr('Clocking in from your phone is {how}.', { how: <b>{s.phone_clock_in === 'off' ? t('off: use the café tablet') : s.phone_clock_in === 'near_cafe' ? t('allowed near the café') : t('allowed')}</b> })}</li>
            <li>{tr('Shifts over {hours} need a break of at least {minutes}.', { hours: <b>{t('{n} hours', { n: s.break_after_hours })}</b>, minutes: <b>{t('{n} minutes', { n: s.min_break_minutes })}</b> })}</li>
            <li>{tr('Holiday allowance: {days}. Request it under Time off.', { days: <b>{t('{n} calendar days a year', { n: s.vacation_days_per_year })}</b> })}</li>
            <li>{tr('Limits: {daily}, {weekly}, and {rest} between shifts.', { daily: <b>{t('{n}h a day', { n: s.max_daily_hours })}</b>, weekly: <b>{t('{n}h a week', { n: s.max_weekly_hours })}</b>, rest: <b>{t('{n}h rest', { n: s.min_rest_hours })}</b> })}</li>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {t('Spanish defaults (Estatuto de los Trabajadores). Your convenio can be stricter; check with the gestor.')}
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
      <DialogTitle>{t('Clock-in rules')}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={async () => { if (await run(onSave, t('Saved'))) onClose() }}>{t('Save')}</Button>
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
      {num('early_clock_in_minutes', t('Earliest clock-in before shift'), t('min'))}
      <TextField select label={t('Clock-in without a shift')} value={s.unscheduled_clock_in}
        onChange={e => setS({ ...s, unscheduled_clock_in: e.target.value as Settings['unscheduled_clock_in'] })}>
        <MenuItem value="flag">{t('Allow, flag on timecard')}</MenuItem>
        <MenuItem value="block">{t('Block')}</MenuItem>
      </TextField>
      {num('auto_clock_out_minutes', t('Auto clock-out after shift end'), t('min'))}
      {num('forgot_clock_out_grace_minutes', t('No shift: close after closing time +'), t('min'))}
      <TextField select label={t('Clock in from phones')} value={s.phone_clock_in}
        onChange={e => setS({ ...s, phone_clock_in: e.target.value as Settings['phone_clock_in'] })}>
        <MenuItem value="anywhere">{t('Allowed')}</MenuItem>
        <MenuItem value="near_cafe">{t('Only near the café (coming later)')}</MenuItem>
        {(FEATURES.kiosk || s.phone_clock_in === 'off') && <MenuItem value="off">{t('Off: tablet only')}</MenuItem>}
      </TextField>
      <FormControlLabel control={<Checkbox checked={s.auto_timecards_from_rota}
        onChange={e => setS({ ...s, auto_timecards_from_rota: e.target.checked })} />}
        label={t('Fill missing timecards from the rota every night (marked for review)')} />
      <Alert severity="info">{t('Spanish defaults. Check your convenio with the gestor; it can be stricter.')}</Alert>
      <Grid container spacing={2}>
        <Grid size={12}>{num('break_after_hours', t('Break needed after'), t('h'))}</Grid>
        <Grid size={12}>{num('min_break_minutes', t('Minimum break'), t('min'))}</Grid>
        <Grid size={12}>{num('max_daily_hours', t('Max per day'), t('h'))}</Grid>
        <Grid size={12}>{num('max_weekly_hours', t('Max per week'), t('h'))}</Grid>
        <Grid size={12}>{num('min_rest_hours', t('Rest between shifts'), t('h'))}</Grid>
        <Grid size={12}>{num('employer_cost_multiplier', t('Employer cost'), '×')}</Grid>
        <Grid size={12}>{num('vacation_days_per_year', t('Holiday per year'), t('days'))}</Grid>
      </Grid>
    </RulesEditDialog>
  )
}

