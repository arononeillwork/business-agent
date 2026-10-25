import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  InputAdornment, Link, MenuItem, Rating, Stack, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import WorkIcon from '@mui/icons-material/PhotoLibraryOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import StarIcon from '@mui/icons-material/Star'
import StarOutlineIcon from '@mui/icons-material/StarBorder'
import { useState, type ReactElement, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { EMAIL } from '../../shared/customers'
import { cleanWebsite } from '../../shared/connections'
import {
  CONTRACTOR_KINDS, COUNTED, QUANTITY_PERS, RATE_UNITS, SERVICES, cheapestOption, compareServices, contractState, daysBetween, monthlyCost, offers,
  optionsFor, outsourcingTotals, sameJob, sortServices, type Contractor, type ContractorInput, type ContractorKind, type OutsourcedJob, type OutsourcedJobInput,
  type QuantityPer, type RateUnit,
} from '../../shared/outsourcing'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tc, tn } from '../i18n'

type View = 'active' | 'catalogue' | 'past'
// Catalogue filters: everyone (grouped by job), the starred, one job's options, or the archived.
type Filter = { kind: 'all' } | { kind: 'starred' } | { kind: 'archived' } | { kind: 'service'; service: string }
// The star's gold, as on Suppliers and the To Do list.
const STAR = '#C98A1E'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
/** A usual job's name in the person's language; the business's own as written. */
const jobName = (service: string) => t(service)
/** The job typed or picked, kept by its English name when it's one of the usual ones. */
const jobKey = (text: string) => SERVICES.find(s => t(s.name).toLowerCase() === text.trim().toLowerCase())?.name ?? text.trim()
const kindLabel = (k: ContractorKind) => t(CONTRACTOR_KINDS.find(x => x.id === k)!.label)
const unitLabel = (u: RateUnit) => t(RATE_UNITS.find(x => x.id === u)!.label)
const priceText = (price: number | null, unit: RateUnit) => (price == null ? '' : t(RATE_UNITS.find(x => x.id === unit)!.price, { price: formatMoney(price) }))
const COUNT_WORDS: Record<string, [string, string]> = {
  hour: [msg('{n} hour'), msg('{n} hours')], day: [msg('{n} day'), msg('{n} days')], visit: [msg('{n} visit'), msg('{n} visits')],
}
const HOW_MANY: Record<string, string> = { hour: msg('How many hours'), day: msg('How many days'), visit: msg('How many visits') }
/** "6 hours a week", "4 visits a year". */
function quantityText(j: Pick<OutsourcedJob, 'price_unit' | 'quantity' | 'quantity_per'>) {
  if (j.quantity == null || !j.quantity_per || !COUNTED.includes(j.price_unit)) return ''
  const [one, many] = COUNT_WORDS[j.price_unit]
  return `${t(j.quantity === 1 ? one : many, { n: formatNumber(j.quantity) })} ${t(QUANTITY_PERS.find(p => p.id === j.quantity_per)!.label)}`
}
function datesText(j: Pick<OutsourcedJob, 'starts_on' | 'ends_on'>) {
  if (j.starts_on && j.ends_on) return t('{from} to {to}', { from: day(j.starts_on), to: day(j.ends_on) })
  if (j.starts_on) return t('Since {date}', { date: day(j.starts_on) })
  return j.ends_on ? t('Until {date}', { date: day(j.ends_on) }) : ''
}

/**
 * Outsourcing: the jobs done for the business by people and firms outside the team (social media,
 * the books, cleaning, the coffee machine's service…). Active: who does each job now, on what terms,
 * roughly what it costs a month and when the contract ends. Catalogue: the people and firms to
 * choose from, grouped by job so the options sit side by side; choosing one gives them the job (and
 * can end it with whoever had it). Past: who did what before. Prices are without IVA.
 * Admins manage it; a gestoría with finances access reads (the database enforces it too).
 */
