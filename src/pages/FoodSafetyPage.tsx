import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { DecimalField, Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, localDate, today } from '../../shared/time'
import {
  CAFE_POINTS, FREQUENCIES, dueToday, frequencyLabel, inRange, limitsText,
  type Due, type PointInput, type PointPreset, type SafetyPoint,
} from '../../shared/foodSafety'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** How many days of checks are counted and exported, and how many the page lists. */
const LOG_DAYS = 7
const SHOWN_DAYS = 3
const limits = (p: Pick<SafetyPoint, 'min_temp' | 'max_temp'>) => { const l = limitsText(p); return l ? t(l.text, l.vars) : '' }
const at = (iso: string) => formatLocal(iso, 'EEE d MMM, HH:mm')
const reading = (n: number | null) => (n === null ? '' : `${String(n).replace('-', '−')} °C`)

/**
 * Food safety (Stock): the APPCC's daily records. What's to check today (fridge and freezer
 * temperatures, cleaning and checks), each recorded by whoever does it at the server's time, with
 * what was done when a reading was out of range (admins hear in the bell). Records are kept for
 * inspections and never changed. The team records; admins set what's checked.
 */
export function FoodSafetyPage() {
  const { api, isAdmin, can, profiles } = useApp()
  // Admins, and anyone whose role has Update on food safety, set up what's checked; Licences stays the admins'.
  const canEdit = can('foodsafety', 'update')
  const now = today()
  const from = addDays(now, -(LOG_DAYS - 1))
  const points = useAsync('safety-points', () => api.safetyPoints(), [])
  const checks = useAsync('safety-checks', () => api.safetyChecks(addDays(now, -31), now), [now])
  const [editing, setEditing] = useState<PointInput | null>(null)

  const allPoints = points.data ?? []
  const all = (checks.data ?? []).map(c => ({ ...c, day: localDate(c.checked_at) }))
  const due = dueToday(allPoints, all, now)
  const todo = due.filter(d => d.done < d.needed)
  const doneToday = due.reduce((s, d) => s + Math.min(d.done, d.needed), 0)
  const neededToday = due.reduce((s, d) => s + d.needed, 0)
  const log = all.filter(c => c.day >= from)
  const recent = log.filter(c => c.day >= addDays(now, -(SHOWN_DAYS - 1)))
  const out = log.filter(c => !c.ok)
  const nameOf = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? ''
  const pointOf = (id: string) => allPoints.find(p => p.id === id)
  const added = new Set(allPoints.map(p => p.name.toLowerCase()))
  const missing = CAFE_POINTS.filter(p => !added.has(t(p.name).toLowerCase()) && !added.has(p.name.toLowerCase()))
  const fromPreset = (p: PointPreset): PointInput => ({ name: t(p.name), kind: p.kind, min_temp: p.min_temp, max_temp: p.max_temp, frequency: p.frequency,
    area: t(p.area), instructions: t(p.instructions), active: true, sort: allPoints.length + 1 })

  const table = (): ExportTable => ({
    title: t('Food safety records'), filename: `food-safety-${from}-${now}`,
    columns: [t('When'), t('Check'), t('Area'), t('Limits'), t('Reading'), t('Result'), t('What was done'), t('Note'), t('By')],
    rows: log.map(c => {
      const p = pointOf(c.point_id)
      return [at(c.checked_at), p?.name ?? '', p?.area ?? '', p ? limits(p) : '', reading(c.reading), c.ok ? t('OK') : t('Out of range'), c.action ?? '', c.note ?? '', nameOf(c.by)]
    }),
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Food safety')} actions={<>
        <ExportButton table={table} disabled={!log.length} folder="Food safety" />
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', kind: 'temperature', frequency: 'daily', active: true })}>{t('Add a check')}</Button>}
      </>} />
      <ErrorBox error={points.error ?? checks.error} />

      <StatGrid>
        <StatTile label={t('Done today')} value={points.data ? `${doneToday} / ${neededToday}` : '–'} note={todo.length ? tn(todo.length, '{n} still to do', '{n} still to do') : t('All done')} />
        <StatTile label={t('Out of range')} value={out.length} note={t('In the last {n} days', { n: LOG_DAYS })} />
        <StatTile label={t('Last check')} value={log[0] ? formatLocal(log[0].checked_at, 'HH:mm') : '–'} note={log[0] ? `${pointOf(log[0].point_id)?.name ?? ''} · ${nameOf(log[0].by)}` : t('None yet')} />
        <StatTile label={t('Records')} value={log.length} note={t('In the last {n} days', { n: LOG_DAYS })} />
      </StatGrid>

      <Card component="section" aria-label={t('To check now')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('To check now')}</SectionTitle>
          {!points.data ? <Empty>{t('Loading…')}</Empty>
            : due.length === 0 ? <Empty>{canEdit ? t('Nothing to check yet. Add the café’s fridges and jobs below.') : t('Nothing to check yet: an admin sets what’s checked.')}</Empty>
              : <Stack>{due.map(d => <DueRow key={d.point.id} due={d} />)}</Stack>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Records')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Records')}</SectionTitle>
          {recent.length === 0 ? <Empty>{checks.data ? t('No checks in the last {n} days.', { n: SHOWN_DAYS }) : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('When')}</TableCell><TableCell>{t('Check')}</TableCell><TableCell>{t('Reading')}</TableCell>
                    <TableCell>{t('Result')}</TableCell><TableCell>{t('By')}</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {recent.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{at(c.checked_at)}</TableCell>
                        <TableCell sx={{ minWidth: 200 }}>
                          {pointOf(c.point_id)?.name}
                          {(c.action || c.note) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{[c.action, c.note].filter(Boolean).join(' · ')}</Typography>}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{reading(c.reading)}</TableCell>
                        <TableCell>{c.ok ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('OK')}</Tag> : <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Out of range')}</Tag>}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{nameOf(c.by)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('The last {n} days; Export has the whole week.', { n: SHOWN_DAYS })}{' '}
            {t('Records are kept as they were written, for inspections. A mistake is put right with another check.')}{' '}
            {t('The pest control contract, the health registration and food handler certificates are on Licences.')}{' '}
            {isAdmin && <RouterLink to="/legal">{t('Open Licences')}</RouterLink>}
          </Typography>
        </CardContent>
      </Card>

      {canEdit && (
        <Card component="section" aria-label={t('What’s checked')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('What’s checked')}</SectionTitle>
            {allPoints.length > 0 && (
              <Box sx={{ overflowX: 'auto', mb: 2 }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Check')}</TableCell><TableCell>{t('Limits')}</TableCell><TableCell>{t('How often')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {allPoints.map(p => (
                      <TableRow key={p.id} hover sx={p.active ? undefined : { opacity: 0.55 }}>
                        <TableCell sx={{ minWidth: 200 }}>
                          {p.name}
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{[p.area, p.active ? null : t('Switched off')].filter(Boolean).join(' · ')}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.kind === 'temperature' ? limits(p) : t('A job')}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(frequencyLabel(p.frequency))}</TableCell>
                        <TableCell align="right"><IconButton size="small" aria-label={t('Edit {name}', { name: p.name })} onClick={() => setEditing(p)}><EditIcon fontSize="small" /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
            {missing.length > 0 && <>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('Usual for a café')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {t('A starting point: your APPCC (food safety plan) says what applies. Chilled food at 4 °C or below (8 °C when eaten within a day), frozen at −18 °C or below, kept hot at 65 °C or above.')}
              </Typography>
              <Stack spacing={1}>
                {missing.map(p => (
                  <Stack key={p.key} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{t(p.name)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[p.kind === 'temperature' ? limits(p) : t('A job'), t(frequencyLabel(p.frequency))].join(' · ')}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing(fromPreset(p))} aria-label={t('Add {name}', { name: t(p.name) })}>{t('Add')}</Button>
                  </Stack>
                ))}
              </Stack>
            </>}
          </CardContent>
        </Card>
      )}

      {editing && <PointDialog point={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One thing to check today: record a reading (with what was done when it's out of range) or mark the job done. */
function DueRow({ due }: { due: Due }) {
  const { api, profiles } = useApp()
  const run = useAction()
  const { point: p, done, needed, last } = due
  const [value, setValue] = useState('')
  const [action, setAction] = useState('')
  const n = value.trim() === '' ? null : Number(value.replace(',', '.').replace('−', '-'))
  const outOfRange = n !== null && !Number.isNaN(n) && !inRange(p, n)
  const finished = done >= needed
  const record = () => run(async () => {
    if (p.kind === 'temperature') {
      if (n === null || Number.isNaN(n)) throw new Error(t('Enter what it read'))
      if (outOfRange && !action.trim()) throw new Error(t('Out of range: say what was done about it'))
    }
    await api.recordSafetyCheck({ point_id: p.id, reading: p.kind === 'temperature' ? n : null, action: outOfRange ? action.trim() : null })
    setValue(''); setAction('')
  }, p.kind === 'temperature' ? (outOfRange ? t('Recorded: admins are told it was out of range') : t('Recorded')) : t('Done'))

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, py: 1.25, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}
      role="group" aria-label={p.name}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
          <Tag {...(finished ? { fg: tokens.goodFg, bg: tokens.goodBg } : { fg: tokens.warnFg, bg: tokens.warnBg })}>{`${Math.min(done, needed)} / ${needed}`}</Tag>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {[p.area, p.kind === 'temperature' ? limits(p) : null, t(frequencyLabel(p.frequency)),
            last ? t('Last: {when}, {who}', { when: formatLocal(last.checked_at, 'HH:mm'), who: profiles.find(x => x.id === last.by)?.full_name ?? '' }) + (last.reading !== null ? ` (${reading(last.reading)})` : '') : null]
            .filter(Boolean).join(' · ')}
        </Typography>
        {p.instructions && !finished && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{p.instructions}</Typography>}
      </Box>
      {!finished && (p.kind === 'temperature'
        ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
            <TextField size="small" label={t('°C')} value={value} onChange={e => setValue(e.target.value)} sx={{ width: 100 }}
              slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': t('Reading for {name}', { name: p.name }) } }} error={outOfRange} />
            {outOfRange && <TextField size="small" label={t('What was done')} value={action} onChange={e => setAction(e.target.value)} sx={{ minWidth: 240 }} required
              helperText={p.instructions ?? t('Out of range: say what was done about it')} />}
            <Button variant="outlined" onClick={() => void record()} aria-label={t('Record {name}', { name: p.name })}>{t('Record')}</Button>
          </Stack>
        : <Button variant="outlined" startIcon={<CheckIcon />} onClick={() => void record()} aria-label={t('Done: {name}', { name: p.name })}>{t('Done')}</Button>)}
    </Stack>
  )
}

/** Something to check: a temperature with its limits, or a job; how often, and how to do it. */
function PointDialog({ point, onClose }: { point: PointInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [p, setP] = useState<PointInput>(point)
  const set = (x: Partial<PointInput>) => setP(y => ({ ...y, ...x }))
  const save = async () => {
    const ok = await run(async () => {
      if (!p.name.trim()) throw new Error(t('Give it a name'))
      await api.saveSafetyPoint({ ...p, name: p.name.trim(), ...(p.kind === 'task' ? { min_temp: null, max_temp: null } : {}) })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (p.id && await run(() => api.deleteSafetyPoint(p.id!), t('Removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="point-title">
      <DialogTitle id="point-title">{p.id ? p.name : t('Add a check')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={p.name} onChange={e => set({ name: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={p.kind ?? 'temperature'} onChange={e => set({ kind: e.target.value as SafetyPoint['kind'] })} sx={{ flex: 1 }}>
              <MenuItem value="temperature">{t('A temperature')}</MenuItem>
              <MenuItem value="task">{t('A job')}</MenuItem>
            </TextField>
            <TextField select label={t('How often')} value={p.frequency ?? 'daily'} onChange={e => set({ frequency: e.target.value as SafetyPoint['frequency'] })} sx={{ flex: 1 }}>
              {FREQUENCIES.map(f => <MenuItem key={f.id} value={f.id}>{t(f.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {p.kind !== 'task' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <DecimalField label={t('Lowest (°C)')} value={p.min_temp} onNumber={n => set({ min_temp: n })} inputMode="text" helperText={t('Empty: no lowest')} sx={{ flex: 1 }} />
              <DecimalField label={t('Highest (°C)')} value={p.max_temp} onNumber={n => set({ max_temp: n })} inputMode="text" helperText={t('Empty: no highest')} sx={{ flex: 1 }} />
            </Stack>
          )}
          <TextField label={t('Area')} value={p.area ?? ''} onChange={e => set({ area: e.target.value })} placeholder={t('Kitchen, Bar…')} />
          <TextField label={t('How to do it, and what to do when it’s out of range')} value={p.instructions ?? ''} multiline minRows={2} onChange={e => set({ instructions: e.target.value })} />
          {p.id && <FormControlLabel control={<Switch checked={p.active !== false} onChange={e => set({ active: e.target.checked })} />} label={t('Checked now (switch off to stop, keeping its records)')} />}
          {!p.id && <Alert severity="info">{t('Everyone on the team can record it once it’s added.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {p.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
