import { describe, expect, it } from 'vitest'
import { cleanTodo, earningsOf, fillTemplate, groupTodos, helpNeeded, todayList, whatsAppMessageLink, type AdminTodo } from './adminArea'
import type { RepIntroduction } from './hqReps'
import type { Prospect } from './salesTeam'

const todo = (id: string, planned_on: string | null, done = false, done_at: string | null = null): AdminTodo => ({
  id, title: id, done, done_at, planned_on, category_id: null, sales_prospect_id: null, created_at: '2026-11-01T10:00:00Z',
})
const intro = (name: string, created_at: string, over: Partial<RepIntroduction> = {}): RepIntroduction => ({
  id: name, rep_id: 'julio', name, kind: 'cafe', code: 'JULIO27', set_up_at: null, plan: 'free', status: 'none',
  billing_interval: null, first_paid_at: null, created_at, ...over,
})

describe('messages to send', () => {
  it('fill in the business, who sends it, their code and link', () => {
    expect(fillTemplate('Hi {business}! I’m {me}. Code {code}: {link}', { business: 'Keki Marbella', me: 'Julio Cesar', code: 'JULIO27', link: 'https://x/?ref=JULIO27' }))
      .toBe('Hi Keki Marbella! I’m Julio Cesar. Code JULIO27: https://x/?ref=JULIO27')
    expect(fillTemplate('Start here: {link} (code {code})', { business: 'X', me: 'Y', code: null, link: 'https://x/' })).toBe('Start here: https://x/')
  })
  it('open WhatsApp with the message written in', () => {
    expect(whatsAppMessageLink('+34 600 111 222', 'Hola, ¿qué tal?')).toBe('https://wa.me/34600111222?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F')
  })
})

describe('the to-do list', () => {
  it('goes in groups: gone by, today, coming up, whenever, done', () => {
    const g = groupTodos([todo('a', '2026-11-25'), todo('b', '2026-11-20'), todo('c', '2026-11-22'), todo('d', null), todo('e', '2026-11-23'),
      todo('f', '2026-11-21', true, '2026-11-21T10:00:00Z'), todo('g', null, true, '2026-11-22T09:00:00Z')], '2026-11-22')
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map(t => t.id)]))).toEqual({
      overdue: ['b'], today: ['c'], soon: ['e', 'a'], later: ['d'], done: ['g', 'f'],
    })
  })
  it('a job as sent: tidied, and what isn’t right said', () => {
    expect(cleanTodo({ title: '  Print   rep cards ', planned_on: '2026-11-24' }, true)).toEqual({ row: { title: 'Print rep cards', planned_on: '2026-11-24' } })
    expect(cleanTodo({ done: true }, false)).toEqual({ row: { done: true } })
    expect(cleanTodo({ planned_on: '' , sales_prospect_id: null }, false)).toEqual({ row: { planned_on: null, sales_prospect_id: null } })
    expect(cleanTodo({ title: ' ' }, true)).toEqual({ error: 'Say what the job is' })
    expect(cleanTodo({ planned_on: 'Friday' }, false)).toEqual({ error: 'That isn’t a date' })
    expect(cleanTodo({ sales_prospect_id: 'keki' }, false)).toEqual({ error: 'Choose a contact' })
  })
})

describe('the team’s money', () => {
  it('earned, waiting its 30 days, paid out and owed', () => {
    const rewards = [
      { rep_id: 'j', kind: 'earn', status: 'approved', amount: '50.00' }, { rep_id: 'j', kind: 'earn', status: 'approved', amount: 15.8 },
      { rep_id: 'j', kind: 'earn', status: 'pending', amount: 15.8 }, { rep_id: 'j', kind: 'clawback', status: 'approved', amount: -15.8 },
      { rep_id: 'j', kind: 'payout', status: 'approved', amount: -40 }, { rep_id: 'j', kind: 'earn', status: 'rejected', amount: 99 },
      { rep_id: 'm', kind: 'earn', status: 'approved', amount: 50 },
    ]
    expect(earningsOf(rewards, 'j')).toEqual({ earned: 50, waiting: 15.8, paid: 40, owed: 10 })
    expect(earningsOf(rewards, 'nobody')).toEqual({ earned: 0, waiting: 0, paid: 0, owed: 0 })
  })
})

describe('businesses that signed up', () => {
  it('need a hand when set-up isn’t finished 3 days on, or a payment failed', () => {
    expect(helpNeeded(intro('a', '2026-11-20T10:00:00Z'), '2026-11-22')).toBeNull()
    expect(helpNeeded(intro('a', '2026-11-19T10:00:00Z'), '2026-11-22')).toBe('set_up')
    expect(helpNeeded(intro('a', '2026-11-01T10:00:00Z', { set_up_at: '2026-11-02T10:00:00Z' }), '2026-11-22')).toBeNull()
    expect(helpNeeded(intro('a', '2026-11-01T10:00:00Z', { set_up_at: '2026-11-02T10:00:00Z', status: 'past_due', plan: 'pro' }), '2026-11-22')).toBe('payment')
    expect(helpNeeded(intro('a', '2026-11-01T10:00:00Z', { status: 'canceled' }), '2026-11-22')).toBeNull()
  })
})

describe('Today', () => {
  it('follow-ups due, jobs due, new sign-ups this week and who needs a hand', () => {
    const p = (name: string, follow_up_on: string | null, stage: Prospect['stage'] = 'contacted'): Prospect => ({
      id: name, member_id: null, name, stage, instagram: null, phone: null, email: null, website: null, town: null, notes: null,
      follow_up_on, created_at: '', updated_at: '',
    })
    const t = todayList(
      [p('Keki', '2026-11-22'), p('Bootes', '2026-11-20'), p('Later', '2026-11-30'), p('Won', '2026-11-01', 'won')],
      [todo('due', '2026-11-22'), todo('late', '2026-11-18'), todo('next', '2026-11-23'), todo('any', null)],
      [intro('New', '2026-11-21T10:00:00Z'), intro('Old', '2026-11-01T10:00:00Z'), intro('Stuck', '2026-11-18T10:00:00Z')],
      '2026-11-22')
    expect(t.followUps.map(x => x.name)).toEqual(['Bootes', 'Keki'])
    expect(t.todos.map(x => x.id)).toEqual(['late', 'due'])
    expect(t.newSignUps.map(x => x.name)).toEqual(['New', 'Stuck'])
    expect(t.needHelp.map(x => x.name)).toEqual(['Old', 'Stuck'])
  })
})
