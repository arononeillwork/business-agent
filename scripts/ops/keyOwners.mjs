// The pure parts of the key owners check (scripts/ops/key-owners.mjs): whose an account is from the
// names its provider gives back, whether that suits a key of its kind, and the table for the run's
// summary. No network here, so the tests can run it.

/**
 * What a key is for, which decides whose it should be:
 * - platform: what every business connects or pays through (the Google, Meta, Microsoft, TikTok and
 *   Square apps, the Stripe account that takes subscriptions). Should be Business Agent's.
 * - business: one business's own account kept as a key (Easy Beans' WhatsApp number). Should be that
 *   business's connection instead, so other businesses can connect theirs.
 * - infra: where the app runs and what it pays for (Cloudflare, Supabase, GitHub, Anthropic). Works
 *   on a personal account; move it to Business Agent's when convenient.
 */
export const ROLES = ['platform', 'business', 'infra']

/** Whose a set of names says an account is: Easy Beans, Business Agent, a person, or someone else. */
export function ownerOf(...names) {
  const text = names.filter(Boolean).join(' ')
  if (!text.trim()) return 'unknown'
  if (/easy\s*beans/i.test(text)) return 'easy-beans'
  if (/business\s*s?agent/i.test(text)) return 'business-agent' // "The Business Agent", "BusinessAgent", businesssagent.com
  if (/\baron|o'?neill|default directory|@gmail\.|@hotmail\.|@outlook\./i.test(text)) return 'personal'
  return 'other'
}

export const OWNER_LABEL = {
  'easy-beans': 'Easy Beans',
  'business-agent': 'The Business Agent',
  personal: 'Personal',
  other: 'Someone else',
  unknown: 'Couldn’t tell',
}

/**
 * Whether a key is where it should be.
 * ready: it is; personal: works, on a personal account (fine for infra); move: it belongs to the
 * wrong account; connection: one business's own account kept as a key; check: the provider doesn't
 * say whose it is, look by hand; missing: not set; broken: the provider refused it.
 */
export function verdictOf({ role, set, owner, error }) {
  if (!set) return 'missing'
  if (error) return 'broken'
  if (role === 'business') return 'connection'
  if (owner === 'business-agent') return 'ready'
  if (owner === 'easy-beans') return 'move'
  if (owner === 'personal') return role === 'infra' ? 'personal' : 'move'
  return 'check'
}

export const VERDICT_LABEL = {
  ready: '✅ Ready',
  personal: '🟡 Works, personal account',
  move: '🔴 Move to The Business Agent',
  connection: '🔴 Make it that business’s connection',
  check: '⚪ Check by hand',
  missing: '⚪ Not set',
  broken: '🔴 Key refused',
}

/** "arononeillwork@gmail.com" → "aron…@gmail.com": enough to recognise, not the whole address. */
export function maskEmail(email) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(email ?? '').trim())
  if (!m) return ''
  return `${m[1].slice(0, 4)}${m[1].length > 4 ? '…' : ''}@${m[2]}`
}

/** "+1 555-667-1618" → "…1618", and whether it's one of Meta's free test numbers (+1 555). */
export function phoneOf(display) {
  const digits = String(display ?? '').replace(/\D/g, '')
  return { last4: digits ? `…${digits.slice(-4)}` : '', test: /^1555/.test(digits) }
}

/**
 * The app name and support email on Google's sign-in page for an OAuth client, best effort: Google
 * puts the consent screen's name in the page's data ("ds:5") and the support email on the "to
 * continue to" button. Null for whatever isn't found.
 */
export function googleConsent(html) {
  const name = /key:\s*'ds:5'[^;]*?data:\[null,null,null,\[\[null,"([^"]{1,120})"\]\]\]/.exec(html)?.[1] ?? null
  const email = /data-third-party-email="([^"]{3,120})"/.exec(html)?.[1] ?? null
  const shownAs = /data-app-name="([^"]{1,120})"/.exec(html)?.[1] ?? null
  return { name, email, shownAs }
}

/** The directory's name on Microsoft's sign-in page for an app ("Default Directory" for a personal one). */
export function microsoftDirectory(html) {
  return /"sCompanyDisplayName":"([^"]{1,120})"/.exec(html)?.[1] ?? null
}

/** Replaces every secret's value in a text, in case a provider ever echoes one back. */
export function scrub(text, secrets) {
  let out = String(text)
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('***')
  return out
}

const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** The run summary: a count, then a table of every account, worst first. */
export function summaryMarkdown(rows) {
  const order = ['broken', 'move', 'connection', 'check', 'personal', 'ready', 'missing']
  const sorted = [...rows].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict))
  const counted = rows.filter(r => r.verdict !== 'missing')
  const ready = counted.filter(r => r.verdict === 'ready' || r.verdict === 'personal').length
  const out = [
    '## Who owns each key',
    '',
    `**${ready} of ${counted.length}** accounts in use are where they should be for selling to other businesses.`,
    'Platform keys (the apps every business connects or pays through) should be The Business Agent’s; one business’s own account should be its connection, not a key; hosting and tools can stay on a personal account for now.',
    '',
    '| Account | Kind | Belongs to | What the provider says | Status | What to do |',
    '|---|---|---|---|---|---|',
    ...sorted.map(r => `| ${cell(r.account)}<br><sub>${cell(r.keys.join(', '))}</sub> | ${cell(r.role)} | ${cell(r.verdict === 'missing' ? '' : OWNER_LABEL[r.owner] ?? '')} | ${cell(r.error ?? r.detail ?? '')} | ${cell(VERDICT_LABEL[r.verdict])} | ${cell(r.verdict === 'ready' || r.verdict === 'missing' ? '' : r.fix ?? '')} |`),
  ]
  return out.join('\n')
}
