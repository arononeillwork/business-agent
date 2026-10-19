// The words of each alert, for email. (WhatsApp uses the approved Meta templates with the same
// names and parameters; see docs/INTEGRATIONS.md.)
export function alertEmail(template: string, params: string[], business: string): { subject: string; text: string } {
  const [a = '', b = '', c = ''] = params
  switch (template) {
    case 'shift_reminder':
      return { subject: `Your shift starts at ${b}`, text: `Hi ${a},\n\nyour shift starts at ${b} (${c}). See you soon!` }
    case 'missed_clock_in':
      return { subject: 'You haven’t clocked in', text: `Hi ${a},\n\nyour shift started at ${b} and you haven’t clocked in yet. Is everything OK?` }
    case 'missed_clock_in_admin':
      return { subject: `${a} hasn’t clocked in`, text: `${a} hasn’t clocked in for the ${b} shift.` }
    case 'rota_published':
      return { subject: `Your shifts for the week of ${b}`, text: `Hi ${a},\n\nyour shifts for the week of ${b}:\n${c}` }
    case 'time_off_requested':
      return { subject: `${a} asked for time off`, text: `${a} asked for time off: ${b} (${c}).\nReview it in the app.` }
    case 'time_off_decided':
      return { subject: `Your time off was ${c}`, text: `Hi ${a},\n\nyour request for ${b} was ${c}.` }
    default:
      return { subject: `${business}: update`, text: params.join('\n') }
  }
}

/** A plain-text email as an RFC 5322 message (UTF-8, base64 body), for Gmail's send API. */
export function mimeMessage(m: { from?: string; to: string; subject: string; text: string }): string {
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  const lines = [
    ...(m.from ? [`From: ${m.from}`] : []),
    `To: ${m.to}`,
    `Subject: =?UTF-8?B?${b64(m.subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(m.text).replace(/.{1,76}/g, '$&\r\n').trimEnd(),
  ]
  return lines.join('\r\n')
}

/** base64url, as Gmail wants the raw message. */
export const base64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
