// Hiring: the jobs the business is filling, where each is advertised, and the people who applied,
// stage by stage until someone is hired (and added to the team). Spain/GDPR: applicants' details are
// kept only while they're needed; a year after applying, people not hired should be removed.
import { msg } from './i18n'

export type OpeningStatus = 'open' | 'paused' | 'filled' | 'closed'
export const OPENING_STATUSES: { id: OpeningStatus; label: string }[] = [
  { id: 'open', label: msg('Open') }, { id: 'paused', label: msg('Paused') }, { id: 'filled', label: msg('Filled') }, { id: 'closed', label: msg('Closed') },
]
export const openingStatusLabel = (s: OpeningStatus) => OPENING_STATUSES.find(x => x.id === s)!.label

export type ContractType = 'permanent' | 'part_time' | 'seasonal' | 'temporary' | 'internship'
/** The usual contracts in Spain: indefinido, a tiempo parcial, fijo discontinuo, temporal, prácticas. */
export const CONTRACTS: { id: ContractType; label: string }[] = [
  { id: 'permanent', label: msg('Permanent, full time') }, { id: 'part_time', label: msg('Part time') },
  { id: 'seasonal', label: msg('Seasonal (fijo discontinuo)') }, { id: 'temporary', label: msg('Temporary') },
  { id: 'internship', label: msg('Internship') },
]
export const contractLabel = (c: ContractType) => CONTRACTS.find(x => x.id === c)!.label

