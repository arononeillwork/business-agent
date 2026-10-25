import { Alert, Box, Button, Card, CardContent, Chip, Link, Stack, TextField, Typography } from '@mui/material'
import ReplyIcon from '@mui/icons-material/ReplyOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { BarChart, ShareBars } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatNumber, today } from '../../shared/time'
import { REVIEW_FILTERS, filterReviews, isLow, suggestedReply, summarise, MAX_REPLY, type Review, type ReviewFilter } from '../../shared/reviews'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
const day = (iso: string) => formatLocal(iso, 'd MMM yyyy')
const month = (ym: string) => formatLocal(`${ym}-15T12:00:00Z`, 'MMM')
/** "within 5 hours", "within 2 days". */
const within = (hours: number) => (hours < 48 ? tn(Math.max(1, Math.round(hours)), '{n} hour', '{n} hours') : tn(Math.round(hours / 24), '{n} day', '{n} days'))

/** Reviews: what people say on Google, with figures, and replies (templates edited before sending). Admins only. */
export function ReviewsPage() {
  const { api, business } = useApp()
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const data = useAsync('reviews', () => api.reviews(), [])
  const s = data.data
  const list = s?.reviews ?? []
  const sum = summarise(list)
  const shown = filterReviews(list, filter)

  const table = (): ExportTable => ({
    title: t('Google reviews'),
    filename: `reviews-${today()}`,
    columns: [t('Date'), t('Stars'), t('Reviewer'), t('Review'), t('Reply'), t('Replied on')],
    rows: shown.map(r => [r.created_at.slice(0, 10), r.rating, r.reviewer, r.text ?? '', r.reply ?? '', r.replied_at?.slice(0, 10) ?? '']),
  })

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Reviews')} actions={<ExportButton table={table} disabled={!shown.length} folder="Marketing" />} />
      {s?.feed && <Box sx={{ mt: -2, mb: 2 }}><Freshness id="reviews" at={s.fetched_at} /></Box>}
      <ErrorBox error={data.error} />
      {!s && !data.error && <Loading />}
      {s?.feed === 'places' && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('These are the newest reviews on your public Google listing (Google shares 5 at a time) and can’t be replied to here. Connect Google Maps (your Business Profile) to see every review and reply to them: Google has to approve the app for that first.')}
        </Alert>
      )}
      {s?.problem && s.feed !== 'places' && (
        <Alert severity={s.feed ? 'warning' : 'info'} sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t(s.problem)}
        </Alert>
      )}

      {s && <>
        <StatGrid>
          <StatTile label={t('Average')} value={sum.average === null && s.google_rating === null ? '–' : `${formatNumber(s.google_rating ?? sum.average!)} ★`}
            note={s.google_count !== null ? tn(s.google_count, '{n} review on Google', '{n} reviews on Google') : tn(sum.count, '{n} review', '{n} reviews')} />
          <StatTile label={t('No reply yet')} value={s.can_reply ? sum.unanswered : '–'} note={s.can_reply ? undefined : t('Replies need Google Maps')} />
          <StatTile label={t('Replied to')} value={s.can_reply && sum.reply_rate !== null ? `${Math.round(sum.reply_rate * 100)}%` : '–'} />
          <StatTile label={t('Replies within')} value={sum.reply_hours === null ? '–' : within(sum.reply_hours)} note={t('on average')} />
        </StatGrid>

        {list.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 2, mb: 3 }}>
            <Card component="section" aria-label={t('Stars')}>
              <CardContent>
                <SectionTitle>{t('Stars')}</SectionTitle>
                <ShareBars label={t('Reviews by stars')} format={n => formatNumber(n)}
                  rows={sum.stars.map(x => ({ name: tn(x.rating, '{n} star', '{n} stars'), value: x.count }))} />
              </CardContent>
            </Card>
            <Card component="section" aria-label={t('Month by month')}>
              <CardContent>
                <SectionTitle>{t('Month by month')}</SectionTitle>
                <BarChart label={t('Reviews each month')} format={n => formatNumber(n)} height={200}
                  points={sum.months.map(m => ({ label: month(m.month), title: t('{month}: average {avg} ★', { month: month(m.month), avg: formatNumber(m.average) }), value: m.count }))} />
              </CardContent>
            </Card>
          </Box>
        )}

        <Card component="section" aria-label={t('Google reviews')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Google reviews')}</SectionTitle>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }} role="group" aria-label={t('Show')}>
              {REVIEW_FILTERS.map(f => (
                <Chip key={f.id} label={t(f.label)} color={filter === f.id ? 'primary' : 'default'} variant={filter === f.id ? 'filled' : 'outlined'}
                  onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} />
              ))}
            </Stack>
            {shown.length === 0
              ? <Empty>{list.length ? t('No reviews match.') : t('No reviews yet.')}</Empty>
              : <Stack spacing={1.5}>
                  {shown.map(r => <ReviewCard key={r.id} review={r} canReply={s.can_reply} business={business?.name ?? ''} contact={business?.email ?? null} />)}
                </Stack>}
          </CardContent>
        </Card>

        <Card component="section" aria-label={t('Other review sites')}>
          <CardContent>
            <SectionTitle>{t('Other review sites')}</SectionTitle>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {['TripAdvisor', 'TheFork'].map(n => (
                <Stack key={n} direction="row" spacing={1} sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, py: 1 }}>
                  <Typography>{n}</Typography><Tag>{t('Coming soon')}</Tag>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </>}
    </>
  )
}

