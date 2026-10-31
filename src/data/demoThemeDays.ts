// The demo's theme days and weekly routine (Calendar, Coffees page, Today): Easy Beans' coffees, three
// themes in the owner's order (Irish, then Colombian, then Brazilian roast, from Monday; nothing on
// Sunday), St Patrick's Day set apart, and a café's usual week. Mirrors the `theme_days` and
// `weekly_routine` migrations' rules: the team reads, admins change, anyone on the team ticks done.
import type { Api } from './api'
import type { CafeTrack } from '../../shared/types'
import { coffeeProblem, sortCoffees, sortThemes, themeProblem, type Coffee, type DayTheme, type ThemeDays, type ThemePlaylist, type Weekday } from '../../shared/themeDays'
import { routineProblem, type RoutineDone, type RoutineItem } from '../../shared/routine'

const playlist = (id: string, name: string, tracks: number): ThemePlaylist =>
  ({ id, name, tracks, url: `https://music.youtube.com/playlist?list=${id}`, provider: 'youtube' })
export const DEMO_THEME_PLAYLISTS = {
  irish: playlist('PLeb-irish', 'Irish pub session', 24),
  colombian: playlist('PLeb-colombia', 'Colombia: cumbia y café', 32),
  brazilian: playlist('PLeb-bossa', 'Bossa nova café', 40),
}
/** Their sample songs, for the café speaker (the demo plays them with a pretend player). */
export const DEMO_THEME_TRACKS: Record<string, CafeTrack[]> = Object.fromEntries(Object.entries({
  'PLeb-irish': [['The Parting Glass', 'The High Kings'], ['Galway Girl', 'Steve Earle'], ['Whiskey in the Jar', 'The Dubliners']],
  'PLeb-colombia': [['La Pollera Colorá', 'Wilson Choperena'], ['Colombia Tierra Querida', 'Lucho Bermúdez'], ['Cumbia Sampuesana', 'Los Corraleros de Majagual']],
  'PLeb-bossa': [['The Girl from Ipanema', 'Stan Getz & João Gilberto'], ['Águas de Março', 'Elis Regina & Tom Jobim'], ['Mas Que Nada', 'Jorge Ben']],
}).map(([id, songs]) => [id, songs.map(([title, artist], i) => ({ id: `demo-${id}-${i + 1}`, title, artist }))]))

interface Who {
  isStaff: () => boolean
  isAdmin: () => boolean
  me: () => string | null
  /** A demo role's id by its name (Shop Manager, Cleaner…), or null. */
  roleId: (name: string) => string | null
  /** Someone on the team by id, for "who does it". */
  onTeam: (id: string) => boolean
  uid: () => string
  nowIso: () => string
}

type ThemeDayApi = Pick<Api, 'coffees' | 'saveCoffee' | 'deleteCoffee' | 'themeDays' | 'saveDayTheme' | 'deleteDayTheme' | 'setThemeRotation' | 'setThemeDate'
  | 'routineItems' | 'saveRoutineItem' | 'deleteRoutineItem' | 'routineDone' | 'setRoutineDone'>

const clone = <T,>(x: T): T => structuredClone(x)
const tidy = (s: string | null | undefined) => (s ?? '').trim() || null

