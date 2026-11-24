// The demo café's repeating rota (Rota → Repeat week), as the `repeating_rota` migration, on the demo's own
// shifts: a week copied onto the weeks after it, or kept going as a continuous rota. Nothing repeats to
// start with. The demo has no nightly job, so a continuous rota is filled on whenever it's looked at.
import type { Api } from './api'
import {
  addable, asWeekShift, filledAhead, isoWeekday, MAX_REPEAT_WEEKS, repeatUntil, shiftOn, type RotaRepeat, type WeekShift,
} from '../../shared/rotaRepeat'
import { addDays, localDate, today, weekStart } from '../../shared/time'
import type { Profile, Shift, TimeOff } from '../../shared/types'

interface Demo {
  shifts: Shift[]
  profiles: Profile[]
  timeOff: TimeOff[]
  /** Whoever edits the rota (admins, and roles with Update on the rota). */
  canEdit: () => boolean
  uid: () => string
  nowIso: () => string
}

type RotaRepeatApi = Pick<Api, 'rotaRepeat' | 'repeatRotaWeek' | 'stopRepeatingRota'>

export function demoRotaRepeatApi(d: Demo): RotaRepeatApi {
  let repeat: (RotaRepeat & { week: WeekShift[] }) | null = null
  const require = () => { if (!d.canEdit()) throw new Error('Only an admin can repeat the rota') }
  const onDays = (s: Shift, from: string, until: string) => { const day = localDate(s.starts_at); return day >= from && day <= until }

  // The week's shifts onto each day from `from` to `until`, as the database's _rota_add.
  const fill = (week: WeekShift[], from: string, until: string) => {
    let added = 0
    let away = 0
    for (let day = from; day <= until; day = addDays(day, 1)) {
      for (const w of week.filter(x => x.weekday === isoWeekday(day)).sort((a, b) => a.starts.localeCompare(b.starts))) {
        const s = shiftOn(w, day)
        const did = addable(s, day, {
          now: d.nowIso(), shifts: d.shifts,
          onRota: id => d.profiles.some(p => p.id === id && p.active && p.on_rota !== false),
          away: (id, on) => d.timeOff.some(t => t.profile_id === id && t.status === 'approved' && on >= t.starts_on && on <= t.ends_on),
        })
        if (did === 'added') { d.shifts.push({ ...s, id: d.uid(), status: 'published' }); added++ }
        if (did === 'away') away++
      }
    }
    return { added, away }
  }

  // The nightly job's part: on to the end of the fourth week after this one.
  const extend = () => {
    if (!repeat) return
    const until = filledAhead(today())
    if (repeat.filled_until >= until) return
    const from = addDays(repeat.filled_until, 1)
    fill(repeat.week, from > today() ? from : today(), until)
    repeat.filled_until = until
  }

  return {
    async rotaRepeat() {
      if (!d.canEdit() || !repeat) return null
      extend()
      return { source_week: repeat.source_week, filled_until: repeat.filled_until, updated_at: repeat.updated_at }
    },
    async repeatRotaWeek(day, weeks) {
      require()
      if (weeks !== null && !(Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_REPEAT_WEEKS)) {
        throw new Error(`Repeat it for 1 to ${MAX_REPEAT_WEEKS} weeks`)
      }
      const monday = weekStart(day)
      const from = addDays(monday, 7)
      const until = repeatUntil(monday, weeks, today())
      const week = d.shifts.filter(s => onDays(s, monday, addDays(monday, 6))).map(asWeekShift)
      if (!week.length) throw new Error('There are no shifts that week to repeat')
      if (weeks === null) repeat = { source_week: monday, filled_until: until, updated_at: d.nowIso(), week }
      else if (repeat && repeat.filled_until < until) repeat.filled_until = until
      // What's on those weeks and hasn't started makes way.
      const now = new Date(d.nowIso())
      const gone = d.shifts.filter(s => onDays(s, from, until) && new Date(s.starts_at) > now)
      for (const s of gone) d.shifts.splice(d.shifts.indexOf(s), 1)
      const { added, away } = fill(week, from, until)
      return { added, removed: gone.length, away, until }
    },
    async stopRepeatingRota() {
      require()
      repeat = null
    },
  }
}
