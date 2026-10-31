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
  /** Music on stories and reels (Social planner), AI tracks paid per use, the brand's sound and the assistant's music tools. Waits for the ElevenLabs key and the render service (docs/SOCIAL_MUSIC_PLAN.md). */
  music: false,
  /** The demo video on the landing page (video/). It shows the menu reaching Google Maps: on once that's live. */
  demoVideo: false,
}

/** Whether something marked as part of one of these (`onlyWith`, e.g. a row of the pricing table) shows: unless that part is switched off. */
export const shows = (x: { onlyWith?: keyof typeof FEATURES }) => !x.onlyWith || FEATURES[x.onlyWith]
