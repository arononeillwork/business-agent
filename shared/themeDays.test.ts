import { describe, expect, it } from 'vitest'
import { closedOn, coffeeProblem, flagOf, inkOn, isoWeekday, playlistFromLink, pricePerKg, sortCoffees, themeOn, themeProblem, weekdaysOf, type DayTheme, type ThemeDays } from './themeDays'
import type { OpeningHours } from './types'

const theme = (id: string, name: string): DayTheme => ({ id, name, emoji: null, colour: '#169B62', description: null, coffee_id: null, playlist: null, notes: null, sort: 0 })
const irish = theme('irish', 'Irish day'), colombian = theme('colombian', 'Colombian day'), brazilian = theme('brazilian', 'Brazilian roast day')
// Irish, then Colombian, then Brazilian roast, from Monday; nothing on Sunday.
const days: ThemeDays = {
  themes: [irish, colombian, brazilian],
  rotation: { 1: 'irish', 2: 'colombian', 3: 'brazilian', 4: 'irish', 5: 'colombian', 6: 'brazilian' },
  dates: [{ day: '2027-03-17', theme_id: 'irish', note: 'St Patrick’s Day' }, { day: '2026-10-02', theme_id: null, note: null }],
}
const open = { open: '08:00', close: '18:00' }
const hours: OpeningHours = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: null }

