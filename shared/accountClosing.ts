// Closing an account (Billing, owners only; the close_account migration): it closes CLOSING_DAYS after an
// owner asks, and until then an owner can keep it. Then The Business Agent deletes its data, except the
// working-hours records (registro de jornada) Spanish law keeps for four years.

/** Days from an owner asking to close the account to it closing (the close_account migration says the same). */
export const CLOSING_DAYS = 30

/** When an account asked to close on `requestedAt` closes. */
export const closesAt = (requestedAt: string) => new Date(Date.parse(requestedAt) + CLOSING_DAYS * 86_400_000).toISOString()

/** Whether it can still be kept (it hasn't closed yet). */
export const canStillKeep = (requestedAt: string, now = Date.now()) => Date.parse(closesAt(requestedAt)) > now

/** Whole days left before it closes (0 on its last day). */
export const daysUntilClosing = (requestedAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(closesAt(requestedAt)) - now) / 86_400_000))
