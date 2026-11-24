// The week's rota written out as one message for the team's WhatsApp group (Rota → "Share to a WhatsApp group"):
// WhatsApp's own share link opens with it, and whoever's sharing picks the group. "Send on WhatsApp" is the other
// way: each person their own shifts, from the business's WhatsApp number (the `send_rota` function); WhatsApp's
// business messages can't go to a group, so the group gets it this way, from the person's own WhatsApp.
//
// The words come in already in the person's language: the heading, each day's label, the name of each person on, an
// open shift's word, the day with nobody on, and the line with the link back to the rota in the app.

export interface RotaDay {
  /** "Mon 7". */
  label: string
  shifts: { who: string; from: string; to: string }[]
}

export interface RotaMessageWords {
  /** "Easy Beans Coffee: the rota for 7–13 Dec". */
  heading: string
  /** "Nobody on". */
  nobody: string
  /** "See it any time, and any change, in the app: https://…/rota". */
  footer: string
}

/** The message: the heading in bold, a line a day (who's on and when, earliest first), and the link to the app. */
export function rotaMessage(days: RotaDay[], words: RotaMessageWords): string {
  const lines = days.map(d => {
    const on = [...d.shifts].sort((a, b) => a.from.localeCompare(b.from) || a.who.localeCompare(b.who))
    return `*${d.label}*: ${on.length ? on.map(s => `${s.who} ${s.from}–${s.to}`).join(', ') : words.nobody}`
  })
  return [`*${words.heading}*`, '', ...lines, '', words.footer].join('\n')
}

/** WhatsApp's share link with the message: on a phone it opens WhatsApp to pick the chat, on a computer WhatsApp Web. */
export const whatsappShareLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
