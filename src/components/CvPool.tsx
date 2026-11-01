import {
  Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormLabel, IconButton, InputAdornment, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import SearchIcon from '@mui/icons-material/Search'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import ViewIcon from '@mui/icons-material/VisibilityOutlined'
import WorkIcon from '@mui/icons-material/WorkOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, SectionTitle, Tag } from './common'
import { FileViewer } from '../pages/LegalDocumentsPage'
import type { Api } from '../data/api'
import { cleanPhone } from '../../shared/customers'
import { formatLocal, today as todayIs } from '../../shared/time'
import {
  CV_ACCEPT, JOB_BOARDS, availableBy, boardLabel, cleanRoles, cvPreview, cvProblem, cvSize, keepUntil, matchesPoolCandidate, openingStatusLabel, overdue, poolRoles,
  suits, type Applicant, type ApplicantCv, type JobOpening, type PoolInput,
} from '../../shared/hiring'
import { tokens } from '../theme'
import { t } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
// The pool's "can start" filter: whenever, by today, or later on.
type CanStart = 'all' | 'now' | 'later'

/** A CV chosen in a dialog: a new file to upload, the one kept taken off ('remove'), or as it was (null). */
export type CvChange = File | 'remove' | null

/** Once the applicant is saved: upload the new CV, or take the old one off. */
export async function applyCvChange(api: Api, applicantId: string, change: CvChange) {
  if (change instanceof File) await api.uploadApplicantCv(applicantId, change)
  else if (change === 'remove') await api.removeApplicantCv(applicantId)
}

/** The applicants' uploaded CVs: who has one, shown in the page (a PDF or a picture) or downloaded. */
export function useCvFiles() {
  const { api } = useApp()
  const notify = useNotify()
  const list = useAsync('applicant-cvs', () => api.applicantCvs(), [])
  const [viewing, setViewing] = useState<{ cv: ApplicantCv; name: string } | null>(null)
  const cvOf = (id: string) => list.data?.find(c => c.applicant_id === id)
  const download = async (cv: ApplicantCv) => {
    try {
      const url = URL.createObjectURL(await api.applicantCvFile(cv.applicant_id))
      Object.assign(document.createElement('a'), { href: url, download: cv.file_name }).click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) { notify(e instanceof Error ? e.message : String(e), 'error') }
  }
  /** Shown in the page when it can be (a PDF or a picture), downloaded when not (a Word document). */
  const view = (cv: ApplicantCv, name: string) => { if (cvPreview(cv)) setViewing({ cv, name }); else void download(cv) }
  const viewer = viewing && (
    <FileViewer key={`${viewing.cv.applicant_id}:${viewing.cv.added_at}`} id={viewing.cv.applicant_id} title={viewing.cv.file_name} link={null} where={null}
      as={cvPreview(viewing.cv) ?? 'pdf'} load={() => api.applicantCvFile(viewing.cv.applicant_id)} onClose={() => setViewing(null)}
      caption={t('{name}’s CV, uploaded {date}.', { name: viewing.name, date: formatLocal(viewing.cv.added_at, 'd MMM yyyy') })} />
  )
  return { cvOf, view, download, viewer, error: list.error }
}
export type CvFiles = ReturnType<typeof useCvFiles>

/** Someone's CV in a list: shown in the page and downloaded (an upload), or opened where it's kept (a link). */
export function CvActions({ a, files }: { a: Pick<Applicant, 'id' | 'full_name' | 'cv_link'>; files: CvFiles }) {
  const cv = files.cvOf(a.id)
  return <>
    {cv && cvPreview(cv) && (
      <IconButton size="small" aria-label={t('View the CV of {name}', { name: a.full_name })} onClick={() => files.view(cv, a.full_name)}><ViewIcon fontSize="small" /></IconButton>
    )}
    {cv && (
      <IconButton size="small" aria-label={t('Download the CV of {name}', { name: a.full_name })} onClick={() => void files.download(cv)}><DownloadIcon fontSize="small" /></IconButton>
    )}
    {a.cv_link && (
      <IconButton size="small" component="a" href={a.cv_link} target="_blank" rel="noopener" aria-label={t('Open the CV of {name}', { name: a.full_name })}><OpenIcon fontSize="small" /></IconButton>
    )}
  </>
}

/** The CV in a dialog: the one kept (shown, replaced or taken off), or a file to upload once saved. */
export function CvFileField({ cv, change, onChange, onView }: { cv: ApplicantCv | undefined; change: CvChange; onChange: (c: CvChange) => void; onView?: () => void }) {
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const pick = (f: File | undefined) => {
    if (!f) return
    const problem = cvProblem(f)
    if (problem) notify(t(problem), 'error')
    else onChange(f)
  }
  const chosen = change instanceof File ? change : null
  const kept = !chosen && change !== 'remove' ? cv : undefined
  const name = chosen?.name ?? kept?.file_name
  return (
    <Box>
      <FormLabel component="div" sx={{ fontSize: '0.8rem', mb: 0.5 }}>{t('CV')}</FormLabel>
      {name ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {kept && onView && cvPreview(kept)
            ? <Link component="button" type="button" variant="body2" onClick={onView} sx={{ fontWeight: 500, overflowWrap: 'anywhere', textAlign: 'left' }}>{name}</Link>
            : <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{name}</Typography>}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {chosen ? t('{size}, uploaded when you save', { size: cvSize(chosen.size) }) : cvSize(kept!.size)}
          </Typography>
          <Button size="small" onClick={() => input.current?.click()} aria-label={t('Replace the CV')}>{t('Replace')}</Button>
          <Button size="small" color="error" onClick={() => onChange(cv ? 'remove' : null)} aria-label={t('Remove the CV')}>{t('Remove')}</Button>
        </Stack>
      ) : (
        <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={() => input.current?.click()}>{t('Upload the CV')}</Button>
      )}
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>{t('A PDF, a Word document or a picture, up to 10 MB')}</Typography>
      <input ref={input} type="file" hidden accept={CV_ACCEPT} aria-label={t('CV file')}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f) }} />
    </Box>
  )
}