export function OutsourcingPage() {
  const { api, isAdmin, isPartner, partnerCan, business } = useApp()
  const canEdit = isAdmin && !isPartner
  const people = useAsync('contractors', () => api.contractors(), [])
  const list = useAsync('outsourced-jobs', () => api.outsourcedJobs(), [])
  const run = useAction()
  const [view, setView] = useState<View>('active')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [job, setJob] = useState<OutsourcedJobInput | null>(null)
  const [person, setPerson] = useState<ContractorInput | null>(null)

  if (!canEdit && !partnerCan('finances')) {
    return <>
      <PageHeader eyebrow={t('Team')} title={t('Outsourcing')} />
      <Alert severity="info">{t('Outsourcing is only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const contractors = people.data ?? []
  const jobs = list.data ?? []
  const who = (id: string) => contractors.find(c => c.id === id)
  const active = jobs.filter(j => j.active).sort((a, b) => compareServices(a.service, b.service))
  const past = jobs.filter(j => !j.active).sort((a, b) => (b.ends_on ?? b.starts_on ?? '').localeCompare(a.ends_on ?? a.starts_on ?? ''))
  const current = contractors.filter(c => c.active)
  const archived = contractors.filter(c => !c.active)
  const totals = outsourcingTotals(jobs)
  const ending = active.filter(j => ['ending', 'overdue'].includes(contractState(j, now)))
  const overdue = active.filter(j => contractState(j, now) === 'overdue')
  const doing = (c: Contractor, service?: string) => active.some(j => j.contractor_id === c.id && (!service || sameJob(j.service, service)))
  const optionCount = (service: string) => optionsFor(service, contractors).length

  const star = (c: Contractor) => run(() => api.saveContractor({ ...c, starred: !c.starred }))
  const end = (j: OutsourcedJob) => run(() => api.saveOutsourcedJob({ ...j, active: false, ends_on: j.ends_on && j.ends_on < now ? j.ends_on : now }),
    t('{job} ended with {name}', { job: jobName(j.service), name: who(j.contractor_id)?.name ?? '' }))
  const choose = (c: Contractor, service: string) => setJob({ service, contractor_id: c.id, price: c.rate, price_unit: c.rate_unit, starts_on: now })
  const seeOptions = (service: string) => { setFilter({ kind: 'service', service }); setView('catalogue') }

  const jobRows = (rows: OutsourcedJob[]) => rows.map(j => {
    const c = who(j.contractor_id)
    return [jobName(j.service), c?.name ?? '', c ? kindLabel(c.kind) : '', j.price, unitLabel(j.price_unit), quantityText(j), monthlyCost(j),
      j.starts_on ?? '', j.ends_on ?? '', j.scope ?? '', c?.phone ?? '', c?.email ?? '', j.notes ?? '']
  })
  const jobColumns = [tc('outsourcing', 'Job'), t('Who'), t('Type'), t('Price'), t('How it’s charged'), t('How many'), t('A month'), t('Starts'), t('Contract ends'),
    t('What’s included'), t('Phone'), t('Email'), t('Notes')]
  const table = (): ExportTable => view === 'catalogue' ? {
    title: t('Outsourcing catalogue'), filename: `outsourcing-catalogue-${now}`,
    columns: [t('Name'), t('Type'), tc('outsourcing', 'Jobs'), t('Who to talk to'), t('Phone'), t('Email'), t('Website'), t('Their work'), t('Location'),
      t('Usual rate'), t('How it’s charged'), t('Rating'), tc('suppliers', 'Starred'), t('Notes')],
    rows: [...current, ...archived].map(c => [c.name, kindLabel(c.kind), c.services.map(jobName).join(', '), c.contact_name ?? '', c.phone ?? '',
      c.email ?? '', c.website ?? '', c.portfolio_url ?? '', c.location ?? '', c.rate, unitLabel(c.rate_unit), c.rating, c.starred ? '✓' : '', c.notes ?? '']),
    money: [9],
  } : view === 'past' ? {
    title: t('Outsourcing: past jobs'), filename: `outsourcing-past-${now}`, columns: jobColumns, rows: jobRows(past), money: [3, 6],
  } : {
    title: t('Outsourcing'), filename: `outsourcing-${now}`, columns: jobColumns, rows: jobRows(active), money: [3, 6],
    footer: [t('A month'), '', '', '', '', '', totals.monthly, '', '', '', '', '', ''],
  }
  const shownCount = view === 'catalogue' ? contractors.length : view === 'past' ? past.length : active.length

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Outsourcing')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        <ExportButton table={table} disabled={!shownCount} folder="Outsourcing" />
        {canEdit && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPerson({ name: '', kind: 'freelancer', services: [], rate_unit: 'month', active: true })}>
          {t('Add to the catalogue')}
        </Button>}
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setJob({ service: '', contractor_id: '', price_unit: 'month', starts_on: now })}>
          {t('Outsource a job')}
        </Button>}
      </>} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 760 }}>
        {t('The jobs done for {business} by people and firms outside the team, and who to choose from for each. Prices are without IVA.',
          { business: business?.name ?? '' })}
      </Typography>
      <ErrorBox error={people.error ?? list.error} />

      <StatGrid>
        <StatTile label={t('Jobs outsourced')} value={list.data ? totals.jobs : '–'}
          note={ending.length ? tn(ending.length, '{n} contract to look at', '{n} contracts to look at') : t('No contracts ending soon')} />
        <StatTile label={t('A month')} value={list.data ? formatMoney(totals.monthly) : '–'}
          note={totals.unknown ? tn(totals.unknown, '{n} job not counted: add its price or hours', '{n} jobs not counted: add their price or hours') : t('Without IVA')} />
        <StatTile label={t('A year')} value={list.data ? formatMoney(totals.monthly * 12) : '–'}
          note={totals.oneOff ? t('Plus {amount} in one-off projects', { amount: formatMoney(totals.oneOff) }) : t('At today’s monthly cost')} />
        <StatTile label={t('In the catalogue')} value={people.data ? current.length : '–'}
          note={tn(sortServices(current.flatMap(c => c.services)).length, 'Covering {n} job', 'Covering {n} jobs')} />
      </StatGrid>

      <Tabs value={view} onChange={(_, v: View) => setView(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        <Tab value="active" label={`${tc('outsourcing', 'Active')} (${active.length})`} />
        <Tab value="catalogue" label={`${t('Catalogue')} (${current.length})`} />
        <Tab value="past" label={`${t('Past')} (${past.length})`} />
      </Tabs>

      {view === 'active' && <>
        {overdue.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('The contract’s end date has passed: {list}. Give it a new end date, or end the job.',
              { list: overdue.map(j => `${jobName(j.service)} (${who(j.contractor_id)?.name ?? ''})`).join(', ') })}
          </Alert>
        )}
        {list.data && !active.length ? (
          <Empty>{t('Nothing outsourced yet. Add the people and firms you use or are thinking of to the catalogue, then choose who does each job.')}</Empty>
        ) : (
          <Grid>
            {active.map(j => (
              <JobCard key={j.id} job={j} who={who(j.contractor_id)} now={now} actions={canEdit && <>
                <Link component="button" underline="hover" onClick={() => setJob(j)} aria-label={t('Edit {name}', { name: jobName(j.service) })}>{t('Edit')}</Link>
                <Link component="button" underline="hover" onClick={() => seeOptions(j.service)}>
                  {optionCount(j.service) > 1 ? t('Compare {n} options', { n: optionCount(j.service) }) : t('Find someone else')}
                </Link>
                <Link component="button" underline="hover" onClick={() => void end(j)} aria-label={t('End {job} with {name}', { job: jobName(j.service), name: who(j.contractor_id)?.name ?? '' })}>
                  {t('End the job')}
                </Link>
              </>} />
            ))}
          </Grid>
        )}
        {canEdit && people.data && list.data && (
          <MightOutsource active={active} options={optionCount} onOptions={seeOptions}
            onAdd={service => setPerson({ name: '', kind: 'freelancer', services: [service], rate_unit: SERVICES.find(s => s.name === service)?.unit ?? 'month', active: true })} />
        )}
      </>}

      {view === 'catalogue' && (
        <Catalogue contractors={contractors} filter={filter} onFilter={setFilter} canEdit={canEdit} doing={doing}
          onChoose={choose} onEdit={c => setPerson(c)} onStar={c => void star(c)} />
      )}

      {view === 'past' && (
        past.length === 0 ? <Empty>{t('Jobs that have ended show here, with who did them and what they cost.')}</Empty> : (
          <Grid>
            {past.map(j => (
              <JobCard key={j.id} job={j} who={who(j.contractor_id)} now={now} actions={canEdit && <>
                <Link component="button" underline="hover" onClick={() => setJob(j)} aria-label={t('Edit {name}', { name: jobName(j.service) })}>{t('Edit')}</Link>
                <Link component="button" underline="hover" onClick={() => void run(() => api.saveOutsourcedJob({ ...j, active: true }), t('{job} is back', { job: jobName(j.service) }))}>
                  {t('Bring back')}
                </Link>
              </>} />
            ))}
          </Grid>
        )
      )}

      {job && <JobDialog job={job} contractors={contractors} jobs={jobs} onClose={() => setJob(null)} />}
      {person && <ContractorDialog contractor={person} hasJobs={!!person.id && jobs.some(j => j.contractor_id === person.id)} onClose={() => setPerson(null)} />}
    </>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>{children}</Box>
}

