import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Link, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import PassIcon from '@mui/icons-material/CheckCircleOutlined'
import FailIcon from '@mui/icons-material/CancelOutlined'
import UnknownIcon from '@mui/icons-material/HelpOutlineOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import NextIcon from '@mui/icons-material/ArrowForward'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  BUSINESS_QUESTIONS, DOCUMENTS, FILTERS, GRANTS, FILTER_OF, QUESTIONS, STAGES, STATUS_LABEL, daysBetween, deadlineOf, documentsFor, evaluateAll,
  isDone, knownAnswers, nextStage, profileOf, questionMatters, stageLabel,
  type Condition, type Deadline, type Evaluation, type Grant, type GrantApplication, type GrantFilter, type GrantProfile, type GrantStatus,
  type Question, type Text,
} from '../../shared/grants'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const fmtDate = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A rule's text in the person's language, with its dates and amounts written out. */
const say = (x: Text) => t(x.text, Object.fromEntries(Object.entries(x.vars ?? {}).map(([k, v]) =>
  [k, typeof v === 'string' && ISO_DATE.test(v) ? fmtDate(v) : k === 'amount' && typeof v === 'number' ? formatMoney(v) : v])))

const TONE: Record<GrantStatus, { fg: string; bg: string }> = {
  yes: { fg: tokens.goodFg, bg: tokens.goodBg }, active: { fg: tokens.goodFg, bg: tokens.goodBg },
  check: { fg: tokens.infoFg, bg: tokens.infoBg }, next: { fg: tokens.warnFg, bg: tokens.warnBg }, no: { fg: tokens.badFg, bg: tokens.badBg },
}

function deadlineText(d: Deadline) {
  switch (d.kind) {
    case 'not_open': return t('Not open yet')
    case 'later': return t('Later for you')
    case 'closed': return t('Closed for now')
    case 'all_year': return t('All year')
    case 'until_funds': return t('Until funds run out')
    default: return d.days === 0 ? t('{date} (last day)', { date: fmtDate(d.date) })
      : d.days > 0 && d.days <= 14 ? tn(d.days, '{date} ({n} day left)', '{date} ({n} days left)', { date: fmtDate(d.date) }) : fmtDate(d.date)
  }
}

/** One line on where they stand with a grant. */
function verdict({ grant, result, status }: Evaluation) {
  const fails = result.conds.filter(c => c.state === 'fail')
  const unknown = result.conds.filter(c => c.state === 'unknown')
  if (status === 'active') return t(result.conds[0].label)
  if (status === 'no') return t('Not a match: {reason}', { reason: t(fails[0].label) }) + (fails[0].note ? `. ${say(fails[0].note)}` : '')
  if (status === 'next') return result.whenNote ? say(result.whenNote) : grant.next_call ? t(grant.next_call) : t('Watch for the next call.')
  if (status === 'check') {
    const shown = unknown.slice(0, 2).map(c => t(c.label)).join('; ')
    return unknown.length > 2 ? t('To confirm: {items} and {n} more', { items: shown, n: unknown.length - 2 }) : t('To confirm: {items}', { items: shown })
  }
  return t('Meets every requirement that can be checked.')
}

