// The demo's Leaderboard and Square logins. Clock-ins come from the demo's own timecards and rota (as
// public.team_leaderboard() works them out); sales from the demo till, split day by day between whoever
// usually works the till then (Julio and Maria on weekdays, Aron in the mornings, Maria and Mark on
// Saturdays; Sofía, in Square but not here, on Sundays). In Square: Aron, Julio and Maria are linked
// already, Mark is there with his email (Match finds him), Sofía is nobody here, the cleaner isn't in Square.
// Mirrors the Worker: amounts for owners only, the team sees the board, admins link Square logins.
// The Tips page's tips on Square come from the same till: each day's tips split the same way.
import type { Api } from './api'
import type { Profile, SalesDay, Shift, TimeEntry } from '../../shared/types'
import type { ChecklistTick } from '../../shared/checklists'
import { clockStats, emptyTill, type TillBoard } from '../../shared/leaderboard'
import { emptyTillTips, tipsByPerson, type MemberTips } from '../../shared/tips'
import { addProblem, suggestLinks, type SquareLink, type SquareMember } from '../../shared/squareTeam'
import { addDays, dayKey } from '../../shared/time'

interface Who {
  isStaff: () => boolean
  isAdmin: () => boolean
  canSeePay: () => boolean
  team: () => Profile[]
  entries: () => TimeEntry[]
  shifts: () => Shift[]
  ticks: (day: string) => Promise<ChecklistTick[]>
  squareOn: () => boolean
  takingsOnPlan: () => boolean
  /** The demo till's takings, day by day. */
  sales: (from: string, to: string) => SalesDay[]
  today: () => string
  nowIso: () => string
  /** Who's signed in. */
  me: () => string | null
}

type LeaderboardApi = Pick<Api, 'leaderboard' | 'leaderboardTill' | 'squareTeam' | 'linkSquareMember' | 'matchSquareMembers' | 'addToSquare' | 'tillTips'>

const round2 = (n: number) => Math.round(n * 100) / 100

