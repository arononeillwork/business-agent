import {
  Alert, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import StopIcon from '@mui/icons-material/TimerOffOutlined'
import StoryIcon from '@mui/icons-material/WebStoriesOutlined'
import PostIcon from '@mui/icons-material/ImageOutlined'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import PhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import TvIcon from '@mui/icons-material/TvOutlined'
import AutoIcon from '@mui/icons-material/AutoModeOutlined'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { boardBrand, type BoardBrand } from '../components/MenuBoard'
import { OfferBoard, offerWhenText } from '../components/OfferBoard'
import { Composer } from './SocialPlannerPage'
import { LastDayRules } from './LastDayRules'
import { offerPicture } from '../lib/offerPicture'
import { readyPhoto } from '../lib/media'
import {
  LENGTHS, OFFER_SECONDS, endFor, lengthOf, newOffer, offerProblem, offerState, type Offer, type OfferInput, type OfferLength, type OfferState,
} from '../../shared/offers'
import { kindInfo } from '../../shared/social'
import type { Screen } from '../../shared/screens'
import type { PostKind, PostMedia, SocialPost } from '../../shared/types'
import { formatLocal as formatIn, localDate as dateIn, localTime as timeIn, ownTimeZone, today as todayIn, zoneCity, zonedIso as isoIn } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

// Offers are planned in the person's own time zone (My account → Time zone; the café's by default), like posts.
const formatLocal = (iso: string, pattern: string) => formatIn(iso, pattern, ownTimeZone())
const localDate = (iso: string) => dateIn(iso, ownTimeZone())
const localTime = (iso: string) => timeIn(iso, ownTimeZone())

const inputOf = ({ id, updated_at: _updated, ...o }: Offer): OfferInput => ({ ...o, id })
const secondsText = (n: number) => (n < 60 ? tn(n, '{n} second', '{n} seconds') : tn(Math.round(n / 60), '{n} minute', '{n} minutes'))
const STATE: Record<OfferState, { label: string; fg: string; bg: string }> = {
  on: { label: msg('Live now'), fg: tokens.goodFg, bg: tokens.goodBg },
  coming: { label: msg('Coming up'), fg: tokens.infoFg, bg: tokens.infoBg },
  ended: { label: msg('Ended'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  off: { label: msg('Switched off'), fg: tokens.warnFg, bg: tokens.warnBg },
}
/** Its days and times: "Thu 1 Oct, 15:00–17:00", or "Thu 1 Oct, 09:00 – Sun 4 Oct, 23:59". */
function span(o: Pick<Offer, 'starts_at' | 'ends_at'>) {
  const day = (iso: string) => (localDate(iso) === todayIn(ownTimeZone()) ? t('Today') : formatLocal(iso, 'EEE d MMM'))
  if (localDate(o.starts_at) === localDate(o.ends_at)) return `${day(o.starts_at)}, ${localTime(o.starts_at)}–${localTime(o.ends_at)}`
  return `${day(o.starts_at)}, ${localTime(o.starts_at)} – ${day(o.ends_at)}, ${localTime(o.ends_at)}`
}
/** What its story or post is doing on the Social planner. */
function postText(p: SocialPost) {
  const kind = t(kindInfo(p.kind).label)
  const when = p.scheduled_at ? formatLocal(p.scheduled_at, 'EEE d MMM, HH:mm') : ''
  const what = {
    draft: t('a draft on the Social planner'),
    scheduled: p.auto ? t('goes out by itself {when}', { when }) : t('a reminder to post it {when}', { when }),
    due: t('your turn to post it'),
    publishing: t('going out now'),
    published: t('posted'),
    partly: t('posted on some networks'),
    failed: t('didn’t go out: see the Social planner'),
  }[p.status]
  return `${kind}: ${what}`
}

/** What the story or post says: its name and price, the details, and until when (as it will be when it goes out). */
function captionFor(o: Pick<Offer, 'title' | 'details' | 'price' | 'was_price' | 'starts_at' | 'ends_at'>) {
  const price = [o.price, o.was_price ? t('was {price}', { price: o.was_price }) : null].filter(Boolean).join(' · ')
  return [price ? `${o.title} · ${price}` : o.title, o.details, offerWhenText(o, Math.max(Date.now(), Date.parse(o.starts_at)), ownTimeZone())]
    .filter(Boolean).join('\n')
}

/**
 * Offers & specials (admins): a special or an offer for a set time, shown on the screens picked from
 * the minute it starts to the minute it ends (in turn with their slides, or on its own), with its
 * story (or post) made on the Social planner: its picture drawn from the offer, going out when the
 * offer starts.
 */
export function OffersPage() {
  const { api, business } = useApp()
  const run = useAction()
  const offers = useAsync('offers', () => api.offers(), [], { refetchInterval: 60_000 })
  const screens = useAsync('screens', () => api.screens(), [])
  const posts = useAsync('social-posts', () => api.socialPosts(), [])
  const integ = useAsync('integrations', () => api.integrations(), [])
  const brandRow = useAsync('brand', () => api.brand(), [])
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<OfferInput | null>(null)
  const [story, setStory] = useState<{ offer: Offer; post: Partial<SocialPost> } | null>(null)
  const [deleting, setDeleting] = useState<Offer | null>(null)
  useTick(30_000)
  const brand = boardBrand(business?.name ?? '', brandRow.data ? { ...brandRow.data, logo: brandRow.data.logo_mark ?? brandRow.data.logo } : null)
  const storage = integ.data?.media_storage ?? null
  const connected = (p: string) => !!integ.data?.integrations.some(i => i.provider === p && i.status === 'connected')
  const screenList = screens.data ?? []

  const startNew = (screenId?: string | null) => setEditing({ ...newOffer(),
    screen_ids: screenId ? [screenId] : screenList.filter(s => s.active).map(s => s.id) })
  // From Screens → New offer: a new offer on that screen.
  useEffect(() => {
    if (!params.get('new') || !screens.data) return
    startNew(params.get('screen'))
    setParams({}, { replace: true })
  }, [params, screens.data])
  // From the bell, when a last-day offer starts: its story, ready on the Social planner's composer.
  useEffect(() => {
    const id = params.get('story')
    const o = id && offers.data?.find(x => x.id === id)
    if (!o || !integ.data || !brandRow.data) return
    setParams({}, { replace: true })
    if (!o.post_id) void makeStory(o)
  }, [params, offers.data, integ.data, brandRow.data])

  /** Its story (or post), ready on the Social planner's composer: the picture drawn from the offer, going out when it starts. */
  const makeStory = (o: Offer, kind: PostKind = 'story') => run(async () => {
    let media: PostMedia[] = []
    if (storage) {
      const picture = await offerPicture(o, brand, kind === 'story' ? 'story' : 'post', offerWhenText(o, Math.max(Date.now(), Date.parse(o.starts_at)), ownTimeZone()))
      media = [await api.uploadMedia(picture, kind === 'story' ? 'Stories' : 'Posts')]
    }
    const ahead = Date.parse(o.starts_at) > Date.now() + 60_000
    setStory({ offer: o, post: { kind, caption: captionFor(o), media, targets: [], ...(ahead ? { scheduled_at: o.starts_at } : {}) } })
  })
  const download = (o: Offer) => run(async () => {
    const picture = await offerPicture(o, brand, 'story', offerWhenText(o, Math.max(Date.now(), Date.parse(o.starts_at)), ownTimeZone()))
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(picture), download: picture.name })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  })
  const endNow = (o: Offer) => run(async () => {
    await api.saveOffer({ ...inputOf(o), ends_at: new Date().toISOString() })
    await offers.reload()
  }, t('{name} has ended: it’s off the screens', { name: o.title }))
  const remove = (o: Offer) => run(async () => {
    await api.deleteOffer(o.id)
    setDeleting(null)
    await offers.reload()
  }, t('Deleted {name}', { name: o.title }))

  const all = offers.data ?? []
  const groups: { state: OfferState; title: string; list: Offer[] }[] = [
    { state: 'on', title: t('Live now'), list: all.filter(o => offerState(o) === 'on') },
    { state: 'coming', title: t('Coming up'), list: all.filter(o => offerState(o) === 'coming').reverse() },
    { state: 'off', title: t('Switched off'), list: all.filter(o => offerState(o) === 'off') },
    { state: 'ended', title: t('Ended'), list: all.filter(o => offerState(o) === 'ended').slice(0, 12) },
  ]
  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Offers & specials')}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => startNew()}>{t('New offer')}</Button>} />
      <ErrorBox error={offers.error} />
      {offers.data && !all.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Put a special on your screens and in a story')}</Typography>
          {t('Add an offer for a set time: it shows on the screens you pick from the minute it starts to the minute it ends, and its story is ready on the Social planner to go out as it starts.')}
          <Box sx={{ mt: 2 }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => startNew()}>{t('New offer')}</Button></Box>
        </Empty>
      ) : groups.filter(g => g.list.length).map(g => (
        <Box key={g.state} component="section" aria-label={g.title} sx={{ mb: 3 }}>
          <SectionTitle>{g.title}</SectionTitle>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
            {g.list.map(o => (
              <OfferCard key={o.id} offer={o} screens={screenList} post={posts.data?.find(p => p.id === o.post_id) ?? null}
                onEdit={() => setEditing(inputOf(o))} onStory={() => void makeStory(o)} onDownload={() => void download(o)}
                onEnd={() => void endNow(o)} onDelete={() => setDeleting(o)} />
            ))}
          </Box>
        </Box>
      ))}
      {offers.data && <LastDayRules screens={screenList} />}

      {editing && <OfferDialog offer={editing} screens={screenList} brand={brand} hasPost={!!editing.post_id && !!posts.data?.some(p => p.id === editing.post_id)}
        onClose={() => setEditing(null)}
        onSaved={async (o, kind) => { await offers.reload(); setEditing(null); if (kind) await makeStory(o, kind) }} />}
      {story && (
        <Composer post={story.post} storage={storage} isConnected={connected} recent={[]} engagement={{}} onClose={() => setStory(null)}
          onSaved={async id => {
            await api.saveOffer({ ...inputOf(story.offer), post_id: id })
            await Promise.all([offers.reload(), posts.reload()])
          }} />
      )}
      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('Delete {name}?', { name: deleting.title })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('It comes off the screens straight away. Its story or post stays on the Social planner.')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>{t('Keep')}</Button>
            <Button variant="contained" color="error" onClick={() => void remove(deleting)}>{t('Delete')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}

function OfferCard({ offer: o, screens, post, onEdit, onStory, onDownload, onEnd, onDelete }: {
  offer: Offer; screens: Screen[]; post: SocialPost | null
  onEdit: () => void; onStory: () => void; onDownload: () => void; onEnd: () => void; onDelete: () => void
}) {
  const state = offerState(o)
  const on = screens.filter(s => o.screen_ids.includes(s.id))
  const tone = STATE[state]
  return (
    <Card component="article" aria-label={o.title} variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1.5} sx={{ p: 2, pb: 1.5 }}>
        <Box sx={{ width: 72, height: 72, flexShrink: 0, borderRadius: 2, overflow: 'hidden', bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center', color: tokens.inkSoft }}>
          {o.image_url ? <Box component="img" src={o.image_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <OfferIcon />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography component="h3" sx={{ fontWeight: 600 }}>{o.title}</Typography>
            {o.price && <Typography sx={{ fontWeight: 600, color: tokens.roseDeep }}>{o.price}</Typography>}
            {o.was_price && <Typography component="s" variant="body2" sx={{ color: 'text.secondary' }}>{o.was_price}</Typography>}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{span(o)}</Typography>
          <Stack direction="row" sx={{ mt: 0.75, gap: 0.75, flexWrap: 'wrap' }}>
            <Tag fg={tone.fg} bg={tone.bg}>{t(tone.label)}</Tag>
            {o.auto_for && <Tag fg={tokens.infoFg} bg={tokens.infoBg}><AutoIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />{t('Automatic: last day')}</Tag>}
          </Stack>
        </Box>
      </Stack>
      <Stack spacing={0.75} sx={{ px: 2, pb: 1.5, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TvIcon fontSize="small" sx={{ color: tokens.inkSoft }} />
          <Typography variant="body2">
            {on.length ? t('On {screens}: {how}', { screens: on.map(s => s.name).join(', '),
              how: o.screen_mode === 'only' ? t('on its own') : t('in turn, {time} each time', { time: secondsText(o.seconds) }) }) : t('Not on a screen')}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {post?.kind === 'story' || !post ? <StoryIcon fontSize="small" sx={{ color: tokens.inkSoft }} /> : <PostIcon fontSize="small" sx={{ color: tokens.inkSoft }} />}
          {post ? (
            <Typography variant="body2">{postText(post)} <Button size="small" component={RouterLink} to="/social" sx={{ py: 0 }}>{t('Open')}</Button></Typography>
          ) : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No story yet')}</Typography>}
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', px: 1.5, pb: 1.5 }}>
        {!post && state !== 'ended' && <Button size="small" variant="outlined" startIcon={<StoryIcon />} onClick={onStory}>{t('Make its story')}</Button>}
        <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>{t('Edit')}</Button>
        {state === 'on' && <Button size="small" startIcon={<StopIcon />} onClick={onEnd}>{t('End now')}</Button>}
        <Button size="small" startIcon={<DownloadIcon />} onClick={onDownload}>{t('Picture')}</Button>
        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={onDelete} aria-label={t('Delete {name}', { name: o.title })}>{t('Delete')}</Button>
      </Stack>
    </Card>
  )
}

/** Adding or changing an offer: what it is, when and for how long, the screens it's on and how, and its story. */
function OfferDialog({ offer, screens, brand, hasPost, onClose, onSaved }: {
  offer: OfferInput; screens: Screen[]; brand: BoardBrand; hasPost: boolean
  onClose: () => void; onSaved: (o: Offer, story: PostKind | null) => Promise<void>
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const tz = ownTimeZone()
  const file = useRef<HTMLInputElement>(null)
  const [o, setO] = useState<OfferInput>(offer)
  const [startDate, setStartDate] = useState(localDate(offer.starts_at))
  const [startTime, setStartTime] = useState(localTime(offer.starts_at))
  const [length, setLength] = useState<OfferLength>(offer.id ? lengthOf(offer.starts_at, offer.ends_at, tz) : '2h')
  const [endDate, setEndDate] = useState(localDate(offer.ends_at))
  const [endTime, setEndTime] = useState(localTime(offer.ends_at))
  const [story, setStory] = useState<PostKind | null>(hasPost ? null : 'story')
  const [uploading, setUploading] = useState(false)
  const set = (patch: Partial<OfferInput>) => setO(x => ({ ...x, ...patch }))

  // The times as picked, in the person's own time zone.
  const starts = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{2}:\d{2}$/.test(startTime) ? isoIn(startDate, startTime, tz) : ''
  const ends = !starts ? '' : length === 'custom'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(endDate) && /^\d{2}:\d{2}$/.test(endTime) ? isoIn(endDate, endTime, tz) : '') : endFor(starts, length, tz)
  const full: OfferInput = { ...o, starts_at: starts, ends_at: ends }
  const problem = offerProblem(full)
  const shownOn = screens.filter(s => o.screen_ids.includes(s.id))
  const portrait = shownOn.length > 0 && shownOn.every(s => s.orientation === 'portrait')

  const upload = (f: File) => run(async () => {
    setUploading(true)
    try { set({ image_url: (await api.uploadMedia(await readyPhoto(f, false), 'Stories')).url }) } finally { setUploading(false) }
  })
  const save = () => run(async () => {
    if (problem) throw new Error(t(problem))
    if (!o.id && Date.parse(ends) <= Date.now()) throw new Error(t('That time has passed. Pick when the offer ends.'))
    const id = await api.saveOffer(full)
    await onSaved({ ...full, id, updated_at: new Date().toISOString() }, story)
  }, story ? undefined : t('Saved. Screens show it within a minute.'))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogTitle>{o.id ? t('Edit offer') : t('New offer')}</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ pt: 1 }}>
          <Stack spacing={2.25} sx={{ flex: 1, minWidth: 0 }}>
            <TextField autoFocus label={t('Name')} placeholder={t('e.g. Pumpkin spice latte, or 2-for-1 iced lattes')} value={o.title}
              onChange={e => set({ title: e.target.value })} slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField label={t('Details (optional)')} multiline minRows={2} value={o.details ?? ''} onChange={e => set({ details: e.target.value || null })}
              slotProps={{ htmlInput: { maxLength: 300 } }} />
            <Stack direction="row" spacing={1.5}>
              <TextField fullWidth label={t('Price (optional)')} placeholder={t('e.g. €3.50, 2 for 1, 20% off')} value={o.price ?? ''}
                onChange={e => set({ price: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 40 } }} />
              <TextField fullWidth label={t('Usually (optional)')} placeholder={t('e.g. €4.20')} value={o.was_price ?? ''}
                onChange={e => set({ was_price: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 40 } }} helperText={t('Shown crossed out')} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField fullWidth size="small" label={t('Photo address (optional)')} placeholder={'https://…'} value={o.image_url ?? ''}
                onChange={e => set({ image_url: e.target.value.trim() || null })} />
              <Button variant="outlined" startIcon={<PhotoIcon />} disabled={uploading} onClick={() => file.current?.click()} sx={{ flexShrink: 0, mt: 0.25 }}>
                {uploading ? t('Uploading…') : t('Upload')}
              </Button>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={t('Photo file')}
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            </Stack>

            <Box role="group" aria-label={t('When')}>
              <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('When')}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 0.5 }}>
                <TextField type="date" label={t('Starts')} value={startDate} onChange={e => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="time" label={t('At ({zone})', { zone: zoneCity(tz) })} value={startTime} onChange={e => setStartTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField select label={t('How long it runs')} value={length} onChange={e => setLength(e.target.value as OfferLength)} sx={{ minWidth: 200 }}>
                  {LENGTHS.map(l => <MenuItem key={l.id} value={l.id}>{t(l.label)}</MenuItem>)}
                </TextField>
              </Stack>
              <Button size="small" sx={{ mt: 0.5 }} onClick={() => { const now = new Date().toISOString(); setStartDate(localDate(now)); setStartTime(localTime(now)) }}>{t('Start now')}</Button>
              {length === 'custom' && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1 }}>
                  <TextField type="date" label={t('Ends')} value={endDate} onChange={e => setEndDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDate } }} />
                  <TextField type="time" label={t('At ({zone})', { zone: zoneCity(tz) })} value={endTime} onChange={e => setEndTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                </Stack>
              )}
              {starts && ends && !problem && <Typography variant="body2" sx={{ mt: 1 }}>{span({ starts_at: starts, ends_at: ends })}</Typography>}
            </Box>

            <Box role="group" aria-label={t('Screens')}>
              <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Screens')}</Typography>
              {screens.length ? <>
                <Stack>
                  {screens.map(s => (
                    <FormControlLabel key={s.id} label={s.active ? s.name : `${s.name} (${t('switched off')})`}
                      control={<Checkbox checked={o.screen_ids.includes(s.id)}
                        onChange={e => set({ screen_ids: e.target.checked ? [...o.screen_ids, s.id] : o.screen_ids.filter(x => x !== s.id) })} />} />
                  ))}
                </Stack>
                <RadioGroup value={o.screen_mode} onChange={e => set({ screen_mode: e.target.value as OfferInput['screen_mode'] })} aria-label={t('How it shows')}>
                  <FormControlLabel value="turns" control={<Radio size="small" />} label={t('In turn with the screen’s other slides')} />
                  {o.screen_mode === 'turns' && (
                    <TextField select size="small" label={t('Each time round, it shows for')} value={o.seconds} onChange={e => set({ seconds: Number(e.target.value) })}
                      sx={{ ml: 4, mb: 1, maxWidth: 260 }}>
                      {[...new Set([...OFFER_SECONDS, o.seconds])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={n}>{secondsText(n)}</MenuItem>)}
                    </TextField>
                  )}
                  <FormControlLabel value="only" control={<Radio size="small" />} label={t('On its own: the screen shows only this offer until it ends')} />
                </RadioGroup>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {t('It goes on at the minute it starts and comes off at the minute it ends, by itself.')}
                </Typography>
              </> : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('No screens yet.')} <Button size="small" component={RouterLink} to="/screens">{t('Add one on Screens')}</Button>
                </Typography>
              )}
            </Box>

            {o.id && (
              <FormControlLabel control={<Switch checked={o.active} onChange={e => set({ active: e.target.checked })} />}
                label={o.active ? t('Switched on') : t('Switched off: on no screen')} />
            )}

            {!hasPost && (
              <Box role="group" aria-label={t('Its story')} sx={{ p: 1.5, borderRadius: 2, bgcolor: tokens.surfaceAlt }}>
                <FormControlLabel control={<Checkbox checked={!!story} onChange={e => setStory(e.target.checked ? 'story' : null)} />}
                  label={t('Make a story for it too (suggested)')} />
                {story && <>
                  <ToggleButtonGroup exclusive size="small" value={story} onChange={(_, k: PostKind | null) => k && setStory(k)} aria-label={t('Story or post')} sx={{ ml: 4, mb: 1 }}>
                    <ToggleButton value="story" sx={{ gap: 0.75, textTransform: 'none' }}><StoryIcon fontSize="small" />{t('Story')}</ToggleButton>
                    <ToggleButton value="post" sx={{ gap: 0.75, textTransform: 'none' }}><PostIcon fontSize="small" />{t('Post')}</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4 }}>
                    {story === 'story'
                      ? t('Next, the Social planner opens with the story ready: its picture made from the offer, going out as the offer starts. A story shows for 24 hours.')
                      : t('Next, the Social planner opens with the post ready: its picture made from the offer and a caption, going out as the offer starts.')}
                  </Typography>
                </>}
              </Box>
            )}
          </Stack>

          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('On the screens')}</Typography>
            <Box sx={{ mx: 'auto', maxWidth: portrait ? 180 : 300 }}>
              <Box role="region" aria-label={t('Preview of the offer')} sx={{ position: 'relative', aspectRatio: portrait ? '9 / 16' : '16 / 9', borderRadius: '8px', overflow: 'hidden',
                border: '5px solid #111', bgcolor: '#000' }}>
                <OfferBoard offer={{ ...full, title: o.title || t('Your offer'), starts_at: starts || o.starts_at, ends_at: ends || o.ends_at }} brand={brand}
                  now={Math.max(Date.now(), Date.parse(starts || o.starts_at))} />
              </Box>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mt: 0.75 }}>
              {t('As it shows while it’s on.')}
            </Typography>
          </Box>
        </Stack>
        {problem && (o.title.trim() || problem !== 'Give the offer a name') && <Alert severity="warning" sx={{ mt: 2 }}>{t(problem)}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ mr: 'auto' }}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={uploading}>
          {story === 'story' ? t('Save and make the story') : story === 'post' ? t('Save and make the post') : t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
