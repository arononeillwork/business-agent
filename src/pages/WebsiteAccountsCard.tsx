import { Alert, Box, Button, Card, CardContent, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import KeyIcon from '@mui/icons-material/KeyRounded'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { ErrorBox, SectionTitle } from '../components/common'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { t } from '../i18n'

const code = { p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
  wordBreak: 'break-all', whiteSpace: 'pre-wrap', m: 0 } as const

/**
 * Accounts & rewards on the business's website (Website & SEO): people who sign in there are on Customers,
 * and their account page reads their points (Square Loyalty), credit and cashback from here, and can erase
 * them (worker/siteAccount.ts, docs/WEBSITE.md). Off until an admin turns it on (settings.website_accounts);
 * the website's server asks with the website key, the newsletter's.
 */
export function WebsiteAccountsCard() {
  const { api, business, settings } = useApp()
  const run = useAction()
  const notify = useNotify()
  const newsletter = useAsync('newsletter', () => api.newsletter(), [])
  const [made, setMade] = useState<string | null>(null)
  const on = settings?.website_accounts === true
  const key = newsletter.data
  const base = `${window.location.origin}/api/site/${business?.id ?? 1}/account`
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => notify(t('Copied'), 'success'), () => notify(t('Select it and copy it'), 'info'))
  const makeKey = () => run(async () => { setMade((await api.makeNewsletterKey()).key) }, t('Key made'))
  return (
    <Card component="section" aria-label={t('Accounts & rewards on your website')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Accounts & rewards on your website')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('People who sign in on your website are on Customers, and their account page shows what they have here: their points from Square, their credit and how posts earn cashback, and their code if they’re a rep. Deleting their account on the website erases them here too. Only your website’s server asks, with the website key.')}
        </Typography>
        <FormControlLabel control={<Switch checked={on} onChange={e => void run(() => api.updateSettings({ website_accounts: e.target.checked }),
          e.target.checked ? t('Your website’s accounts read from here') : t('Your website’s accounts no longer read from here'))} />}
          label={t('Website accounts')} />
        {on && <>
          <Typography variant="body2" sx={{ mt: 1, mb: 0.75 }}>{t('The website’s server calls these (POST, never from its pages):')}</Typography>
          <Box aria-label={t('Addresses for website accounts')} sx={code}>{['sync', 'summary', 'erase'].map(a => `POST ${base}/${a}`).join('\n')}</Box>
          <ErrorBox error={newsletter.error} />
          <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
            <KeyIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            {key?.key_hint ? (
              <Typography variant="body2">{t('Website key ending {hint}, made {when}', { hint: key.key_hint, when: formatLocal(key.key_made_at!, 'd MMM yyyy') })}</Typography>
            ) : key && <>
              <Typography variant="body2">{t('No website key yet: the website can’t ask until it has one.')}</Typography>
              <Button size="small" variant="outlined" onClick={() => void makeKey()}>{t('Make a website key')}</Button>
            </>}
          </Stack>
          {made && (
            <Alert severity="success" sx={{ mt: 1 }} onClose={() => setMade(null)}
              action={<Button color="inherit" size="small" startIcon={<CopyIcon fontSize="small" />} onClick={() => void copy(made)}>{t('Copy')}</Button>}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {t('Copy it now and give it to whoever runs the website: it won’t be shown again. It goes on the website’s server only (Authorization: Bearer …), never in its pages.')}
              </Typography>
              <Box aria-label={t('The new website key')} sx={{ ...code, bgcolor: 'transparent' }}>{made}</Box>
            </Alert>
          )}
        </>}
      </CardContent>
    </Card>
  )
}