/** Grants that fit, the questions that decide them, and the applications under way. Finance partners read only. */
export function GrantsPage() {
  const { api, business, profiles, canSeeFinances, isPartner } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const saved = useAsync('grant-profile', () => api.grantProfile(), [])
  const apps = useAsync('grant-applications', () => api.grantApplications(), [])
  const run = useAction()
  // Answers show straight away; each change is saved as it's made.
  const [answers, setAnswers] = useState<Partial<GrantProfile> | null>(null)
  useEffect(() => { if (saved.data && !answers) setAnswers(saved.data) }, [saved.data, answers])

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Grants')} />
      <Alert severity="info">{t('Grants are only visible to admins with pay access.')}</Alert>
    </>
  }

  const day = today()
  const employees = profiles.filter(p => p.active && p.role === 'employee').length
  const known = business ? knownAnswers(business, profiles.length ? employees : null) : {}
  const profile = profileOf(known, answers ?? saved.data ?? {})
  const results = evaluateAll(profile, day)
  const list = apps.data ?? []
  const open = list.filter(a => !isDone(a.stage))
  const count = (s: GrantStatus) => results.filter(x => x.status === s).length

  const answer = (patch: Partial<GrantProfile>) => {
    const next = { ...(answers ?? {}), ...patch }
    setAnswers(next)
    void run(() => api.saveGrantProfile(next))
  }
  const track = (x: Evaluation) => {
    const d = deadlineOf(x, day)
    return run(() => api.saveGrantApplication({ grant_id: x.grant.id, grant_name: x.grant.name, stage: 'interested',
      deadline: d.kind === 'date' && d.days >= 0 ? d.date : null, deadline_label: d.kind === 'date' && d.days >= 0 ? msg('Apply') : null,
      amount_requested: x.result.max || x.grant.max || null }), t('Added to your applications'))
  }

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Grants')} actions={!canEdit && <Tag>{t('Read-only')}</Tag>} />
      <ErrorBox error={saved.error ?? apps.error} />
      <Typography sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 760 }}>
        {t('From Solicita’s list of grants for Andalucía, each checked by hand against its official source (BOE, BOJA, BOP or the body’s own e-office). The official call always decides.')}
      </Typography>

      <StatGrid>
        <StatTile label={t('Eligible now')} value={count('yes')} note={t('every requirement checked')} />
        <StatTile label={t('To confirm')} value={count('check')} note={t('a question or two left')} />
        <StatTile label={t('Next calls')} value={count('next')} note={t('not open for you now')} />
        <StatTile label={t('In progress')} value={open.length} note={t('applications')} />
      </StatGrid>

      <Deadlines list={open} day={day} />
      <Answers profile={profile} known={known} answers={answers ?? {}} onAnswer={answer} canEdit={canEdit} owners={business?.owners ?? []} day={day} />
      <Results results={results} day={day} entity={profile.entity} tracked={new Set(open.map(a => a.grant_id))} canEdit={canEdit} onTrack={track} />
      <Applications list={list} profile={profile} canEdit={canEdit} loaded={!!apps.data} day={day} />
    </>
  )
}