/** Phone, WhatsApp, email, website and their work: whichever they have. */
function Reach({ c }: { c: Contractor }) {
  const phone = c.phone?.replace(/\s/g, '')
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
      {c.phone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${phone}`}>{c.phone}</Button>}
      {c.phone && c.whatsapp && <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener">{'WhatsApp'}</Button>}
      {c.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${c.email}`}>{t('Email')}</Button>}
      {c.website && <Button size="small" variant="outlined" startIcon={<WebIcon />} href={c.website} target="_blank" rel="noopener">{t('Website')}</Button>}
      {c.portfolio_url && <Button size="small" variant="outlined" startIcon={<WorkIcon />} href={c.portfolio_url} target="_blank" rel="noopener">{t('Their work')}</Button>}
    </Stack>
  )
}

/** Where a job's contract is, when it needs a look: starting later, ending soon, or past its end date. */
function ContractTag({ job, now }: { job: OutsourcedJob; now: string }) {
  const state = contractState(job, now)
  if (state === 'upcoming') return <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Starts {date}', { date: day(job.starts_on) })}</Tag>
  if (state === 'overdue') return <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Contract ended {date}', { date: day(job.ends_on) })}</Tag>
  if (state !== 'ending') return null
  const left = daysBetween(now, job.ends_on!)
  return <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{left === 0 ? t('Ends today') : tn(left, 'Ends in {n} day', 'Ends in {n} days')}</Tag>
}

