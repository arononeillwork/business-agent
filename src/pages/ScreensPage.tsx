import {
  Alert, Box, Button, Card, CardActionArea, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Radio,
  RadioGroup, Slider, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import DownIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import LeftIcon from '@mui/icons-material/ChevronLeftRounded'
import RightIcon from '@mui/icons-material/ChevronRightRounded'
import ExpandIcon from '@mui/icons-material/ExpandMoreRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import RefreshIcon from '@mui/icons-material/AutorenewRounded'
import EditIcon from '@mui/icons-material/EditOutlined'
import ImageIcon from '@mui/icons-material/ImageOutlined'
import UploadIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import VideoIcon from '@mui/icons-material/MovieOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import MenuIcon from '@mui/icons-material/RestaurantMenuOutlined'
import YouTubeIcon from '@mui/icons-material/YouTube'
import InstagramIcon from '@mui/icons-material/Instagram'
import MusicIcon from '@mui/icons-material/MusicNoteOutlined'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import TvIcon from '@mui/icons-material/TvOutlined'
import SlideshowIcon from '@mui/icons-material/SlideshowOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { FEATURES } from '../app/features'
import { useAsync, useTick } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { ScreenPlayer } from '../components/ScreenPlayer'
import { offerWhenText } from '../components/OfferBoard'
import { ago } from '../components/Freshness'
import { readyPhoto } from '../lib/media'
import { imageOf, type MenuDesign, type MenuItem as Item } from '../../shared/menu'
import {
  LINK_NAME, LINK_PREFIX, OWN_URL, SECONDS_CHOICES, TRANSITIONS, cleanUrl, embedCode, hasVersion, isOnline, kindLabel, kindOf, linkName, loopSeconds, newScreen, offersSlide,
  screenProblem, shortLinkPath, versionOn, type DisplayFeed, type OfferPicture, type Screen, type ScreenInput, type ScreenKind, type Slide, type SlideKind,
} from '../../shared/screens'
import type { MenuAllergens } from '../../shared/allergens'
import { offerState, type Offer, type ScreenOffer } from '../../shared/offers'
import { qrSvg } from '../../shared/qrCodes'
import type { Brand } from '../../shared/types'
import { tokens } from '../theme'
import { SlideVersions } from './ScreenSlideVersions'
import { currentCountry } from '../../shared/country'
import { fromPost, onNow, postSlide, postTitle, show, showOnly } from '../../shared/singleDisplay'
import type { SourcePost } from '../../shared/offerFromPost'
import { formatLocal } from '../../shared/time'
import { msg, t, tc, tn } from '../i18n'

const inputOf = ({ id, token: _token, last_seen_at: _seen, updated_at: _updated, ...s }: Screen): ScreenInput => ({ ...s, own_url: s.own_url ?? null, id })
const ICON: Record<SlideKind, ReactNode> = {
  image: <ImageIcon />, video: <VideoIcon />, youtube: <YouTubeIcon />, vimeo: <VideoIcon />, instagram: <InstagramIcon />, web: <WebIcon />, menu: <MenuIcon />,
  offers: <OfferIcon />,
}
const appBase = () => `${location.origin}${import.meta.env.VITE_DEMO_ONLY === '1' ? `${location.pathname}#` : ''}`
/** The screen's secret link: works however the short link is changed, and nobody can guess it. */
export const screenLink = (token: string) => `${appBase()}/display/${token}`
/** The screen's short link: what's typed on the TV or tablet (/display-menu/cafe-tv, /slideshow/offers). */
const shortLink = (s: Pick<Screen, 'slug' | 'kind'>, business: number | undefined, main = false) => `${appBase()}${shortLinkPath(s, business, main)}`
const secondsText = (n: number) => (n < 60 ? tn(n, '{n} second', '{n} seconds') : tn(Math.round(n / 60), '{n} minute', '{n} minutes'))
const duration = (n: number) => (n < 60 ? tn(n, '{n} second', '{n} seconds') : t('{m} min {s} s', { m: Math.floor(n / 60), s: n % 60 }))
const menuSlide = (designId: string): Slide => ({ id: crypto.randomUUID(), kind: 'menu', url: null, design_id: designId, title: null, seconds: null, live: false, active: true })
const pictureSlide = (url: string, title: string | null = null): Slide => ({ id: crypto.randomUUID(), kind: 'image', url, design_id: null, title, seconds: null, live: false, active: true })
/** A slide's name in the list: its own, its menu's, the live offers' pictures, or its address. */
const slideName = (sl: Slide, designs: MenuDesign[]) =>
  sl.title || (sl.kind === 'menu' ? designs.find(d => d.id === sl.design_id)?.name : undefined) || (sl.kind === 'offers' ? t('Live offers’ pictures') : null) || sl.url || t('Slide')
/** As display_feed(): the offers whose pictures a live offers' pictures slide plays (with a picture, not ended, not on the screen already). */
const offerPicturesFor = (screenId: string, offers: Offer[]): OfferPicture[] => offers
  .filter(o => o.active && o.image_url && !o.screen_ids.includes(screenId) && ['on', 'coming'].includes(offerState(o)))
  .map(({ id, title, image_url, starts_at, ends_at }) => ({ id, title, image_url: image_url!, starts_at, ends_at }))

/**
 * Screens (admins): the café's TVs and tablets, each playing a slideshow of pictures, videos,
 * YouTube, web pages and the digital menus, with how long each slide shows, how it changes, and
 * music; and picture slideshows, kept simple: pictures and the live offers' pictures. Each has a
 * short link (…/display-menu/cafe-tv, …/slideshow/window), opened once on the screen itself, and a
 * private one; changes reach it within a minute.
 */
export function ScreensPage() {
  const { api, business } = useApp()
  const run = useAction()
  const screens = useAsync('screens', () => api.screens(), [], { refetchInterval: 60_000 })
  const designs = useAsync('menu-designs', () => api.menuDesigns(), [])
  const items = useAsync('menu-items', () => api.menuItems(), [])
  const allergens = useAsync('menu-allergens', () => api.menuAllergens(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const offers = useAsync('offers', () => api.offers(), [])
  // Whether the café's storage is connected: a post's photo is kept there to fill a single display.
  const integ = useAsync('integrations', () => api.integrations(), [])
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState<ScreenKind | null>(null)
  // A single display (one thing at a time), or a slideshow (things taking turns): switched off for now.
  const [mode, setMode] = useState<ScreenMode>('single')
  const single = !FEATURES.screenSlideshows || mode === 'single'
  useTick(30_000)
  const all = screens.data ?? []
  const tvs = all.filter(s => s.kind !== 'slideshow')
  const slideshows = single ? [] : all.filter(s => s.kind === 'slideshow')
  const list = [...tvs, ...slideshows]
  const current = list.find(s => s.id === selected) ?? list[0] ?? null
  const digital = (designs.data ?? []).filter(d => d.format === 'digital')
  // From Menu design → "Show on a screen": put that menu on one (on a single display, on its own).
  const adding = digital.find(d => d.id === params.get('menu')) ?? null
  const addTo = (s: Screen) => run(async () => {
    await api.saveScreen({ ...inputOf(s), slides: single ? show(s.slides, menuSlide(adding!.id)) : [...s.slides, menuSlide(adding!.id)] })
    setParams({})
    setSelected(s.id)
  }, t('{menu} is on {screen}', { menu: adding!.name, screen: s.name }))
  const newWith = () => run(async () => {
    const id = await api.saveScreen({ ...newScreen(t('Menu screen')), slides: [menuSlide(adding!.id)], seconds: 30 })
    setParams({})
    setSelected(id)
  }, t('Added {name}', { name: t('Menu screen') }))
  const buttons = (
    <>
      {!single && <Button variant="outlined" startIcon={<SlideshowIcon />} onClick={() => setCreating('slideshow')}>{t('New picture slideshow')}</Button>}
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating('screen')}>{t('Add screen')}</Button>
    </>
  )
  const editorProps = (s: Screen) => ({ screen: s, main: s.id === tvs[0]?.id, designs: digital, items: items.data ?? [], allergens: allergens.data, brand: brand.data,
    allOffers: offers.data ?? [], offers: (offers.data ?? []).filter(o => o.screen_ids.includes(s.id) && ['on', 'coming'].includes(offerState(o))) })

  return (
    <>
      <PageHeader eyebrow={t('Menu')} title={t('Screens')} actions={buttons} />
      <ScreenModes mode={single ? 'single' : 'slideshow'} onMode={setMode} link={shortLinkPath({ kind: 'screen', slug: '' }, business?.id, true)} />
      <ErrorBox error={screens.error} />
      {adding && (
        <Alert severity="info" sx={{ mb: 2.5 }} onClose={() => setParams({})}>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('Put “{name}” on a screen:', { name: adding.name })}</Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {tvs.map(s => <Button key={s.id} size="small" variant="outlined" onClick={() => addTo(s)}>
              {single ? t('Show on {screen}', { screen: s.name }) : t('Add to {screen}', { screen: s.name })}
            </Button>)}
            <Button size="small" variant="contained" onClick={newWith}>{t('A new screen with it')}</Button>
          </Stack>
        </Alert>
      )}
      {screens.data && !list.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Turn a TV or tablet into a menu board')}</Typography>
          {t('Add a screen, give it pictures, videos, web pages or your digital menu, and open its link once on the screen. Changes reach it within a minute.')}
          <Stack direction="row" sx={{ mt: 2, gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>{buttons}</Stack>
        </Empty>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'flex-start' }}>
          <Stack spacing={2.5} sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
            {tvs.length > 0 && (
              <ScreenGroup title={t('Screens')}>
                {tvs.map((s, i) => <ScreenCard key={s.id} screen={s} main={i === 0} selected={s.id === current?.id} onClick={() => setSelected(s.id)}
                  showing={single ? showingText(s.slides, digital) : undefined} />)}
              </ScreenGroup>
            )}
            {slideshows.length > 0 && (
              <ScreenGroup title={t('Picture slideshows')}>
                {slideshows.map(s => <ScreenCard key={s.id} screen={s} main={false} selected={s.id === current?.id} onClick={() => setSelected(s.id)} />)}
              </ScreenGroup>
            )}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            {current && (single
              ? <SingleDisplayEditor key={current.id} {...editorProps(current)} storage={!!integ.data?.media_storage} />
              : <ScreenEditor key={current.id} {...editorProps(current)} />)}
          </Box>
        </Stack>
      )}
      {creating && <NewScreenDialog kind={creating} kinds={!single} onClose={() => setCreating(null)} onMade={setSelected} />}
    </>
  )
}

