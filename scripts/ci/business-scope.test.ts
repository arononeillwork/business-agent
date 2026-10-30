// Several businesses in one database (docs/SEVERAL_BUSINESSES.md): the Worker's service role skips
// row security, so it acts for one business at a time (businessDb in worker/supabase.ts). This keeps
// the few places that use it over every business to the ones listed, so a new one is a choice.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
describe('the service role over every business is only used to find which business something is', () => {
  // Where serviceClient() is used, file by file. Anything else acts for one business (businessDb or
  // requestDb). Adding one: it may only find a business (by a link, a token, a webhook's account)
  // or touch accounts (auth), never read or change a business's rows for it.
  const ALLOWED: Record<string, number> = {
    'apiKeys.ts': 1,      // an access key's owner, by the key's hash
    'authEmail.ts': 1,    // the business of whoever the email is for
    'billing.ts': 2,      // the business of a Stripe customer; AI music still to charge, each on its business
    'calendarFeed.ts': 1, // a feed link's owner, by its hash
    'cameras.ts': 1,      // a camera's business, by its username on the upload server
    'index.ts': 5,        // accounts (invites, passwords, someone's account by email) and the jobs that run for each business
    'integrations.ts': 1, // the business whose Square account a webhook is for
    'menu.ts': 1,         // the business of an AI image Higgsfield finished
    'referrals.ts': 1,    // the business whose referral code it is
    'screens.ts': 1,      // a screen's business, by its link
  }
  it('stays where it is listed', () => {
    const dir = new URL('../../worker/', import.meta.url)
    const found: Record<string, number> = {}
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f === 'supabase.ts') continue
      const n = readFileSync(new URL(f, dir), 'utf8').match(/serviceClient\(/g)?.length ?? 0
      if (n) found[f] = n
    }
    expect(found).toEqual(ALLOWED)
  })
})
