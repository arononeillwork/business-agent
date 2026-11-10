// The demo's support tickets (src/data/demoBackOffice.ts) keep the database's rules (the support_tickets
// migration): five a day, at least 10 characters, the same words twice in a day being the one sent; HQ hears
// about problem reports at most once every 15 minutes; the person hears when HQ replies or closes theirs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoBackOfficeApi } from './demoBackOffice'
import type { BillingInfo } from './api'
import type { Business, Profile } from '../../shared/types'

const team = [
  { id: 'p-aron', full_name: 'Aron', email: 'aron@example.com', role: 'admin', active: true },
  { id: 'p-maria', full_name: 'Maria', email: 'maria@example.com', role: 'employee', active: true },
] as Profile[]

let me: string | null
let notes: { profileId: string; title: string; body: string | null; link: string }[]

function demo(isHq = true) {
  return demoBackOfficeApi({
    hqAdmin: () => isHq && me === 'p-aron', isOwner: () => me === 'p-aron', me: () => me,
    business: { name: 'Easy Beans Coffee', is_hq: isHq } as Business, billing: {} as BillingInfo,
    team: () => team, shifts: () => [], timecards: () => [], daysAgo: d => new Date(Date.now() - d * 86_400_000).toISOString(),
    notify: (profileId, title, body, link) => { notes.push({ profileId, title, body, link }) },
    owner: 'p-aron',
  })
}
const draft = (message: string, kind: 'not_working' | 'question' | 'idea' = 'question') =>
  ({ kind, message, page: '/rota', app_version: 'index-abc', browser: 'Mozilla/5.0', error_fingerprint: null })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
  me = 'p-maria'
  notes = []
})
afterEach(() => { vi.useRealTimers() })

describe('the demo’s support tickets', () => {
  it('has the owner’s answered idea under Your requests, and nothing for someone who sent none', async () => {
    const api = demo()
    expect(await api.mySupportTickets()).toEqual([])
    me = 'p-aron'
    const [idea] = await api.mySupportTickets()
    expect(idea).toMatchObject({ kind: 'idea', status: 'answered' })
    expect(idea.reply).toMatch(/on our list/)
  })

  it('keeps the limits: 10 characters, the same words twice in a day being the one sent, five a day', async () => {
    const api = demo()
    await expect(api.reportProblem(draft('Too short'))).rejects.toThrow('Say a little more: at least 10 characters')
    const first = await api.reportProblem(draft('How do I swap a shift with Julio?'))
    expect(first.duplicate).toBe(false)
    expect(await api.reportProblem(draft('  how do I swap a SHIFT with julio? '))).toEqual({ id: first.id, duplicate: true })
    for (const n of [2, 3, 4, 5]) expect((await api.reportProblem(draft(`Question number ${n} about tips`))).duplicate).toBe(false)
    await expect(api.reportProblem(draft('A sixth one, about holidays'))).rejects.toThrow('You’ve sent us 5 requests today')
    expect((await api.reportProblem(draft('Question number 3 about tips'))).duplicate).toBe(true)
    expect(await api.mySupportTickets()).toHaveLength(5)
    // A day later there's room again, and the same words are a new one.
    vi.advanceTimersByTime(24 * 3_600_000 + 1000)
    expect((await api.reportProblem(draft('How do I swap a shift with Julio?'))).duplicate).toBe(false)
    me = null
    await expect(api.reportProblem(draft('Signed out, asking anyway'))).rejects.toThrow('Sign in to send us a request')
  })

  it('tells HQ’s admins about problem reports at most once every 15 minutes, how many; questions and ideas tell nobody', async () => {
    const api = demo()
    await api.reportProblem(draft('A question about the rota page', 'question'))
    expect(notes).toEqual([])
    await api.reportProblem(draft('The rota went blank on my phone.', 'not_working'))
    expect(notes).toEqual([{ profileId: 'p-aron', title: '1 new problem report', body: 'Latest: “The rota went blank on my phone.”. On Businesses, under Support.',
      link: '/hq/businesses#support' }])
    vi.advanceTimersByTime(5 * 60_000)
    await api.reportProblem(draft('Clocking in says I am not on the rota.', 'not_working'))
    expect(notes).toHaveLength(1)
    vi.advanceTimersByTime(11 * 60_000)
    await api.reportProblem(draft('The till total does not match.', 'not_working'))
    expect(notes).toHaveLength(2)
    expect(notes[1]).toMatchObject({ title: '2 new problem reports', body: 'Latest: “The till total does not match.”. On Businesses, under Support.' })
  })

  it('tells nobody when the café isn’t HQ (HQ’s admins are elsewhere)', async () => {
    const api = demo(false)
    await api.reportProblem(draft('The rota went blank on my phone.', 'not_working'))
    expect(notes).toEqual([])
    me = 'p-aron'
    expect(await api.hqSupportTickets()).toEqual([])
  })

  it('lets HQ list them, open ones first, and answer: the person hears about a reply, and about it closing', async () => {
    const api = demo()
    const { id } = await api.reportProblem(draft('Can I export the rota to Excel?'))
    await expect(api.hqSupportTickets()).resolves.toEqual([])
    await expect(api.hqAnswerSupportTicket(id, 'closed', null)).rejects.toThrow('Only The Business Agent HQ’s admins')

    me = 'p-aron'
    const list = await api.hqSupportTickets()
    expect(list.map(s => s.status)).toEqual(['open', 'open', 'looking', 'answered'])
    expect(list.find(s => s.id === id)).toMatchObject({ person: 'Maria', email: 'maria@example.com', business_name: 'Easy Beans Coffee', page: '/rota' })
    await expect(api.hqAnswerSupportTicket(id, 'answered', '  ')).rejects.toThrow('Write a reply before marking it answered')
    await api.hqAnswerSupportTicket(id, 'looking', null)
    expect(notes).toEqual([])
    await api.hqAnswerSupportTicket(id, 'answered', 'Yes: Rota → Export, then CSV.')
    expect(notes).toEqual([{ profileId: 'p-maria', title: 'The Business Agent answered your request', body: 'Yes: Rota → Export, then CSV.', link: '/?help=requests' }])
    await api.hqAnswerSupportTicket(id, 'closed', 'Yes: Rota → Export, then CSV.')
    expect(notes[1]).toMatchObject({ profileId: 'p-maria', title: 'Your request is closed', body: 'You wrote: “Can I export the rota to Excel?”' })
    await api.hqAnswerSupportTicket(id, 'closed', null)
    expect(notes).toHaveLength(2)

    me = 'p-maria'
    expect((await api.mySupportTickets())[0]).toMatchObject({ id, status: 'closed', reply: 'Yes: Rota → Export, then CSV.' })
  })
})