type ScreenMode = 'single' | 'slideshow'

/**
 * How the screens show things: one thing at a time, full screen, on the screen's /display-menu link
 * (a single display); or things taking turns (a slideshow), switched off for now.
 */
function ScreenModes({ mode, onMode, link }: { mode: ScreenMode; onMode: (m: ScreenMode) => void; link: string }) {
  const options: { id: ScreenMode; title: string; body: string; icon: ReactNode; note?: string; soon?: boolean }[] = [
    { id: 'single', title: t('Single display'), icon: <TvIcon />, note: link,
      body: t('One thing on the screen at a time, full screen: an Instagram post, a picture or your digital menu.') },
    { id: 'slideshow', title: t('Slideshow'), icon: <SlideshowIcon />, soon: !FEATURES.screenSlideshows,
      body: t('Menus, pictures, videos and pages taking turns, with music.') },
  ]
  return (
    <RadioGroup value={mode} onChange={e => onMode(e.target.value as ScreenMode)} aria-label={t('What the screens show')}
      sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 3 }}>
      {options.map(o => (
        <FormControlLabel key={o.id} value={o.id} disabled={o.soon} control={<Radio size="small" sx={{ mt: -0.5 }} />}
          sx={{ m: 0, p: 1.75, alignItems: 'flex-start', borderRadius: 3, bgcolor: mode === o.id ? tokens.roseWash : 'transparent',
            border: `1px solid ${mode === o.id ? tokens.rose : tokens.line}`, borderStyle: o.soon ? 'dashed' : 'solid' }}
          label={<Box sx={{ pl: 0.5 }}>
            <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap', color: o.soon ? 'text.disabled' : tokens.roseDeep }}>
              {o.icon}
              <Typography sx={{ fontWeight: 600, color: o.soon ? 'text.secondary' : 'text.primary' }}>{o.title}</Typography>
              {o.soon && <Tag>{t('Coming soon')}</Tag>}
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{o.body}</Typography>
            {o.note && <Typography variant="caption" sx={{ display: 'block', color: tokens.roseDeep, fontFamily: 'monospace', mt: 0.5 }}>{o.note}</Typography>}
          </Box>} />
      ))}
    </RadioGroup>
  )
}

function ScreenGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Typography variant="overline" component="h2" sx={{ display: 'block', color: 'text.secondary', mb: 0.75, px: 0.5 }}>{title}</Typography>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  )
}

function Status({ screen }: { screen: Screen }) {
  if (!screen.active) return <Tag>{t('Switched off')}</Tag>
  if (isOnline(screen.last_seen_at)) return <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('On now')}</Tag>
  return <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{screen.last_seen_at ? t('Last seen {when}', { when: ago(screen.last_seen_at) }) : t('Not opened on a screen yet')}</Tag>
}

/** What a single display shows now, in a line: the one that's on, how many take turns, or nothing. */
const showingText = (slides: Slide[], designs: MenuDesign[]) => {
  const on = onNow(slides)
  if (!on.length) return t('Nothing on it')
  return on.length === 1 ? t('Showing {name}', { name: slideName(on[0], designs) }) : t('{n} taking turns', { n: on.length })
}

function ScreenCard({ screen: s, main, selected, onClick, showing }: {
  screen: Screen; main: boolean; selected: boolean; onClick: () => void
  /** A single display's: what it shows now (else how many slides it plays). */
  showing?: string
}) {
  const { business } = useApp()
  const count = s.slides.filter(x => x.active).length
  return (
    <Card variant="outlined" sx={selected ? { borderColor: tokens.rose, boxShadow: `0 0 0 1px ${tokens.rose}`, bgcolor: tokens.roseWash } : undefined}>
      <CardActionArea onClick={onClick} aria-pressed={selected} aria-label={s.name} sx={{ px: 2, py: 1.75, display: 'block' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, color: tokens.inkSoft }}>
            {s.kind === 'slideshow' ? <SlideshowIcon fontSize="small" /> : <TvIcon fontSize="small" />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 600, lineHeight: 1.35 }}>{s.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
              {`${showing ?? (s.kind === 'slideshow' ? tn(count, '{n} picture', '{n} pictures') : tn(count, '{n} slide', '{n} slides'))} · ${s.orientation === 'portrait' ? t('Portrait') : t('Landscape')}`}
            </Typography>
            <Typography variant="caption" noWrap sx={{ color: tokens.roseDeep, display: 'block', fontFamily: 'monospace', fontSize: '0.74rem', mt: 0.25 }}>
              {shortLinkPath(s, business?.id, main)}
            </Typography>
            <Box sx={{ mt: 1 }}><Status screen={s} /></Box>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  )
}

/** A titled part of the editor. */
function Panel({ title, intro, action, label, children }: { title: string; intro?: ReactNode; action?: ReactNode; label?: string; children: ReactNode }) {
  return (
    <Card component="section" aria-label={label ?? title} sx={{ p: { xs: 2, sm: 2.75 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: intro ? 0.5 : 2 }}>
        <Typography variant="h6" component="h3" sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Stack>
      {intro && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.25, maxWidth: 720 }}>{intro}</Typography>}
      {children}
    </Card>
  )
}

interface EditorProps {
  screen: Screen; main: boolean; designs: MenuDesign[]; items: Item[]; allergens: MenuAllergens | null; brand: Brand | null
  /** The offers on this screen that are on now or coming up (Offers & specials). */
  offers: Offer[]
  /** Every offer, for the live offers' pictures. */
  allOffers: Offer[]
}

/** What the preview plays: the screen as it is on the page now, saved or not, with the digital menus as they are. */
function useScreenFeed(s: ScreenInput, screen: Screen, { designs, items, allergens, brand, offers, pictures }:
  Pick<EditorProps, 'designs' | 'items' | 'allergens' | 'brand' | 'offers'> & { pictures: OfferPicture[] }): DisplayFeed {
  const { business, settings } = useApp()
  return useMemo<DisplayFeed>(() => ({
    screen: { ...s, id: screen.id, updated_at: screen.updated_at },
    sections: settings?.menu_sections ?? [],
    business: { name: business?.name ?? '', logo: brand?.logo_mark ?? brand?.logo ?? null, heading_font: brand?.heading_font, body_font: brand?.body_font, colours: brand?.colours },
    menus: Object.fromEntries(designs.map(({ images: _images, ...d }) => [d.id, { design: { ...d, image_url: imageOf({ image_id: d.image_id, images: _images })?.url ?? null }, items }])),
    allergens,
    offers: offers.map(({ id, title, details, price, was_price, image_url, starts_at, ends_at, screen_mode, seconds }): ScreenOffer =>
      ({ id, title, details, price, was_price, image_url, starts_at, ends_at, screen_mode, seconds })),
    offer_pictures: pictures,
  }), [s, screen.id, screen.updated_at, settings?.menu_sections, business?.name, brand, designs, items, allergens, offers, pictures])
}