/** One job: who does it, the price and roughly a month's cost, what's included, the dates and how to reach them. */
function JobCard({ job, who, now, actions }: { job: OutsourcedJob; who: Contractor | undefined; now: string; actions: ReactNode }) {
  const monthly = monthlyCost(job)
  const many = quantityText(job)
  return (
    <Card component="article" aria-label={jobName(job.service)} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">{jobName(job.service)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{who ? `${who.name} · ${kindLabel(who.kind)}` : '—'}</Typography>
        </Box>
        <Box sx={{ flexShrink: 0 }}><ContractTag job={job} now={now} /></Box>
      </Stack>
      <Typography sx={{ fontWeight: 500 }}>
        {[priceText(job.price, job.price_unit) || t('No price yet'), many].filter(Boolean).join(' · ')}
      </Typography>
      {monthly !== null && job.price_unit !== 'month' && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.75 }}>{t('About {amount} a month', { amount: formatMoney(monthly) })}</Typography>
      )}
      {COUNTED.includes(job.price_unit) && monthly === null && job.price != null && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.75 }}>{t('Add how many there are to see a month’s cost')}</Typography>
      )}
      {job.scope && <Typography variant="body2">{job.scope}</Typography>}
      {(job.starts_on || job.ends_on) && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{datesText(job)}</Typography>}
      {who && <Reach c={who} />}
      {job.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{job.notes}</Typography>}
      {actions && <Stack direction="row" sx={{ gap: 2, mt: 'auto', pt: 0.5, flexWrap: 'wrap' }}>{actions}</Stack>}
    </Card>
  )
}

/** The usual jobs nobody does for the business yet: how many options there are for each, or a way to add one. */
function MightOutsource({ active, options, onOptions, onAdd }: {
  active: OutsourcedJob[]; options: (service: string) => number; onOptions: (service: string) => void; onAdd: (service: string) => void
}) {
  const open = SERVICES.filter(s => !active.some(j => sameJob(j.service, s.name)))
  if (!open.length) return null
  return (
    <Card component="section" aria-label={t('Jobs you might outsource')}>
      <CardContent>
        <SectionTitle>{t('Jobs you might outsource')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('What cafés often have done from outside. Add who you know for each, compare them, then choose.')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, columnGap: 3 }}>
          {open.map(s => {
            const n = options(s.name)
            return (
              <Stack key={s.name} direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{t(s.name)}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(s.what)}</Typography>
                </Box>
                {n > 0
                  ? <Button size="small" onClick={() => onOptions(s.name)} aria-label={t('See the options for {job}', { job: t(s.name) })}>{tn(n, '{n} option', '{n} options')}</Button>
                  : <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd(s.name)} aria-label={t('Add someone for {job}', { job: t(s.name) })}>{t('Add someone')}</Button>}
              </Stack>
            )
          })}
        </Box>
      </CardContent>
    </Card>
  )
}

/**
 * The catalogue: everyone grouped by the jobs they do (the options for each side by side, the
 * cheapest marked), or the starred, one job's options, or the archived.
 */
