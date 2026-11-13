import { Box, Button, Card, CardContent, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { SectionTitle } from '../components/common'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

/**
 * The business's details on its own website (Website & SEO): its address, phone, WhatsApp, email,
 * social accounts and opening hours with the Calendar's closures, read from here
 * (/api/site/<business>/details, shared/websiteDetails.ts). Changed on the Business and Opening hours
 * pages, the website follows within minutes. Off until an admin turns it on (settings.website_details).
 */
export function DetailsOnWebsite() {
  const { api, business, settings } = useApp()
  const run = useAction()
  const notify = useNotify()
  const on = settings?.website_details === true
  // The demo's business has no number: Easy Beans is 1.
  const url = `${window.location.origin}/api/site/${business?.id ?? 1}/details`
  return (
    <Card component="section" aria-label={t('Your details on your website')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Your details on your website')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Your website can show your address, phone, WhatsApp, email, Instagram, TikTok and opening hours from here, with the days you’re closed on the Calendar. Change them on the Business and Opening hours pages and the website follows within a few minutes, like Google Maps.')}
        </Typography>
        <FormControlLabel control={<Switch checked={on} onChange={e => void run(() => api.updateSettings({ website_details: e.target.checked }),
          e.target.checked ? t('The website can read your details') : t('The website can no longer read your details'))} />}
          label={t('Share your details with the website')} />
        {on && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2">{t('The website reads them from this address:')}</Typography>
            <Box aria-label={t('Details address for the website')} sx={{ p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider',
              fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{url}</Box>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button startIcon={<CopyIcon fontSize="small" />} onClick={() => {
                navigator.clipboard?.writeText(url).then(() => notify(t('Link copied'), 'success'), () => notify(t('Copy the link above'), 'info'))
              }}>{t('Copy link')}</Button>
              <Button startIcon={<OpenIcon fontSize="small" />} href={url} target="_blank" rel="noopener noreferrer">{tc('verb', 'Open')}</Button>
              <Button component={RouterLink} to="/business">{t('Business')}</Button>
              <Button component={RouterLink} to="/opening-hours">{t('Opening hours')}</Button>
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