/** One screen as a slideshow: its link, a live preview of the changes, its slides and how it plays them. */
function ScreenEditor({ screen, main, designs, items, allergens, brand, offers, allOffers }: EditorProps) {
  const { api, business } = useApp()
  const run = useAction()
  const saved = inputOf(screen)
  const [s, setS] = useState<ScreenInput>(saved)
  const [open, setOpen] = useState<string[]>([])
  const [address, setAddress] = useState('')
  const [menu, setMenu] = useState('')
  const [uploading, setUploading] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const slideshow = s.kind === 'slideshow'
  const set = (patch: Partial<ScreenInput>) => setS(x => ({ ...x, ...patch }))
  const setSlide = (id: string, patch: Partial<Slide>) => set({ slides: s.slides.map(x => (x.id === id ? { ...x, ...patch } : x)) })
  const moveSlide = (i: number, by: -1 | 1) => {
    const slides = [...s.slides]
    ;[slides[i], slides[i + by]] = [slides[i + by], slides[i]]
    set({ slides })
  }
  // A slide just added opens, ready to fill in.
  const addSlides = (added: Slide[]) => { setS(x => ({ ...x, slides: [...x.slides, ...added] })); setOpen(o => [...o, ...added.map(a => a.id)]) }
  const pictures = useMemo(() => offerPicturesFor(screen.id, allOffers), [screen.id, allOffers])
  const livePictures = pictures.filter(p => offerState({ ...p, active: true }) === 'on').length
  const feed = useScreenFeed(s, screen, { designs, items, allergens, brand, offers, pictures })

  const addAddress = () => {
    const url = cleanUrl(address)
    if (!url) return
    addSlides([{ id: crypto.randomUUID(), kind: kindOf(url), url, design_id: null, title: null, seconds: null, live: false, active: true }])
    setAddress('')
  }
  // Pictures from this device: kept in the café's storage (Google Drive or OneDrive), then on the screen.
  const upload = (files: File[]) => run(async () => {
    setUploading(files.length)
    try {
      const added: Slide[] = []
      for (const f of files) {
        const { url } = await api.uploadMedia(await readyPhoto(f, false, 1920), 'Posts')
        added.push(pictureSlide(url, f.name.replace(/\.\w+$/, '').slice(0, 120) || null))
      }
      setS(x => ({ ...x, slides: [...x.slides, ...added] }))
    } finally { setUploading(0) }
  })
  const hasOffers = s.slides.some(x => x.kind === 'offers')
  const toggleOffers = (on: boolean) => set({ slides: on ? [offersSlide(), ...s.slides] : s.slides.filter(x => x.kind !== 'offers') })
  const save = () => run(async () => {
    const problem = screenProblem(s)
    if (problem) throw new Error(t(problem))
    await api.saveScreen(s)
  }, t('Saved. The screen shows the changes within a minute.'))

  return (
    <Stack spacing={2.5}>
      <Card component="section" aria-label={t('The screen and its link')} sx={{ p: { xs: 2, sm: 2.75 }, containerType: 'inline-size' }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="overline" sx={{ color: tokens.roseDeep, display: 'block' }}>{slideshow ? t('Picture slideshow') : t('Screen')}</Typography>
            <Typography variant="h5" component="h2" sx={{ mb: 0.75 }}>{s.name || screen.name}</Typography>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Status screen={screen} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Once round: {time}', { time: duration(loopSeconds(s)) })}</Typography>
            </Stack>
          </Box>
          <Button variant="outlined" startIcon={<OpenIcon />} component="a" href={s.own_url || shortLink(screen, business?.id, main)} target="_blank" rel="noopener">
            {slideshow ? t('Open the slideshow') : t('Open the screen')}
          </Button>
        </Stack>
        <LinkPanel screen={screen} main={main} slug={s.slug} onSlug={slug => set({ slug })} own={s.own_url ?? null} onOwn={own_url => set({ own_url })}
          preview={<Preview s={s} feed={feed} note={t('A silent preview of the changes below, as the screen will play them.')} />} />
      </Card>

      <input ref={file} type="file" accept="image/*" multiple hidden aria-label={t('Pictures from this device')}
        onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void upload(files) }} />

      {slideshow ? (
        <Panel title={t('Pictures')}
          intro={t('Played in this order. Add pictures from this device or paste a picture’s address. The live offers’ pictures come and go with the offers by themselves.')}
          action={<FormControlLabel sx={{ mr: 0 }} control={<Switch checked={hasOffers} onChange={e => toggleOffers(e.target.checked)} />} label={t('Live offers’ pictures')} />}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(168px, 1fr))' } }}>
            {s.slides.map((sl, i) => (
              <PictureTile key={sl.id} slide={sl} index={i} count={s.slides.length} portrait={s.orientation === 'portrait'} designs={designs} live={livePictures}
                onChange={patch => setSlide(sl.id, patch)} onMove={by => moveSlide(i, by)} onRemove={() => set({ slides: s.slides.filter(x => x.id !== sl.id) })} />
            ))}
            <Box component="button" type="button" onClick={() => file.current?.click()} disabled={uploading > 0}
              sx={{ minHeight: 150, border: `1.5px dashed ${tokens.lineStrong}`, borderRadius: 3, bgcolor: 'transparent', color: tokens.roseDeep, cursor: 'pointer',
                display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 0.75, font: 'inherit', fontWeight: 500, p: 2,
                '&:hover': { bgcolor: tokens.roseSoft, borderColor: tokens.roseDeep }, '&:disabled': { opacity: 0.6, cursor: 'progress' } }}>
              <UploadIcon />
              {uploading ? tn(uploading, 'Adding {n} picture…', 'Adding {n} pictures…') : t('Add pictures')}
            </Box>
          </Box>
          <Box sx={{ mt: 2 }}><AddressBar address={address} onAddress={setAddress} onAdd={addAddress} label={t('Add picture')} /></Box>
        </Panel>
      ) : (
        <Panel title={t('Slides')} intro={t('Played in this order. Paste the address of a picture, a video (MP4), YouTube, Vimeo, an Instagram post or any web page.')}
          action={<Typography variant="body2" sx={{ color: 'text.secondary' }}>{tn(s.slides.length, '{n} slide', '{n} slides')}</Typography>}>
          <Stack spacing={1.25}>
            {s.slides.map((sl, i) => (
              <SlideRow key={sl.id} slide={sl} index={i} count={s.slides.length} screenSeconds={s.seconds} designs={designs} live={livePictures}
                open={open.includes(sl.id)} onToggle={() => setOpen(o => (o.includes(sl.id) ? o.filter(x => x !== sl.id) : [...o, sl.id]))}
                onChange={patch => setSlide(sl.id, patch)} onMove={by => moveSlide(i, by)} onRemove={() => set({ slides: s.slides.filter(x => x.id !== sl.id) })} />
            ))}
            {!s.slides.length && <Empty>{t('No slides yet.')}</Empty>}
          </Stack>
          <Box sx={{ mt: 2.5, p: { xs: 1.5, sm: 2 }, borderRadius: 3, bgcolor: tokens.surfaceAlt }}>
            <Typography variant="subtitle2" component="h4" sx={{ mb: 1.25 }}>{t('Add a slide')}</Typography>
            <AddressBar address={address} onAddress={setAddress} onAdd={addAddress} />
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1.5, alignItems: 'center' }}>
              <Button variant="outlined" size="small" startIcon={<UploadIcon />} disabled={uploading > 0} onClick={() => file.current?.click()}>
                {uploading ? tn(uploading, 'Adding {n} picture…', 'Adding {n} pictures…') : t('Pictures from this device')}
              </Button>
              <Button variant="outlined" size="small" startIcon={<OfferIcon />} disabled={hasOffers} onClick={() => addSlides([offersSlide()])}>{t('Live offers’ pictures')}</Button>
              {designs.length ? (
                <Stack direction="row" sx={{ gap: 1, flex: '1 1 260px', minWidth: 0 }}>
                  <TextField select size="small" sx={{ flex: 1, bgcolor: tokens.surface, borderRadius: 3 }} label={t('A digital menu')} value={menu} onChange={e => setMenu(e.target.value)}>
                    {designs.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                  </TextField>
                  <Button variant="outlined" size="small" startIcon={<MenuIcon />} disabled={!menu} onClick={() => { addSlides([menuSlide(menu)]); setMenu('') }}>{t('Add the menu')}</Button>
                </Stack>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('Your digital menus can play here too.')} <Button size="small" component={RouterLink} to="/menu/design?format=digital">{t('Make one on Menu design')}</Button>
                </Typography>
              )}
            </Stack>
          </Box>
        </Panel>
      )}

      {(!slideshow || offers.length > 0) && <OffersPanel screen={screen} offers={offers} />}

      <Panel title={t('How it plays')}>
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField select label={slideshow ? t('Each picture shows for') : t('Each slide shows for')} value={s.seconds} onChange={e => set({ seconds: Number(e.target.value) })}
              helperText={slideshow ? t('Unless a picture says otherwise.') : t('Unless a slide says otherwise.')}>
              {[...new Set([...SECONDS_CHOICES, s.seconds])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={n}>{secondsText(n)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Change effect')} value={s.transition} onChange={e => set({ transition: e.target.value as ScreenInput['transition'] })}>
              {TRANSITIONS.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
            </TextField>
          </Box>
          {s.transition !== 'none' && (
            <Box sx={{ px: 1 }}>
              <Typography variant="body2" id="speed-label">{t('Change speed: {s} s', { s: (s.transition_ms / 1000).toFixed(1) })}</Typography>
              <Slider aria-labelledby="speed-label" value={s.transition_ms} min={200} max={3000} step={100} onChange={(_, v) => set({ transition_ms: v as number })}
                marks={[{ value: 200, label: t('Quick') }, { value: 3000, label: t('Slow') }]} />
            </Box>
          )}
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Box>
              <Typography variant="subtitle2" component="h4" sx={{ mb: 0.5 }}>{t('Pictures and videos')}</Typography>
              <RadioGroup value={s.fit} onChange={e => set({ fit: e.target.value as ScreenInput['fit'] })}>
                <FormControlLabel value="cover" control={<Radio size="small" />} label={t('Fill the screen (edges may be cut)')} />
                <FormControlLabel value="contain" control={<Radio size="small" />} label={t('Show all of it (with borders)')} />
              </RadioGroup>
              <FormControlLabel control={<Switch checked={s.shuffle} onChange={e => set({ shuffle: e.target.checked })} />} label={t('Shuffle the order')} />
            </Box>
            <Box>
              <Typography variant="subtitle2" component="h4" id="orientation-label" sx={{ mb: 1 }}>{t('The screen is')}</Typography>
              <ToggleButtonGroup exclusive size="small" value={s.orientation} onChange={(_, v: ScreenInput['orientation'] | null) => v && set({ orientation: v })}
                aria-label={t('Orientation')}>
                <ToggleButton value="landscape" sx={{ px: 2 }}>{t('Landscape')}</ToggleButton>
                <ToggleButton value="portrait" sx={{ px: 2 }}>{t('Portrait')}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
        </Stack>
      </Panel>

      {!slideshow && <MusicExtras s={s} set={set} />}

      <NameOnOff s={s} set={set} screen={screen} />

      {dirty && <UnsavedBar onUndo={() => setS(saved)} onSave={save} />}
    </Stack>
  )
}

/** The offers from Offers & specials on this screen, on now or coming up, and making a new one for it. */
function OffersPanel({ screen, offers }: { screen: Screen; offers: Offer[] }) {
  return (
    <Panel title={t('Offers on this screen')}
      action={<Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<InstagramIcon />} component={RouterLink} to={`/offers?from=instagram&screen=${screen.id}`}>{t('From Instagram')}</Button>
        <Button size="small" startIcon={<OfferIcon />} component={RouterLink} to={`/offers?new=1&screen=${screen.id}`}>{t('New offer')}</Button>
      </Stack>}
      intro={offers.length ? t('Each shows from the minute it starts to the minute it ends, then comes off by itself.')
        : t('None coming up. An offer or a special from Offers & specials shows here for its time, then comes off by itself.')}>
      <Stack spacing={1}>
        {offers.map(o => (
          <Stack key={o.id} direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 1.5, py: 1.25, borderRadius: 2.5, border: `1px solid ${tokens.line}` }}>
            <OfferIcon fontSize="small" sx={{ color: tokens.inkSoft }} />
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography sx={{ fontWeight: 500, lineHeight: 1.4 }}>{o.title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {`${offerWhenText(o)} · ${o.screen_mode === 'only' ? t('on its own') : t('in turn, {time} each time', { time: secondsText(o.seconds) })}`}
              </Typography>
            </Box>
            {offerState(o) === 'on' ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Showing now')}</Tag> : <Tag>{t('Coming up')}</Tag>}
          </Stack>
        ))}
      </Stack>
      {offers.length > 0 && <Button size="small" component={RouterLink} to="/offers" sx={{ mt: 1.25 }}>{t('Change them on Offers & specials')}</Button>}
    </Panel>
  )
}

type SetScreen = (patch: Partial<ScreenInput>) => void

/** The screen's music, and the clock and running line on top. */
function MusicExtras({ s, set }: { s: ScreenInput; set: SetScreen }) {
  return (
    <Panel title={t('Music and extras')}>
      <Stack spacing={2.5}>
        <Box>
          <TextField fullWidth size="small" label={t('Music address (optional)')} placeholder={t('An MP3, a radio stream, or a YouTube video or playlist')} value={s.music_url ?? ''}
            onChange={e => set({ music_url: e.target.value.trim() ? (cleanUrl(e.target.value) ?? null) : null })}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><MusicIcon fontSize="small" /></InputAdornment> } }} />
          {s.music_url && (
            <Box sx={{ px: 1, mt: 1.5 }}>
              <Typography variant="body2" id="volume-label">{t('Volume: {n}%', { n: s.music_volume })}</Typography>
              <Slider aria-labelledby="volume-label" value={s.music_volume} min={0} max={100} step={5} onChange={(_, v) => set({ music_volume: v as number })} />
            </Box>
          )}
          <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={s.video_sound} onChange={e => set({ video_sound: e.target.checked })} />}
            label={t('Videos play their own sound (the music pauses for them)')} />
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            {currentCountry() === 'IE' ? t('Playing music in the café needs the usual licences (IMRO and PPI in Ireland): see Licences & renewals.')
              : t('Playing music in the café needs the usual licences (SGAE and AGEDI/AIE in Spain): see Licences & renewals.')}
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" component="h4" sx={{ mb: 0.5 }}>{t('On top')}</Typography>
          <FormControlLabel control={<Switch checked={s.show_clock} onChange={e => set({ show_clock: e.target.checked })} />} label={t('The time, in a corner')} />
          <TextField fullWidth size="small" label={t('A line running along the bottom (optional)')} placeholder={t('e.g. Today’s special: pumpkin spice latte · Free Wi-Fi: ask at the counter')}
            value={s.ticker ?? ''} onChange={e => set({ ticker: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 280 } }} sx={{ mt: 1.25 }} />
        </Box>
      </Stack>
    </Panel>
  )
}

