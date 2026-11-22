import { Alert, Box, Button, ButtonBase, Card, CardContent, Chip, Dialog, IconButton, Link, MenuItem, Stack, TextField, Typography } from '@mui/material'
import ReplyIcon from '@mui/icons-material/ReplyOutlined'
import CloseIcon from '@mui/icons-material/Close'
import PrevIcon from '@mui/icons-material/ChevronLeft'
import NextIcon from '@mui/icons-material/ChevronRight'
import { useEffect, useRef, useState } from 'react'
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
import {
  REVIEW_FILTERS, REVIEW_SORTS, filterReviews, isLow, sortReviews, suggestedReply, summarise, toTranslate, wordsIn, MAX_REPLY,
  type Review, type ReviewFilter, type ReviewLanguage, type ReviewPhoto, type ReviewSort,
} from '../../shared/reviews'
import { tokens } from '../theme'
import { t, tn, useLanguage } from '../i18n'

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
const day = (iso: string) => formatLocal(iso, 'd MMM yyyy')
const month = (ym: string) => formatLocal(`${ym}-15T12:00:00Z`, 'MMM')
/** "within 5 hours", "within 2 days". */
const within = (hours: number) => (hours < 48 ? tn(Math.max(1, Math.round(hours)), '{n} hour', '{n} hours') : tn(Math.round(hours / 24), '{n} day', '{n} days'))

/** Reviews: what people say on Google (and the photos they add), with figures, and replies (templates edited before sending). Admins only.
 * The list filters by stars, replies or photos and sorts by date or by stars. */
