// The demo's Square PINs (Leaderboard): Aron, Julio and Maria have theirs saved; Mark and the cleaner don't
// yet. Mirrors worker/squarePins.ts: owners (admins with pay access) see and change everyone's; anyone else
// on the team sees only their own.
import type { Api } from './api'
import type { Profile } from '../../shared/types'
import { cleanPin, pinProblem, type SquarePins } from '../../shared/squarePins'

interface Who {
  isStaff: () => boolean
  isOwner: () => boolean
  me: () => string | null
  team: () => Profile[]
  nowIso: () => string
}

type SquarePinsApi = Pick<Api, 'squarePins' | 'showSquarePin' | 'saveSquarePin'>

/** `P`: the demo's people by first name. */
export function demoSquarePinsApi(w: Who, P: { aron: string; julio: string; maria: string }): SquarePinsApi {
  const saved = new Map<string, { pin: string; updated_at: string }>([
    [P.aron, { pin: '0417', updated_at: '2026-09-02T10:00:00.000Z' }],
    [P.julio, { pin: '5286', updated_at: '2026-09-02T10:00:00.000Z' }],
    [P.maria, { pin: '7390', updated_at: '2026-09-14T16:30:00.000Z' }],
  ])
  const team = () => w.team().filter(p => p.active && (p.role === 'admin' || p.role === 'employee')).map(p => p.id)
  const needTeam = () => { if (!w.isStaff()) throw new Error('Only the team has Square PINs') }

  return {
    async squarePins(): Promise<SquarePins> {
      needTeam()
      const owner = w.isOwner()
      const listed = owner ? team() : team().filter(id => id === w.me())
      return { owner, people: listed.map(id => ({ profile_id: id, set: saved.has(id), updated_at: saved.get(id)?.updated_at ?? null })) }
    },
    async showSquarePin(profileId) {
      needTeam()
      if (!w.isOwner() && profileId !== w.me()) throw new Error('You can see only your own Square PIN')
      const s = saved.get(profileId)
      if (!s) throw new Error('No Square PIN is saved for them yet')
      return s.pin
    },
    async saveSquarePin(profileId, pin) {
      if (!w.isOwner()) throw new Error('Only an owner changes Square PINs')
      if (!team().includes(profileId)) throw new Error('That person isn’t on the team')
      if (pin === null || !cleanPin(pin)) { saved.delete(profileId); return }
      const problem = pinProblem(pin)
      if (problem) throw new Error(problem)
      saved.set(profileId, { pin: cleanPin(pin), updated_at: w.nowIso() })
    },
  }
}