export type JobBoard = 'infojobs' | 'indeed' | 'linkedin' | 'instagram' | 'window' | 'referral' | 'other'
/** Where a job is advertised and people apply from. Brand names are the same in every language. */
export const JOB_BOARDS: { id: JobBoard; label: string }[] = [
  { id: 'infojobs', label: 'InfoJobs' }, { id: 'indeed', label: 'Indeed' }, { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' }, { id: 'window', label: msg('Sign in the window') }, { id: 'referral', label: msg('Word of mouth') },
  { id: 'other', label: msg('Other') },
]
export const boardLabel = (b: JobBoard) => JOB_BOARDS.find(x => x.id === b)!.label

export type ApplicantStage = 'applied' | 'screening' | 'interview' | 'trial' | 'offer' | 'hired' | 'rejected'
export const APPLICANT_STAGES: { id: ApplicantStage; label: string }[] = [
  { id: 'applied', label: msg('Applied') }, { id: 'screening', label: msg('Shortlisted') }, { id: 'interview', label: msg('Interview') },
  { id: 'trial', label: msg('Trial shift') }, { id: 'offer', label: msg('Offer') }, { id: 'hired', label: msg('Hired') },
  { id: 'rejected', label: msg('Not this time') },
]
export const applicantStageLabel = (s: ApplicantStage) => APPLICANT_STAGES.find(x => x.id === s)!.label
export const STILL_IN: ApplicantStage[] = ['applied', 'screening', 'interview', 'trial', 'offer']

export interface JobOpening {
  id: string
  title: string
  /** The rota position it's for (Barista, Kitchen…). */
  position_id: number | null
  contract: ContractType
  hours_per_week: number | null
  /** In words: "€1.350 gross a month", "€9,50 an hour". */
  pay: string | null
  description: string | null
  status: OpeningStatus
  posted_on: JobBoard[]
  opened_on: string
  closes_on: string | null
  created_at: string
}
export type OpeningInput = Partial<Omit<JobOpening, 'id' | 'created_at'>> & { id?: string; title: string }

export interface Applicant {
  id: string
  /** The job they applied for; null while they're in the CV pool, kept for a job to come. */
  opening_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  source: JobBoard
  stage: ApplicantStage
  interview_at: string | null
  /** 1–5, after meeting them. */
  rating: number | null
  /** Their CV where it's kept (the job board, Drive). */
  cv_link: string | null
  notes: string | null
  applied_on: string
  /** When their details should go, if they weren't hired. */
  keep_until: string
  /** Their account once added to the team. */
  profile_id: string | null
  /** The roles they'd suit ("Barista", "Kitchen"), said for the CV pool. */
  roles: string[]
  /** The day they can start from; null: now, or not said. */
  available_from: string | null
  /** When they can work, in words ("Weekends", "Mornings until June"). */
  availability: string | null
}
/** Someone who applied for a job (everyone but the CV pool). */
export type JobApplicant = Applicant & { opening_id: string }
export const onAJob = (a: Applicant): a is JobApplicant => a.opening_id !== null
export type ApplicantInput = Partial<Omit<Applicant, 'id'>> & { id?: string; opening_id: string; full_name: string }

/** Months an applicant who wasn't hired is kept (then they should be removed). */
export const KEEP_MONTHS = 12

export function keepUntil(appliedOn: string) {
  const [y, m, d] = appliedOn.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + KEEP_MONTHS, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

/** Kept past their day and not hired: their details should be removed. */
export const overdue = (a: Pick<Applicant, 'stage' | 'keep_until'>, today: string) => a.stage !== 'hired' && a.keep_until < today

/** How many applicants are at each stage. */
export function stageCounts(list: Pick<Applicant, 'stage'>[]): Record<ApplicantStage, number> {
  const out = Object.fromEntries(APPLICANT_STAGES.map(s => [s.id, 0])) as Record<ApplicantStage, number>
  for (const a of list) out[a.stage]++
  return out
}

/** A job's lane on the hiring board: its applicants by stage, the newest first in each. */
export interface HiringLane { opening: JobOpening; byStage: Record<ApplicantStage, JobApplicant[]>; total: number }

/** Filled and closed jobs with nobody left in the running: off the board unless asked for. */
export const finishedJob = (o: Pick<JobOpening, 'id' | 'status'>, applicants: Pick<Applicant, 'opening_id' | 'stage'>[]) =>
  (o.status === 'filled' || o.status === 'closed') && !applicants.some(a => a.opening_id === o.id && STILL_IN.includes(a.stage))

/**
 * The hiring board's swimlanes: a lane per job (open ones first, then the newest), a column per stage.
 * Finished jobs (filled or closed, nobody left in the running) only when `withFinished`.
 */
export function hiringLanes(openings: JobOpening[], applicants: Applicant[], withFinished = false): HiringLane[] {
  return openings
    .filter(o => withFinished || !finishedJob(o, applicants))
    .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.opened_on.localeCompare(a.opened_on))
    .map(opening => {
      const theirs = applicants.filter((a): a is JobApplicant => a.opening_id === opening.id)
      const byStage = Object.fromEntries(APPLICANT_STAGES.map(s => [s.id,
        theirs.filter(a => a.stage === s.id).sort((x, y) => y.applied_on.localeCompare(x.applied_on) || x.full_name.localeCompare(y.full_name))])) as Record<ApplicantStage, JobApplicant[]>
      return { opening, byStage, total: theirs.length }
    })
}

/** Where a card was dropped on the board: a job's lane and a stage. What changes, or null if nothing does. */
export function boardMove(a: Pick<Applicant, 'opening_id' | 'stage'>, to: { opening_id: string; stage: ApplicantStage }) {
  if (a.opening_id === to.opening_id && a.stage === to.stage) return null
  return a.opening_id === to.opening_id ? { stage: to.stage } : { opening_id: to.opening_id, stage: to.stage }
}

/** The candidates list's search: a name, an email or a phone number (digits only, spaces ignored). */
export function matchesCandidate(a: Pick<Applicant, 'full_name' | 'email' | 'phone'>, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  return a.full_name.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)
    || (digits.length >= 3 && (a.phone ?? '').replace(/\D/g, '').includes(digits))
}

// The CV pool: people kept for a job to come when there's no job for them yet (a CV handed in at the
// counter, sent by email, passed on). They're applicants with no job until they're added to one, when
// they go on its board at Applied, CV and all. Kept a year from being added, as everyone who applied.

/** Someone added to the CV pool (no id) or changed there. */
export type PoolInput = Partial<Pick<Applicant, 'email' | 'phone' | 'source' | 'roles' | 'available_from' | 'availability' | 'cv_link' | 'notes' | 'applied_on'>>
  & { id?: string; full_name: string }

/** The roles typed for someone: trimmed, each once whatever its capitals (the first spelling), up to 10 of up to 60 characters. */
export function cleanRoles(roles: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of roles) {
    const r = raw.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!r || seen.has(r.toLowerCase())) continue
    seen.add(r.toLowerCase())
    out.push(r)
  }
  return out.slice(0, 10)
}

