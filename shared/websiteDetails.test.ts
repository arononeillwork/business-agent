// The business's details for its website (shared/websiteDetails.ts). What must never break:
//   - the usual week as the Opening hours page has it, Monday first, "HH:MM", a missing day closed
//   - the same closures Google Maps is sent: closures on the Calendar, public holidays only when the
//     business closes on them, from today on
//   - the next 14 days with those applied, for "open now" and online ordering
//   - its contacts and accounts as links a website can use as they are
import { describe, expect, it } from 'vitest'
import { siteDetails, DAYS_AHEAD, type DetailsInput } from './websiteDetails'
import type { CalendarEvent } from './types'

const event = (starts_on: string, title: string, category: CalendarEvent['category'], more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${starts_on}-${title}`, starts_on, ends_on: null, starts_at: null, title, category, town: null, competition: null, source: 'manual',
  confirmed: true, visibility: 'all', ...more,
})

const input = (more: Partial<DetailsInput> = {}): DetailsInput => ({
  business: {
    id: 1, name: 'Easy Beans Coffee', address: 'C. Pizarro 8, 29670 San Pedro de Alcántara, Málaga', phone: '+34 952 000 000',
    email: 'hola@easybeans.example', instagram: '@easy.beans.coffee', website: 'https://www.easybeanscoffee.com', timezone: 'Europe/Madrid',
    whatsapp: '+34 695 415 335', tiktok: 'easybeanscoffee',
    opening_hours: { mon: { open: '8:00', close: '15:00' }, tue: { open: '08:00', close: '15:00' }, wed: { open: '08:00', close: '15:00' },
      thu: { open: '08:00', close: '15:00' }, fri: { open: '08:00', close: '15:00' }, sat: { open: '09:00', close: '15:00' }, sun: null },
  },
  events: [],
  closedOnHolidays: false,
  today: '2026-12-21', // a Monday
  now: new Date('2026-12-21T09:00:00Z'),
  ...more,
})

describe('the business’s details for its website', () => {
  it('gives its contacts and accounts as links to use as they are', () => {
    const d = siteDetails(input())
    expect(d).toMatchObject({
      version: 1, business: { id: 1, name: 'Easy Beans Coffee' },
      address: 'C. Pizarro 8, 29670 San Pedro de Alcántara, Málaga',
      address_lines: ['C. Pizarro 8', '29670 San Pedro de Alcántara', 'Málaga'],
      phone: '+34 952 000 000', whatsapp: '+34 695 415 335', whatsapp_url: 'https://wa.me/34695415335',
      email: 'hola@easybeans.example', website: 'https://www.easybeanscoffee.com',
      social: { instagram: { handle: 'easy.beans.coffee', url: 'https://www.instagram.com/easy.beans.coffee' },
        tiktok: { handle: 'easybeanscoffee', url: 'https://www.tiktok.com/@easybeanscoffee' } },
      timezone: 'Europe/Madrid', generated_at: '2026-12-21T09:00:00.000Z',
    })
    expect(d.maps_url).toBe('https://www.google.com/maps/search/?api=1&query=Easy%20Beans%20Coffee%20C.%20Pizarro%208%2C%2029670%20San%20Pedro%20de%20Alc%C3%A1ntara%2C%20M%C3%A1laga')
    expect(siteDetails(input({ placeId: 'ChIJ123' })).maps_url).toMatch(/&query_place_id=ChIJ123$/)
  })

  it('leaves out what the business hasn’t filled in', () => {
    const d = siteDetails(input({ business: { ...input().business, address: ' ', whatsapp: null, tiktok: null, instagram: null, email: null } }))
    expect(d).toMatchObject({ address: null, address_lines: [], maps_url: null, whatsapp: null, whatsapp_url: null, email: null,
      social: { instagram: null, tiktok: null } })
  })

  it('gives the usual week Monday first, as HH:MM, a day without hours closed', () => {
    expect(siteDetails(input()).hours).toEqual({
      mon: { open: '08:00', close: '15:00' }, tue: { open: '08:00', close: '15:00' }, wed: { open: '08:00', close: '15:00' },
      thu: { open: '08:00', close: '15:00' }, fri: { open: '08:00', close: '15:00' }, sat: { open: '09:00', close: '15:00' }, sun: null,
    })
    const { hours } = siteDetails(input({ business: { ...input().business, opening_hours: { mon: { open: '7:30', close: '14:00' } } } }))
    expect(hours.mon).toEqual({ open: '07:30', close: '14:00' })
    expect(hours.tue).toBeNull()
  })

  it('lists the closures Google Maps is sent: the Calendar’s, and holidays only when it closes on them', () => {
    const events = [
      event('2026-12-24', 'Closed for Christmas', 'business', { ends_on: '2026-12-26' }),
      event('2026-12-25', 'Christmas Day', 'national'),
      event('2026-12-23', 'Staff party', 'business'),
      event('2026-12-22', 'Cerrado por inventario', 'business', { confirmed: false }),
      event('2026-12-10', 'Closed for a wedding', 'business'),
    ]
    expect(siteDetails(input({ events })).closures).toEqual([{ from: '2026-12-24', to: '2026-12-26', reason: 'Closed for Christmas' }])
    expect(siteDetails(input({ events, closedOnHolidays: true })).closures).toEqual([
      { from: '2026-12-24', to: '2026-12-26', reason: 'Closed for Christmas' },
      { from: '2026-12-25', to: '2026-12-25', reason: 'Christmas Day' },
    ])
  })

  it('a closure that started before today counts from today', () => {
    const d = siteDetails(input({ events: [event('2026-12-19', 'Closed: new floor', 'business', { ends_on: '2026-12-22' })] }))
    expect(d.closures).toEqual([{ from: '2026-12-21', to: '2026-12-22', reason: 'Closed: new floor' }])
    expect(d.days[0]).toEqual({ date: '2026-12-21', day: 'mon', open: null, close: null, closed_reason: 'Closed: new floor' })
  })

  it('gives the next 14 days with the closures applied', () => {
    const d = siteDetails(input({ events: [event('2026-12-24', 'Closed for Christmas', 'business', { ends_on: '2026-12-25' })] }))
    expect(d.days).toHaveLength(DAYS_AHEAD)
    expect(d.days.slice(0, 7)).toEqual([
      { date: '2026-12-21', day: 'mon', open: '08:00', close: '15:00', closed_reason: null },
      { date: '2026-12-22', day: 'tue', open: '08:00', close: '15:00', closed_reason: null },
      { date: '2026-12-23', day: 'wed', open: '08:00', close: '15:00', closed_reason: null },
      { date: '2026-12-24', day: 'thu', open: null, close: null, closed_reason: 'Closed for Christmas' },
      { date: '2026-12-25', day: 'fri', open: null, close: null, closed_reason: 'Closed for Christmas' },
      { date: '2026-12-26', day: 'sat', open: '09:00', close: '15:00', closed_reason: null },
      // Closed on Sundays anyway: no reason needed.
      { date: '2026-12-27', day: 'sun', open: null, close: null, closed_reason: null },
    ])
    expect(d.days[13].date).toBe('2027-01-03')
  })
})