describe('theme days', () => {
  it('knows the weekday of a date, Monday first', () => {
    expect(isoWeekday('2026-09-28')).toBe(1) // Monday
    expect(isoWeekday('2026-09-30')).toBe(3)
    expect(isoWeekday('2026-10-04')).toBe(7) // Sunday
  })

  it('follows the weekly rotation', () => {
    expect(themeOn('2026-09-28', days, { hours })).toMatchObject({ theme: irish, source: 'rotation', closed: false })
    expect(themeOn('2026-09-29', days, { hours }).theme?.name).toBe('Colombian day')
    expect(themeOn('2026-09-30', days, { hours }).theme?.name).toBe('Brazilian roast day')
    expect(themeOn('2026-10-03', days, { hours }).theme?.name).toBe('Brazilian roast day')
  })

  it('a date set apart comes first: another theme, or none that day', () => {
    expect(themeOn('2027-03-17', days, { hours })).toMatchObject({ theme: irish, source: 'date' }) // a Wednesday: Brazilian otherwise
    expect(themeOn('2026-10-02', days, { hours })).toEqual({ theme: null, source: 'date', closed: false }) // a Friday: Colombian otherwise
  })

  it('gives a closed day no theme from the rotation, unless a date says otherwise', () => {
    expect(themeOn('2026-10-04', days, { hours })).toEqual({ theme: null, source: null, closed: true }) // Sunday
    // Open on Sundays, but nothing in the rotation then.
    expect(themeOn('2026-10-04', days, { hours: { ...hours, sun: open } })).toEqual({ theme: null, source: null, closed: false })
    // A closure on the calendar (a deep clean) closes a Monday.
    expect(themeOn('2026-09-28', days, { hours, closures: new Set(['2026-09-28']) })).toEqual({ theme: null, source: null, closed: true })
    // A special opening on a closed Sunday with its own theme.
    const special = { ...days, dates: [{ day: '2026-10-04', theme_id: 'irish', note: null }] }
    expect(themeOn('2026-10-04', special, { hours })).toEqual({ theme: irish, source: 'date', closed: true })
    // Opening hours not set yet: every day is open.
    expect(closedOn('2026-10-04', {})).toBe(false)
    expect(closedOn('2026-10-04', null)).toBe(false)
  })

  it('a theme that has gone gives no theme, and no data gives none', () => {
    expect(themeOn('2026-09-28', { ...days, themes: [colombian] }, { hours }).theme).toBeNull()
    expect(themeOn('2026-09-28', null)).toEqual({ theme: null, source: null, closed: false })
  })

  it('lists the weekdays a theme is on', () => {
    expect(weekdaysOf('irish', days.rotation)).toEqual([1, 4])
    expect(weekdaysOf('nothing', days.rotation)).toEqual([])
  })

  it('makes a flag from a country code', () => {
    expect(flagOf('CO')).toBe('🇨🇴')
    expect(flagOf('ie')).toBe('🇮🇪')
    expect(flagOf(null)).toBe('')
    expect(flagOf('Colombia')).toBe('')
  })

  it('reads a playlist from a YouTube Music or Spotify link', () => {
    expect(playlistFromLink('https://music.youtube.com/playlist?list=PLx_12-ab&si=abc', ' Cumbia ')).toEqual(
      { id: 'PLx_12-ab', name: 'Cumbia', url: 'https://music.youtube.com/playlist?list=PLx_12-ab', provider: 'youtube' })
    expect(playlistFromLink('https://www.youtube.com/watch?v=abc&list=PL99', 'Mix')?.id).toBe('PL99')
    expect(playlistFromLink('https://open.spotify.com/intl-es/playlist/37i9dQZF1DX0XUsuxWHRQd?si=1', 'Bossa')).toEqual(
      { id: '37i9dQZF1DX0XUsuxWHRQd', name: 'Bossa', url: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd', provider: 'spotify' })
    expect(playlistFromLink('http://music.youtube.com/playlist?list=PL1', 'x')).toBeNull()
    expect(playlistFromLink('https://example.com/playlist?list=PL1', 'x')).toBeNull()
    expect(playlistFromLink('not a link', 'x')).toBeNull()
  })

  it('says what stops a coffee or a theme being saved', () => {
    expect(coffeeProblem({ name: '  ' })).toBe('Give the coffee a name')
    expect(coffeeProblem({ name: 'Colombia Huila', country: 'Colombia' })).toBe('Pick the country from the list')
    expect(coffeeProblem({ name: 'Brazil', bag_grams: 0 })).toBe('The bag size is in grams, like 1000')
    expect(coffeeProblem({ name: 'Brazil', bag_price: -1 })).toBe('The price can’t be below zero')
    expect(coffeeProblem({ name: 'Brazil', photo: 'https://example.com/bag.jpg' })).toBe('That photo can’t be used. Try another.')
    expect(coffeeProblem({ name: 'Brazil dark roast', country: 'BR', bag_grams: 1000, bag_price: 24, photo: 'data:image/jpeg;base64,/9j/' })).toBeNull()
    expect(themeProblem({ name: '' })).toBe('Give the theme a name')
    expect(themeProblem({ name: 'Irish day', colour: 'green' })).toBe('Pick a colour')
    expect(themeProblem({ name: 'Irish day', emoji: '🇮🇪🇮🇪🇮🇪🇮🇪🇮🇪🇮🇪🇮🇪🇮🇪🇮🇪' })).toBe('One flag or emoji is enough')
    expect(themeProblem({ name: 'Irish day', playlist: { id: 'x', name: 'Pub', url: 'javascript:alert(1)' } })).toBe('That playlist link can’t be used')
    expect(themeProblem({ name: 'Irish day', emoji: '🇮🇪', colour: '#169B62' })).toBeNull()
  })

  it('works out the price of a kilo, and puts the coffees in use first', () => {
    expect(pricePerKg({ bag_grams: 250, bag_price: 9.5 })).toBe(38)
    expect(pricePerKg({ bag_grams: 1000, bag_price: null })).toBeNull()
    const list = sortCoffees([{ name: 'B', sort: 0, active: false }, { name: 'C', sort: 2, active: true }, { name: 'A', sort: 1, active: true }])
    expect(list.map(c => c.name)).toEqual(['A', 'C', 'B'])
  })

  it('writes on a theme’s colour in the colour that reads', () => {
    expect(inkOn('#FCD116')).toBe('#2B2522') // Colombian yellow: dark text
    expect(inkOn('#169B62')).toBe('#2B2522') // Irish green: dark reads better than white
    expect(inkOn('#0B6B3A')).toBe('#FFFFFF') // a deeper green: white
    expect(inkOn('#6B4226')).toBe('#FFFFFF') // roast brown: white
  })
})