export function ReviewsPage() {
  const { api, business } = useApp()
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [sort, setSort] = useState<ReviewSort>('newest')
  const data = useAsync('reviews', () => api.reviews(), [])
  const s = data.data
  const list = s?.reviews ?? []
  const sum = summarise(list)
  const shown = sortReviews(filterReviews(list, filter), sort)
  // In the page's language: a review written in the other one shows translated (Google's translation, or one
  // made now, once, and kept). Asked for once each time the page opens; the reviews come back translated.
  const language = useLanguage() as ReviewLanguage
  const [translating, setTranslating] = useState(false)
  const asked = useRef(false)
  const missing = s?.can_translate ? toTranslate(list, language).length : 0
  useEffect(() => {
    if (!missing || asked.current) return
    asked.current = true
    setTranslating(true)
    api.translateReviews(language).then(r => (r.translated ? data.reload() : undefined)).catch(() => { /* shown as written */ }).finally(() => setTranslating(false))
  }, [missing, language, api, data])

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
      {s?.feed === 'places' && !s.problem && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('These are the newest reviews on your public Google listing (Google shares 5 at a time) and can’t be replied to here. Connect Google Maps (your Business Profile) to see every review and reply to them: Google has to approve the app for that first.')}
        </Alert>
      )}
      {s?.problem && (
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
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }} role="group" aria-label={t('Show')}>
                {REVIEW_FILTERS.map(f => (
                  <Chip key={f.id} label={t(f.label)} color={filter === f.id ? 'primary' : 'default'} variant={filter === f.id ? 'filled' : 'outlined'}
                    onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} />
                ))}
              </Stack>
              <TextField select fullWidth={false} size="small" label={t('Sort by')} value={sort} onChange={e => setSort(e.target.value as ReviewSort)} sx={{ ml: 'auto', minWidth: 180 }}>
                {REVIEW_SORTS.map(o => <MenuItem key={o.id} value={o.id}>{t(o.label)}</MenuItem>)}
              </TextField>
            </Stack>
            {translating && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('Translating the reviews written in the other language…')}</Typography>}
            {shown.length === 0
              ? <Empty>{list.length ? t('No reviews match.') : t('No reviews yet.')}</Empty>
              : <Stack spacing={1.5}>
                  {shown.map(r => <ReviewCard key={r.id} review={r} canReply={s.can_reply} business={business?.name ?? ''} contact={business?.email ?? null}
                    language={language} listing={s.listing_url ?? null} />)}
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

/** One review: its stars, words and photos, the reply if there is one, and replying (from a template) in place. */
function ReviewCard({ review: r, canReply, business, contact, language, listing }: {
  review: Review; canReply: boolean; business: string; contact: string | null; language: ReviewLanguage; listing: string | null
}) {
  const { api } = useApp()
  const run = useAction()
  const [draft, setDraft] = useState<string | null>(null)
  // In the page's language when it's a translation; their own words a press away.
  const [original, setOriginal] = useState(false)
  const words = wordsIn(r, language)
  const text = words.translated && !original ? words.text : r.text
  const onMaps = r.url ?? listing
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
        {onMaps && <Link href={onMaps} target="_blank" rel="noopener" variant="body2" sx={{ ml: 'auto' }}>{t('Open on Google Maps')}</Link>}
      </Stack>
      {text ? <Typography sx={{ whiteSpace: 'pre-wrap' }} lang={words.translated && !original ? language : r.language}>{text}</Typography>
        : !r.photos?.length && (
          <Typography sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            {Date.now() - Date.parse(r.created_at) < 3 * 86_400_000
              ? t('Stars only so far: Google hasn’t sent any words with it. Open it on Google Maps to check.')
              : t('Stars only, no words')}
          </Typography>
        )}
      {words.translated && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {original ? t('As they wrote it') : r.language === 'es' ? t('Translated from Spanish') : t('Translated from English')}
          </Typography>
          <Button size="small" onClick={() => setOriginal(o => !o)} sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.75rem' }}>
            {original ? t('Show the translation') : t('Show original')}
          </Button>
        </Stack>
      )}
      {!!r.photos?.length && <ReviewPhotos photos={r.photos} reviewer={r.reviewer || t('Someone')} />}

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

/** A review's photos, small in a row; one tapped opens large, with the others a step either side. */
function ReviewPhotos({ photos, reviewer }: { photos: ReviewPhoto[]; reviewer: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const shown = open === null ? null : photos[open]
  const step = (by: number) => setOpen(i => (i === null ? i : (i + by + photos.length) % photos.length))
  return (
    <>
      <Stack component="ul" direction="row" spacing={1} useFlexGap aria-label={t('Photos')} sx={{ flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0, mt: 1 }}>
        {photos.map((p, i) => (
          <li key={p.url}>
            <ButtonBase onClick={() => setOpen(i)} aria-label={t('Photo {n} of {count}', { n: i + 1, count: photos.length })}
              sx={{ borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
              <Box component="img" src={p.thumb ?? p.url} alt="" loading="lazy" referrerPolicy="no-referrer"
                sx={{ width: { xs: 72, sm: 96 }, height: { xs: 72, sm: 96 }, objectFit: 'cover', display: 'block' }} />
            </ButtonBase>
          </li>
        ))}
      </Stack>
      <Dialog open={!!shown} onClose={() => setOpen(null)} maxWidth="md"
        slotProps={{ paper: { 'aria-label': t('Photo from {name}', { name: reviewer }), sx: { bgcolor: 'common.black', overflow: 'hidden' } } }}
        onKeyDown={e => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1) }}>
        {shown && <Box sx={{ position: 'relative', bgcolor: 'common.black' }}>
          <Box component="img" src={shown.url} alt={t('Photo {n} of {count}', { n: open! + 1, count: photos.length })} referrerPolicy="no-referrer"
            sx={{ display: 'block', maxWidth: '100%', maxHeight: '85vh', mx: 'auto', objectFit: 'contain' }} />
          <IconButton onClick={() => setOpen(null)} aria-label={t('Close')} sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' } }}>
            <CloseIcon />
          </IconButton>
          {photos.length > 1 && <>
            <IconButton onClick={() => step(-1)} aria-label={t('Previous photo')} sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' } }}>
              <PrevIcon />
            </IconButton>
            <IconButton onClick={() => step(1)} aria-label={t('Next photo')} sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.45)', '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' } }}>
              <NextIcon />
            </IconButton>
          </>}
        </Box>}
      </Dialog>
    </>
  )
}