/** Every role someone in the pool would suit, each once, A to Z: the pool's role filter. */
export const poolRoles = (pool: Pick<Applicant, 'roles'>[]) => {
  const seen = new Map<string, string>()
  for (const r of pool.flatMap(a => a.roles)) if (!seen.has(r.toLowerCase())) seen.set(r.toLowerCase(), r)
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** They'd suit this role (whatever its capitals). */
export const suits = (a: Pick<Applicant, 'roles'>, role: string) => a.roles.some(r => r.toLowerCase() === role.trim().toLowerCase())

/** They can start by this day: no day said, or that day or before. */
export const availableBy = (a: Pick<Applicant, 'available_from'>, day: string) => !a.available_from || a.available_from <= day

/** The CV pool's search: a name, an email or a phone number, as for candidates, and the roles they'd suit, when they can work and the notes. */
export function matchesPoolCandidate(a: Pick<Applicant, 'full_name' | 'email' | 'phone' | 'roles' | 'availability' | 'notes'>, query: string) {
  const q = query.trim().toLowerCase()
  return matchesCandidate(a, query) || [...a.roles, a.availability ?? '', a.notes ?? ''].some(x => x.toLowerCase().includes(q))
}

/** The pool, the newest first (then A to Z). */
export const poolOrder = <T extends Pick<Applicant, 'applied_on' | 'full_name'>>(pool: T[]) =>
  [...pool].sort((a, b) => b.applied_on.localeCompare(a.applied_on) || a.full_name.localeCompare(b.full_name))

/** An applicant's uploaded CV, without the file itself. */
export interface ApplicantCv {
  applicant_id: string
  file_name: string
  mime_type: string | null
  size: number
  added_at: string
}
/** Everything but the file, for listing them. */
export const CV_COLUMNS = 'applicant_id,file_name,mime_type,size,added_at'

/** CVs are kept in the database, as a data: URL: up to 10 MB. */
export const MAX_CV_SIZE = 10 * 1024 * 1024

const PREVIEW_IMAGE = /^image\/(png|jpeg|gif|webp)$/
const CV_NAMES = /\.(pdf|docx?|odt|rtf|txt|pages|heic|heif|png|jpe?g|gif|webp)$/
const CV_TYPES = /^(application\/(pdf|msword|rtf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.oasis\.opendocument\.text)|text\/(plain|rtf)|image\/(png|jpeg|gif|webp|heic|heif))$/

/** What a CV file is: a PDF or a picture (shown in the page), another document (Word, a phone photo: downloaded), or not a CV (null). */
export function cvKind(f: { name: string; type?: string | null }): 'pdf' | 'image' | 'document' | null {
  const type = (f.type ?? '').toLowerCase()
  const name = f.name.toLowerCase()
  if (type === 'application/pdf' || (!type && name.endsWith('.pdf'))) return 'pdf'
  if (PREVIEW_IMAGE.test(type) || (!type && /\.(png|jpe?g|gif|webp)$/.test(name))) return 'image'
  return CV_TYPES.test(type) || CV_NAMES.test(name) ? 'document' : null
}

/** How a CV is shown in the page (a PDF or a picture), or null when it only downloads (a Word document). */
export function cvPreview(cv: Pick<ApplicantCv, 'file_name' | 'mime_type'>): 'pdf' | 'image' | null {
  const kind = cvKind({ name: cv.file_name, type: cv.mime_type })
  return kind === 'pdf' || kind === 'image' ? kind : null
}

/** The files the CV picker offers. */
export const CV_ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,.pages,.heic,.heif,image/png,image/jpeg,image/gif,image/webp'

/** Why a file can't be kept as a CV (shown as is), or null. */
export function cvProblem(f: { size: number; name: string; type?: string | null }): string | null {
  if (!f.size) return msg('That file is empty')
  if (f.size > MAX_CV_SIZE) return msg('A CV can be up to 10 MB')
  if (f.name.length > 255) return msg('That file’s name is too long')
  if (!cvKind(f)) return msg('A CV is a PDF, a Word document or a picture')
  return null
}

/** "84 KB", "1.6 MB". */
export const cvSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