export function demoThemeDayApi(w: Who, cleaner: string): ThemeDayApi {
  const at = w.nowIso()
  const coffee = (id: string, p: Partial<Coffee> & Pick<Coffee, 'name'>): Coffee => ({ id, country: null, region: null, roaster: null, roast: null, process: null,
    tasting_notes: null, brew: 'both', bag_grams: null, bag_price: null, active: true, photo: null, sort: 0, created_at: at, ...p })
  const coffees: Coffee[] = [
    coffee('coffee-br-dark', { name: 'Brazilian dark roast', country: 'BR', region: 'Cerrado Mineiro', roaster: 'Easy Beans', roast: 'dark', process: 'natural',
      tasting_notes: 'Dark chocolate, roasted nuts, molasses', brew: 'espresso', bag_grams: 1000, bag_price: 24, sort: 1 }),
    coffee('coffee-br-light', { name: 'Brazilian light roast', country: 'BR', region: 'Cerrado Mineiro', roaster: 'Easy Beans', roast: 'light', process: 'natural',
      tasting_notes: 'Milk chocolate, hazelnut, red apple', brew: 'both', bag_grams: 1000, bag_price: 25, sort: 2 }),
    coffee('coffee-colombia', { name: 'Colombian (guest)', country: 'CO', region: 'Huila', roast: 'medium', process: 'washed',
      tasting_notes: 'Caramel, red fruit, panela', bag_grams: 250, bag_price: 11.5, sort: 3 }),
    coffee('coffee-irish', { name: 'Irish blend (guest)', country: 'IE', roast: 'medium', tasting_notes: 'Toffee, cocoa, a little spice', bag_grams: 250, bag_price: 10.9, sort: 4 }),
    coffee('coffee-ethiopia', { name: 'Ethiopia Yirgacheffe', country: 'ET', region: 'Gedeo', roast: 'light', process: 'washed', tasting_notes: 'Jasmine, lemon, bergamot',
      brew: 'filter', active: false, sort: 5 }),
  ]
  const theme = (id: string, p: Omit<DayTheme, 'id' | 'notes'> & { notes?: string | null }): DayTheme => ({ id, notes: null, ...p })
  const themes: DayTheme[] = [
    theme('theme-irish', { name: 'Irish day', emoji: '🇮🇪', colour: '#169B62', description: 'The Irish guest blend, with Irish music to match.',
      coffee_id: 'coffee-irish', playlist: DEMO_THEME_PLAYLISTS.irish, notes: 'Irish soda bread and Baileys cream on the specials board.', sort: 1 }),
    theme('theme-colombian', { name: 'Colombian day', emoji: '🇨🇴', colour: '#FCD116', description: 'The Colombian guest coffee, with a Colombian playlist.',
      coffee_id: 'coffee-colombia', playlist: DEMO_THEME_PLAYLISTS.colombian, notes: 'Arepas with cheese at lunch.', sort: 2 }),
    theme('theme-brazilian', { name: 'Brazilian roast day', emoji: '🇧🇷', colour: '#6B4226',
      description: 'Our own Brazilian bean: the dark roast for milk drinks, the light one black.', coffee_id: 'coffee-br-dark', playlist: DEMO_THEME_PLAYLISTS.brazilian,
      notes: 'Pão de queijo with every flat white.', sort: 3 }),
  ]
  const rotation: ThemeDays['rotation'] = { 1: 'theme-irish', 2: 'theme-colombian', 3: 'theme-brazilian', 4: 'theme-irish', 5: 'theme-colombian', 6: 'theme-brazilian' }
  const dates: ThemeDays['dates'] = [{ day: '2027-03-17', theme_id: 'theme-irish', note: 'St Patrick’s Day' }]

  const item = (id: string, p: Partial<RoutineItem> & Pick<RoutineItem, 'name' | 'category' | 'weekdays'>): RoutineItem => ({ id, every_weeks: 1, month_week: null,
    starts_on: '2026-01-05', starts_at: null, ends_at: null, profile_id: null, job_role_id: null, checklist: [], notes: null, active: true, sort: 0, ...p })
  const routine: RoutineItem[] = [
    item('r-stock', { name: 'Stock take and buying list', category: 'stock', weekdays: [1], starts_at: '09:00', ends_at: '09:45', job_role_id: w.roleId('Shop Manager'),
      checklist: ['Count the coffee, milk, cups and lids', 'Check the fridges and the pastry order', 'Add what’s low to the order list on Stock'], sort: 1 }),
    item('r-wholesale', { name: 'Wholesale order and cash and carry run', category: 'suppliers', weekdays: [1], starts_at: '10:00', ends_at: '11:30',
      job_role_id: w.roleId('Shop Manager'), checklist: ['Check the order list against what’s in', 'Order from the wholesaler or do the GM Cash & Carry / Transgourmet run',
        'Put the delivery away and record it on Stock'], sort: 2 }),
    item('r-meeting', { name: 'Weekly business meeting', category: 'meetings', weekdays: [1], starts_at: '15:30', ends_at: '16:30',
      checklist: ['Last week’s takings and costs', 'What’s on this week', 'Anything from the team'], sort: 3 }),
    item('r-licences', { name: 'Licence and insurance check', category: 'accounts', weekdays: [1], month_week: 1, starts_at: '11:30', ends_at: '12:00',
      job_role_id: w.roleId('Business Manager'), checklist: ['Anything running out on Legal & licences', 'Insurance, extinguishers and the electrical check'],
      notes: 'First Monday of the month.', sort: 4 }),
    item('r-prices', { name: 'Supplier and wholesale price check', category: 'suppliers', weekdays: [2], starts_at: '10:00', ends_at: '10:30', job_role_id: w.roleId('Shop Manager'),
      checklist: ['Look at what went up on Wholesale', 'Compare the main items with another supplier'], sort: 5 }),
    item('r-clean', { name: 'Deep clean (cleaner)', category: 'cleaning', weekdays: [3], starts_at: '18:00', ends_at: '20:00', profile_id: cleaner,
      checklist: ['Floors, toilets and the terrace', 'Behind the counter and under the machines', 'Bins out'], notes: 'After close.', sort: 6 }),
    item('r-social', { name: 'Social content planning', category: 'marketing', weekdays: [3], starts_at: '11:00', ends_at: '12:00',
      checklist: ['Plan next week’s posts and stories on the Social planner', 'Photos of the theme days and specials'], sort: 7 }),
    item('r-beans', { name: 'Coffee order for the weekend', category: 'stock', weekdays: [4], starts_at: '10:00', ends_at: '10:30', job_role_id: w.roleId('Head Barista'),
      checklist: ['Beans for both roasts and the guest coffee', 'Order from the roaster in time for Saturday'], sort: 8 }),
    item('r-accounts', { name: 'Accounts talk with the gestoría', category: 'accounts', weekdays: [5], starts_at: '10:00', ends_at: '11:00',
      job_role_id: w.roleId('Business Manager'), checklist: ['Invoices in and paid', 'Till reconciliation for the week', 'Anything the gestoría needs'], sort: 9 }),
    item('r-weekend', { name: 'Weekend prep and next week’s rota', category: 'team', weekdays: [5], starts_at: '15:00', ends_at: '15:30', job_role_id: w.roleId('Shop Manager'),
      checklist: ['Next week’s rota checked and published', 'Weekend stock and the pastry order'], sort: 10 }),
    item('r-machine', { name: 'Coffee machine deep clean', category: 'maintenance', weekdays: [6], starts_at: '18:00', ends_at: '18:45', job_role_id: w.roleId('Head Barista'),
      checklist: ['Backflush the group heads', 'Clean the grinder burrs and hopper', 'Soak the portafilters and baskets'], notes: 'After close.', sort: 11 }),
    item('r-fridges', { name: 'Fridge temperature log review', category: 'maintenance', weekdays: [6], starts_at: '17:30', ends_at: '17:45', job_role_id: w.roleId('Shop Manager'),
      checklist: ['Every fridge and the freezer recorded this week on Food safety', 'Anything out of range dealt with'], sort: 12 }),
  ]
  const done: RoutineDone[] = []

  const read = () => w.isStaff()
  const requireAdmin = () => { if (!w.isAdmin()) throw new Error('Only an admin can do that') }
  const themeOf = (id: string | null) => {
    if (id && !themes.some(t => t.id === id)) throw new Error('That theme isn’t one of yours')
  }

  return {
    async coffees() { return read() ? clone(sortCoffees(coffees)) : [] },
    async saveCoffee({ id, ...c }) {
      requireAdmin()
      const was = id ? coffees.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That coffee isn’t here any more')
      const base = was ?? coffee(w.uid(), { name: '', sort: Math.max(0, ...coffees.map(x => x.sort)) + 1 })
      // Only what's sent changes (a new photo keeps the rest).
      const next: Coffee = { ...base, ...c, name: (c.name ?? base.name).trim(),
        region: 'region' in c ? tidy(c.region) : base.region, roaster: 'roaster' in c ? tidy(c.roaster) : base.roaster,
        tasting_notes: 'tasting_notes' in c ? tidy(c.tasting_notes) : base.tasting_notes }
      const problem = coffeeProblem(next)
      if (problem) throw new Error(problem)
      if (coffees.some(x => x.id !== next.id && x.name.toLowerCase() === next.name.toLowerCase())) {
        throw new Error('duplicate key value violates unique constraint "coffees_name_key"')
      }
      if (was) Object.assign(was, next)
      else coffees.push(next)
      return next.id
    },
    async deleteCoffee(id) {
      requireAdmin()
      const i = coffees.findIndex(x => x.id === id)
      if (i >= 0) coffees.splice(i, 1)
      for (const t of themes) if (t.coffee_id === id) t.coffee_id = null
    },
    async themeDays() {
      return read() ? clone({ themes: sortThemes(themes), rotation, dates: [...dates].sort((a, b) => a.day.localeCompare(b.day)) }) : { themes: [], rotation: {}, dates: [] }
    },
    async saveDayTheme({ id, ...t }) {
      requireAdmin()
      const was = id ? themes.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That theme isn’t here any more')
      const base = was ?? theme(w.uid(), { name: '', emoji: null, colour: '#F79BA4', description: null, coffee_id: null, playlist: null,
        sort: Math.max(0, ...themes.map(x => x.sort)) + 1 })
      const next: DayTheme = { ...base, ...t, name: (t.name ?? base.name).trim(), emoji: 'emoji' in t ? tidy(t.emoji) : base.emoji,
        description: 'description' in t ? tidy(t.description) : base.description, notes: 'notes' in t ? tidy(t.notes) : base.notes }
      const problem = themeProblem(next)
      if (problem) throw new Error(problem)
      if (next.coffee_id && !coffees.some(c => c.id === next.coffee_id)) throw new Error('That coffee isn’t on the Coffees page')
      if (themes.some(x => x.id !== next.id && x.name.toLowerCase() === next.name.toLowerCase())) {
        throw new Error('duplicate key value violates unique constraint "day_themes_name_key"')
      }
      if (was) Object.assign(was, next)
      else themes.push(next)
      return next.id
    },
    async deleteDayTheme(id) {
      requireAdmin()
      const i = themes.findIndex(x => x.id === id)
      if (i >= 0) themes.splice(i, 1)
      for (const k of Object.keys(rotation)) if (rotation[Number(k) as Weekday] === id) delete rotation[Number(k) as Weekday]
      for (let j = dates.length - 1; j >= 0; j--) if (dates[j].theme_id === id) dates.splice(j, 1)
    },
    async setThemeRotation(weekday, themeId) {
      requireAdmin()
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error('new row violates check constraint "day_theme_schedule_weekday_check"')
      themeOf(themeId)
      if (themeId) rotation[weekday as Weekday] = themeId
      else delete rotation[weekday as Weekday]
    },
    async setThemeDate(day, themeId, note) {
      requireAdmin()
      const i = dates.findIndex(d => d.day === day)
      if (themeId === undefined) { if (i >= 0) dates.splice(i, 1); return }
      themeOf(themeId)
      const row = { day, theme_id: themeId, note: tidy(note) }
      if (i >= 0) dates[i] = row
      else dates.push(row)
    },

    async routineItems() { return read() ? clone(routine) : [] },
    async saveRoutineItem({ id, ...r }) {
      requireAdmin()
      const was = id ? routine.find(x => x.id === id) : undefined
      if (id && !was) throw new Error('That activity isn’t here any more')
      const base = was ?? item(w.uid(), { name: '', category: 'team', weekdays: [1], starts_on: w.nowIso().slice(0, 10),
        sort: Math.max(0, ...routine.map(x => x.sort)) + 1 })
      const next: RoutineItem = { ...base, ...r, name: (r.name ?? base.name).trim(), notes: 'notes' in r ? tidy(r.notes) : base.notes,
        weekdays: [...new Set(r.weekdays ?? base.weekdays)].sort((a, b) => a - b), checklist: (r.checklist ?? base.checklist).map(l => l.trim()).filter(Boolean) }
      const problem = routineProblem(next)
      if (problem) throw new Error(problem)
      if (next.profile_id && !w.onTeam(next.profile_id)) throw new Error('Pick someone on the team')
      if (was) Object.assign(was, next)
      else routine.push(next)
      return next.id
    },
    async deleteRoutineItem(id) {
      requireAdmin()
      const i = routine.findIndex(x => x.id === id)
      if (i >= 0) routine.splice(i, 1)
      for (let j = done.length - 1; j >= 0; j--) if (done[j].item_id === id) done.splice(j, 1)
    },
    async routineDone(from, to) { return read() ? clone(done.filter(d => d.day >= from && d.day <= to)) : [] },
    async setRoutineDone(itemId, day, on) {
      if (!read()) throw new Error('new row violates row-level security policy for table "routine_done"')
      if (!routine.some(r => r.id === itemId)) throw new Error('That activity isn’t on the routine')
      const i = done.findIndex(d => d.item_id === itemId && d.day === day)
      if (on) { if (i < 0) done.push({ item_id: itemId, day, done_by: w.me(), done_at: w.nowIso() }) }
      else if (i >= 0 && (done[i].done_by === w.me() || w.isAdmin())) done.splice(i, 1)
    },
  }
}
