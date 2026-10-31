import { describe, expect, it } from 'vitest'
import {
  CONTRACT_KINDS, contractProblem, contractStatus, contractTotals, contractsByPerson, inFilter, isCurrent, monthlyGross, trialEndingSoon,
  type EmploymentContract,
} from './contracts'

const contract = (c: Partial<EmploymentContract>): EmploymentContract => ({ id: 'c', profile_id: 'p', kind: 'indefinido', starts_on: '2026-04-01',
  ends_on: null, trial_ends_on: null, hours_per_week: null, salary: null, salary_per: null, convenio: null, job_title: null, document_url: null,
  notes: null, created_at: '2026-04-01T09:00:00Z', updated_at: '2026-04-01T09:00:00Z', ...c })
const today = '2026-09-30'

describe('employment contracts', () => {
  it('the kinds Spanish law has, each once', () => {
    expect(CONTRACT_KINDS.map(k => k.id)).toEqual(['indefinido', 'indefinido_parcial', 'fijo_discontinuo', 'temporal_produccion',
      'temporal_sustitucion', 'formativo', 'autonomo'])
    expect(CONTRACT_KINDS.filter(k => k.temporary).map(k => k.id)).toEqual(['temporal_produccion', 'temporal_sustitucion', 'formativo'])
  })

  it('a contract runs, is in its trial period, ends within 30 days, has ended or starts later', () => {
    expect(contractStatus(contract({}), today)).toBe('active')
    expect(contractStatus(contract({ ends_on: '2026-10-31' }), today)).toBe('active')
    expect(contractStatus(contract({ ends_on: '2026-10-30' }), today)).toBe('ending')
    expect(contractStatus(contract({ ends_on: '2026-09-30' }), today)).toBe('ending') // its last day
    expect(contractStatus(contract({ ends_on: '2026-09-29' }), today)).toBe('ended')
    expect(contractStatus(contract({ starts_on: '2026-10-01' }), today)).toBe('upcoming')
    expect(contractStatus(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-09-30' }), today)).toBe('trial')
    expect(contractStatus(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-09-29' }), today)).toBe('active')
    // Ending soon is the one to act on, even in the trial period; ended is ended.
    expect(contractStatus(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-10-10', ends_on: '2026-10-20' }), today)).toBe('ending')
    expect(contractStatus(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-10-10', ends_on: '2026-09-20' }), today)).toBe('ended')
  })

  it('a trial period ending within two weeks is marked; one further off, over or of an ended contract isn’t', () => {
    expect(trialEndingSoon(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-10-14' }), today)).toBe(true)
    expect(trialEndingSoon(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-09-30' }), today)).toBe(true)
    expect(trialEndingSoon(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-10-15' }), today)).toBe(false)
    expect(trialEndingSoon(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-09-29' }), today)).toBe(false)
    expect(trialEndingSoon(contract({ starts_on: '2026-09-10', trial_ends_on: '2026-10-05', ends_on: '2026-09-20' }), today)).toBe(false)
    expect(trialEndingSoon(contract({ starts_on: '2026-10-01', trial_ends_on: '2026-10-05' }), today)).toBe(false)
    expect(trialEndingSoon(contract({}), today)).toBe(false)
  })

  it('the filters: active is everything not ended (starting later too)', () => {
    expect((['upcoming', 'trial', 'active', 'ending', 'ended'] as const).filter(s => inFilter(s, 'active'))).toEqual(['upcoming', 'trial', 'active', 'ending'])
    expect((['upcoming', 'trial', 'active', 'ending', 'ended'] as const).filter(s => inFilter(s, 'ending'))).toEqual(['ending'])
    expect((['upcoming', 'trial', 'active', 'ending', 'ended'] as const).filter(s => inFilter(s, 'ended'))).toEqual(['ended'])
    expect((['upcoming', 'trial', 'active', 'ending', 'ended'] as const).every(s => inFilter(s, 'all'))).toBe(true)
  })

  it('a month’s gross: a monthly salary as it is, a yearly one over 12 months, an hourly one by the hours a week over 52 weeks', () => {
    expect(monthlyGross(contract({ salary: 1320, salary_per: 'month' }))).toBe(1320)
    expect(monthlyGross(contract({ salary: 18480, salary_per: 'year' }))).toBe(1540)
    expect(monthlyGross(contract({ salary: 8.8, salary_per: 'hour', hours_per_week: 30 }))).toBe(1144)
    expect(monthlyGross(contract({ salary: 9.5, salary_per: 'hour', hours_per_week: 6 }))).toBe(247)
    expect(monthlyGross(contract({ salary: 10, salary_per: 'hour', hours_per_week: 7 }))).toBe(303.33)
    expect(monthlyGross(contract({ salary: 10, salary_per: 'hour' }))).toBeNull()
    expect(monthlyGross(contract({ salary: null, salary_per: 'month' }))).toBeNull() // not set, or not shown to them
  })

  it('totals: the people on a contract today, their hours and their gross a month; ended and later ones left out', () => {
    const list = [
      contract({ id: 'a', profile_id: 'julio', hours_per_week: 35, salary: 1320, salary_per: 'month', trial_ends_on: '2026-05-31' }),
      contract({ id: 'b', profile_id: 'maria', starts_on: '2026-07-01', ends_on: '2026-10-21', hours_per_week: 30, salary: 8.8, salary_per: 'hour' }),
      contract({ id: 'c', profile_id: 'maria', starts_on: '2026-04-01', ends_on: '2026-06-30', hours_per_week: 30, salary: 8.8, salary_per: 'hour' }),
      contract({ id: 'd', profile_id: 'cleaner', starts_on: '2026-09-10', trial_ends_on: '2026-10-10', hours_per_week: 6, salary: 9.5, salary_per: 'hour' }),
      contract({ id: 'e', profile_id: 'new', starts_on: '2026-11-01', hours_per_week: 40, salary: 1500, salary_per: 'month' }),
      contract({ id: 'f', profile_id: 'mark', kind: 'autonomo' }),
    ]
    expect(list.filter(c => isCurrent(c, today)).map(c => c.id)).toEqual(['a', 'b', 'd', 'f'])
    expect(contractTotals(list, today)).toEqual({ people: 4, contracts: 4, hours: 71, monthly: 2711, unknown: 1 })
    expect(contractTotals([], today)).toEqual({ people: 0, contracts: 0, hours: 0, monthly: 0, unknown: 0 })
  })

  it('each person’s contracts, newest first', () => {
    const by = contractsByPerson([
      contract({ id: 'old', profile_id: 'maria', starts_on: '2026-04-01' }),
      contract({ id: 'julio', profile_id: 'julio' }),
      contract({ id: 'new', profile_id: 'maria', starts_on: '2026-07-01' }),
    ])
    expect(by.get('maria')!.map(c => c.id)).toEqual(['new', 'old'])
    expect(by.get('julio')!.map(c => c.id)).toEqual(['julio'])
  })

  it('what’s wrong with a contract before it’s saved', () => {
    const ok = { profile_id: 'p', kind: 'indefinido' as const, starts_on: '2026-04-01' }
    expect(contractProblem(ok)).toBeNull()
    expect(contractProblem({ ...ok, ends_on: '2026-04-01', trial_ends_on: '2026-04-01', hours_per_week: 40, salary: 0, document_url: 'https://drive.google.com/x' })).toBeNull()
    expect(contractProblem({ ...ok, profile_id: '' })).toBe('Choose whose contract it is')
    expect(contractProblem({ ...ok, kind: undefined })).toBe('Choose the type of contract')
    expect(contractProblem({ ...ok, starts_on: '' })).toBe('Say when it starts')
    expect(contractProblem({ ...ok, ends_on: '2026-03-31' })).toBe('It can’t end before it starts')
    expect(contractProblem({ ...ok, trial_ends_on: '2026-03-31' })).toBe('The trial period can’t end before the contract starts')
    expect(contractProblem({ ...ok, hours_per_week: 0 })).toBe('Give the hours a week, up to 80')
    expect(contractProblem({ ...ok, hours_per_week: 81 })).toBe('Give the hours a week, up to 80')
    expect(contractProblem({ ...ok, salary: -1 })).toBe('Enter numbers like 12 or 1,45')
    expect(contractProblem({ ...ok, document_url: 'drive.google.com/x' })).toBe('The link needs to start with https://')
  })
})