/** `P`: the demo's people by first name. */
export function demoLeaderboardApi(w: Who, P: { aron: string; mark: string; julio: string; maria: string }): LeaderboardApi {
  const members: SquareMember[] = [
    { id: 'TM_aron', name: "Aron O'Neill", email: 'aron@example.com', phone: null, is_owner: true, active: true },
    { id: 'TM_mark', name: 'Mark Murray', email: 'mark@example.com', phone: null, is_owner: false, active: true },
    { id: 'TM_julio', name: 'Julio', email: 'julio@example.com', phone: '+34600111222', is_owner: false, active: true },
    { id: 'TM_maria', name: 'María', email: null, phone: '+34600333444', is_owner: false, active: true },
    { id: 'TM_sofia', name: 'Sofía Romero', email: 'sofia@example.com', phone: null, is_owner: false, active: true },
  ]
  const links: SquareLink[] = [
    { profile_id: P.aron, team_member_id: 'TM_aron', created_in_square: false },
    { profile_id: P.julio, team_member_id: 'TM_julio', created_in_square: false },
    { profile_id: P.maria, team_member_id: 'TM_maria', created_in_square: false },
  ]
  // Who takes the till's payments on each day of the week, and their share of them.
  const TILL: Record<string, [string, number][]> = {
    mon: [['TM_julio', 0.5], ['TM_maria', 0.35], ['TM_aron', 0.15]],
    tue: [['TM_julio', 0.45], ['TM_maria', 0.4], ['TM_aron', 0.15]],
    wed: [['TM_julio', 0.4], ['TM_maria', 0.45], ['TM_aron', 0.15]],
    thu: [['TM_julio', 0.5], ['TM_maria', 0.35], ['TM_aron', 0.15]],
    fri: [['TM_julio', 0.45], ['TM_maria', 0.35], ['TM_aron', 0.2]],
    sat: [['TM_maria', 0.6], ['TM_mark', 0.4]],
    sun: [['TM_sofia', 1]],
  }
  const staff = () => { if (!w.isStaff()) throw new Error('Only the team sees the leaderboard') }
  const admin = () => { if (!w.isAdmin()) throw new Error('Only an admin can link Square logins') }
  const square = () => { if (!w.squareOn()) throw new Error('Connect Square on the Connections page first') }
  const onTeam = (id: string) => w.team().find(p => p.id === id && (p.role === 'admin' || p.role === 'employee'))
  const link = (profileId: string, memberId: string, created = false) => {
    for (let i = links.length - 1; i >= 0; i--) if (links[i].profile_id === profileId || links[i].team_member_id === memberId) links.splice(i, 1)
    links.push({ profile_id: profileId, team_member_id: memberId, created_in_square: created })
  }

  return {
    async leaderboard(from, to) {
      staff()
      const ticks: ChecklistTick[] = []
      for (let d = from; d <= to && d <= w.today(); d = addDays(d, 1)) ticks.push(...await w.ticks(d))
      const people = new Set(w.team().filter(p => p.active && (p.role === 'admin' || p.role === 'employee')).map(p => p.id))
      return clockStats(w.entries(), w.shifts(), ticks, from, to).filter(s => people.has(s.profile_id))
    },
    async leaderboardTill(from, to) {
      staff()
      if (!w.takingsOnPlan()) return emptyTill('plan')
      if (!w.squareOn()) return emptyTill('not_connected')
      if (!links.length) return emptyTill('no_links')
      const by = new Map<string, { sales: number; gross: number }>()
      for (const d of w.sales(from, to)) {
        for (const [member, share] of TILL[dayKey(d.date)]) {
          const row = by.get(member) ?? { sales: 0, gross: 0 }
          row.sales += Math.round(d.payments * share)
          row.gross += (d.gross - d.refunds) * share
          by.set(member, row)
        }
      }
      const pay = w.canSeePay()
      const board: TillBoard = { ...emptyTill('ok'), fetched_at: w.nowIso() }
      for (const [member, v] of by) {
        const person = links.find(l => l.team_member_id === member)?.profile_id
        if (person) board.people.push({ profile_id: person, sales: v.sales, gross: pay ? round2(v.gross) : null })
        else {
          board.unlinked.sales += v.sales
          board.unlinked.gross = pay ? round2((board.unlinked.gross ?? 0) + v.gross) : null
        }
      }
      return board
    },
    async tillTips(from, to) {
      staff()
      if (!w.takingsOnPlan()) return emptyTillTips('plan')
      if (!w.squareOn()) return emptyTillTips('not_connected')
      const me = w.me() ?? '', everyone = w.canSeePay()
      if (!everyone && !links.some(l => l.profile_id === me)) return emptyTillTips('not_linked')
      const byMember: Record<string, MemberTips> = {}
      for (const d of w.sales(from, to)) {
        for (const [member, share] of TILL[dayKey(d.date)]) {
          const tips = round2(d.tips * share)
          if (tips <= 0) continue
          // About one payment in six leaves a tip.
          const tipped = Math.max(1, Math.round((d.payments * share) / 6))
          const m = byMember[member] ??= { tips: 0, tipped: 0, days: {} }
          m.days[d.date] = { tips, tipped }
          m.tips = round2(m.tips + tips)
          m.tipped += tipped
        }
      }
      return { ...emptyTillTips('ok'), ...tipsByPerson(byMember, links, { me, everyone }), fetched_at: w.nowIso() }
    },
    async squareTeam() {
      admin()
      if (!w.squareOn()) return { status: 'not_connected', members: [], links: [] }
      return { status: 'ok', members: structuredClone(members), links: structuredClone(links) }
    },
    async linkSquareMember(profileId, memberId) {
      admin()
      if (!onTeam(profileId)) throw new Error('That person isn’t on the team')
      if (!memberId) {
        const i = links.findIndex(l => l.profile_id === profileId)
        if (i >= 0) links.splice(i, 1)
        return
      }
      square()
      if (!members.some(m => m.id === memberId)) throw new Error('Square doesn’t have that team member any more. Choose another.')
      link(profileId, memberId)
    },
    async matchSquareMembers() {
      admin()
      square()
      const found = suggestLinks(w.team().filter(p => p.active && (p.role === 'admin' || p.role === 'employee')), members, links)
      for (const f of found) link(f.profile_id, f.team_member_id)
      return found.length
    },
    async addToSquare(profileId) {
      admin()
      square()
      const person = onTeam(profileId)
      if (!person) throw new Error('That person isn’t on the team')
      const problem = addProblem(person, links.some(l => l.profile_id === profileId))
      if (problem) throw new Error(problem)
      const same = suggestLinks([person], members.filter(m => !!m.email), links).find(f => f.by === 'email')
      if (same) {
        link(profileId, same.team_member_id)
        return { team_member_id: same.team_member_id, existing: true }
      }
      const id = `TM_${profileId.replace(/[^A-Za-z0-9]/g, '')}`
      members.push({ id, name: person.full_name, email: person.email, phone: person.phone, is_owner: false, active: true })
      link(profileId, id, true)
      return { team_member_id: id, existing: false }
    },
  }
}
