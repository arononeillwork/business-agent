import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopy'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { SectionTitle } from './common'
import { tokens } from '../theme'
import { msg, t } from '../i18n'

const TEXT = {
  me: {
    title: msg('My shifts in my calendar'),
    blurb: msg('Your shifts, approved time off and the days the café is closed, in Google, Apple or Outlook calendar. It updates by itself when the rota changes.'),
    make: msg('Add my shifts to my calendar'),
  },
  business: {
    title: msg('Team calendar'),
    blurb: msg('Every published shift with names, time off, holidays and closures, and the big sports nights. For owners and managers only: anyone with the link can see it.'),
    make: msg('Make the team calendar link'),
  },
}

/** A private calendar subscription link (iCalendar). No sign-in with Google or Apple needed. */
export function CalendarFeedCard({ scope }: { scope: 'me' | 'business' }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const feeds = useAsync('calendar-feeds', () => api.calendarFeeds(), [])
  const url = feeds.data?.[scope]
  const text = TEXT[scope]
  const webcal = url?.replace(/^https?:/, 'webcal:')
  return (
    <Card component="section" aria-label={t(text.title)}>
      <CardContent>
        <SectionTitle>{t(text.title)}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t(text.blurb)}</Typography>
        {feeds.error && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{feeds.error}</Typography>}
        {feeds.data && !url && (
          <Button variant="contained" onClick={() => run(() => api.makeCalendarFeed(scope), t('Calendar link ready'))}>{t(text.make)}</Button>
        )}
        {url && (
          <Stack spacing={1.25}>
            <Box aria-label={t('Calendar link')} sx={{ p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider',
              fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{url}</Box>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noreferrer">
                {t('Add to Google Calendar')}
              </Button>
              <Button variant="outlined" href={webcal}>{'Apple / Outlook'}</Button>
              <Button startIcon={<CopyIcon fontSize="small" />} onClick={() => {
                navigator.clipboard?.writeText(url).then(() => notify(t('Link copied'), 'success'), () => notify(t('Copy the link above'), 'info'))
              }}>{t('Copy link')}</Button>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('Keep this link private. If it gets shared by mistake, make a new one: the old link stops working.')}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => run(() => api.makeCalendarFeed(scope), t('New link made; the old one no longer works'))}>{t('Make a new link')}</Button>
              <Button size="small" color="error" onClick={() => run(() => api.stopCalendarFeed(scope), t('Calendar link switched off'))}>{t('Switch off')}</Button>
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
