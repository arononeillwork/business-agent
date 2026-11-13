// The business's website key: made on Website & SEO (POST /api/newsletter/key, shown once), kept only as its
// SHA-256 (newsletter.key_hash). The website's server sends it as `Authorization: Bearer nl_…` for what
// only it may do: newsletter sign-ups from a list and unsubscribes (worker/newsletter.ts), and its
// visitors' accounts (worker/siteAccount.ts). Never put in a website's pages.
import type { Context } from 'hono'
import { bearer } from './supabase'

/** The business's number in an address (/api/site/2/…); null when it isn't one. */
export const businessIn = (raw: string) => (/^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null)

export const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

/** Whether the request carries the key whose hash is `hash`: true, false (none sent), or 'wrong' (another, or the business has none). */
export async function websiteKey(c: Context, hash: string | null | undefined): Promise<boolean | 'wrong'> {
  const token = bearer(c.req.header('authorization'))
  if (!token) return false
  return hash && (await sha256(token)) === hash ? true : 'wrong'
}