function Catalogue({ contractors, filter, onFilter, canEdit, doing, onChoose, onEdit, onStar }: {
  contractors: Contractor[]; filter: Filter; onFilter: (f: Filter) => void; canEdit: boolean; doing: (c: Contractor, service?: string) => boolean
  onChoose: (c: Contractor, service: string) => void; onEdit: (c: Contractor) => void; onStar: (c: Contractor) => void
}) {
  const current = contractors.filter(c => c.active)
  const archived = contractors.filter(c => !c.active)
  const starred = current.filter(c => c.starred)
  const services = sortServices(current.flatMap(c => c.services))
  const others = current.filter(c => !c.services.length)
  const chip = (key: string, label: string, n: number, f: Filter, pressed: boolean, icon?: ReactElement) => (
    <Chip key={key} size="small" clickable label={`${label} ${n}`} aria-pressed={pressed} onClick={() => onFilter(f)} icon={icon}
      variant={pressed ? 'filled' : 'outlined'} color={pressed ? 'primary' : 'default'} />
  )
  const card = (c: Contractor, service?: string, cheapest?: boolean) => (
    <ContractorCard key={c.id} c={c} service={service} cheapest={!!cheapest} canEdit={canEdit} doing={doing}
      onChoose={onChoose} onEdit={onEdit} onStar={onStar} />
  )
  const group = (service: string) => {
    const options = optionsFor(service, current)
    const low = cheapestOption(options)
    return (
      <Box key={service} component="section" aria-label={jobName(service)} sx={{ mb: 3 }}>
        <SectionTitle action={<Typography variant="body2" sx={{ color: 'text.secondary' }}>{tn(options.length, '{n} option', '{n} options')}</Typography>}>
          {jobName(service)}
        </SectionTitle>
        <Grid>{options.map(c => card(c, service, c.id === low))}</Grid>
      </Box>
    )
  }
  const shown = filter.kind === 'service' && !services.some(s => sameJob(s, filter.service)) ? { kind: 'all' as const } : filter

  return (
    <>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {chip('all', t('All'), current.length, { kind: 'all' }, shown.kind === 'all')}
        {starred.length > 0 && chip('starred', tc('suppliers', 'Starred'), starred.length, { kind: 'starred' }, shown.kind === 'starred',
          <StarIcon sx={{ fontSize: 16, color: `${shown.kind === 'starred' ? 'inherit' : STAR} !important` }} />)}
        {services.map(s => chip(s, jobName(s), optionsFor(s, current).length, { kind: 'service', service: s },
          shown.kind === 'service' && sameJob(shown.service, s)))}
        {archived.length > 0 && chip('archived', t('Archived'), archived.length, { kind: 'archived' }, shown.kind === 'archived')}
      </Stack>
      {!current.length && shown.kind === 'all' ? (
        <Empty>{t('Nobody in the catalogue yet. Add the freelancers, agencies and firms you use or have been recommended, with the jobs they do and what they charge.')}</Empty>
      ) : shown.kind === 'service' ? group(shown.service)
        : shown.kind === 'starred' ? <Grid>{starred.map(c => card(c))}</Grid>
        : shown.kind === 'archived' ? <Grid>{archived.map(c => card(c))}</Grid>
        : <>
          {services.map(group)}
          {others.length > 0 && (
            <Box component="section" aria-label={t('No jobs listed yet')} sx={{ mb: 3 }}>
              <SectionTitle>{t('No jobs listed yet')}</SectionTitle>
              <Grid>{others.map(c => card(c))}</Grid>
            </Box>
          )}
        </>}
    </>
  )
}

