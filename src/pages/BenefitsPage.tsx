import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import RecordIcon from '@mui/icons-material/EventBusyOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, today } from '../../shared/time'
import { HOLIDAY_CATEGORIES } from '../../shared/rules'
import { TIME_OFF_KINDS, TIME_OFF_LABELS, type Profile, type TimeOffKind } from '../../shared/types'
import { businessConfig } from '../../shared/business.config'
import {
  COUNTRY_NAME, ENTITLEMENTS, LAW_CHECKED, LEAVE_GROUPS, PAYER_LABEL, PERK_IDEAS, allocated, awayOn, belowLaw, leaveYear, proRata,
  type Benefit, type Entitlement, type LeaveAllowance, type Payer,
} from '../../shared/benefits'
import { tokens } from '../theme'
import { t, tc, tn, tr } from '../i18n'

const PAYER_TONE: Record<Payer, { fg: string; bg: string }> = {
  business: { fg: tokens.goodFg, bg: tokens.goodBg }, social_security: { fg: tokens.infoFg, bg: tokens.infoBg },
  shared: { fg: tokens.infoFg, bg: tokens.infoBg }, unpaid: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const leaveLabel = (k: TimeOffKind) => tc('leave', TIME_OFF_LABELS[k])
const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
const allowanceText = (e: Entitlement, n: number | null) => t(e.allowance, { n: n ?? 0 })

/**
 * Staff benefits: what everyone on the team gets in the business's country (Spain: the Estatuto de
 * los Trabajadores and Social Security), what the business gives on top, and each person's
 * allocation for the year: holiday allowance, taken, booked and left, sick days and other leave.
 * Everyone reads it, with their own allocation; admins (and a payroll gestoría, reading) see the
 * whole team. Admins raise the amounts, add the business's own benefits, change someone's holiday
 * for a year and record leave for someone (the database enforces the same).
 */
export function BenefitsPage() {
  const { api, me, isAdmin, isPartner, partnerCan, profiles, settings, business } = useApp()
  const canEdit = isAdmin && !isPartner
  const seesTeam = isAdmin || partnerCan('payroll')
  const now = today()
  const thisYear = Number(now.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [editing, setEditing] = useState<Entitlement | null>(null)
  const [perk, setPerk] = useState<Partial<Benefit> | null>(null)
  const [adjusting, setAdjusting] = useState<Profile | null>(null)
  const [recording, setRecording] = useState(false)
  const data = useAsync('benefits', async () => {
    const [benefits, allowances, off, events] = await Promise.all([
      api.benefits(), api.leaveAllowances(year), api.timeOff(`${year}-01-01`, `${year}-12-31`), api.events(`${year}-01-01`, `${year}-12-31`),
    ])
    return { benefits, allowances, off, events }
  }, [year])

  const country = businessConfig.country
  const law = ENTITLEMENTS[country]
  const checked = LAW_CHECKED[country]
  const businessName = business?.name ?? businessConfig.name
  const benefits = data.data?.benefits ?? []
  const own = (key: string) => benefits.find(b => b.law_key === key)
  const extras = benefits.filter(b => !b.law_key)
  const amountOf = (e: Entitlement) => (e.key === 'holidays' ? settings?.vacation_days_per_year ?? e.amount : allocated(e, own(e.key)))
  const off = data.data?.off ?? []
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
  const people = seesTeam ? team : team.filter(p => p.id === me?.id)
  const allowanceOf = (id: string) => data.data?.allowances.find(a => a.profile_id === id)
  const holidaysOf = (id: string) => allowanceOf(id)?.holiday_days ?? settings?.vacation_days_per_year ?? 30
  const rows = people.map(p => {
    const used = leaveYear(off, p.id, year, now)
    const allowance = holidaysOf(p.id)
    const other = TIME_OFF_KINDS.filter(k => k !== 'vacation' && k !== 'sick' && used.days[k])
    return { p, used, allowance, left: allowance - used.holidayTaken - used.holidayBooked, sick: used.days.sick ?? 0, other, own: allowanceOf(p.id) }
  })
  const mine = rows.find(r => r.p.id === me?.id)
  const publicHolidays = (data.data?.events ?? []).filter(e => HOLIDAY_CATEGORIES.has(e.category)).length
  const away = year === thisYear ? awayOn(off, now) : []
  const sickDays = rows.reduce((n, r) => n + r.sick, 0)
  const otherText = (r: (typeof rows)[number]) => r.other.map(k => `${leaveLabel(k)} ${r.used.days[k]}`).join(' · ')
  const ideas = PERK_IDEAS.filter(i => !extras.some(b => b.name?.toLowerCase() === t(i).toLowerCase()))

  const table = (): ExportTable => ({
    title: t('Staff benefits {year}', { year }), filename: `staff-benefits-${year}`,
    columns: [t('Person'), t('Holiday'), t('Taken'), t('Booked'), t('Left'), t('Sick days'), t('Other leave'), t('Note')],
    rows: rows.map(r => [r.p.full_name, r.allowance, r.used.holidayTaken, r.used.holidayBooked, r.left, r.sick, otherText(r), r.own?.note ?? '']),
  })

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Staff benefits')} actions={<>
        {seesTeam && <ExportButton table={table} disabled={!rows.length} folder="Team" />}
        {canEdit && <Button variant="contained" startIcon={<RecordIcon />} onClick={() => setRecording(true)}>{t('Record leave')}</Button>}
      </>} />
      <ErrorBox error={data.error} />
      <Typography sx={{ mb: 0.5, maxWidth: 760 }}>
        {t('What everyone on the team gets in {country}: the legal minimum, and what {business} gives on top. A convenio colectivo can give more, never less.',
          { country: t(COUNTRY_NAME[country]), business: businessName })}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {tr('Checked against the {law} on {date}. Your convenio and your gestoría have the final word.', {
          law: <Link href={checked.link} target="_blank" rel="noopener">{checked.source}</Link>, date: day(checked.on) })}
      </Typography>

      <StatGrid>
        {mine && <StatTile label={t('My holiday left in {year}', { year })} value={tn(mine.left, '{n} day', '{n} days')}
          note={t('{used} of {allowance} used or booked', { used: mine.used.holidayTaken + mine.used.holidayBooked, allowance: mine.allowance })} />}
        {(!isPartner || partnerCan('calendar')) && (
          <StatTile label={t('Public holidays in {year}', { year })} value={data.data ? publicHolidays : '–'} note={t('On the Calendar')} />
        )}
        <StatTile label={t('Sick days in {year}', { year })} value={data.data ? sickDays : '–'} note={seesTeam ? t('The whole team') : t('Yours')} />
        {year === thisYear && <StatTile label={t('Off today')} value={away.length}
          note={away.length ? away.map(r => profiles.find(p => p.id === r.profile_id)?.full_name).filter(Boolean).join(', ') : t('Everyone’s in')} />}
      </StatGrid>

      <Card component="section" aria-label={t('Allocation')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={
            <TextField select size="small" label={t('Year')} value={year} onChange={e => setYear(Number(e.target.value))} sx={{ minWidth: 110 }}>
              {[thisYear - 1, thisYear, thisYear + 1].map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          }>{t('Allocation')}</SectionTitle>
          {rows.length === 0
            ? <Empty>{t('Nobody on the team yet.')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Person')}</TableCell><TableCell align="right">{t('Holiday')}</TableCell><TableCell align="right">{t('Taken')}</TableCell>
                    <TableCell align="right">{t('Booked')}</TableCell><TableCell align="right">{t('Left')}</TableCell>
                    <TableCell align="right">{t('Sick days')}</TableCell><TableCell>{t('Other leave')}</TableCell>{canEdit && <TableCell />}
                  </TableRow></TableHead>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.p.id} hover>
                        <TableCell sx={{ minWidth: 180 }}>
                          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                            <PersonAvatar name={r.p.full_name} colour={r.p.colour} size={28} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.p.full_name}</Typography>
                              {r.own && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{r.own.note ?? t('Their own allowance')}</Typography>}
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.allowance}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.used.holidayTaken}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.used.holidayBooked}</TableCell>
                        <TableCell align="right">
                          <Tag {...(r.left < 0 ? { fg: tokens.badFg, bg: tokens.badBg } : r.left <= 3 ? { fg: tokens.warnFg, bg: tokens.warnBg } : { fg: tokens.goodFg, bg: tokens.goodBg })}>
                            {tn(r.left, '{n} day', '{n} days')}
                          </Tag>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.sick}</TableCell>
                        <TableCell sx={{ minWidth: 160 }}><Typography variant="body2">{otherText(r)}</Typography></TableCell>
                        {canEdit && (
                          <TableCell align="right">
                            <IconButton size="small" aria-label={t('Change the holiday of {name}', { name: r.p.full_name })} onClick={() => setAdjusting(r.p)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
            {t('Holiday counts calendar days, as requests on Time off do. Booked: approved days still to come, and requests waiting. Days of leave are those approved.')}
          </Typography>
        </CardContent>
      </Card>

      {LEAVE_GROUPS.map(g => (
        <Card key={g.id} component="section" aria-label={t(g.label)} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t(g.label)}</SectionTitle>
            <Stack>
              {law.filter(e => e.group === g.id).map(e => {
                const amount = amountOf(e)
                const note = own(e.key)?.details
                return (
                  <Stack key={e.key} component="article" aria-label={t(e.name)} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }}
                    sx={{ py: 1.75, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0, pt: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 500 }}>{t(e.name)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{e.term} · {e.law}</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{t(e.detail)}</Typography>
                      {note && <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-line' }}><b>{businessName}:</b> {note}</Typography>}
                    </Box>
                    <Box sx={{ width: { sm: 260 }, flexShrink: 0, textAlign: { sm: 'right' } }}>
                      <Typography sx={{ fontWeight: 500 }}>{allowanceText(e, amount)}</Typography>
                      {amount !== e.amount && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('The law: {allowance}', { allowance: allowanceText(e, e.amount) })}</Typography>
                      )}
                      <Box sx={{ my: 0.5 }}><Tag {...PAYER_TONE[e.payer]}>{t(PAYER_LABEL[e.payer])}</Tag></Box>
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t(e.pay)}</Typography>
                      {canEdit && <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(e)} aria-label={t('Change {name}', { name: t(e.name) })} sx={{ mt: 0.5 }}>{t('Change')}</Button>}
                    </Box>
                  </Stack>
                )
              })}
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Card component="section" aria-label={t('Extras from {business}', { business: businessName })} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={canEdit && <Button startIcon={<AddIcon />} onClick={() => setPerk({ name: '' })}>{t('Add a benefit')}</Button>}>
            {t('Extras from {business}', { business: businessName })}
          </SectionTitle>
          {extras.length === 0 && <Empty>{data.data ? t('Nothing added yet.') : t('Loading…')}</Empty>}
          <Stack>
            {extras.map(b => (
              <Stack key={b.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', py: 1.25, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0, pt: 0 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500 }}>{b.name}</Typography>
                  {b.details && <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-line' }}>{b.details}</Typography>}
                </Box>
                {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: b.name ?? '' })} onClick={() => setPerk(b)}><EditIcon fontSize="small" /></IconButton>}
              </Stack>
            ))}
          </Stack>
          {canEdit && ideas.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('Ideas to add:')}</Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                {ideas.map(i => <Chip key={i} size="small" variant="outlined" icon={<AddIcon />} label={t(i)} onClick={() => setPerk({ name: t(i) })} />)}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {editing && <EntitlementDialog entitlement={editing} amount={amountOf(editing)} own={own(editing.key)} onClose={() => setEditing(null)} />}
      {perk && <PerkDialog perk={perk} onClose={() => setPerk(null)} />}
      {adjusting && <AllowanceDialog person={adjusting} year={year} own={allowanceOf(adjusting.id)} onClose={() => setAdjusting(null)} />}
      {recording && <RecordDialog team={team} onClose={() => setRecording(false)} />}
    </>
  )
}

