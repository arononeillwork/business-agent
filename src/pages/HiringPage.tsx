import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, FormLabel, IconButton,
  InputAdornment, Link, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import SearchIcon from '@mui/icons-material/Search'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { HiringBoard, OPENING_TONE, STAGE_TONE } from '../components/HiringBoard'
import { addDays, formatLocal, localDate, today, zonedIso } from '../../shared/time'
import { cleanPhone } from '../../shared/customers'
import {
  APPLICANT_STAGES, CONTRACTS, JOB_BOARDS, OPENING_STATUSES, STILL_IN, applicantStageLabel, boardLabel, boardMove, contractLabel, finishedJob, hiringLanes,
  keepUntil, matchesCandidate, openingStatusLabel, overdue,
  type Applicant, type ApplicantInput, type ApplicantStage, type JobOpening, type OpeningInput, type OpeningStatus,
} from '../../shared/hiring'
import { tokens } from '../theme'
import { t } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const when = (iso: string | null) => (iso ? formatLocal(iso, 'EEE d MMM, HH:mm') : '')
type View = 'board' | 'candidates' | 'jobs'
// The candidates list's stage filter: everyone, those still in the running, or one stage.
type StageFilter = 'all' | 'running' | ApplicantStage

/**
 * Hiring (Team): the jobs being filled, where each is advertised, and who applied, stage by stage
 * (an interview goes on the calendar for admins) until someone is hired and added to the team.
 * Seen as a board (a swimlane per job, a column per stage, cards dragged along), as one list of every
 * candidate (searched and filtered), or job by job. Applicants who weren't hired are kept a year,
 * then their details should go (GDPR). Admins only.
 */