/** Someone in the catalogue: what they charge and how they're rated, what else they do, how to reach them; choose them for the job. */
function ContractorCard({ c, service, cheapest, canEdit, doing, onChoose, onEdit, onStar }: {
  c: Contractor; service?: string; cheapest: boolean; canEdit: boolean; doing: (c: Contractor, service?: string) => boolean
  onChoose: (c: Contractor, service: string) => void; onEdit: (c: Contractor) => void; onStar: (c: Contractor) => void
}) {
  const here = service ? doing(c, service) : doing(c)
  const also = service ? c.services.filter(s => !sameJob(s, service)) : c.services
  return (
    <Card component="article" aria-label={c.name} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h3" noWrap>{c.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[kindLabel(c.kind), c.location, c.contact_name].filter(Boolean).join(' · ')}</Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {!c.active && <Tag>{tc('supplier', 'Archived')}</Tag>}
          {canEdit ? (
            <Tooltip title={c.starred ? t('Remove star') : t('Star')}>
              <IconButton size="small" onClick={() => onStar(c)} aria-label={t('Star')} aria-pressed={c.starred} sx={{ color: c.starred ? STAR : tokens.inkFaint }}>
                {c.starred ? <StarIcon sx={{ fontSize: 20 }} /> : <StarOutlineIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </Tooltip>
          ) : c.starred && <StarIcon role="img" aria-label={tc('supplier', 'Starred')} sx={{ fontSize: 20, color: STAR }} />}
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {c.rating
          ? <Rating value={c.rating} readOnly size="small" getLabelText={v => tn(v, '{n} star', '{n} stars')} />
          : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Not rated yet')}</Typography>}
        {here && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{service ? t('Does it for you now') : t('Works for you now')}</Tag>}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 500 }}>{priceText(c.rate, c.rate_unit) || t('No rate yet')}</Typography>
        {cheapest && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Lowest price')}</Tag>}
      </Stack>
      {also.length > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {service ? t('Also: {jobs}', { jobs: also.map(jobName).join(', ') }) : also.map(jobName).join(', ')}
        </Typography>
      )}
      <Reach c={c} />
      {c.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{c.notes}</Typography>}
      {canEdit && (
        <Stack direction="row" sx={{ gap: 2, mt: 'auto', pt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {c.active && service && !here && (
            <Button size="small" variant="contained" onClick={() => onChoose(c, service)} aria-label={t('Choose {name} for {job}', { name: c.name, job: jobName(service) })}>
              {t('Choose')}
            </Button>
          )}
          {c.active && !service && c.services.length > 0 && (
            <Button size="small" variant="outlined" onClick={() => onChoose(c, c.services[0])} aria-label={t('Give {name} a job', { name: c.name })}>{t('Give a job')}</Button>
          )}
          <Link component="button" underline="hover" onClick={() => onEdit(c)} aria-label={t('Edit {name}', { name: c.name })}>{t('Edit')}</Link>
        </Stack>
      )}
    </Card>
  )
}

const money = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null)
const numberField = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

/**
 * Give someone a job, or change one: who, what's included, the price and how it's charged (with how
 * many hours, days or visits, to work out a month), and the dates. Choosing someone else for a job
 * that's being done ends it with whoever had it, unless asked not to.
 */
function JobDialog({ job, contractors, jobs, onClose }: { job: OutsourcedJobInput; contractors: Contractor[]; jobs: OutsourcedJob[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [j, setJ] = useState<OutsourcedJobInput>(job)
  const [jobText, setJobText] = useState(job.service ? jobName(job.service) : '')
  const [price, setPrice] = useState(numberField(job.price))
  const [quantity, setQuantity] = useState(numberField(job.quantity))
  const [endOther, setEndOther] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<OutsourcedJobInput>) => setJ(x => ({ ...x, ...p }))
  const service = jobKey(jobText)
  const now = today()
  // Whoever does this job now, when it's someone else: choosing a new person ends theirs.
  const before = !j.id && service ? jobs.find(x => x.active && sameJob(x.service, service) && x.contractor_id !== j.contractor_id) : undefined
  const beforeName = before ? contractors.find(c => c.id === before.contractor_id)?.name ?? '' : ''
  const pickable = contractors.filter(c => c.active || c.id === j.contractor_id)
    .sort((a, b) => Number(offers(b, service)) - Number(offers(a, service)) || a.name.localeCompare(b.name))
  const counted = COUNTED.includes(j.price_unit ?? 'month')
  const jobOptions = sortServices([...SERVICES.map(s => s.name), ...jobs.map(x => x.service), ...contractors.flatMap(c => c.services)]).map(jobName)

  const save = async () => {
    const ok = await run(async () => {
      if (!service) throw new Error(t('Say what the job is'))
      if (!j.contractor_id) throw new Error(t('Choose who does it'))
      const p = money(price), q = counted ? money(quantity) : null
      if ((p !== null && !(p >= 0)) || (q !== null && !(q > 0))) throw new Error(t('Enter numbers like 12 or 1,45'))
      if (j.starts_on && j.ends_on && j.ends_on < j.starts_on) throw new Error(t('It can’t end before it starts'))
      if (before && endOther) await api.saveOutsourcedJob({ ...before, active: false, ends_on: before.ends_on && before.ends_on < now ? before.ends_on : now })
      await api.saveOutsourcedJob({ ...j, service, price: p, quantity: q, quantity_per: q === null ? null : j.quantity_per ?? 'month',
        scope: j.scope?.trim() || null, notes: j.notes?.trim() || null, active: j.active ?? true })
    }, j.id ? t('Saved') : t('{name} does {job} now', { name: contractors.find(c => c.id === j.contractor_id)?.name ?? '', job: jobName(service) }))
    if (ok) onClose()
  }
  const remove = async () => { if (j.id && await run(() => api.deleteOutsourcedJob(j.id!), t('Deleted {name}', { name: jobName(j.service) }))) onClose() }
  const endNow = async () => {
    if (await run(() => api.saveOutsourcedJob({ ...(job as OutsourcedJob), active: false, ends_on: job.ends_on && job.ends_on < now ? job.ends_on : now }),
      t('{job} ended with {name}', { job: jobName(job.service), name: contractors.find(c => c.id === job.contractor_id)?.name ?? '' }))) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{j.id ? jobName(j.service) : t('Outsource a job')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!contractors.length && <Alert severity="info">{t('Add who does it to the catalogue first.')}</Alert>}
          <Autocomplete freeSolo options={jobOptions} inputValue={jobText} onInputChange={(_, v) => setJobText(v)}
            renderInput={p => <TextField {...p} label={tc('outsourcing', 'Job')} placeholder={t('e.g. Social media management')} autoFocus={!job.service} />} />
          <TextField select label={t('Who does it')} value={pickable.some(c => c.id === j.contractor_id) ? j.contractor_id : ''}
            slotProps={{ select: { renderValue: id => contractors.find(c => c.id === id)?.name ?? '' } }}
            onChange={e => {
              const c = contractors.find(x => x.id === e.target.value)
              // A new job takes their usual rate until one is typed.
              set({ contractor_id: e.target.value, ...(!j.id && c && !price.trim() && c.rate != null ? { price_unit: c.rate_unit } : {}) })
              if (!j.id && c && !price.trim() && c.rate != null) setPrice(String(c.rate))
            }}>
            {pickable.map(c => (
              <MenuItem key={c.id} value={c.id}>
                <Box>
                  <Typography>{c.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {[offers(c, service) ? null : t('Doesn’t list this job'), priceText(c.rate, c.rate_unit)].filter(Boolean).join(' · ') || kindLabel(c.kind)}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
          {before && (
            <FormControlLabel control={<Checkbox checked={endOther} onChange={e => setEndOther(e.target.checked)} />}
              label={t('End the job with {name} today', { name: beforeName })} />
          )}
          <TextField label={t('What’s included')} value={j.scope ?? ''} onChange={e => set({ scope: e.target.value })} multiline minRows={2}
            placeholder={t('e.g. 3 posts and 5 stories a week, replies to messages, a report each month')} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Price without IVA')} value={price} inputMode="decimal" onChange={e => setPrice(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
            <TextField select fullWidth label={t('How it’s charged')} value={j.price_unit ?? 'month'} onChange={e => set({ price_unit: e.target.value as RateUnit })}>
              {RATE_UNITS.map(u => <MenuItem key={u.id} value={u.id}>{t(u.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {counted && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label={t(HOW_MANY[j.price_unit ?? 'hour'])} value={quantity} inputMode="decimal" onChange={e => setQuantity(e.target.value)}
                helperText={t('To work out what it costs a month')} />
              <TextField select fullWidth label={t('How often')} value={j.quantity_per ?? 'month'} onChange={e => set({ quantity_per: e.target.value as QuantityPer })}>
                {QUANTITY_PERS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
              </TextField>
            </Stack>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth type="date" label={t('Starts')} value={j.starts_on ?? ''} onChange={e => set({ starts_on: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth type="date" label={t('Contract ends')} value={j.ends_on ?? ''} onChange={e => set({ ends_on: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true } }} helperText={t('Empty: until one side ends it')} />
          </Stack>
          <TextField label={t('Notes')} value={j.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {job.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete this job and its history?')}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete')}</Button>
          {job.active && <Button onClick={() => void endNow()} sx={{ mr: 'auto' }}>{t('End the job')}</Button>}
        </>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!contractors.length}>{j.id ? t('Save') : t('Give them the job')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Someone in the catalogue: the jobs they do, how to reach them, what they charge and how they're rated. */
function ContractorDialog({ contractor, hasJobs, onClose }: { contractor: ContractorInput; hasJobs: boolean; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [c, setC] = useState<ContractorInput>(contractor)
  const [rate, setRate] = useState(numberField(contractor.rate))
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<ContractorInput>) => setC(x => ({ ...x, ...p }))
  const text = (v: string | null | undefined) => v?.trim() || null
  const jobOptions = SERVICES.map(s => jobName(s.name))

  const save = async () => {
    const ok = await run(async () => {
      if (!c.name.trim()) throw new Error(t('Give them a name'))
      const email = text(c.email)
      if (email && !EMAIL.test(email)) throw new Error(t('Enter a full email address, like name@example.com'))
      const website = cleanWebsite(c.website), work = cleanWebsite(c.portfolio_url)
      for (const url of [website, work]) if (url && !/^https?:\/\/[^\s/]+\S*$/i.test(url)) throw new Error(t('The link needs to start with https://'))
      const r = money(rate)
      if (r !== null && !(r >= 0)) throw new Error(t('Enter numbers like 12 or 1,45'))
      await api.saveContractor({ ...c, name: c.name.trim(), email, website, portfolio_url: work, phone: text(c.phone), contact_name: text(c.contact_name),
        location: text(c.location), notes: text(c.notes), rate: r, whatsapp: !!text(c.phone) && !!c.whatsapp })
    }, c.id ? t('Saved') : t('Added {name}', { name: c.name.trim() }))
    if (ok) onClose()
  }
  const archive = async () => {
    if (await run(() => api.saveContractor({ ...contractor, name: contractor.name, active: !contractor.active }),
      contractor.active ? t('Archived {name}', { name: contractor.name }) : t('{name} is back', { name: contractor.name }))) onClose()
  }
  const remove = async () => { if (await run(() => api.deleteContractor(contractor.id!), t('Deleted {name}', { name: contractor.name }))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{contractor.id ? contractor.name : t('Add to the catalogue')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Name')} value={c.name} onChange={e => set({ name: e.target.value })} autoFocus={!contractor.id} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField select fullWidth label={t('Type')} value={c.kind ?? 'freelancer'} onChange={e => set({ kind: e.target.value as ContractorKind })}>
              {CONTRACTOR_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
          </Stack>
          <Autocomplete multiple freeSolo options={jobOptions} value={(c.services ?? []).map(jobName)} filterSelectedOptions
            onChange={(_, v) => set({ services: v.map(jobKey).filter(Boolean) })}
            renderInput={p => <TextField {...p} label={t('Jobs they do')} helperText={t('Pick the usual ones, or type your own and press Enter')} />} />
          <TextField label={t('Who to talk to')} value={c.contact_name ?? ''} onChange={e => set({ contact_name: e.target.value })} slotProps={{ htmlInput: { maxLength: 100 } }} />
          <PhoneField label={t('Phone')} value={c.phone ?? ''} onChange={v => set({ phone: v })} />
          <FormControlLabel label={t('They answer on WhatsApp')} control={<Checkbox checked={!!c.whatsapp} onChange={e => set({ whatsapp: e.target.checked })} />} />
          <TextField label={t('Email')} type="email" value={c.email ?? ''} onChange={e => set({ email: e.target.value })} slotProps={{ htmlInput: { maxLength: 254 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Website')} type="url" placeholder={'https://'} value={c.website ?? ''} onChange={e => set({ website: e.target.value })} />
            <TextField fullWidth label={t('Their work: Instagram or portfolio')} type="url" placeholder={'https://'} value={c.portfolio_url ?? ''}
              onChange={e => set({ portfolio_url: e.target.value })} />
          </Stack>
          <TextField label={t('Location')} value={c.location ?? ''} onChange={e => set({ location: e.target.value })} placeholder={t('e.g. Marbella, or Remote')}
            slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Usual rate without IVA')} value={rate} inputMode="decimal" onChange={e => setRate(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
            <TextField select fullWidth label={t('How it’s charged')} value={c.rate_unit ?? 'month'} onChange={e => set({ rate_unit: e.target.value as RateUnit })}>
              {RATE_UNITS.map(u => <MenuItem key={u.id} value={u.id}>{t(u.label)}</MenuItem>)}
            </TextField>
          </Stack>
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>{t('Your rating')}</Typography>
            <Rating value={c.rating ?? null} onChange={(_, v) => set({ rating: v })} getLabelText={v => tn(v, '{n} star', '{n} stars')} />
          </Box>
          <TextField label={t('Notes')} value={c.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            placeholder={t('e.g. a quote, who recommended them, how it went')} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {contractor.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete {name} from the catalogue?', { name: contractor.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <>
          {!hasJobs && <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete')}</Button>}
          <Button onClick={() => void archive()} sx={{ mr: 'auto' }}>{contractor.active ? t('Archive') : t('Bring back')}</Button>
        </>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{contractor.id ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