/** One review: its stars and words, the reply if there is one, and replying (from a template) in place. */
function ReviewCard({ review: r, canReply, business, contact }: { review: Review; canReply: boolean; business: string; contact: string | null }) {
  const { api } = useApp()
  const run = useAction()
  const [draft, setDraft] = useState<string | null>(null)
  const start = () => setDraft(r.reply ?? suggestedReply(r, business, contact))
  const send = async () => {
    if (await run(() => api.replyReview(r.id, draft!), t('Reply posted on Google'))) setDraft(null)
  }
  return (
    <Box component="article" aria-label={t('{name}, {n} stars', { name: r.reviewer || t('Someone'), n: r.rating })}
      sx={{ border: 1, borderColor: isLow(r) && !r.reply && canReply ? tokens.warnFg : 'divider', borderRadius: 2, p: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography aria-hidden sx={{ color: tokens.roseDeep, letterSpacing: 1 }}>{starText(r.rating)}</Typography>
        <Typography sx={{ fontWeight: 600 }}>{r.reviewer || t('Someone')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{day(r.created_at)}</Typography>
        <Tag>{r.language === 'es' ? 'ES' : 'EN'}</Tag>
        {canReply && !r.reply && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('No reply yet')}</Tag>}
        {r.url && <Link href={r.url} target="_blank" rel="noopener" variant="body2" sx={{ ml: 'auto' }}>{t('Open on Google Maps')}</Link>}
      </Stack>
      {r.text ? <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.text}</Typography>
        : <Typography sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{t('Stars only, no words')}</Typography>}

      {r.reply && draft === null && (
        <Box sx={{ mt: 1.5, pl: 1.5, borderLeft: `3px solid ${tokens.rose}` }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {r.replied_at ? t('Your reply · {date}', { date: day(r.replied_at) }) : t('Your reply')}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.reply}</Typography>
        </Box>
      )}

      {canReply && draft === null && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" startIcon={<ReplyIcon />} onClick={start}>{r.reply ? t('Edit reply') : t('Reply')}</Button>
          {r.reply && <Button size="small" color="inherit" onClick={() => void run(() => api.deleteReviewReply(r.id), t('Reply taken down'))}>{t('Remove reply')}</Button>}
        </Stack>
      )}
      {draft !== null && (
        <Box sx={{ mt: 1.5 }}>
          <TextField label={t('Reply to {name}', { name: r.reviewer || t('Someone') })} value={draft} onChange={e => setDraft(e.target.value)} multiline minRows={3} fullWidth
            helperText={r.reply ? t('{n} of {max} characters', { n: draft.length, max: MAX_REPLY })
              : t('A starting point in the review’s language: make it personal before you send it. {n} of {max} characters.', { n: draft.length, max: MAX_REPLY })}
            error={draft.length > MAX_REPLY} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" disabled={!draft.trim() || draft.length > MAX_REPLY} onClick={() => void send()}>{t('Post reply')}</Button>
            <Button onClick={() => setDraft(null)}>{t('Cancel')}</Button>
          </Stack>
        </Box>
      )}
    </Box>
  )
}
