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
  opening_id: string
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
}
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
export interface HiringLane { opening: JobOpening; byStage: Record<ApplicantStage, Applicant[]>; total: number }

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
      const theirs = applicants.filter(a => a.opening_id === opening.id)
      const byStage = Object.fromEntries(APPLICANT_STAGES.map(s => [s.id,
        theirs.filter(a => a.stage === s.id).sort((x, y) => y.applied_on.localeCompare(x.applied_on) || x.full_name.localeCompare(y.full_name))])) as Record<ApplicantStage, Applicant[]>
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
