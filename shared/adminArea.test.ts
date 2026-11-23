import { describe, expect, it } from 'vitest'
import {
  cleanPerson, cleanTodo, earningsOf, fillTemplate, groupTodos, helpNeeded, orgChart, reorderTodos, reportsInACircle, teamUnder, todayList, whatsAppMessageLink,
  type AdminPerson, type AdminTodo,
} from './adminArea'
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
  it('in the order they were dragged into; those never moved by day, as before', () => {
    const g = groupTodos([{ ...todo('a', null), position: 2 }, { ...todo('b', null), position: -1 }, todo('c', null),
      { ...todo('d', '2026-11-30'), position: 0.5 }, todo('e', '2026-11-25'), todo('f', '2026-11-24')], '2026-11-22')
    expect(g.later.map(t => t.id)).toEqual(['b', 'c', 'a'])
    expect(g.soon.map(t => t.id)).toEqual(['f', 'e', 'd'])
  })

  it('a job dragged: between its new neighbours, or the group numbered afresh when they’re level', () => {
    const list = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }]
    expect(reorderTodos(list, 2, 0)).toEqual([{ id: 'c', position: -1 }])
    expect(reorderTodos(list, 0, 2)).toEqual([{ id: 'a', position: 3 }])
    expect(reorderTodos(list, 2, 1)).toEqual([{ id: 'c', position: 0.5 }])
    expect(reorderTodos(list, 1, 1)).toEqual([])
    expect(reorderTodos(list, 0, 5)).toEqual([])
    // Never moved: all at 0 (and one with none), so they're numbered in their new order.
    expect(reorderTodos([{ id: 'a', position: 0 }, { id: 'b' }, { id: 'c', position: 0 }], 2, 1)).toEqual([{ id: 'c', position: 1 }, { id: 'b', position: 2 }])
  })

  it('a job as sent: tidied, and what isn’t right said', () => {
    expect(cleanTodo({ title: '  Print   rep cards ', planned_on: '2026-11-24' }, true)).toEqual({ row: { title: 'Print rep cards', planned_on: '2026-11-24' } })
    expect(cleanTodo({ done: true }, false)).toEqual({ row: { done: true } })
    expect(cleanTodo({ planned_on: '' , sales_prospect_id: null }, false)).toEqual({ row: { planned_on: null, sales_prospect_id: null } })
    expect(cleanTodo({ title: ' ' }, true)).toEqual({ error: 'Say what the job is' })
    expect(cleanTodo({ planned_on: 'Friday' }, false)).toEqual({ error: 'That isn’t a date' })
    expect(cleanTodo({ sales_prospect_id: 'keki' }, false)).toEqual({ error: 'Choose a contact' })
    expect(cleanTodo({ position: 1.5 }, false)).toEqual({ row: { position: 1.5 } })
    expect(cleanTodo({ position: 'top' }, false)).toEqual({ error: 'That isn’t a place in the order' })
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

describe('people', () => {
  const person = (id: string, reports_to: string | null, position: number, kind: AdminPerson['kind'] = 'team'): AdminPerson =>
    ({ id, name: id, role: null, kind, reports_to, position })
  const people = [
    person('aron', null, 1), person('alejandro', 'aron', 2), person('ryan', 'alejandro', 3), person('mark', 'alejandro', 4),
    person('kim', 'aron', 7), person('zoe', 'aron', 8), person('giorgos', null, 9, 'investor'), person('ollie', null, 10, 'investor'),
  ]

  it('the team from the top down, each one’s reports in order; the investors beside it', () => {
    const chart = orgChart(people)
    expect(chart.team.map(n => n.person.id)).toEqual(['aron'])
    expect(chart.team[0].reports.map(n => n.person.id)).toEqual(['alejandro', 'kim', 'zoe'])
    expect(chart.team[0].reports[0].reports.map(n => n.person.id)).toEqual(['ryan', 'mark'])
    expect(teamUnder(chart.team[0])).toBe(5)
    expect(chart.investors.map(p => p.id)).toEqual(['giorgos', 'ollie'])
  })

  it('someone whose boss has gone, or who’d go round in a circle, is at the top', () => {
    expect(orgChart([...people.slice(0, 2), person('lola', 'gone', 5)]).team.map(n => n.person.id)).toEqual(['aron', 'lola'])
    const circle = orgChart([person('a', 'b', 1), person('b', 'a', 2)])
    expect(circle.team.map(n => n.person.id)).toEqual(['a', 'b'])
    expect(reportsInACircle(people, 'alejandro', 'ryan')).toBe(true)
    expect(reportsInACircle(people, 'alejandro', 'alejandro')).toBe(true)
    expect(reportsInACircle(people, 'ryan', 'kim')).toBe(false)
  })

  it('someone as sent: tidied; an investor reports to nobody; what isn’t right said', () => {
    expect(cleanPerson({ name: '  Kim  Lee ', role: ' Head of  Marketing ' }, true)).toEqual({ row: { name: 'Kim Lee', role: 'Head of Marketing', kind: 'team' } })
    expect(cleanPerson({ kind: 'investor', reports_to: '0b0e2f6c-1111-4c2d-8e3f-000000000001' }, false)).toEqual({ row: { kind: 'investor', reports_to: null } })
    expect(cleanPerson({ role: '' }, false)).toEqual({ row: { role: null } })
    expect(cleanPerson({ name: ' ' }, true)).toEqual({ error: 'Give them a name' })
    expect(cleanPerson({ name: 'X', kind: 'advisor' }, true)).toEqual({ error: 'Someone is on the team or an investor' })
    expect(cleanPerson({ reports_to: 'aron' }, false)).toEqual({ error: 'Choose someone on the team to report to' })
    // Labels: tidied, each once.
    expect(cleanPerson({ labels: [' C  TWO ', 'c two', '', 'Board'] }, false)).toEqual({ row: { labels: ['C TWO', 'Board'] } })
    expect(cleanPerson({ labels: 'C TWO' }, false)).toEqual({ error: 'Up to 10 labels' })
    expect(cleanPerson({ labels: Array.from({ length: 11 }, (_, i) => `L${i}`) }, false)).toEqual({ error: 'Up to 10 labels' })
  })
})