export function HiringPage() {
  const { api, isAdmin, positions } = useApp()
  const jobs = useAsync('job-openings', () => api.jobOpenings(), [])
  const people = useAsync('applicants', () => api.applicants(), [])
  const run = useAction()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'candidates' ? 'candidates' : params.get('view') === 'jobs' ? 'jobs' : 'board'
  const [withFinished, setWithFinished] = useState(false)
  const [opening, setOpening] = useState<OpeningInput | null>(null)
  const [applicant, setApplicant] = useState<ApplicantInput | null>(null)
  const [hiring, setHiring] = useState<Applicant | null>(null)

  if (!isAdmin) {
    return <>
      <PageHeader eyebrow={t('Team')} title={t('Hiring')} />
      <Alert severity="info">{t('Hiring is only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const openings = [...(jobs.data ?? [])].sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.opened_on.localeCompare(a.opened_on))
  const all = people.data ?? []
  const running = all.filter(a => STILL_IN.includes(a.stage))
  const week = addDays(now, 7)
  const interviews = all.filter(a => a.interview_at && STILL_IN.includes(a.stage) && localDate(a.interview_at) >= now && localDate(a.interview_at) <= week)
  const toRemove = all.filter(a => overdue(a, now))
  const positionName = (id: number | null) => positions.find(p => p.id === id)?.name
  const newOpening = (): OpeningInput => ({ title: '', contract: 'part_time', status: 'open', posted_on: [], opened_on: now })
  const newApplicant = (openingId: string): ApplicantInput => ({ opening_id: openingId, full_name: '', source: 'other', stage: 'applied', applied_on: now })

  const move = (a: Applicant, stage: ApplicantStage) => run(() => api.saveApplicant({ id: a.id, opening_id: a.opening_id, full_name: a.full_name, stage }),
    t('Moved to {stage}', { stage: t(applicantStageLabel(stage)) }))
  // Dropped on the board: another stage, or another job's lane.
  const drop = (a: Applicant, to: { opening_id: string; stage: ApplicantStage }) => {
    const patch = boardMove(a, to)
    if (!patch) return
    const job = openings.find(o => o.id === to.opening_id)
    void run(() => api.saveApplicant({ id: a.id, opening_id: to.opening_id, full_name: a.full_name, stage: to.stage }),
      patch.opening_id && job ? t('Moved to {stage}, for {job}', { stage: t(applicantStageLabel(to.stage)), job: job.title }) : t('Moved to {stage}', { stage: t(applicantStageLabel(to.stage)) }))
  }
  const forget = (a: Applicant) => run(() => api.deleteApplicant(a.id), t('{name}’s details removed', { name: a.full_name }))
  const lanes = hiringLanes(openings, all, withFinished)
  const finished = openings.filter(o => finishedJob(o, all)).length
  const setView = (v: View) => setParams(v === 'board' ? {} : { view: v }, { replace: true })
  const stageSelect = (a: Applicant) => (
    <TextField select size="small" variant="standard" value={a.stage} onChange={x => void move(a, x.target.value as ApplicantStage)}
      slotProps={{ input: { disableUnderline: true }, select: { SelectDisplayProps: { 'aria-label': t('Stage of {name}', { name: a.full_name }) },
        renderValue: v => <Tag {...STAGE_TONE[v as ApplicantStage]}>{t(applicantStageLabel(v as ApplicantStage))}</Tag> } }}>
      {APPLICANT_STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
    </TextField>
  )

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Hiring')} actions={<>
        {openings.length > 0 && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setApplicant(newApplicant(openings[0].id))}>{t('Add an applicant')}</Button>}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpening(newOpening())}>{t('Add a vacancy')}</Button>
      </>} />
      <ErrorBox error={jobs.error ?? people.error} />

      <StatGrid>
        <StatTile label={t('Open jobs')} value={jobs.data ? openings.filter(o => o.status === 'open').length : '–'} />
        <StatTile label={t('In the running')} value={running.length} note={t('{n} still to look at', { n: all.filter(a => a.stage === 'applied').length })} />
        <StatTile label={t('Interviews this week')} value={interviews.length} note={interviews.length ? interviews.map(a => `${a.full_name}, ${when(a.interview_at)}`).join(' · ') : t('None booked')} />
        <StatTile label={t('To remove')} value={toRemove.length} note={t('Kept over a year and not hired')} />
      </StatGrid>

      {toRemove.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('Kept over a year and not hired: {list}. Remove their details: the law says to keep them only while needed.', { list: toRemove.map(a => a.full_name).join(', ') })}
        </Alert>
      )}

      {openings.length === 0 && <Card sx={{ mb: 3 }}><CardContent><Empty>{jobs.data ? t('No jobs yet. Add the one you’re filling.') : t('Loading…')}</Empty></CardContent></Card>}

      {openings.length > 0 && (
        <Tabs value={view} onChange={(_, v: View) => setView(v)} variant="scrollable" allowScrollButtonsMobile aria-label={t('How to see the applicants')}
          sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
          <Tab value="board" label={t('Board')} />
          <Tab value="candidates" label={`${t('Candidates')} (${all.length})`} />
          <Tab value="jobs" label={`${t('Jobs')} (${openings.length})`} />
        </Tabs>
      )}

      {openings.length > 0 && view === 'board' && <>
        {finished > 0 && (
          <Chip clickable onClick={() => setWithFinished(x => !x)} aria-pressed={withFinished} variant={withFinished ? 'filled' : 'outlined'} sx={{ mb: 1.5 }}
            label={t('Filled and closed jobs ({n})', { n: finished })} />
        )}
        <HiringBoard lanes={lanes} today={now} positionName={positionName} onMove={drop} onEdit={setApplicant} onHire={setHiring}
          onAdd={o => setApplicant(newApplicant(o.id))} />
      </>}

      {openings.length > 0 && view === 'candidates' && (
        <CandidatesList applicants={all} openings={openings} today={now} stageSelect={stageSelect} onEdit={setApplicant} onHire={setHiring} onForget={a => void forget(a)} />
      )}

      {view === 'jobs' && openings.map(o => {
        const theirs = all.filter(a => a.opening_id === o.id)
        return (
          <Card key={o.id} component="section" aria-label={o.title} sx={{ mb: 3 }}>
            <CardContent>
              <SectionTitle action={<Stack direction="row" spacing={0.5}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setApplicant(newApplicant(o.id))} aria-label={t('Add an applicant for {name}', { name: o.title })}>{t('Applicant')}</Button>
                <IconButton size="small" aria-label={t('Edit {name}', { name: o.title })} onClick={() => setOpening(o)}><EditIcon fontSize="small" /></IconButton>
              </Stack>}>{o.title}</SectionTitle>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                <Tag {...OPENING_TONE[o.status]}>{t(openingStatusLabel(o.status))}</Tag>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[positionName(o.position_id), t(contractLabel(o.contract)), o.hours_per_week ? t('{n} hours a week', { n: o.hours_per_week }) : null, o.pay,
                    o.closes_on && o.status === 'open' ? t('Closes {date}', { date: day(o.closes_on) }) : null].filter(Boolean).join(' · ')}
                </Typography>
                {o.posted_on.map(b => <Tag key={b}>{t(boardLabel(b))}</Tag>)}
              </Stack>
              {theirs.length === 0
                ? <Empty>{t('Nobody has applied yet.')}</Empty>
                : <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" aria-label={t('Applicants for {name}', { name: o.title })}>
                      <TableHead><TableRow>
                        <TableCell>{t('Applicant')}</TableCell><TableCell>{t('Stage')}</TableCell><TableCell>{t('Interview')}</TableCell>
                        <TableCell>{t('Rating')}</TableCell><TableCell />
                      </TableRow></TableHead>
                      <TableBody>
                        {theirs.map(a => (
                          <TableRow key={a.id} hover>
                            <TableCell sx={{ minWidth: 200 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{a.full_name}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[t(boardLabel(a.source)), t('applied {date}', { date: day(a.applied_on) }), a.email ?? a.phone].filter(Boolean).join(' · ')}</Typography>
                              {overdue(a, now) && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Kept until {date}', { date: day(a.keep_until) })}</Tag></Box>}
                            </TableCell>
                            <TableCell>{stageSelect(a)}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{STILL_IN.includes(a.stage) ? when(a.interview_at) : ''}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }} aria-label={a.rating ? t('{n} out of 5', { n: a.rating }) : undefined}>{a.rating ? '★'.repeat(a.rating) + '☆'.repeat(5 - a.rating) : ''}</TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              {a.cv_link && <IconButton size="small" component="a" href={a.cv_link} target="_blank" rel="noopener" aria-label={t('Open the CV of {name}', { name: a.full_name })}><OpenIcon fontSize="small" /></IconButton>}
                              {(a.stage === 'offer' || a.stage === 'hired') && !a.profile_id && (
                                <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setHiring(a)} aria-label={t('Add {name} to the team', { name: a.full_name })}>{t('Add to the team')}</Button>
                              )}
                              {a.profile_id && <Button size="small" component={RouterLink} to="/team">{t('On the team')}</Button>}
                              {overdue(a, now) && <Button size="small" color="error" onClick={() => void forget(a)} aria-label={t('Remove the details of {name}', { name: a.full_name })}>{t('Remove')}</Button>}
                              <IconButton size="small" aria-label={t('Edit {name}', { name: a.full_name })} onClick={() => setApplicant(a)}><EditIcon fontSize="small" /></IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>}
            </CardContent>
          </Card>
        )
      })}

      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {t('Posting jobs to InfoJobs, Indeed and LinkedIn from the app is coming (Connections). Until then, post them there and add who applies here.')}
      </Typography>

      {opening && <OpeningDialog opening={opening} onClose={() => setOpening(null)} />}
      {applicant && <ApplicantDialog applicant={applicant} openings={openings} onClose={() => setApplicant(null)} />}
      {hiring && <AddToTeamDialog applicant={hiring} onClose={() => setHiring(null)} />}
    </>
  )
}