/** Admins: what the business gives for one of the law's (never less than the law), and a note for the team. */
function EntitlementDialog({ entitlement: e, amount, own, onClose }: { entitlement: Entitlement; amount: number | null; own?: Benefit; onClose: () => void }) {
  const { api, refresh, business } = useApp()
  const run = useAction()
  const [n, setN] = useState(amount === null ? '' : String(amount))
  const [details, setDetails] = useState(own?.details ?? '')
  const value = n === '' ? e.amount : Number(n)
  const low = belowLaw(e, value)
  const save = async () => {
    const ok = await run(async () => {
      if (low) throw new Error(t('It can’t be less than the law: {allowance}', { allowance: allowanceText(e, e.amount) }))
      // Holidays are the business's allowance in Settings: Time off checks requests against it.
      if (e.key === 'holidays') { await api.updateSettings({ vacation_days_per_year: value ?? 30 }); await refresh() }
      const patch = { amount: e.key === 'holidays' || value === e.amount ? null : value, details: details.trim() || null }
      if (own) await api.saveBenefit({ id: own.id, ...patch })
      else if (patch.amount !== null || patch.details) await api.saveBenefit({ law_key: e.key, ...patch })
    }, t('Saved'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="entitlement-title">
      <DialogTitle id="entitlement-title">{t(e.name)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('The law: {allowance}', { allowance: allowanceText(e, e.amount) })} · {e.law}</Typography>
          {e.amount !== null && (
            <TextField type="number" label={t('What {business} gives', { business: business?.name ?? businessConfig.name })} value={n} onChange={x => setN(x.target.value)}
              error={low} helperText={low ? t('It can’t be less than the law: {allowance}', { allowance: allowanceText(e, e.amount) }) : allowanceText(e, value)}
              slotProps={{ htmlInput: { min: e.amount, step: 0.5 } }} />
          )}
          <TextField label={t('Notes for the team')} value={details} onChange={x => setDetails(x.target.value)} multiline minRows={3}
            helperText={t('What the convenio or their contract adds, and how to ask for it.')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Admins: one of the business's own benefits (a staff meal, a birthday off). */
function PerkDialog({ perk, onClose }: { perk: Partial<Benefit>; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState(perk.name ?? '')
  const [details, setDetails] = useState(perk.details ?? '')
  const save = async () => {
    const ok = await run(async () => {
      if (!name.trim()) throw new Error(t('Give it a name'))
      await api.saveBenefit({ id: perk.id, name: name.trim(), details: details.trim() || null })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (perk.id && await run(() => api.deleteBenefit(perk.id!), t('Benefit removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="perk-title">
      <DialogTitle id="perk-title">{perk.id ? perk.name : t('Add a benefit')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} required />
          <TextField label={t('Details')} value={details} onChange={e => setDetails(e.target.value)} multiline minRows={2}
            helperText={t('Who gets it, and how')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {perk.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Admins: someone's holiday for a year, when it isn't the business's (they started part-way, days carried over). */
function AllowanceDialog({ person, year, own, onClose }: { person: Profile; year: number; own?: LeaveAllowance; onClose: () => void }) {
  const { api, settings } = useApp()
  const run = useAction()
  const base = settings?.vacation_days_per_year ?? 30
  const [days, setDays] = useState(String(own?.holiday_days ?? base))
  const [started, setStarted] = useState('')
  const [note, setNote] = useState(own?.note ?? '')
  const save = (holidayDays: number | null) => run(async () => {
    if (holidayDays !== null && !(holidayDays >= 0 && holidayDays <= 366)) throw new Error(t('Give a number of days from 0 to 366'))
    await api.saveLeaveAllowance({ profile_id: person.id, year, holiday_days: holidayDays, note: note.trim() || null })
  }, t('Saved')).then(ok => { if (ok) onClose() })
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="allowance-title">
      <DialogTitle id="allowance-title">{t('{name}: holiday in {year}', { name: person.full_name, year })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('The business gives {n} calendar days a year.', { n: base })}</Typography>
          <TextField type="number" label={t('Holiday days in {year}', { year })} value={days} onChange={e => setDays(e.target.value)}
            slotProps={{ htmlInput: { min: 0, max: 366, step: 0.5 } }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField type="date" label={t('Started on')} value={started} onChange={e => setStarted(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <Button disabled={!started} onClick={() => {
              setDays(String(proRata(base, year, started)))
              if (!note) setNote(t('Started on {date}', { date: day(started) }))
            }}>{t('Work out their share')}</Button>
          </Stack>
          <TextField label={t('Note')} value={note} onChange={e => setNote(e.target.value)} helperText={t('Why it’s different: started in August, days carried over…')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {own && <Button sx={{ mr: 'auto' }} onClick={() => void save(null)}>{t('Back to the business’s {n}', { n: base })}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save(days === '' ? null : Number(days))}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Admins: leave for someone (a sick note, birth leave, a bereavement), approved already. */
function RecordDialog({ team, onClose }: { team: Profile[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [person, setPerson] = useState(team[0]?.id ?? '')
  const [kind, setKind] = useState<TimeOffKind>('sick')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [note, setNote] = useState('')
  const birthWeeks = ENTITLEMENTS[businessConfig.country].find(e => e.key === 'birth')?.amount ?? 0
  const save = async () => {
    let opened = 0
    if (!await run(async () => { opened = await api.recordTimeOff(person, from, to, kind, note) })) return
    notify(opened ? tn(opened, 'Leave recorded. {n} shift is now an open shift.', 'Leave recorded. {n} shifts are now open shifts.') : t('Leave recorded'), 'success')
    onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="record-title">
      <DialogTitle id="record-title">{t('Record leave')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Person')} value={person} onChange={e => setPerson(e.target.value)}>
            {team.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
          </TextField>
          <TextField select label={t('Type')} value={kind} onChange={e => setKind(e.target.value as TimeOffKind)}>
            {TIME_OFF_KINDS.map(k => <MenuItem key={k} value={k}>{leaveLabel(k)}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField type="date" label={t('First day')} value={from} slotProps={{ inputLabel: { shrink: true } }}
              onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} />
            <TextField type="date" label={t('Last day')} value={to} slotProps={{ inputLabel: { shrink: true } }} onChange={e => setTo(e.target.value)} />
          </Stack>
          {kind === 'birth' && (
            <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setTo(addDays(from, birthWeeks * 7 - 1))}>
              {t('{n} weeks from the first day', { n: birthWeeks })}
            </Button>
          )}
          <TextField label={t('Note (optional)')} value={note} onChange={e => setNote(e.target.value)} />
          <Alert severity="info">{t('Approved straight away. Their shifts on those days become open shifts.')}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!person} onClick={() => void save()}>{t('Record')}</Button>
      </DialogActions>
    </Dialog>
  )
}
