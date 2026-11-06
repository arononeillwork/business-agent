// The businesses kept signed in on this device, for switching between them (top left in the app, and the
// account menu). An account is in one business (profiles.business_id), so someone in two has an account
// in each: the browser keeps each one's sign-in, and switching hands Supabase the other's
// (docs/SEVERAL_BUSINESSES.md). The business open now is Supabase's own sign-in; this list, in
// localStorage beside it, keeps the others and what the switcher shows of each.

/** A business kept on this device, as the switcher shows it. */
export interface DeviceAccount {
  userId: string
  /** The person's name and email in that business. */
  name: string
  email: string | null
  /** Null: signed up, not in a business yet. */
  businessId: number | null
  business: string | null
  /** Its logo, when it's small enough to keep here; the initials stand in otherwise. */
  logo: string | null
  /** Its sign-in has ended (signed out elsewhere, the password changed…): sign in to it again. */
  signedOut: boolean
}

/** A kept sign-in: what Supabase's setSession() takes. */
export interface KeptSession { access_token: string; refresh_token: string }

/** An account on this device: what's shown, and its sign-in while another business is open. */
export interface KeptAccount extends Omit<DeviceAccount, 'signedOut'> { session: KeptSession | null }

export const KEY = 'business-agent.accounts'
/** A logo bigger than this (an uploaded image kept as a data: URL) isn't copied here. */
export const MAX_LOGO = 40_000
/** At most this many businesses on one device: the oldest goes first. */
export const MAX_ACCOUNTS = 10

const text = (v: unknown) => (typeof v === 'string' ? v : null)

/** The kept list from storage; anything unreadable is left out. */
export function parseKept(raw: string | null): KeptAccount[] {
  let data: unknown
  try { data = JSON.parse(raw ?? '') } catch { return [] }
  const list = (data as { v?: number; accounts?: unknown })?.v === 1 ? (data as { accounts?: unknown }).accounts : null
  if (!Array.isArray(list)) return []
  return list.flatMap((a: Record<string, unknown>): KeptAccount[] => {
    const userId = text(a?.userId)
    if (!userId) return []
    const s = a.session as Record<string, unknown> | null
    const session = text(s?.access_token) && text(s?.refresh_token) ? { access_token: s!.access_token as string, refresh_token: s!.refresh_token as string } : null
    return [{ userId, name: text(a.name) ?? '', email: text(a.email), businessId: typeof a.businessId === 'number' ? a.businessId : null,
      business: text(a.business), logo: text(a.logo), session }]
  })
}

export const serializeKept = (accounts: KeptAccount[]) => JSON.stringify({ v: 1, accounts })

/** Keep an account, or bring its details and sign-in up to date where it already is (the list keeps its order). */
export function keep(list: KeptAccount[], account: KeptAccount): KeptAccount[] {
  const at = list.findIndex(a => a.userId === account.userId)
  if (at >= 0) return list.map((a, i) => (i === at ? account : a))
  return [...list, account].slice(-MAX_ACCOUNTS)
}

export const forget = (list: KeptAccount[], userId: string) => list.filter(a => a.userId !== userId)

/** The account is open now: its sign-in is Supabase's from here, so the kept copy goes. */
export const opened = (list: KeptAccount[], userId: string) => list.map(a => (a.userId === userId ? { ...a, session: null } : a))

/** What the switcher shows: every account kept here but the one open now, without their sign-ins. */
export const shownAccounts = (list: KeptAccount[], currentId?: string | null): DeviceAccount[] =>
  list.filter(a => a.userId !== currentId).map(({ session, ...a }) => ({ ...a, signedOut: !session }))

/** A logo worth copying here: a link, or a small image. */
export const smallLogo = (logo: string | null | undefined) =>
  logo && (/^https?:\/\//.test(logo) || logo.length <= MAX_LOGO) ? logo : null

/** The kept list (empty when storage can't be read: private browsing, an embed). */
export function readKept(): KeptAccount[] {
  try { return parseKept(localStorage.getItem(KEY)) } catch { return [] }
}

export function writeKept(list: KeptAccount[]) {
  try {
    if (list.length) localStorage.setItem(KEY, serializeKept(list))
    else localStorage.removeItem(KEY)
  } catch { /* storage unavailable: the switcher just has nothing to show */ }
}
