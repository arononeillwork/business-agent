// The Outsourcing tools for AI assistants: reading the jobs and the catalogue, adding someone to the
// catalogue, and giving them a job (which ends it with whoever had it). The SQL rules are proven in
// supabase/tests/zz_outsourcing.test.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOLS, runTool, toolsFor } from './tools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { today } from '../shared/time'
import type { Profile } from '../shared/types'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const admin = { id: 'u-admin', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
const employee = { id: 'u-staff', full_name: 'Julio', role: 'employee', active: true, can_see_pay: false } as Profile
const partner = (access: Profile['partner_access']) => ({ id: 'u-partner', full_name: 'Laura', role: 'partner', active: true, partner_access: access }) as Profile

let db: FakeSupabase
const run = (name: string, args: unknown, me = admin) => runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me }, args)
const person = (c: Row): Row => ({ kind: 'freelancer', services: [], contact_name: null, email: null, phone: null, whatsapp: false, website: null,
  portfolio_url: null, location: null, rate: null, rate_unit: 'month', rating: null, notes: null, starred: false, active: true, ...c })
const job = (j: Row): Row => ({ scope: null, price: null, price_unit: 'month', quantity: null, quantity_per: null, starts_on: null, ends_on: null,
  notes: null, active: true, ...j })

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.contractors = [
    person({ id: 'lucia', name: 'Lucía Marín', services: ['Social media management', 'Photography & video'], rate: '350.00', rating: 5, starred: true,
      phone: '+34 622 41 87 30', whatsapp: true }),
    person({ id: 'nacho', name: 'Nacho Vega', services: ['Social media management'], rate: '240.00' }),
    person({ id: 'costa', name: 'Costa Social Studio', kind: 'agency', services: ['Social media management'], rate: '690.00', rating: 4 }),
    person({ id: 'cristales', name: 'Cristales Costa', kind: 'company', services: ['Window cleaning'], rate: '35.00', rate_unit: 'visit' }),
    person({ id: 'old', name: 'Old Photos SL', kind: 'company', services: ['Photography & video'], active: false }),
  ]
  db.tables.outsourced_jobs = [
    job({ id: 'j-social', service: 'Social media management', contractor_id: 'lucia', price: '350.00', starts_on: '2026-04-01', ends_on: '2099-03-31' }),
    job({ id: 'j-windows', service: 'Window cleaning', contractor_id: 'cristales', price: '35.00', price_unit: 'visit', quantity: '2.00', quantity_per: 'month' }),
    job({ id: 'j-photos', service: 'Photography & video', contractor_id: 'old', price: '450.00', price_unit: 'project', active: false,
      starts_on: '2026-04-02', ends_on: '2026-04-10' }),
  ]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const contractor = (name: string) => db.table('contractors').find(c => c.name === name)!
const jobRow = (id: string) => db.table('outsourced_jobs').find(j => j.id === id)!