/** The screen's name, whether it's playing, and deleting it (straight away, once sure). */
function NameOnOff({ s, set, screen }: { s: ScreenInput; set: SetScreen; screen: Screen }) {
  const { api } = useApp()
  const run = useAction()
  const [deleting, setDeleting] = useState(false)
  const remove = () => run(() => api.deleteScreen(screen.id), t('Deleted {name}', { name: screen.name }))
  return (
    <Panel title={t('Name, on or off')}>
      <Stack spacing={2}>
        <TextField fullWidth label={t('Name')} value={s.name} onChange={e => set({ name: e.target.value })} slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ maxWidth: 480 }} />
        <FormControlLabel control={<Switch checked={s.active} onChange={e => set({ active: e.target.checked })} />}
          label={s.active ? t('Playing') : t('Switched off: the screen shows your name and logo')} />
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', pt: 1, borderTop: `1px solid ${tokens.line}` }}>
          {deleting ? <>
            <Typography variant="body2" sx={{ mr: 1 }}>{t('Delete {name}? Its link stops working.', { name: screen.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </> : <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{s.kind === 'slideshow' ? t('Delete slideshow') : t('Delete screen')}</Button>}
        </Stack>
      </Stack>
    </Panel>
  )
}

/** The changes stay on the page until saved: the bar follows down the page while there are some. */
function UnsavedBar({ onUndo, onSave }: { onUndo: () => void; onSave: () => void }) {
  return (
    <Card role="region" aria-label={t('Unsaved changes')} sx={{ position: 'sticky', bottom: { xs: 82, md: 20 }, zIndex: 2, px: 2, py: 1.5,
      display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderColor: tokens.rose, boxShadow: `0 16px 40px -16px ${tokens.shadow}` }}>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 140, fontWeight: 500 }}>{t('Unsaved changes')}</Typography>
      <Button onClick={onUndo}>{t('Undo changes')}</Button>
      <Button variant="contained" onClick={onSave}>{t('Save changes')}</Button>
    </Card>
  )
}

/** The screen as it plays, small and silent, in its shape. */
function Preview({ s, feed, note }: { s: Pick<ScreenInput, 'orientation'>; feed: DisplayFeed; note: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, borderRadius: 3, p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ width: '100%', maxWidth: s.orientation === 'portrait' ? 200 : 520 }}>
        <Box role="region" aria-label={t('Preview of the screen')} sx={{ position: 'relative', aspectRatio: s.orientation === 'portrait' ? '9 / 16' : '16 / 9',
          borderRadius: '10px', overflow: 'hidden', border: '6px solid #111', bgcolor: '#000' }}>
          <ScreenPlayer feed={feed} preview />
        </Box>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mt: 1 }}>{note}</Typography>
      </Box>
    </Box>
  )
}

