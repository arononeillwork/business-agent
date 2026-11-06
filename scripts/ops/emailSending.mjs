// The parts of the "Email sending" deploy step (scripts/ops/email-sending.mjs) that need no deploy:
// whether the domain is set up for Cloudflare Email Sending, and switching the Worker's binding on.

/**
 * Whether the domain is onboarded for Cloudflare Email Sending. Onboarding (Cloudflare dashboard →
 * Email Service → Email Sending → Onboard Domain) adds an MX record to cf-bounce.<domain>, so it's
 * read from public DNS: no token permission needed, and the answer is the same one mail servers see.
 */
export async function onboarded(domain, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=cf-bounce.${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return false
    const body = await res.json()
    return (body.Answer ?? []).some(a => a.type === 15) // 15: MX
  } catch {
    return false
  }
}

/** wrangler.jsonc with the commented-out send_email line switched on (unchanged if it's on, or not there). */
export const withSending = cfg => cfg.replace(/^(\s*)\/\/\s*("send_email":.*)$/m, '$1$2')