/** Application deadlines coming up (and any already passed), soonest first. */
function Deadlines({ list, day }: { list: GrantApplication[]; day: string }) {
  const due = list.filter(a => a.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  if (!due.length) return null
  return (
    <Card component="section" aria-label={t('Coming up')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Coming up')}</SectionTitle>
        <Stack spacing={1}>
          {due.map(a => {
            const days = daysBetween(day, a.deadline!)
            return (
              <Stack key={a.id} direction="row" sx={{ gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600, minWidth: 110, color: days < 0 ? tokens.danger : days <= 14 ? tokens.roseDeep : 'text.primary' }}>
                  {fmtDate(a.deadline!)}
                </Typography>
                <Typography sx={{ flex: 1, minWidth: 0 }}>{t(a.grant_name)}{a.deadline_label ? ` · ${t(a.deadline_label)}` : ''}</Typography>
                <Typography variant="body2" sx={{ color: days < 0 ? tokens.danger : 'text.secondary' }}>
                  {days < 0 ? tn(-days, '{n} day ago', '{n} days ago') : days === 0 ? t('Today') : tn(days, 'in {n} day', 'in {n} days')}
                </Typography>
              </Stack>
            )
          })}
        </Stack>
      </CardContent>
    </Card>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = (from: number) => Array.from({ length: new Date().getFullYear() - from + 1 }, (_, i) => new Date().getFullYear() - i)

/** A month and a year, side by side. */
function MonthYear({ month, year, onChange, label, disabled, from = 1990 }: {
  month: number | null; year: number | null; onChange: (m: number | null, y: number | null) => void; label: string; disabled: boolean; from?: number
}) {
  return (
    <Stack direction="row" spacing={1} role="group" aria-label={label}>
      <TextField select size="small" label={t('Month')} value={month ?? ''} disabled={disabled} sx={{ minWidth: 130 }}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null, year)}>
        <MenuItem value="">{t('Month')}</MenuItem>
        {MONTHS.map(m => <MenuItem key={m} value={m}>{formatLocal(`2026-${String(m).padStart(2, '0')}-15T12:00:00Z`, 'MMMM')}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t('Year')} value={year ?? ''} disabled={disabled} sx={{ minWidth: 110 }}
        onChange={e => onChange(month, e.target.value ? Number(e.target.value) : null)}>
        <MenuItem value="">{t('Year')}</MenuItem>
        {YEARS(from).map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
      </TextField>
    </Stack>
  )
}

/** The questions: the business first (mostly known already), then only those that can still change a result. */
function Answers({ profile, known, answers, onAnswer, canEdit, owners, day }: {
  profile: GrantProfile; known: Partial<GrantProfile>; answers: Partial<GrantProfile>; onAnswer: (p: Partial<GrantProfile>) => void
  canEdit: boolean; owners: string[]; day: string
}) {
  const company = profile.entity === 'sl' || profile.entity === 'other'
  const asked = QUESTIONS.filter(q => questionMatters(q, profile, day))
  const open = asked.filter(q => profile[q.key] === q.unknown).length

  const row = (q: Question) => {
    const label = t(company && q.companyLabel ? q.companyLabel : q.label)
    const fromApp = q.key in known && !(q.key in answers)
    let control: ReactNode
    if (q.kind === 'month') {
      control = <MonthYear label={label} month={profile.startM} year={profile.startY} disabled={!canEdit} onChange={(m, y) => onAnswer({ startM: m, startY: y })} />
    } else if (q.kind === 'number') {
      control = (
        <TextField size="small" type="number" value={profile[q.key] ?? ''} disabled={!canEdit} sx={{ maxWidth: 120 }}
          slotProps={{ htmlInput: { min: 0, max: 999, 'aria-label': label } }}
          onChange={e => onAnswer({ [q.key]: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) } as Partial<GrantProfile>)} />
      )
    } else {
      control = (
        <Stack spacing={1}>
          <ToggleButtonGroup size="small" exclusive value={profile[q.key] ?? ''} disabled={!canEdit} aria-label={label} sx={{ flexWrap: 'wrap' }}
            onChange={(_, v: string | null) => v !== null && onAnswer({ [q.key]: v } as Partial<GrantProfile>)}>
            {q.options!.map(o => <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none' }}>{t(o.label)}</ToggleButton>)}
          </ToggleButtonGroup>
          {q.key === 'alta' && profile.alta === 'date' && (
            <MonthYear label={label} month={profile.altaM} year={profile.altaY} disabled={!canEdit} from={2010}
              onChange={(m, y) => onAnswer({ altaM: m, altaY: y })} />
          )}
        </Stack>
      )
    }
    return (
      <Box key={q.key} sx={{ py: 1.5, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.75 }}>
          <Typography sx={{ fontWeight: 500 }}>{label}</Typography>
          {fromApp && <Tag>{t('From your business details')}</Tag>}
        </Stack>
        {q.hint && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t(q.hint)}</Typography>}
        {control}
      </Box>
    )
  }

  return (
    <Card component="section" aria-label={t('Your answers')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {open ? tn(open, '{n} question left', '{n} questions left') : t('All answered')}
        </Typography>}>
          {t('Your answers')}
        </SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {t('Only what decides the grants that could still apply. Questions go away as grants are ruled in or out, and the results below change as you answer.')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, columnGap: 4 }}>
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Your business')}</Typography>
            {BUSINESS_QUESTIONS.map(row)}
          </Box>
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('A few questions')}</Typography>
            {company && owners.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Questions about the owner are about {names}.', { names: owners.join(', ') })}</Typography>
            )}
            {asked.map(row)}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

const ICON: Record<Condition['state'], ReactNode> = {
  pass: <PassIcon fontSize="small" sx={{ color: tokens.goodFg }} />,
  fail: <FailIcon fontSize="small" sx={{ color: tokens.badFg }} />,
  unknown: <UnknownIcon fontSize="small" sx={{ color: tokens.infoFg }} />,
}
const STATE_NAME: Record<Condition['state'], string> = { pass: msg('Met'), fail: msg('Not met'), unknown: msg('To confirm') }

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>{title}</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{items.map(i => <li key={i}><Typography variant="body2">{t(i)}</Typography></li>)}</Box>
    </Box>
  )
}

/** The grants, best fit first, with the quick filters. */
function Results({ results, day, entity, tracked, canEdit, onTrack }: {
  results: Evaluation[]; day: string; entity: GrantProfile['entity']; tracked: Set<string>; canEdit: boolean; onTrack: (x: Evaluation) => Promise<boolean>
}) {
  const [filter, setFilter] = useState<GrantFilter>('all')
  const of = (f: GrantFilter) => (f === 'all' ? results : results.filter(x => FILTER_OF[x.grant.category] === f))
  const shown = of(filter)

  const table = (): ExportTable => ({
    title: t('Grants'),
    filename: `grants-${day}`,
    columns: [t('Grant'), t('From'), t('Status'), t('Amount'), t('Deadline'), t('Official source'), t('Checked on')],
    rows: shown.map(x => [t(x.grant.name), t(x.grant.body), t(STATUS_LABEL[x.status]), x.result.amount ? say(x.result.amount) : t(x.grant.amount),
      deadlineText(deadlineOf(x, day)), x.grant.source, fmtDate(x.grant.checked)]),
  })

  return (
    <Card component="section" aria-label={t('Grants for you')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} disabled={!shown.length} folder="Grants" />}>{t('Grants for you')}</SectionTitle>
        <Stack direction="row" role="group" aria-label={t('Filter grants')} sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
          {FILTERS.map(f => {
            const n = of(f.key).length
            if (!n && f.key !== 'all') return null
            return (
              <Chip key={f.key} size="small" clickable label={`${t(f.label)} ${n}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                variant={filter === f.key ? 'filled' : 'outlined'} color={filter === f.key ? 'primary' : 'default'} />
            )
          })}
        </Stack>
        {shown.map(x => <GrantCard key={x.grant.id} x={x} day={day} entity={entity} tracked={tracked.has(x.grant.id)} canEdit={canEdit} onTrack={onTrack} />)}
      </CardContent>
    </Card>
  )
}

function GrantCard({ x, day, entity, tracked, canEdit, onTrack }: {
  x: Evaluation; day: string; entity: GrantProfile['entity']; tracked: boolean; canEdit: boolean; onTrack: (x: Evaluation) => Promise<boolean>
}) {
  const { grant: g, result: r, status } = x
  const [busy, setBusy] = useState(false)
  const docs = documentsFor(g, entity)
  return (
    <Accordion disableGutters variant="outlined" sx={{ mb: 1, borderRadius: '12px !important', '&::before': { display: 'none' } }}
      slotProps={{ heading: { component: 'h3' }, transition: { unmountOnExit: true } }}>
      <AccordionSummary expandIcon={<ExpandIcon />} aria-label={t(g.name)}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600 }}>{t(g.name)}</Typography>
            <Tag {...TONE[status]}>{t(STATUS_LABEL[status])}</Tag>
            {tracked && <Tag>{t('In your applications')}</Tag>}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t(g.body)} · {r.amount ? say(r.amount) : t(g.amount)} · {deadlineText(deadlineOf(x, day))}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{verdict(x)}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Typography variant="body2">{t(g.summary)}</Typography>
        <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>{t('Requirements, checked against your answers')}</Typography>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-label={t('Requirements')}>
          {r.conds.map(c => (
            <Stack key={c.label} component="li" direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Box component="span" role="img" aria-label={t(STATE_NAME[c.state])} sx={{ display: 'inline-flex', mt: '1px' }}>{ICON[c.state]}</Box>
              <Box>
                <Typography variant="body2">{t(c.label)}</Typography>
                {c.note && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{say(c.note)}</Typography>}
              </Box>
            </Stack>
          ))}
        </Stack>
        <Bullets title={t('What it pays for')} items={g.covers} />
        {g.paid && <><Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>{t('How it’s paid')}</Typography><Typography variant="body2">{t(g.paid)}</Typography></>}
        <Bullets title={t('What you commit to')} items={g.obligations} />
        <Bullets title={t('Documents')} items={docs.length ? docs.map(d => DOCUMENTS[d.id].name) : g.docs ?? []} />
        <Bullets title={t('Steps')} items={g.steps} />
        <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
          {canEdit && !tracked && status !== 'no' && (
            <Button variant="contained" size="small" startIcon={<AddIcon />} disabled={busy}
              onClick={async () => { setBusy(true); await onTrack(x); setBusy(false) }}>
              {t('Track this grant')}
            </Button>
          )}
          <Link href={g.source} target="_blank" rel="noopener" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            {t('Official page')} <OpenIcon sx={{ fontSize: 16 }} />
          </Link>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Checked on {date}', { date: fmtDate(g.checked) })}{g.ref ? ` · ${t(g.ref)}` : ''}{g.note ? ` · ${t(g.note)}` : ''}
          </Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}


/** The applications under way: their stage, dates, amounts and checklists. */
function Applications({ list, profile, canEdit, loaded, day }: { list: GrantApplication[]; profile: GrantProfile; canEdit: boolean; loaded: boolean; day: string }) {
  const ordered = [...list].sort((a, b) => Number(isDone(a.stage)) - Number(isDone(b.stage)) || a.created_at.localeCompare(b.created_at))
  const money = (n: number | null) => (n == null ? '' : n)
  const table = (): ExportTable => ({
    title: t('My applications'),
    filename: `grant-applications-${day}`,
    columns: [t('Grant'), t('Stage'), t('Submitted'), t('Expediente'), t('Requested'), t('Awarded'), t('Received'), t('Next deadline')],
    rows: ordered.map(a => [t(a.grant_name), t(stageLabel(a.stage)), a.submitted_on ? fmtDate(a.submitted_on) : '', a.expediente ?? '',
      money(a.amount_requested), money(a.amount_awarded), money(a.amount_received),
      a.deadline ? `${fmtDate(a.deadline)}${a.deadline_label ? ` · ${t(a.deadline_label)}` : ''}` : '']),
    money: [4, 5, 6],
  })
  return (
    <Card component="section" aria-label={t('My applications')}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} disabled={!list.length} folder="Grants" />}>{t('My applications')}</SectionTitle>
        {loaded && !list.length && <Empty>{canEdit ? t('No applications yet. Open a grant above and press Track this grant.') : t('No applications yet.')}</Empty>}
        <Stack spacing={1.5}>
          {ordered.map(a => <ApplicationCard key={a.id} a={a} grant={GRANTS.find(g => g.id === a.grant_id)} entity={profile.entity} canEdit={canEdit} />)}
        </Stack>
      </CardContent>
    </Card>
  )
}

function ApplicationCard({ a, grant, entity, canEdit }: { a: GrantApplication; grant?: Grant; entity: GrantProfile['entity']; canEdit: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [editing, setEditing] = useState(false)
  const next = nextStage(a.stage)
  const docs = grant ? documentsFor(grant, entity).map(d => ({ key: d.id, label: DOCUMENTS[d.id].name, note: d.note ?? DOCUMENTS[d.id].how }))
    .concat((grant.docs ?? []).map(d => ({ key: d, label: d, note: null }))) : []
  const tick = (field: 'docs_done' | 'obligations_done', key: string, on: boolean) =>
    run(() => api.saveGrantApplication({ id: a.id, [field]: on ? [...a[field], key] : a[field].filter(x => x !== key) }))
  const done = (n: number, total: number) => t('{n} of {total}', { n, total })
  const moneyRow = [[t('Requested'), a.amount_requested], [t('Awarded'), a.amount_awarded], [t('Received'), a.amount_received]] as const

  return (
    <Card variant="outlined" component="article" aria-label={t(a.grant_name)}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ fontWeight: 600 }}>{t(a.grant_name)}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {[a.submitted_on && t('Submitted {date}', { date: fmtDate(a.submitted_on) }), a.expediente && t('Expediente {ref}', { ref: a.expediente }),
                a.deadline && t('Next: {date}', { date: fmtDate(a.deadline) }) + (a.deadline_label ? ` · ${t(a.deadline_label)}` : '')].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {canEdit ? (
              <TextField select size="small" label={t('Stage')} value={a.stage} sx={{ minWidth: 200 }}
                onChange={e => void run(() => api.saveGrantApplication({ id: a.id, stage: e.target.value as GrantApplication['stage'] }), t('Stage changed'))}>
                {STAGES.map(s => <MenuItem key={s.key} value={s.key}>{t(s.label)}</MenuItem>)}
              </TextField>
            ) : <Tag>{t(stageLabel(a.stage))}</Tag>}
            {canEdit && next && (
              <Button size="small" variant="outlined" endIcon={<NextIcon />}
                onClick={() => void run(() => api.saveGrantApplication({ id: a.id, stage: next }), t('Moved to {stage}', { stage: t(stageLabel(next)) }))}>
                {t('Move to {stage}', { stage: t(stageLabel(next)) })}
              </Button>
            )}
            {canEdit && <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>{t('Edit')}</Button>}
          </Stack>
        </Stack>

        <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap', mt: 1.5 }}>
          {moneyRow.map(([label, n]) => (
            <Box key={label}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
              <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{n == null ? '–' : formatMoney(n)}</Typography>
            </Box>
          ))}
        </Stack>
        {a.notes && <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }}>{a.notes}</Typography>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 3, mt: 1 }}>
          {docs.length > 0 && (
            <Box role="group" aria-label={t('Documents')}>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>{t('Documents')} · {done(docs.filter(d => a.docs_done.includes(d.key)).length, docs.length)}</Typography>
              {docs.map(d => (
                <Box key={d.key}>
                  <FormControlLabel disabled={!canEdit} label={<Typography variant="body2">{t(d.label)}</Typography>}
                    control={<Checkbox size="small" checked={a.docs_done.includes(d.key)} onChange={e => void tick('docs_done', d.key, e.target.checked)} />} />
                  {d.note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', ml: 4, mt: -0.75, mb: 0.5 }}>{t(d.note)}</Typography>}
                </Box>
              ))}
            </Box>
          )}
          {grant && grant.obligations.length > 0 && (
            <Box role="group" aria-label={t('Obligations')}>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>
                {t('Obligations')} · {done(grant.obligations.filter(o => a.obligations_done.includes(o)).length, grant.obligations.length)}
              </Typography>
              {grant.obligations.map(o => (
                <FormControlLabel key={o} sx={{ display: 'flex' }} disabled={!canEdit} label={<Typography variant="body2">{t(o)}</Typography>}
                  control={<Checkbox size="small" checked={a.obligations_done.includes(o)} onChange={e => void tick('obligations_done', o, e.target.checked)} />} />
              ))}
            </Box>
          )}
        </Box>
      </CardContent>
      {editing && <EditApplication a={a} onClose={() => setEditing(false)} />}
    </Card>
  )
}

/** The details of one application, and stopping tracking it. */
function EditApplication({ a, onClose }: { a: GrantApplication; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [d, setD] = useState({ ...a })
  const [removing, setRemoving] = useState(false)
  const amount = (k: 'amount_requested' | 'amount_awarded' | 'amount_received', label: string) => (
    <TextField label={label} type="number" size="small" value={d[k] ?? ''} slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
      onChange={e => setD({ ...d, [k]: e.target.value === '' ? null : Number(e.target.value) })} />
  )
  const save = async () => {
    const bad = [d.amount_requested, d.amount_awarded, d.amount_received].some(n => n != null && !(n >= 0))
    if (bad) { await run(async () => { throw new Error(t('Amounts are 0 or more')) }); return }
    const ok = await run(() => api.saveGrantApplication({ id: a.id, submitted_on: d.submitted_on || null, expediente: d.expediente, amount_requested: d.amount_requested,
      amount_awarded: d.amount_awarded, amount_received: d.amount_received, deadline: d.deadline || null, deadline_label: d.deadline_label, notes: d.notes }), t('Application saved'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="grant-app-title">
      <DialogTitle id="grant-app-title">{t(a.grant_name)}</DialogTitle>
      <DialogContent>
        {removing ? (
          <Typography>{t('Stop tracking this grant? Its dates, amounts and ticks are removed, and its deadline comes off the calendar.')}</Typography>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={t('Submitted on')} type="date" size="small" value={d.submitted_on ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                onChange={e => setD({ ...d, submitted_on: e.target.value || null })} />
              <TextField label={t('Expediente (file number)')} size="small" value={d.expediente ?? ''} sx={{ flex: 1 }}
                onChange={e => setD({ ...d, expediente: e.target.value })} slotProps={{ htmlInput: { maxLength: 80 } }} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              {amount('amount_requested', t('Requested (€)'))}
              {amount('amount_awarded', t('Awarded (€)'))}
              {amount('amount_received', t('Received (€)'))}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={t('Next deadline')} type="date" size="small" value={d.deadline ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                onChange={e => setD({ ...d, deadline: e.target.value || null })} />
              <TextField label={t('What it’s for')} size="small" value={d.deadline_label ?? ''} sx={{ flex: 1 }} placeholder={t('Send the justification')}
                onChange={e => setD({ ...d, deadline_label: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: '4px !important' }}>
              {t('The deadline also goes on the team calendar, for admins.')}
            </Typography>
            <TextField label={t('Notes')} multiline minRows={3} value={d.notes ?? ''} onChange={e => setD({ ...d, notes: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 4000 } }} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        {removing ? (
          <>
            <Button onClick={() => setRemoving(false)}>{t('Keep it')}</Button>
            <Button color="error" variant="contained" onClick={async () => {
              if (await run(() => api.deleteGrantApplication(a.id), t('No longer tracked'))) onClose()
            }}>{t('Stop tracking')}</Button>
          </>
        ) : (
          <>
            <Button color="error" onClick={() => setRemoving(true)}>{t('Stop tracking')}</Button>
            <Stack direction="row" spacing={1}>
              <Button onClick={onClose}>{t('Cancel')}</Button>
              <Button variant="contained" onClick={save}>{t('Save')}</Button>
            </Stack>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