describe('Outsourcing: the AI tools', () => {
  it('reads who does each job, what it costs a month, the options for each job and the past', async () => {
    const out = await run('outsourcing', {}) as Record<string, Row[] | number | string[]>
    expect(out.jobs_outsourced).toEqual([
      expect.objectContaining({ job: 'Social media management', who: 'Lucía Marín', price_eur: 350, charged: 'a month', about_eur_a_month: 350, contract: 'running',
        reach: expect.objectContaining({ phone: '+34 622 41 87 30', whatsapp: true }) }),
      expect.objectContaining({ job: 'Window cleaning', who: 'Cristales Costa', price_eur: 35, charged: 'a visit', how_many: '2 visits a month', about_eur_a_month: 70 }),
    ])
    expect(out.cost_eur_a_month).toBe(420)
    const catalogue = out.catalogue as { job: string; options: Row[] }[]
    expect(catalogue.map(g => g.job)).toEqual(['Social media management', 'Photography & video', 'Window cleaning'])
    // Starred first, then the best rated, then the cheapest; the archived aren't options.
    expect(catalogue[0].options.map(o => [o.name, o.does_it_now])).toEqual([['Lucía Marín', true], ['Costa Social Studio', false], ['Nacho Vega', false]])
    expect(catalogue[1].options.map(o => o.name)).toEqual(['Lucía Marín'])
    expect(out.archived).toEqual(['Old Photos SL'])
    expect(out.usual_jobs_nobody_does_yet).toContain('Photography & video')
    expect(out.usual_jobs_nobody_does_yet).not.toContain('Window cleaning')
    expect(out.past_jobs).toEqual([expect.objectContaining({ job: 'Photography & video', who: 'Old Photos SL', price_eur: 450, charged: 'for the project' })])
  })

  it('is for admins, and a gestoría with finances access reads it; employees and other partners don’t get it', async () => {
    const names = (me: Profile) => toolsFor(me).map(t => t.name).filter(n => ['outsourcing', 'save_contractor', 'outsource_job'].includes(n))
    expect(names(admin)).toEqual(['outsourcing', 'save_contractor', 'outsource_job'])
    expect(names(employee)).toEqual([])
    expect(names(partner(['finances']))).toEqual(['outsourcing'])
    expect(names(partner(['payroll']))).toEqual([])
    await expect(run('outsourcing', {}, employee)).rejects.toThrow('Only admins can do that')
    await expect(run('save_contractor', { name: 'X' }, partner(['finances']))).rejects.toThrow(/read-only/)
  })

  it('adds someone to the catalogue (the usual jobs in their own spelling, the phone and links tidied) and changes them by name', async () => {
    const made = await run('save_contractor', { name: 'Pablo Ríos', jobs: ['photography & VIDEO', 'Drone shots'], phone: '655 20 14 77', whatsapp: true,
      their_work: 'pabloriosfoto.example', rate_eur: 450, charged: 'project', rating: 5 }) as Row
    expect(made).toMatchObject({ ok: true, added: true })
    expect(contractor('Pablo Ríos')).toMatchObject({ services: ['Photography & video', 'Drone shots'], phone: '+34 655 201 477', whatsapp: true,
      portfolio_url: 'https://pabloriosfoto.example', rate: 450, rate_unit: 'project', rating: 5 })

    expect(await run('save_contractor', { name: 'nacho vega', add_jobs: ['Ads management'], notes: 'Quote: €240 a month' })).toEqual({ ok: true, contractor_id: 'nacho' })
    expect(contractor('Nacho Vega')).toMatchObject({ services: ['Social media management', 'Ads management'], notes: 'Quote: €240 a month' })
    await expect(run('save_contractor', { name: 'Y', phone: '12' })).rejects.toThrow(/isn't a phone number/)
    await expect(run('save_contractor', { contractor_id: 'Nobody' })).rejects.toThrow(/Nobody in the outsourcing catalogue matches "Nobody". In it: Costa Social Studio, Cristales Costa, Lucía Marín, Nacho Vega/)
  })

  it('gives someone a job and ends it with whoever had it; or changes or ends a job', async () => {
    const out = await run('outsource_job', { job: 'social media management', who: 'Nacho', price_eur: 240, charged: 'month', starts_on: '2026-11-01',
      whats_included: '3 posts a week' }) as Row
    expect(out).toMatchObject({ ok: true, ended_with: ['Lucía Marín'] })
    expect(jobRow(out.job_id as string)).toMatchObject({ service: 'Social media management', contractor_id: 'nacho', price: 240, price_unit: 'month',
      starts_on: '2026-11-01', scope: '3 posts a week' })
    expect(jobRow('j-social')).toMatchObject({ active: false, ends_on: today() })

    // A second firm for the windows, keeping the first; then hours a week counted.
    const both = await run('outsource_job', { job: 'Window cleaning', who: 'Lucía', price_eur: 15, charged: 'hour', how_many: 3, per: 'week', end_current: false }) as Row
    expect(both.ended_with).toBeUndefined()
    expect(jobRow('j-windows').active).toBe(true)
    expect(jobRow(both.job_id as string)).toMatchObject({ quantity: 3, quantity_per: 'week', starts_on: today() })

    await run('outsource_job', { job_id: 'j-windows', active: false })
    expect(jobRow('j-windows')).toMatchObject({ active: false, ends_on: today() })
    await expect(run('outsource_job', { job: 'Cleaning' })).rejects.toThrow(/Say the job and who does it/)
    await expect(run('outsource_job', { job: 'Cleaning', who: 'Costa', how_many: 2 })).rejects.toThrow(/"Costa" matches several: Costa Social Studio, Cristales Costa/)
    await expect(run('outsource_job', { job_id: 'nope', active: false })).rejects.toThrow(/No outsourced job with id nope/)
  })
})
