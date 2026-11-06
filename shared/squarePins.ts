// Square PINs (Leaderboard): each person's Square Point of Sale passcode, the one they sign in to the till
// with. Square's API can neither read nor set passcodes (they're set in the Square Dashboard → Team), so an
// owner types each one here as it is in Square. Kept encrypted by the Worker (worker/squarePins.ts, the
// `square_pins` migration). Owners (admins with pay access) see and change everyone's; everyone else on the
// team sees only their own (Leaderboard → Show PINs). A PIN changed in Square has to be changed here too.
import { msg } from './i18n'

export interface PinPerson {
  profile_id: string
  /** A PIN is saved for them. */
  set: boolean
  updated_at: string | null
}

export interface SquarePins {
  /** The caller is an owner: everyone is listed, and they can change any PIN. */
  owner: boolean
  /** Owners: the whole team (owners, shop managers, employees); anyone else: themselves. */
  people: PinPerson[]
}

/** A PIN as typed ("12 34 ") → "1234". */
export const cleanPin = (typed: string) => typed.replace(/\s+/g, '')

/** What's wrong with a PIN (null: nothing). Square's personal passcodes are 4 digits; up to 6 are taken. */
export function pinProblem(pin: string): string | null {
  const p = cleanPin(pin)
  if (!/^\d+$/.test(p)) return msg('A Square PIN is digits only')
  if (p.length < 4 || p.length > 6) return msg('A Square PIN is 4 digits (up to 6)')
  return null
}