/**
 * A single display: one thing on the screen at a time, full screen. The latest Instagram posts to
 * tap; a digital menu, a picture or an address; and everything it has shown, each with its switch:
 * switched on, it's back on the screen and the one that was on goes off. Those are saved straight
 * away; the screen's settings below them wait for Save.
 */
function SingleDisplayEditor({ screen, main, designs, items, allergens, brand, offers, allOffers, storage }: EditorProps & {
  /** The café's storage is connected: a post's photo is kept there, and fills the screen. */
  storage: boolean
}) {
  const { api, business } = useApp()
  const run = useAction()
  const saved = inputOf(screen)
  // The settings until they're saved. What it shows is saved as it's picked, and shown straight
  // away (`pending`) until the save is back.
  const [draft, setDraft] = useState<ScreenInput>(saved)
  const [pending, setPending] = useState<Slide[] | null>(null)
  const turn = useRef(0)
  const [menu, setMenu] = useState('')
  const [address, setAddress] = useState('')
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const slides = pending ?? screen.slides
  const s: ScreenInput = { ...draft, slides }
  const set: SetScreen = patch => setDraft(x => ({ ...x, ...patch }))
  const dirty = JSON.stringify({ ...draft, slides: null }) !== JSON.stringify({ ...saved, slides: null })
  const pictures = useMemo(() => offerPicturesFor(screen.id, allOffers), [screen.id, allOffers])
  const feed = useScreenFeed(s, screen, { designs, items, allergens, brand, offers, pictures })
  const on = onNow(slides)
  const nameOf = (sl: Slide) => slideName(sl, designs)
  const goesOn = (name: string) => t('{name} goes on {screen} within a minute', { name, screen: screen.name })

  /** What it shows, saved straight away, with the screen's saved settings (not the ones still being changed). */
  const put = async (change: (now: Slide[]) => Slide[] | Promise<Slide[]>, success: string) => {
    const n = ++turn.current
    await run(async () => {
      const next = await change(slides)
      const problem = screenProblem({ ...saved, slides: next })
      if (problem) throw new Error(t(problem))
      setPending(next)
      await api.saveScreen({ ...saved, slides: next })
    }, success, { fresh: true })
    if (turn.current === n) setPending(null)
  }
  const toggle = (sl: Slide, turnOn: boolean) => void put(now => (turnOn ? showOnly(now, sl.id) : now.map(x => (x.id === sl.id ? { ...x, active: false } : x))),
    turnOn ? goesOn(nameOf(sl)) : t('Saved. The screen shows the changes within a minute.'))
  const remove = (sl: Slide) => void put(now => now.filter(x => x.id !== sl.id), t('{name}: off the list', { name: nameOf(sl) }))
  // A post's photo is kept in the café's storage (Instagram's own link runs out), else the post itself shows.
  const showPost = (p: SourcePost) => put(async now => {
    const slide = fromPost(now, p) ?? postSlide(p, storage && p.image_url && !p.video ? await api.keepPostPhoto(p.image_url) : null)
    if (!slide) throw new Error(t('This post can’t go on a screen'))
    return show(now, slide)
  }, goesOn(postTitle(p.caption) ?? t('Instagram post')))
  const showMenu = () => {
    const d = designs.find(x => x.id === menu)
    if (!d) return
    setMenu('')
    void put(now => show(now, menuSlide(d.id)), goesOn(d.name))
  }
  const showAddress = () => {
    const url = cleanUrl(address)
    if (!url) return
    setAddress('')
    void put(now => show(now, { id: crypto.randomUUID(), kind: kindOf(url), url, design_id: null, title: null, seconds: null, live: false, active: true }), goesOn(url))
  }
  // A picture from this device: kept in the café's storage (Google Drive or OneDrive), then on the screen.
  const showPicture = async (f: File) => {
    const title = f.name.replace(/\.\w+$/, '').slice(0, 120) || null
    setUploading(true)
    try {
      await put(async now => {
        const { url } = await api.uploadMedia(await readyPhoto(f, false, 1920), 'Posts')
        return show(now, pictureSlide(url, title))
      }, goesOn(title ?? t('The picture')))
    } finally { setUploading(false) }
  }
  const save = () => run(async () => {
    const problem = screenProblem(s)
    if (problem) throw new Error(t(problem))
    await api.saveScreen({ ...draft, slides: screen.slides })
  }, t('Saved. The screen shows the changes within a minute.'))

  return (
    <Stack spacing={2.5}>
      <Card component="section" aria-label={t('The screen and its link')} sx={{ p: { xs: 2, sm: 2.75 }, containerType: 'inline-size' }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="overline" sx={{ color: tokens.roseDeep, display: 'block' }}>{t('Single display')}</Typography>
            <Typography variant="h5" component="h2" sx={{ mb: 0.75 }}>{draft.name || screen.name}</Typography>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Status screen={screen} />
              <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{showingText(slides, designs)}</Typography>
            </Stack>
          </Box>
          <Button variant="outlined" startIcon={<OpenIcon />} component="a" href={draft.own_url || shortLink(screen, business?.id, main)} target="_blank" rel="noopener">{t('Open the screen')}</Button>
        </Stack>
        <LinkPanel screen={screen} main={main} slug={draft.slug} onSlug={slug => set({ slug })} own={draft.own_url ?? null} onOwn={own_url => set({ own_url })}
          preview={<Preview s={s} feed={feed} note={t('A silent preview of what the screen shows.')} />} />
      </Card>

      <InstagramPosts slides={slides} storage={storage} onPick={showPost} />

      <Panel title={t('Or show something else')}>
        <Stack spacing={2}>
          {designs.length ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
              <TextField select size="small" sx={{ flex: 1 }} label={t('A digital menu')} value={menu} onChange={e => setMenu(e.target.value)}>
                {designs.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </TextField>
              <Button variant="outlined" startIcon={<MenuIcon />} disabled={!menu} onClick={showMenu} sx={{ alignSelf: { sm: 'flex-start' }, flexShrink: 0 }}>{t('Show the menu')}</Button>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Your digital menus can play here too.')} <Button size="small" component={RouterLink} to="/menu/design?format=digital">{t('Make one on Menu design')}</Button>
            </Typography>
          )}
          <AddressBar address={address} onAddress={setAddress} onAdd={showAddress} label={t('Show it')} />
          <Box>
            <Button variant="outlined" size="small" startIcon={<UploadIcon />} disabled={uploading} onClick={() => file.current?.click()}>
              {uploading ? t('Adding the picture…') : t('A picture from this device')}
            </Button>
          </Box>
        </Stack>
        <input ref={file} type="file" accept="image/*" hidden aria-label={t('Pictures from this device')}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void showPicture(f) }} />
      </Panel>

      <Panel title={t('Shown before')} intro={t('Everything this screen has shown, newest first. Switch one on to put it back on the screen: the one that was on goes off.')}>
        {on.length > 1 && <Alert severity="info" sx={{ mb: 1.5 }}>{t('{n} are on, so they take turns. Choose “Show only this” on the one to keep.', { n: on.length })}</Alert>}
        <Stack spacing={1}>
          {slides.map(sl => (
            <HistoryRow key={sl.id} slide={sl} name={nameOf(sl)} designs={designs} alone={on.length < 2}
              onToggle={v => toggle(sl, v)} onOnly={() => toggle(sl, true)} onRemove={() => remove(sl)} />
          ))}
          {!slides.length && <Empty>{t('Nothing shown yet: tap one of your Instagram posts above.')}</Empty>}
        </Stack>
      </Panel>

      <OffersPanel screen={screen} offers={offers} />

      <Panel title={t('How it shows')}>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <Box>
            <Typography variant="subtitle2" component="h4" sx={{ mb: 1 }}>{t('The screen is')}</Typography>
            <ToggleButtonGroup exclusive size="small" value={s.orientation} onChange={(_, v: ScreenInput['orientation'] | null) => v && set({ orientation: v })}
              aria-label={t('Orientation')}>
              <ToggleButton value="landscape" sx={{ px: 2 }}>{t('Landscape')}</ToggleButton>
              <ToggleButton value="portrait" sx={{ px: 2 }}>{t('Portrait')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography variant="subtitle2" component="h4" sx={{ mb: 0.5 }}>{t('Pictures and videos')}</Typography>
            <RadioGroup value={s.fit} onChange={e => set({ fit: e.target.value as ScreenInput['fit'] })}>
              <FormControlLabel value="cover" control={<Radio size="small" />} label={t('Fill the screen (edges may be cut)')} />
              <FormControlLabel value="contain" control={<Radio size="small" />} label={t('Show all of it (with borders)')} />
            </RadioGroup>
          </Box>
        </Box>
      </Panel>

      <MusicExtras s={s} set={set} />

      <NameOnOff s={s} set={set} screen={screen} />

      {dirty && <UnsavedBar onUndo={() => setDraft(saved)} onSave={save} />}
    </Stack>
  )
}

