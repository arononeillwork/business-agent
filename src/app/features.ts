// Parts of the app that are built but switched off for now. Turning one back on is a one-line change.
export const FEATURES = {
  /** Outside businesses (gestoría, accountant) with their own read-only login, managed on the Partners page. */
  partners: false,
  /** The café tablet: a shared clock-in screen where staff tap their name and enter a PIN. */
  kiosk: false,
  /** Square as a payment system (next to Stripe): takings on Finances, next to the team's cost. */
  square: true,
  /** Tips (Team): shares of the tips by hours worked. Waits for its database change, held in supabase/pending until then (see the README there). */
  tips: false,
  /** Quotes & estimates (Sales): priced offers made from an enquiry. Taken out of the app; its tables stay in the database. */
  quotes: false,
}