/** Every candidate in one list, whichever job they applied for: searched, and narrowed to a job or a stage. */
function CandidatesList({ applicants, openings, today, stageSelect, onEdit, onHire, onForget }: {
  applicants: Applicant[]; openings: JobOpening[]; today: string; stageSelect: (a: Applicant) => ReactNode
  onEdit: (a: Applicant) => void; onHire: (a: Applicant) => void; onForget: (a: Applicant) => void
}) {
  const [query, setQuery] = useState('')
  const [job, setJob] = useState('all')
  const [stage, setStage] = useState<StageFilter>('all')
  const title = (id: string) => openings.find(o => o.id === id)?.title ?? ''
  const shown = applicants
    .filter(a => matchesCandidate(a, query) && (job === 'all' || a.opening_id === job)
      && (stage === 'all' || (stage === 'running' ? STILL_IN.includes(a.stage) : a.stage === stage)))
    .sort((a, b) => b.applied_on.localeCompare(a.applied_on) || a.full_name.localeCompare(b.full_name))
  return (
    <Card component="section" aria-label={t('Candidates')} sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField size="small" placeholder={t('Search the candidates')} value={query} onChange={e => setQuery(e.target.value)} sx={{ flex: 2 }}
            slotProps={{ htmlInput: { 'aria-label': t('Search the candidates') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <TextField select size="small" label={t('Job')} value={job} onChange={e => setJob(e.target.value)} sx={{ flex: 1, minWidth: 160 }}>
            <MenuItem value="all">{t('All jobs')}</MenuItem>
            {openings.map(o => <MenuItem key={o.id} value={o.id}>{o.title}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('Stage')} value={stage} onChange={e => setStage(e.target.value as StageFilter)} sx={{ flex: 1, minWidth: 160 }}>
            <MenuItem value="all">{t('Everyone')}</MenuItem>
            <MenuItem value="running">{t('Still in the running')}</MenuItem>
            {APPLICANT_STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
          </TextField>
        </Stack>
        {shown.length === 0
          ? <Empty>{applicants.length ? t('No candidates match.') : t('Nobody has applied yet.')}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('Candidates')}>
                <TableHead><TableRow>
                  <TableCell>{t('Candidate')}</TableCell><TableCell>{t('Job')}</TableCell><TableCell>{t('Stage')}</TableCell>
                  <TableCell>{t('Came from')}</TableCell><TableCell>{t('Applied on')}</TableCell><TableCell>{t('Interview')}</TableCell>
                  <TableCell>{t('Rating')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {shown.map(a => (
                    <TableRow key={a.id} hover>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{a.full_name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{[a.email, a.phone].filter(Boolean).join(' · ')}</Typography>
                        {overdue(a, today) && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Kept until {date}', { date: day(a.keep_until) })}</Tag></Box>}
                      </TableCell>
                      <TableCell sx={{ minWidth: 140 }}>{title(a.opening_id)}</TableCell>
                      <TableCell>{stageSelect(a)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(boardLabel(a.source))}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(a.applied_on)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{STILL_IN.includes(a.stage) ? when(a.interview_at) : ''}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }} aria-label={a.rating ? t('{n} out of 5', { n: a.rating }) : undefined}>{a.rating ? '★'.repeat(a.rating) + '☆'.repeat(5 - a.rating) : ''}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {a.cv_link && <IconButton size="small" component="a" href={a.cv_link} target="_blank" rel="noopener" aria-label={t('Open the CV of {name}', { name: a.full_name })}><OpenIcon fontSize="small" /></IconButton>}
                        {(a.stage === 'offer' || a.stage === 'hired') && !a.profile_id && (
                          <Button size="small" startIcon={<PersonAddIcon />} onClick={() => onHire(a)} aria-label={t('Add {name} to the team', { name: a.full_name })}>{t('Add to the team')}</Button>
                        )}
                        {a.profile_id && <Button size="small" component={RouterLink} to="/team">{t('On the team')}</Button>}
                        {overdue(a, today) && <Button size="small" color="error" onClick={() => onForget(a)} aria-label={t('Remove the details of {name}', { name: a.full_name })}>{t('Remove')}</Button>}
                        <IconButton size="small" aria-label={t('Edit {name}', { name: a.full_name })} onClick={() => onEdit(a)}><EditIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>}
      </CardContent>
    </Card>
  )
}

/** A job: what it is, the contract and pay, where it's advertised and whether it's still open. */
function OpeningDialog({ opening, onClose }: { opening: OpeningInput; onClose: () => void }) {
  const { api, positions } = useApp()
  const run = useAction()
  const [o, setO] = useState<OpeningInput>(opening)
  const set = (p: Partial<OpeningInput>) => setO(x => ({ ...x, ...p }))
  const posted = o.posted_on ?? []
  const save = async () => {
    const ok = await run(async () => {
      if (!o.title.trim()) throw new Error(t('Give the job a title'))
      const { created_at: _at, ...input } = o as JobOpening
      await api.saveOpening({ ...input, title: o.title.trim() })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (o.id && await run(() => api.deleteOpening(o.id!), t('Job removed, with its applicants'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="opening-title">
      <DialogTitle id="opening-title">{o.id ? o.title : t('Add a vacancy')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Job title')} value={o.title} onChange={e => set({ title: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Position on the rota')} value={o.position_id ?? ''} onChange={e => set({ position_id: e.target.value === '' ? null : Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ flex: 1 }}>
              <MenuItem value="">{t('None')}</MenuItem>
              {positions.filter(p => p.active).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField select label={t('Contract')} value={o.contract ?? 'part_time'} onChange={e => set({ contract: e.target.value as JobOpening['contract'] })} sx={{ flex: 1 }}>
              {CONTRACTS.map(c => <MenuItem key={c.id} value={c.id}>{t(c.label)}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Hours a week')} type="number" value={o.hours_per_week ?? ''} onChange={e => set({ hours_per_week: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('Pay')} value={o.pay ?? ''} onChange={e => set({ pay: e.target.value })} placeholder={t('€1.350 gross a month')} sx={{ flex: 2 }} />
          </Stack>
          <TextField label={t('About the job')} value={o.description ?? ''} multiline minRows={3} onChange={e => set({ description: e.target.value })}
            helperText={t('The days and hours, what they’ll do, what you’re looking for')} />
          <Box>
            <FormLabel component="legend" sx={{ fontSize: '0.8rem' }}>{t('Advertised on')}</FormLabel>
            <FormGroup row>
              {JOB_BOARDS.map(b => (
                <FormControlLabel key={b.id} label={t(b.label)} control={
                  <Checkbox checked={posted.includes(b.id)} onChange={e => set({ posted_on: e.target.checked ? [...posted, b.id] : posted.filter(x => x !== b.id) })} />} />
              ))}
            </FormGroup>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Opened on')} type="date" value={o.opened_on ?? ''} onChange={e => set({ opened_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Closes on')} type="date" value={o.closes_on ?? ''} onChange={e => set({ closes_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField select label={t('Status')} value={o.status ?? 'open'} onChange={e => set({ status: e.target.value as OpeningStatus })} sx={{ flex: 1 }}>
              {OPENING_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {o.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Someone who applied: how to reach them, where they came from, how far they've got and the interview. */
function ApplicantDialog({ applicant, openings, onClose }: { applicant: ApplicantInput; openings: JobOpening[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [a, setA] = useState<ApplicantInput>(applicant)
  const set = (p: Partial<ApplicantInput>) => setA(x => ({ ...x, ...p }))
  const save = async () => {
    const ok = await run(async () => {
      if (!a.full_name.trim()) throw new Error(t('Add their name'))
      const phone = a.phone?.trim() ? cleanPhone(a.phone) : null
      if (a.phone?.trim() && !phone) throw new Error(t('That phone number doesn’t look right'))
      await api.saveApplicant({ ...a, full_name: a.full_name.trim(), phone, email: a.email?.trim() || null })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (a.id && await run(() => api.deleteApplicant(a.id!), t('Applicant removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="applicant-title">
      <DialogTitle id="applicant-title">{a.id ? a.full_name : t('Add an applicant')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Applied for')} value={a.opening_id} onChange={e => set({ opening_id: e.target.value })}>
            {openings.map(o => <MenuItem key={o.id} value={o.id}>{o.title}</MenuItem>)}
          </TextField>
          <TextField label={t('Name')} value={a.full_name} onChange={e => set({ full_name: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Email')} type="email" value={a.email ?? ''} onChange={e => set({ email: e.target.value })} sx={{ flex: 1 }} />
            <TextField label={t('Phone')} value={a.phone ?? ''} onChange={e => set({ phone: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Came from')} value={a.source ?? 'other'} onChange={e => set({ source: e.target.value as Applicant['source'] })} sx={{ flex: 1 }}>
              {JOB_BOARDS.map(b => <MenuItem key={b.id} value={b.id}>{t(b.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Stage')} value={a.stage ?? 'applied'} onChange={e => set({ stage: e.target.value as ApplicantStage })} sx={{ flex: 1 }}>
              {APPLICANT_STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Interview')} type="datetime-local" sx={{ flex: 1 }} slotProps={{ inputLabel: { shrink: true } }}
              value={a.interview_at ? `${localDate(a.interview_at)}T${formatLocal(a.interview_at, 'HH:mm')}` : ''}
              onChange={e => set({ interview_at: e.target.value ? zonedIso(e.target.value.slice(0, 10), e.target.value.slice(11, 16)) : null })} helperText={t('Goes on the calendar, for admins')} />
            <TextField select label={t('Rating')} value={a.rating ?? ''} onChange={e => set({ rating: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('Not yet')}</MenuItem>
              {[5, 4, 3, 2, 1].map(n => <MenuItem key={n} value={n}>{t('{n} out of 5', { n })}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('CV')} value={a.cv_link ?? ''} onChange={e => set({ cv_link: e.target.value || null })} placeholder={'https://'} helperText={t('A link to it: the job board, Drive or OneDrive')} />
          <TextField label={t('Notes')} value={a.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField label={t('Applied on')} type="date" value={a.applied_on ?? ''} onChange={e => set({ applied_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <Typography variant="body2" sx={{ flex: 2, color: 'text.secondary' }}>
              {a.applied_on && t('If they aren’t hired, their details are kept until {date}.', { date: day(keepUntil(a.applied_on)) })}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {a.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Hired: invite them to the app as an employee (as on Team), and mark them hired. */
function AddToTeamDialog({ applicant, onClose }: { applicant: Applicant; onClose: () => void }) {
  const { api, refresh } = useApp()
  const run = useAction()
  const [email, setEmail] = useState(applicant.email ?? '')
  const add = async () => {
    const ok = await run(async () => {
      const address = email.trim().toLowerCase()
      await api.invite(address, applicant.full_name, 'employee', undefined, { phone: applicant.phone })
      const profile = (await api.profiles()).find(p => p.email?.toLowerCase() === address)
      await api.saveApplicant({ id: applicant.id, opening_id: applicant.opening_id, full_name: applicant.full_name, stage: 'hired', profile_id: profile?.id ?? null })
      await refresh()
    }, t('{name} is on the team: an invite is on its way', { name: applicant.full_name }))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="hire-title">
      <DialogTitle id="hire-title">{t('Add {name} to the team', { name: applicant.full_name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">{t('They get an email to sign in to the app as an employee. Their pay, position and PIN are set on Team.')}</Typography>
          <TextField label={t('Email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Link component={RouterLink} to="/team" variant="body2">{t('Open Team')}</Link>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void add()} disabled={!email.trim()}>{t('Send the invite')}</Button>
      </DialogActions>
    </Dialog>
  )
}