/**
 * The business's latest posts on Instagram (its Facebook Page's while Instagram isn't connected),
 * newest first: one tap puts one on the screen.
 */
function InstagramPosts({ slides, storage, onPick }: { slides: Slide[]; storage: boolean; onPick: (p: SourcePost) => Promise<void> }) {
  const { api } = useApp()
  const read = useAsync('latest-posts', () => api.latestPosts(12), [])
  const [busy, setBusy] = useState<string | null>(null)
  const posts = read.data?.posts ?? []
  const pick = async (p: SourcePost) => {
    setBusy(p.id)
    try { await onPick(p) } finally { setBusy(null) }
  }
  return (
    <Panel title={t('Show an Instagram post')}
      intro={read.data?.source === 'facebook' ? t('Instagram isn’t connected, so these are your Facebook Page’s latest posts. Tap one to put it on the screen.')
        : t('Your latest posts. Tap one to put it on the screen.')}>
      {read.error && (
        <Alert severity="info" action={<Button color="inherit" size="small" component={RouterLink} to="/connections">{t('Connections')}</Button>}>{read.error}</Alert>
      )}
      {!read.data && !read.error && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Loading your latest posts…')}</Typography>}
      {read.data && !posts.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No posts yet.')}</Typography>}
      {posts.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 112px), 1fr))' }}>
          {posts.map(p => {
            const on = !!fromPost(slides, p)?.active
            const name = postTitle(p.caption) ?? t('Instagram post')
            return (
              <Box key={p.id} component="button" type="button" disabled={!!busy} onClick={() => void pick(p)} aria-pressed={on}
                aria-label={t('Show {name} on the screen', { name })} title={p.caption ?? undefined}
                sx={{ position: 'relative', aspectRatio: '1 / 1', p: 0, m: 0, borderRadius: 2.5, overflow: 'hidden', cursor: 'pointer', font: 'inherit',
                  bgcolor: tokens.surfaceAlt, color: tokens.inkSoft, display: 'grid', placeItems: 'center',
                  border: on ? `2px solid ${tokens.rose}` : `1px solid ${tokens.line}`, boxShadow: on ? `0 0 0 2px ${tokens.roseWash}` : 'none',
                  '&:hover img': { transform: 'scale(1.04)' }, '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 2 },
                  '&:disabled': { cursor: busy === p.id ? 'progress' : 'default', opacity: busy === p.id ? 1 : 0.7 } }}>
                {p.image_url
                  ? <Box component="img" src={p.image_url} alt="" loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .2s' }} />
                  : <InstagramIcon />}
                {p.video && <PlayIcon aria-hidden sx={{ position: 'absolute', top: 6, right: 6, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' }} />}
                <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, px: 1, pt: 2, pb: 0.6, textAlign: 'left', fontSize: '0.72rem', fontWeight: 600,
                  color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.7))' }}>
                  {busy === p.id ? t('Bringing it in…') : on ? t('On the screen') : formatLocal(p.posted_at, 'd MMM')}
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
      {posts.length > 0 && !storage && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
          {t('Until Google Drive or OneDrive is connected, the screen shows the post as it is on Instagram. Once one is, the photo fills the screen.')}{' '}
          <Button size="small" component={RouterLink} to="/connections" sx={{ verticalAlign: 'baseline' }}>{t('Connections')}</Button>
        </Typography>
      )}
    </Panel>
  )
}

/** Something the single display has shown: its switch puts it back on the screen (the one that was on goes off). */
function HistoryRow({ slide: sl, name, designs, alone, onToggle, onOnly, onRemove }: {
  slide: Slide; name: string; designs: MenuDesign[]
  /** It's the only one on, or none is: no need to ask for only this one. */
  alone: boolean
  onToggle: (on: boolean) => void; onOnly: () => void; onRemove: () => void
}) {
  const gone = sl.kind === 'menu' && !designs.some(d => d.id === sl.design_id)
  return (
    <Box component="article" aria-label={name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' }, p: 1.25, pl: 1.5,
      borderRadius: 3, border: `1px solid ${sl.active ? tokens.rose : tokens.line}`, bgcolor: sl.active ? tokens.roseWash : tokens.surface, transition: 'background-color .2s, border-color .2s' }}>
      <Thumb slide={sl} width={80} height={46} />
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
        <Typography noWrap title={name} sx={{ fontWeight: 500, lineHeight: 1.4 }}>{sl.url?.startsWith('data:') && !sl.title ? t('A drawn picture') : name}</Typography>
        <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
          <Tag>{sl.post ? t('Instagram post') : tc('slide', kindLabel(sl.kind))}</Tag>
          {sl.active && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('On the screen')}</Tag>}
          {gone && <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('That menu was deleted')}</Tag>}
        </Stack>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
        {sl.active && !alone && <Button size="small" onClick={onOnly}>{t('Show only this')}</Button>}
        <Switch checked={sl.active} onChange={e => onToggle(e.target.checked)} slotProps={{ input: { 'aria-label': t('Show {name}', { name }) } }} />
        <Tooltip title={sl.active ? t('Switch it off first') : t('Remove {name}', { name })}>
          <span><IconButton size="small" aria-label={t('Remove {name}', { name })} disabled={sl.active} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton></span>
        </Tooltip>
      </Stack>
    </Box>
  )
}

/**
 * The screen's short link (with its QR code, to open it on a tablet) and its link name; under it, how
 * to open it on the screen beside the preview, and the private link.
 */
function LinkPanel({ screen, main, slug, onSlug, own, onOwn, preview }: {
  screen: Screen; main: boolean; slug: string; onSlug: (slug: string) => void
  /** Its own address on the business's website, and when it's changed (saved straight away). */
  own: string | null; onOwn: (url: string | null) => void
  preview: ReactNode
}) {
  const { api, business } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [renaming, setRenaming] = useState(false)
  const [privateOpen, setPrivateOpen] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [owning, setOwning] = useState(false)
  const link = shortLink(screen, business?.id, main)
  const named = shortLink(screen, business?.id)
  // With its own address (a page on the business's website), that is the screen's link; Business Agent's still works.
  const shown = own ?? link
  const secret = screenLink(screen.token)
  const qr = useMemo(() => { try { return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(shown, { dark: '#2B2522', light: '#FFFFFF' }))}` } catch { return null } }, [shown])
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => notify(t('Link copied'), 'success'), () => notify(text, 'info'))
  const relink = () => run(async () => { await api.newScreenLink(screen.id); setRelinking(false) }, t('New link made. Open it on the screen: the old one no longer works.'))
  const mono = { fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.5 }
  return (
    <>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Several lines when it's long, so the whole link shows. */}
          <TextField fullWidth multiline maxRows={3} label={t('The screen’s link')} value={shown}
            slotProps={{ htmlInput: { readOnly: true, style: mono },
              input: { endAdornment: <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1.25 }}>
                <Tooltip title={t('Copy link')}><IconButton size="small" aria-label={t('Copy link')} onClick={() => copy(shown)}><CopyIcon fontSize="small" /></IconButton></Tooltip>
                {own
                  ? <Tooltip title={t('Change your own address')}><IconButton size="small" aria-label={t('Change your own address')} onClick={() => setOwning(true)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  : <Tooltip title={t('Change the link name')}><IconButton size="small" aria-label={t('Change the link name')} onClick={() => setRenaming(true)}><EditIcon fontSize="small" /></IconButton></Tooltip>}
              </InputAdornment> } }} />
          {own ? (
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {t('Your website shows it. It also opens at {link}.', { link: link.replace(/^https?:\/\//, '') })}
              </Typography>
              <Button size="small" onClick={() => setRenaming(true)}>{t('Change the link name')}</Button>
            </Stack>
          ) : (
            <>
              {main && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.75, overflowWrap: 'anywhere' }}>
                  {t('Your first screen opens at the short address. It also opens at {link}.', { link: named.replace(/^https?:\/\//, '') })}
                </Typography>
              )}
              <Button size="small" startIcon={<WebIcon />} onClick={() => setOwning(true)} sx={{ mt: 0.75, ml: -1 }}>{t('Use your own website’s address')}</Button>
            </>
          )}
        </Box>
        {qr && <Box component="img" src={qr} alt={t('QR code for the screen’s link')} sx={{ width: 88, height: 88, flexShrink: 0, borderRadius: 2, border: `1px solid ${tokens.line}`, bgcolor: '#fff', p: 0.5, display: { xs: 'none', sm: 'block' } }} />}
      </Stack>
      <Box sx={{ display: 'grid', gap: 2.5, mt: 2.5, gridTemplateColumns: '1fr', alignItems: 'start',
        '@container (min-width: 560px)': { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box>
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, color: 'text.secondary', typography: 'body2' }}>
            <li>{t('On the TV or tablet, open its web browser (a smart TV, Fire TV, Chromecast or an old tablet all work).')}</li>
            <li>{t('Type the link, or scan the code with the tablet’s camera.')}</li>
            <li>{t('Tap once to go full screen. It checks for changes every minute and keeps playing if the internet drops.')}</li>
          </Box>
          <Button size="small" startIcon={<LockIcon />} onClick={() => setPrivateOpen(o => !o)} aria-expanded={privateOpen} sx={{ mt: 1.5, ml: -1 }}>
            {privateOpen ? t('Hide the private link') : t('A private link instead')}
          </Button>
          <Collapse in={privateOpen} unmountOnExit>
            <Box sx={{ mt: 1, p: 1.5, borderRadius: 2.5, border: `1px solid ${tokens.line}` }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                {t('A link nobody can guess, for a screen that isn’t for everyone. It works alongside the short one.')}
              </Typography>
              <TextField fullWidth multiline maxRows={3} label={t('The screen’s private link')} value={secret}
                slotProps={{ htmlInput: { readOnly: true, style: { ...mono, fontSize: '0.8rem' } },
                  input: { endAdornment: <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1.25 }}>
                    <Tooltip title={t('Copy link')}><IconButton size="small" aria-label={t('Copy the private link')} onClick={() => copy(secret)}><CopyIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={t('New link')}><IconButton size="small" aria-label={t('New link')} onClick={() => setRelinking(true)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                  </InputAdornment> } }} />
            </Box>
          </Collapse>
        </Box>
        {preview}
      </Box>
      {renaming && <LinkNameDialog screen={screen} slug={slug} onClose={() => setRenaming(false)} onSaved={x => { onSlug(x); setRenaming(false) }} />}
      {owning && <OwnAddressDialog screen={screen} link={link} own={own} onClose={() => setOwning(false)} onSaved={x => { onOwn(x); setOwning(false) }} />}
      {relinking && (
        <Dialog open onClose={() => setRelinking(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('Make a new link?')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('The old link stops working straight away, so the screen goes blank until the new one is opened on it. Do this if the link was shared by mistake.')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRelinking(false)}>{t('Cancel')}</Button>
            <Button variant="contained" color="error" onClick={relink}>{t('Make a new link')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}

/**
 * Its own address, saved straight away: a page on the business's own website for the TV (Easy Beans' TV
 * opens easybeanscoffee.com/display-menu), and the code that makes that page show the screen, so what's
 * picked here reaches it within a minute. The code frames Business Agent's link (`link`), never the page itself.
 */
function OwnAddressDialog({ screen, link, own, onClose, onSaved }: { screen: Screen; link: string; own: string | null; onClose: () => void; onSaved: (url: string | null) => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [typed, setTyped] = useState(own ?? '')
  const url = cleanUrl(typed)
  const ok = !!url && OWN_URL.test(url)
  const code = embedCode(link)
  const copy = () => navigator.clipboard.writeText(code).then(() => notify(t('Code copied'), 'success'), () => notify(code, 'info'))
  const save = async (value: string | null) => {
    const done = await run(() => api.saveScreen({ ...inputOf(screen), own_url: value }),
      value ? t('Saved. Your page shows the screen once the code is on it.') : t('Your own address is off this screen'))
    if (done) onSaved(value)
  }
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('Your own website’s address')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('A page on your own website for the TV, such as yoursite.com/display-menu. With the code below on it, that page shows this screen, and what you change here reaches it within a minute.')}
          </Typography>
          <TextField autoFocus label={t('Your page’s address')} placeholder={'https://www.yoursite.com/display-menu'} value={typed} onChange={e => setTyped(e.target.value)}
            error={!!typed.trim() && !ok} onKeyDown={e => { if (e.key === 'Enter' && ok && url !== own) void save(url) }}
            helperText={typed.trim() && !ok ? t('Your own address should start with https://') : ' '} />
          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.75 }}>{t('Put this on that page')}</Typography>
            <Box component="pre" aria-label={t('The code for your page')} sx={{ m: 0, p: 1.5, borderRadius: 2, bgcolor: tokens.surfaceAlt, fontFamily: 'monospace',
              fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{code}</Box>
            <Button size="small" startIcon={<CopyIcon />} onClick={() => void copy()} sx={{ mt: 0.75, ml: -0.5 }}>{t('Copy the code')}</Button>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {t('Whoever looks after your website can add it; the page needs nothing else. The screen fills it, and stands upright on a TV hung on its side.')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {own && <Button color="error" onClick={() => void save(null)} sx={{ mr: 'auto' }}>{t('Take it off')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ok || url === own} onClick={() => void save(url)}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The name at the end of the short link: saved straight away (the TV needs the new link opened on it). */
function LinkNameDialog({ screen, slug, onClose, onSaved }: { screen: Screen; slug: string; onClose: () => void; onSaved: (slug: string) => void }) {
  const { api, business } = useApp()
  const run = useAction()
  const [typed, setTyped] = useState(slug)
  const value = typed.trim().toLowerCase()
  const ok = LINK_NAME.test(value)
  const prefix = shortLinkPath({ kind: screen.kind, slug: '' }, business?.id)
  const save = async () => {
    const done = await run(() => api.saveScreen({ ...inputOf(screen), slug: value }), t('Saved. Open the new link on the screen: the old short link no longer works.'))
    if (done) onSaved(value)
  }
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('Change the link name')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus label={t('Link name')} value={typed} onChange={e => setTyped(e.target.value)} error={!!value && !ok}
            onKeyDown={e => { if (e.key === 'Enter' && ok && value !== slug) void save() }}
            helperText={value && !ok ? t('A link name is up to 40 small letters, numbers and dashes, starting with a letter') : t('Small letters, numbers and dashes, e.g. counter-tv.')}
            slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{prefix}</InputAdornment> } }} />
          <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setTyped(linkName(screen.name))}>{t('Make it from the name')}</Button>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('The screen keeps playing the old link until the new one is opened on it.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ok || value === slug} onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function AddressBar({ address, onAddress, onAdd, label }: { address: string; onAddress: (v: string) => void; onAdd: () => void; label?: string }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField size="small" sx={{ flex: 1, '& .MuiOutlinedInput-root': { bgcolor: tokens.surface } }} label={t('Paste an address')} placeholder={'https://…'} value={address}
        onChange={e => onAddress(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
        helperText={address.trim() ? t('Kind: {kind}', { kind: tc('slide', kindLabel(kindOf(cleanUrl(address) ?? ''))) }) : undefined} />
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} disabled={!address.trim()} sx={{ alignSelf: { sm: 'flex-start' }, flexShrink: 0 }}>{label ?? t('Add slide')}</Button>
    </Stack>
  )
}

/** A slide's picture, or the icon for its kind. */
function Thumb({ slide: sl, width, height, ratio }: { slide: Slide; width?: number | string; height?: number; ratio?: string }) {
  return (
    <Box sx={{ width, height, aspectRatio: ratio, flexShrink: 0, borderRadius: 1.5, overflow: 'hidden', bgcolor: sl.kind === 'offers' ? tokens.roseSoft : tokens.surfaceAlt,
      display: 'grid', placeItems: 'center', color: sl.kind === 'offers' ? tokens.roseDeep : tokens.inkSoft }}>
      {sl.kind === 'image' && sl.url ? <Box component="img" src={sl.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ICON[sl.kind]}
    </Box>
  )
}

/** What the live offers' pictures slide is playing now. */
const offersNow = (live: number) => (live ? tn(live, '{n} offer on now', '{n} offers on now') : t('No offer with a picture on now'))

function SlideRow({ slide: sl, index, count, screenSeconds, designs, live, open, onToggle, onChange, onMove, onRemove }: {
  slide: Slide; index: number; count: number; screenSeconds: number; designs: MenuDesign[]
  /** How many offers' pictures are on now (for a live offers' pictures slide). */
  live: number
  open: boolean; onToggle: () => void
  onChange: (patch: Partial<Slide>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const design = sl.kind === 'menu' ? designs.find(d => d.id === sl.design_id) : undefined
  const name = slideName(sl, designs)
  const own = sl.seconds === null ? '' : String(sl.seconds)
  const time = sl.seconds ? secondsText(sl.seconds) : sl.kind === 'video' ? t('To its end') : t('The usual ({time})', { time: secondsText(screenSeconds) })
  const langs = sl.kind === 'offers' ? [] : (['en', 'es'] as const).filter(l => hasVersion(sl, l) && versionOn(sl, l))
  const details = `${sl.kind}-details-${sl.id}`
  return (
    <Box component="article" aria-label={name} sx={{ borderRadius: 3, border: `1px solid ${open ? tokens.lineStrong : tokens.line}`, bgcolor: tokens.surface,
      opacity: sl.active ? 1 : 0.6, transition: 'border-color .2s' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' }, p: 1.25, pl: 1.5 }}>
        <Typography aria-hidden sx={{ width: 20, textAlign: 'center', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem', flexShrink: 0 }}>{index + 1}</Typography>
        <Thumb slide={sl} width={80} height={46} />
        <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500, lineHeight: 1.4 }} noWrap title={name}>{sl.url?.startsWith('data:') && !sl.title ? t('A drawn picture') : name}</Typography>
          <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
            <Tag>{tc('slide', kindLabel(sl.kind))}</Tag>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{sl.kind === 'offers' ? `${time} · ${offersNow(live)}` : time}</Typography>
            {sl.live && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{tc('slide', 'Live')}</Tag>}
            {langs.length > 0 && <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '0.04em' }}>{langs.map(l => l.toUpperCase()).join(' · ')}</Typography>}
            {sl.kind === 'menu' && !design && <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('That menu was deleted')}</Tag>}
          </Stack>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
          <Tooltip title={sl.active ? t('Playing') : t('Skipped')}>
            <Switch size="small" checked={sl.active} onChange={e => onChange({ active: e.target.checked })} slotProps={{ input: { 'aria-label': t('Play {name}', { name }) } }} />
          </Tooltip>
          <IconButton size="small" aria-label={t('Move {name} up', { name })} disabled={index === 0} onClick={() => onMove(-1)}><UpIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label={t('Move {name} down', { name })} disabled={index === count - 1} onClick={() => onMove(1)}><DownIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label={t('Remove {name}', { name })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label={t('Edit {name}', { name })} aria-expanded={open} aria-controls={details} onClick={onToggle}
            sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><ExpandIcon fontSize="small" /></IconButton>
        </Stack>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box id={details} sx={{ borderTop: `1px solid ${tokens.line}`, p: { xs: 1.5, sm: 2 }, display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 210px' } }}>
            <TextField size="small" label={t('Slide name')} value={sl.title ?? ''} placeholder={design?.name ?? (sl.kind === 'offers' ? t('Live offers’ pictures') : t('Name (optional)'))}
              onChange={e => onChange({ title: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 120 }, inputLabel: { shrink: true } }} />
            <TextField select size="small" label={sl.kind === 'offers' ? t('Each picture shows for') : t('Shows for')} value={own}
              onChange={e => onChange({ seconds: e.target.value === '' ? null : Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{sl.kind === 'video' ? t('To its end') : t('The usual ({time})', { time: secondsText(screenSeconds) })}</MenuItem>
              {[...new Set([...SECONDS_CHOICES, ...(sl.seconds ? [sl.seconds] : [])])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={String(n)}>{secondsText(n)}</MenuItem>)}
            </TextField>
          </Box>
          {(sl.kind === 'image' || sl.kind === 'web') && (
            <FormControlLabel sx={{ alignItems: 'flex-start', ml: -1, mr: 0 }} control={<Switch size="small" checked={sl.live} onChange={e => onChange({ live: e.target.checked })} />}
              label={<Box sx={{ pt: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{tc('slide', 'Live')}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('Loaded fresh each time it shows (a webcam picture, a live page)')}</Typography>
              </Box>} />
          )}
          {sl.kind === 'offers' ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Plays the picture of each offer that’s on now on Offers & specials, and takes it off when the offer ends. Offers put on this screen show as usual, not twice.')}{' '}
              <Button size="small" component={RouterLink} to="/offers" sx={{ verticalAlign: 'baseline' }}>{t('Offers & specials')}</Button>
            </Typography>
          ) : <SlideVersions slide={sl} name={name} designs={designs} onChange={onChange} />}
        </Box>
      </Collapse>
    </Box>
  )
}

/** A picture in a picture slideshow: big, with its name, its switch, and moving it along or out. */
function PictureTile({ slide: sl, index, count, portrait, designs, live, onChange, onMove, onRemove }: {
  slide: Slide; index: number; count: number; portrait: boolean; designs: MenuDesign[]; live: number
  onChange: (patch: Partial<Slide>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const name = slideName(sl, designs)
  return (
    <Box component="article" aria-label={name} sx={{ borderRadius: 3, border: `1px solid ${tokens.line}`, bgcolor: tokens.surface, overflow: 'hidden',
      opacity: sl.active ? 1 : 0.55, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative' }}>
        <Thumb slide={sl} width="100%" ratio={portrait ? '3 / 4' : '16 / 10'} />
        <Box aria-hidden sx={{ position: 'absolute', top: 8, left: 8, minWidth: 24, height: 24, px: 0.75, borderRadius: 99, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{index + 1}</Box>
        {sl.kind === 'offers' && (
          <Box sx={{ position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'center' }}>
            <Tag fg={live ? tokens.goodFg : tokens.neutralFg} bg={live ? tokens.goodBg : tokens.neutralBg}>{offersNow(live)}</Tag>
          </Box>
        )}
      </Box>
      <Box sx={{ p: 1.25, pt: 1, display: 'grid', gap: 0.5 }}>
        {sl.kind === 'offers'
          ? <Typography variant="body2" sx={{ fontWeight: 500, py: 0.5 }}>{t('Live offers’ pictures')}</Typography>
          : <TextField variant="standard" size="small" value={sl.title ?? ''} placeholder={t('Name (optional)')} onChange={e => onChange({ title: e.target.value || null })}
            slotProps={{ htmlInput: { 'aria-label': t('Slide name'), maxLength: 120 } }} />}
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Tooltip title={sl.active ? t('Playing') : t('Skipped')}>
            <Switch size="small" checked={sl.active} onChange={e => onChange({ active: e.target.checked })} slotProps={{ input: { 'aria-label': t('Play {name}', { name }) } }} />
          </Tooltip>
          <Stack direction="row">
            <IconButton size="small" aria-label={t('Move {name} up', { name })} disabled={index === 0} onClick={() => onMove(-1)}><LeftIcon fontSize="small" /></IconButton>
            <IconButton size="small" aria-label={t('Move {name} down', { name })} disabled={index === count - 1} onClick={() => onMove(1)}><RightIcon fontSize="small" /></IconButton>
            <IconButton size="small" aria-label={t('Remove {name}', { name })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}

const KINDS: { id: ScreenKind; title: string; body: string; icon: ReactNode }[] = [
  { id: 'screen', title: msg('A screen'), body: msg('A TV or tablet: menus, pictures, videos and web pages, with music.'), icon: <TvIcon /> },
  { id: 'slideshow', title: msg('A picture slideshow'), body: msg('Your pictures and the live offers’ pictures, on a link of its own.'), icon: <SlideshowIcon /> },
]

function NewScreenDialog({ kind: initial, kinds, onClose, onMade }: {
  kind: ScreenKind
  /** Whether a picture slideshow can be picked (not while slideshows are switched off). */
  kinds: boolean
  onClose: () => void; onMade: (id: string) => void
}) {
  const { api } = useApp()
  const run = useAction()
  const [kind, setKind] = useState<ScreenKind>(initial)
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState<ScreenInput['orientation']>('landscape')
  const make = async () => {
    let id = ''
    const ok = await run(async () => { id = await api.saveScreen({ ...newScreen(name.trim(), kind), orientation }) }, t('Added {name}', { name: name.trim() }))
    if (ok) { onMade(id); onClose() }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{kind === 'slideshow' ? t('New picture slideshow') : t('Add a screen')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {kinds && <RadioGroup value={kind} onChange={e => setKind(e.target.value as ScreenKind)} aria-label={t('What it is')}
            sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {KINDS.map(k => (
              <FormControlLabel key={k.id} value={k.id} control={<Radio size="small" sx={{ mt: -0.5 }} />} sx={{ m: 0, p: 1.5, alignItems: 'flex-start', borderRadius: 3,
                border: `1px solid ${kind === k.id ? tokens.rose : tokens.line}`, bgcolor: kind === k.id ? tokens.roseWash : 'transparent' }}
                label={<Box sx={{ pl: 0.5 }}>
                  <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', color: tokens.roseDeep }}>{k.icon}<Typography sx={{ fontWeight: 600, color: 'text.primary' }}>{t(k.title)}</Typography></Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t(k.body)}</Typography>
                </Box>} />
            ))}
          </RadioGroup>}
          <TextField autoFocus label={t('Name')} placeholder={kind === 'slideshow' ? t('e.g. Window pictures') : t('e.g. Counter TV')} value={name} onChange={e => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void make() }}
            helperText={name.trim() ? t('Its link: {link}', { link: `${LINK_PREFIX[kind]}/${linkName(name) || 'screen'}` }) : ' '} />
          <ToggleButtonGroup exclusive fullWidth size="small" value={orientation} onChange={(_, v: ScreenInput['orientation'] | null) => v && setOrientation(v)} aria-label={t('Orientation')}>
            <ToggleButton value="landscape">{t('Landscape')}</ToggleButton>
            <ToggleButton value="portrait">{t('Portrait')}</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={make}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