/**
 * The CV pool (Hiring): people kept for a job to come when there's no job for them yet, with the roles
 * they'd suit, when they can start and their CV. Searched and narrowed to a role or to who can start
 * now; each is added to a job once there's one for them (they go on its board at Applied).
 */
export function CvPool({ pool, openings, today, files, onAdd, onEdit, onAddToJob, onForget }: {
  pool: Applicant[]; openings: JobOpening[]; today: string; files: CvFiles
  /** Add someone (none when the page offers it already). */
  onAdd?: () => void
  onEdit: (a: Applicant) => void; onAddToJob: (a: Applicant) => void; onForget: (a: Applicant) => void
}) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('all')
  const [start, setStart] = useState<CanStart>('all')
  const roles = poolRoles(pool)
  const shown = pool.filter(a => matchesPoolCandidate(a, query) && (role === 'all' || suits(a, role))
    && (start === 'all' || (start === 'now') === availableBy(a, today)))
  return (
    <Card component="section" aria-label={t('CV pool')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={onAdd && <Button size="small" startIcon={<AddIcon />} onClick={onAdd}>{t('Add a CV')}</Button>}>{t('CV pool')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {openings.length
            ? t('CVs kept for a job to come. When there’s one for them, add them to it from here.')
            : t('CVs kept for a job to come. Once you post a job, add them to it from here.')}
        </Typography>
        {pool.length > 0 && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField size="small" placeholder={t('Search the CV pool')} value={query} onChange={e => setQuery(e.target.value)} sx={{ flex: 2 }}
              slotProps={{ htmlInput: { 'aria-label': t('Search the CV pool') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <TextField select size="small" label={t('Role')} value={role} onChange={e => setRole(e.target.value)} sx={{ flex: 1, minWidth: 160 }}>
              <MenuItem value="all">{t('All roles')}</MenuItem>
              {roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('Can start')} value={start} onChange={e => setStart(e.target.value as CanStart)} sx={{ flex: 1, minWidth: 160 }}>
              <MenuItem value="all">{t('Any time')}</MenuItem>
              <MenuItem value="now">{t('Now')}</MenuItem>
              <MenuItem value="later">{t('Later')}</MenuItem>
            </TextField>
          </Stack>
        )}
        {shown.length === 0
          ? <Empty>{pool.length ? t('Nobody in the CV pool matches.') : t('No CVs kept yet. When someone hands one in and there’s no job for them, add it here for later.')}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('CV pool')}>
                <TableHead><TableRow>
                  <TableCell>{t('Candidate')}</TableCell><TableCell>{t('Suits')}</TableCell><TableCell>{t('Can start')}</TableCell>
                  <TableCell>{t('Added on')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {shown.map(a => (
                    <TableRow key={a.id} hover>
                      <TableCell sx={{ minWidth: 200 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{a.full_name}</Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere' }}>{[a.email, a.phone].filter(Boolean).join(' · ')}</Typography>
                        {a.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', maxWidth: 360 }}>{a.notes}</Typography>}
                        {overdue(a, today) && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Kept until {date}', { date: day(a.keep_until) })}</Tag></Box>}
                      </TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>{a.roles.map(r => <Tag key={r}>{r}</Tag>)}</Stack>
                      </TableCell>
                      <TableCell sx={{ minWidth: 130 }}>
                        <Typography variant="body2">{availableBy(a, today) ? t('Now') : t('From {date}', { date: day(a.available_from) })}</Typography>
                        {a.availability && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{a.availability}</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{day(a.applied_on)}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(boardLabel(a.source))}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <CvActions a={a} files={files} />
                        {openings.length > 0 && (
                          <Button size="small" startIcon={<WorkIcon />} onClick={() => onAddToJob(a)} aria-label={t('Add {name} to a job', { name: a.full_name })}>{t('Add to a job')}</Button>
                        )}
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

/** Someone for the CV pool: how to reach them, the roles they'd suit, when they can start, their CV and notes. */
export function PoolDialog({ person, pool, files, onClose }: { person: Applicant | null; pool: Applicant[]; files: CvFiles; onClose: () => void }) {
  const { api, positions, jobRoles } = useApp()
  const run = useAction()
  const [c, setC] = useState<PoolInput>(() => person
    ? { id: person.id, full_name: person.full_name, email: person.email, phone: person.phone, source: person.source, roles: person.roles, available_from: person.available_from,
        availability: person.availability, cv_link: person.cv_link, notes: person.notes, applied_on: person.applied_on }
    : { full_name: '', source: 'other', roles: [], applied_on: todayIs() })
  const [file, setFile] = useState<CvChange>(null)
  const set = (p: Partial<PoolInput>) => setC(x => ({ ...x, ...p }))
  const cv = c.id ? files.cvOf(c.id) : undefined
  // The business's positions and roles, and the roles already typed for the pool.
  const options = poolRoles([{ roles: positions.filter(p => p.active).map(p => p.name) }, { roles: jobRoles.map(r => r.name) }, ...pool])
  const save = async () => {
    const name = c.full_name.trim()
    const ok = await run(async () => {
      if (!name) throw new Error(t('Add their name'))
      const phone = c.phone?.trim() ? cleanPhone(c.phone) : null
      if (c.phone?.trim() && !phone) throw new Error(t('That phone number doesn’t look right'))
      const id = await api.savePoolCandidate({ ...c, full_name: name, phone, email: c.email?.trim() || null, roles: cleanRoles(c.roles ?? []),
        availability: c.availability?.trim() || null, cv_link: c.cv_link?.trim() || null, notes: c.notes?.trim() || null, available_from: c.available_from || null })
      // Saved: a second try (the CV didn't upload) changes them rather than adding them again.
      setC(x => ({ ...x, id }))
      await applyCvChange(api, id, file)
    }, c.id ? t('Saved') : t('{name} is in the CV pool', { name }))
    if (ok) onClose()
  }
  const remove = async () => {
    if (c.id && await run(() => api.deleteApplicant(c.id!), t('{name}’s details removed', { name: c.full_name }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="pool-title">
      <DialogTitle id="pool-title">{person ? person.full_name : t('Add a CV')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Kept in the CV pool for a job to come: no job needed.')}</Typography>
          <TextField label={t('Name')} value={c.full_name} onChange={e => set({ full_name: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Email')} type="email" value={c.email ?? ''} onChange={e => set({ email: e.target.value })} sx={{ flex: 1 }} />
            <TextField label={t('Phone')} value={c.phone ?? ''} onChange={e => set({ phone: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <Autocomplete multiple freeSolo autoSelect options={options} value={c.roles ?? []} filterSelectedOptions
            onChange={(_, v) => set({ roles: cleanRoles(v) })}
            renderValue={(value, getItemProps) => value.map((x, i) => { const { key, ...p } = getItemProps({ index: i }); return <Chip key={key} size="small" label={x} {...p} /> })}
            renderInput={params => <TextField {...params} label={t('Roles they’d suit')} helperText={t('Pick a role or type one and press Enter')} />} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Can start from')} type="date" value={c.available_from ?? ''} onChange={e => set({ available_from: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true } }} helperText={t('Empty: they can start now')} sx={{ flex: 1 }} />
            <TextField label={t('When they can work')} value={c.availability ?? ''} onChange={e => set({ availability: e.target.value })}
              placeholder={t('Weekends, mornings until June…')} slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ flex: 1 }} />
          </Stack>
          <TextField select label={t('Came from')} value={c.source ?? 'other'} onChange={e => set({ source: e.target.value as Applicant['source'] })}>
            {JOB_BOARDS.map(b => <MenuItem key={b.id} value={b.id}>{t(b.label)}</MenuItem>)}
          </TextField>
          <CvFileField cv={cv} change={file} onChange={setFile} onView={cv ? () => files.view(cv, c.full_name) : undefined} />
          <TextField label={t('Or a link to it')} value={c.cv_link ?? ''} onChange={e => set({ cv_link: e.target.value || null })} placeholder={'https://'}
            helperText={t('A link to it: the job board, Drive or OneDrive')} />
          <TextField label={t('Notes')} value={c.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField label={t('Added on')} type="date" value={c.applied_on ?? ''} onChange={e => set({ applied_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <Typography variant="body2" sx={{ flex: 2, color: 'text.secondary' }}>
              {c.applied_on && t('If they aren’t hired, their details are kept until {date}.', { date: day(keepUntil(c.applied_on)) })}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {c.id && person && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Someone from the CV pool onto a job: they go on its board at Applied, with their CV and notes. */
export function AddToJobDialog({ person, openings, onClose }: { person: Applicant; openings: JobOpening[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [job, setJob] = useState(openings.find(o => o.status === 'open')?.id ?? openings[0]?.id ?? '')
  const add = async () => {
    const title = openings.find(o => o.id === job)?.title ?? ''
    if (await run(() => api.addToJob(person.id, job), t('{name} is on the board for {job}', { name: person.full_name, job: title }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="pool-job-title">
      <DialogTitle id="pool-job-title">{t('Add {name} to a job', { name: person.full_name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Which job')} value={job} onChange={e => setJob(e.target.value)}>
            {openings.map(o => <MenuItem key={o.id} value={o.id}>{o.status === 'open' ? o.title : `${o.title} (${t(openingStatusLabel(o.status))})`}</MenuItem>)}
          </TextField>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('They go on its board at Applied, with their CV and notes.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void add()} disabled={!job}>{t('Add to the job')}</Button>
      </DialogActions>
    </Dialog>
  )
}
