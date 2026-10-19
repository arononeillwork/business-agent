import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopy'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { SectionTitle } from './common'
import { tokens } from '../theme'

const TEXT = {
  me: {
    title: 'My shifts in my calendar',
    blurb: 'Your shifts, approved time off and the days the café is closed, in Google, Apple or Outlook calendar. It updates by itself when the rota changes.',
    make: 'Add my shifts to my calendar',
  },
  business: {
    title: 'Team calendar',
    blurb: 'Every published shift with names, time off, holidays and closures, and the big sports nights. For owners and managers only: anyone with the link can see it.',
    make: 'Make the team calendar link',
  },
}

/** A private calendar subscription link (iCalendar). No sign-in with Google or Apple needed. */
export function CalendarFeedCard({ scope }: { scope: 'me' | 'business' }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const feeds = useAsync('calendar-feeds', () => api.calendarFeeds(), [])
  const url = feeds.data?.[scope]
  const t = TEXT[scope]
  const webcal = url?.replace(/^https?:/, 'webcal:')
  return (
    <Card component="section" aria-label={t.title}>
      <CardContent>
        <SectionTitle>{t.title}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t.blurb}</Typography>
        {feeds.error && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{feeds.error}</Typography>}
        {feeds.data && !url && (
          <Button variant="contained" onClick={() => run(() => api.makeCalendarFeed(scope), 'Calendar link ready')}>{t.make}</Button>
        )}
        {url && (
          <Stack spacing={1.25}>
            <Box aria-label="Calendar link" sx={{ p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider',
              fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{url}</Box>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noreferrer">
                Add to Google Calendar
              </Button>
              <Button variant="outlined" href={webcal}>Apple / Outlook</Button>
              <Button startIcon={<CopyIcon fontSize="small" />} onClick={() => {
                navigator.clipboard?.writeText(url).then(() => notify('Link copied', 'success'), () => notify('Copy the link above', 'info'))
              }}>Copy link</Button>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Keep this link private. If it gets shared by mistake, make a new one: the old link stops working.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => run(() => api.makeCalendarFeed(scope), 'New link made; the old one no longer works')}>Make a new link</Button>
              <Button size="small" color="error" onClick={() => run(() => api.stopCalendarFeed(scope), 'Calendar link switched off')}>Switch off</Button>
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
