import { Box, Button, Card, CardContent, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { SectionTitle } from '../components/common'
import type { Settings } from '../../shared/types'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

/**
 * One thing the business's own website reads from the app (Website & SEO): a switch, and once it's on,
 * the address the website reads it from. Each is off until an admin turns it on.
 */
function FeedOnWebsite({ title, about, setting, path, on: onText, off: offText, label, addressLabel, links }: {
  title: string
  about: string
  setting: 'website_reviews' | 'website_posts'
  /** The feed's name in its address: /api/site/<business>/<path>. */
  path: string
  on: string
  off: string
  label: string
  addressLabel: string
  links: { to: string; label: string }[]
}) {
  const { api, business, settings } = useApp()
  const run = useAction()
  const notify = useNotify()
  const on = settings?.[setting] === true
  // The demo's business has no number: Easy Beans is 1.
  const url = `${window.location.origin}/api/site/${business?.id ?? 1}/${path}`
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{about}</Typography>
        <FormControlLabel control={<Switch checked={on} onChange={e => void run(() => api.updateSettings({ [setting]: e.target.checked } as Partial<Settings>),
          e.target.checked ? onText : offText)} />} label={label} />
        {on && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2">{t('The website reads them from this address:')}</Typography>
            <Box aria-label={addressLabel} sx={{ p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider',
              fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{url}</Box>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button startIcon={<CopyIcon fontSize="small" />} onClick={() => {
                navigator.clipboard?.writeText(url).then(() => notify(t('Link copied'), 'success'), () => notify(t('Copy the link above'), 'info'))
              }}>{t('Copy link')}</Button>
              <Button startIcon={<OpenIcon fontSize="small" />} href={url} target="_blank" rel="noopener noreferrer">{tc('verb', 'Open')}</Button>
              {links.map(l => <Button key={l.to} component={RouterLink} to={l.to}>{l.label}</Button>)}
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The business's Google rating and reviews on its website (/api/site/<business>/reviews,
 * shared/websiteReviews.ts): what the Reviews page keeps, so the website needs no Google key of its own.
 */
export function ReviewsOnWebsite() {
  return (
    <FeedOnWebsite
      title={t('Your Google reviews on your website')}
      about={t('Your website can show your Google rating and your newest reviews from here, the ones on the Reviews page, without a Google key of its own. A new review is on the website within the hour.')}
      setting="website_reviews" path="reviews"
      on={t('The website can read your reviews')} off={t('The website can no longer read your reviews')}
      label={t('Share your reviews with the website')} addressLabel={t('Reviews address for the website')}
      links={[{ to: '/reviews', label: t('Reviews') }, { to: '/connections', label: t('Connections') }]}
    />
  )
}

/**
 * The business's latest Instagram posts on its website (/api/site/<business>/posts,
 * shared/websitePosts.ts): from the Instagram connected here, so the website needs no Instagram token.
 */
export function PostsOnWebsite() {
  return (
    <FeedOnWebsite
      title={t('Your Instagram posts on your website')}
      about={t('Your website can show your latest Instagram posts from here, from the Instagram connected on Connections (or your Facebook Page while Instagram isn’t), without an Instagram token of its own. A new post is on the website within about 15 minutes.')}
      setting="website_posts" path="posts"
      on={t('The website can read your posts')} off={t('The website can no longer read your posts')}
      label={t('Share your posts with the website')} addressLabel={t('Posts address for the website')}
      links={[{ to: '/connections', label: t('Connections') }]}
    />
  )
}
