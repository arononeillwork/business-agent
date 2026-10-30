import {
  Alert, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Radio,
  RadioGroup, Slider, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import DownIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import RefreshIcon from '@mui/icons-material/AutorenewRounded'
import ImageIcon from '@mui/icons-material/ImageOutlined'
import VideoIcon from '@mui/icons-material/MovieOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import MenuIcon from '@mui/icons-material/RestaurantMenuOutlined'
import YouTubeIcon from '@mui/icons-material/YouTube'
import InstagramIcon from '@mui/icons-material/Instagram'
import MusicIcon from '@mui/icons-material/MusicNoteOutlined'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { ScreenPlayer } from '../components/ScreenPlayer'
import { offerWhenText } from '../components/OfferBoard'
import { ago } from '../components/Freshness'
import { imageOf, type MenuDesign, type MenuItem as Item } from '../../shared/menu'
import {
  SECONDS_CHOICES, TRANSITIONS, cleanUrl, isOnline, kindLabel, kindOf, loopSeconds, newScreen, screenProblem, type DisplayFeed, type Screen, type ScreenInput, type Slide,
  type SlideKind,
} from '../../shared/screens'
import type { MenuAllergens } from '../../shared/allergens'
import { offerState, type Offer, type ScreenOffer } from '../../shared/offers'
import type { Brand } from '../../shared/types'
import { tokens } from '../theme'
import { t, tc, tn } from '../i18n'

const inputOf = ({ id, token: _token, last_seen_at: _seen, updated_at: _updated, ...s }: Screen): ScreenInput => ({ ...s, id })
const ICON: Record<SlideKind, ReactNode> = {
  image: <ImageIcon />, video: <VideoIcon />, youtube: <YouTubeIcon />, vimeo: <VideoIcon />, instagram: <InstagramIcon />, web: <WebIcon />, menu: <MenuIcon />,
}
/** The screen's own link: what's opened on the TV or tablet. */
export const screenLink = (token: string) =>
  `${location.origin}${import.meta.env.VITE_DEMO_ONLY === '1' ? `${location.pathname}#` : ''}/display/${token}`
const secondsText = (n: number) => (n < 60 ? tn(n, '{n} second', '{n} seconds') : tn(Math.round(n / 60), '{n} minute', '{n} minutes'))
const duration = (n: number) => (n < 60 ? tn(n, '{n} second', '{n} seconds') : t('{m} min {s} s', { m: Math.floor(n / 60), s: n % 60 }))
const menuSlide = (designId: string): Slide => ({ id: crypto.randomUUID(), kind: 'menu', url: null, design_id: designId, title: null, seconds: null, live: false, active: true })

/**
 * Screens (admins): the café's TVs and tablets, each playing a slideshow of pictures, videos,
 * YouTube, web pages and the digital menus, with how long each slide shows, how it changes, and
 * music. Each screen has a secret link, opened once on the screen itself; changes reach it within
 * a minute.
 */
export function ScreensPage() {
  const { api } = useApp()
  const run = useAction()
  const screens = useAsync('screens', () => api.screens(), [], { refetchInterval: 60_000 })
  const designs = useAsync('menu-designs', () => api.menuDesigns(), [])
  const items = useAsync('menu-items', () => api.menuItems(), [])
  const allergens = useAsync('menu-allergens', () => api.menuAllergens(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const offers = useAsync('offers', () => api.offers(), [])
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useTick(30_000)
  const list = screens.data ?? []
  const current = list.find(s => s.id === selected) ?? list[0] ?? null
  const digital = (designs.data ?? []).filter(d => d.format === 'digital')
  // From Menu design → "Show on a screen": put that menu on one.
  const adding = digital.find(d => d.id === params.get('menu')) ?? null
  const addTo = (s: Screen) => run(async () => {
    await api.saveScreen({ ...inputOf(s), slides: [...s.slides, menuSlide(adding!.id)] })
    setParams({})
    setSelected(s.id)
  }, t('{menu} is on {screen}', { menu: adding!.name, screen: s.name }))
  const newWith = () => run(async () => {
    const id = await api.saveScreen({ ...newScreen(t('Menu screen')), slides: [menuSlide(adding!.id)], seconds: 30 })
    setParams({})
    setSelected(id)
  }, t('Added {name}', { name: t('Menu screen') }))

  return (
    <>
      <PageHeader eyebrow={t('Menu')} title={t('Screens')} actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>{t('Add screen')}</Button>} />
      <ErrorBox error={screens.error} />
      {adding && (
        <Alert severity="info" sx={{ mb: 2.5 }} onClose={() => setParams({})}>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('Put “{name}” on a screen:', { name: adding.name })}</Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {list.map(s => <Button key={s.id} size="small" variant="outlined" onClick={() => addTo(s)}>{t('Add to {screen}', { screen: s.name })}</Button>)}
            <Button size="small" variant="contained" onClick={newWith}>{t('A new screen with it')}</Button>
          </Stack>
        </Alert>
      )}
      {screens.data && !list.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Turn a TV or tablet into a menu board')}</Typography>
          {t('Add a screen, give it pictures, videos, web pages or your digital menu, and open its link once on the screen. Changes reach it within a minute.')}
          <Box sx={{ mt: 2 }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>{t('Add screen')}</Button></Box>
        </Empty>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
          <Stack spacing={1} sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
            {list.map(s => <ScreenCard key={s.id} screen={s} selected={s.id === current?.id} onClick={() => setSelected(s.id)} />)}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            {current && <ScreenEditor key={current.id} screen={current} designs={digital} items={items.data ?? []} allergens={allergens.data} brand={brand.data}
              offers={(offers.data ?? []).filter(o => o.screen_ids.includes(current.id) && ['on', 'coming'].includes(offerState(o)))} />}
          </Box>
        </Stack>
      )}
      {creating && <NewScreenDialog onClose={() => setCreating(false)} onMade={setSelected} />}
    </>
  )
}

function Status({ screen }: { screen: Screen }) {
  if (!screen.active) return <Tag>{t('Switched off')}</Tag>
  if (isOnline(screen.last_seen_at)) return <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('On now')}</Tag>
  return <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{screen.last_seen_at ? t('Last seen {when}', { when: ago(screen.last_seen_at) }) : t('Not opened on a screen yet')}</Tag>
}

function ScreenCard({ screen: s, selected, onClick }: { screen: Screen; selected: boolean; onClick: () => void }) {
  return (
    <Card variant="outlined" sx={selected ? { borderColor: tokens.rose, boxShadow: `0 0 0 1px ${tokens.rose}` } : undefined}>
      <CardActionArea onClick={onClick} aria-pressed={selected} aria-label={s.name} sx={{ p: 1.5, display: 'block' }}>
        <Typography sx={{ fontWeight: 500 }}>{s.name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
          {`${tn(s.slides.filter(x => x.active).length, '{n} slide', '{n} slides')} · ${s.orientation === 'portrait' ? t('Portrait') : t('Landscape')}`}
        </Typography>
        <Status screen={s} />
      </CardActionArea>
    </Card>
  )
}

/** One screen: its link, a live preview of the changes, its slides and how it plays them. */
function ScreenEditor({ screen, designs, items, allergens, brand, offers }: {
  screen: Screen; designs: MenuDesign[]; items: Item[]; allergens: MenuAllergens | null; brand: Brand | null
  /** The offers on this screen that are on now or coming up (Offers & specials). */
  offers: Offer[]
}) {
  const { api, business, settings } = useApp()
  const run = useAction()
  const notify = useNotify()
  const saved = inputOf(screen)
  const [s, setS] = useState<ScreenInput>(saved)
  const [address, setAddress] = useState('')
  const [menu, setMenu] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const set = (patch: Partial<ScreenInput>) => setS(x => ({ ...x, ...patch }))
  const setSlide = (id: string, patch: Partial<Slide>) => set({ slides: s.slides.map(x => (x.id === id ? { ...x, ...patch } : x)) })
  const moveSlide = (i: number, by: -1 | 1) => {
    const slides = [...s.slides]
    ;[slides[i], slides[i + by]] = [slides[i + by], slides[i]]
    set({ slides })
  }
  const link = screenLink(screen.token)

  // The preview plays what's on the page now, saved or not, with the digital menus as they are.
  const feed = useMemo<DisplayFeed>(() => ({
    screen: { ...s, id: screen.id, updated_at: screen.updated_at },
    sections: settings?.menu_sections ?? [],
    business: { name: business?.name ?? '', logo: brand?.logo_mark ?? brand?.logo ?? null, heading_font: brand?.heading_font, body_font: brand?.body_font, colours: brand?.colours },
    menus: Object.fromEntries(designs.map(({ images: _images, ...d }) => [d.id, { design: { ...d, image_url: imageOf({ image_id: d.image_id, images: _images })?.url ?? null }, items }])),
    allergens,
    offers: offers.map(({ id, title, details, price, was_price, image_url, starts_at, ends_at, screen_mode, seconds }): ScreenOffer =>
      ({ id, title, details, price, was_price, image_url, starts_at, ends_at, screen_mode, seconds })),
  }), [s, screen.id, screen.updated_at, settings?.menu_sections, business?.name, brand, designs, items, allergens, offers])

  const addAddress = () => {
    const url = cleanUrl(address)
    if (!url) return
    set({ slides: [...s.slides, { id: crypto.randomUUID(), kind: kindOf(url), url, design_id: null, title: null, seconds: null, live: false, active: true }] })
    setAddress('')
  }
  const save = () => run(async () => {
    const problem = screenProblem(s)
    if (problem) throw new Error(t(problem))
    await api.saveScreen(s)
  }, t('Saved. The screen shows the changes within a minute.'))
  const remove = () => run(() => api.deleteScreen(screen.id), t('Deleted {name}', { name: screen.name }))
  const relink = () => run(async () => { await api.newScreenLink(screen.id); setRelinking(false) }, t('New link made. Open it on the screen: the old one no longer works.'))
  const copy = () => navigator.clipboard.writeText(link).then(() => notify(t('Link copied'), 'success'), () => notify(link, 'info'))

  return (
    <Stack spacing={2.5}>
      <Card sx={{ p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 180 }}>
            <Typography variant="h6" component="h2">{s.name || screen.name}</Typography>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Status screen={screen} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {`${t('Once round: {time}', { time: duration(loopSeconds(s)) })}${dirty ? ` · ${t('Unsaved changes')}` : ''}`}
              </Typography>
            </Stack>
          </Box>
          <Button variant="outlined" startIcon={<OpenIcon />} component="a" href={link} target="_blank" rel="noopener">{t('Open the screen')}</Button>
        </Stack>
        <TextField fullWidth size="small" label={t('The screen’s link')} value={link}
          slotProps={{ htmlInput: { readOnly: true, style: { fontFamily: 'monospace', fontSize: '0.85rem' } },
            input: { endAdornment: <InputAdornment position="end">
              <Tooltip title={t('Copy link')}><IconButton size="small" aria-label={t('Copy link')} onClick={copy}><CopyIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title={t('New link')}><IconButton size="small" aria-label={t('New link')} onClick={() => setRelinking(true)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
            </InputAdornment> } }} />
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('Open this link once in the browser on the TV or tablet (a smart TV, Fire TV, Chromecast or an old tablet all work) and tap to go full screen. It checks for changes every minute and keeps playing if the internet drops.')}
        </Typography>
        <Box sx={{ mt: 2, display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, borderRadius: 2, p: { xs: 1.5, md: 3 } }}>
          <Box sx={{ width: '100%', maxWidth: s.orientation === 'portrait' ? 260 : 640 }}>
            <Box role="region" aria-label={t('Preview of the screen')} sx={{ position: 'relative', aspectRatio: s.orientation === 'portrait' ? '9 / 16' : '16 / 9',
              borderRadius: '10px', overflow: 'hidden', border: '6px solid #111', bgcolor: '#000' }}>
              <ScreenPlayer feed={feed} preview />
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mt: 0.75 }}>{t('A silent preview of the changes below, as the screen will play them.')}</Typography>
          </Box>
        </Box>
      </Card>

      <Card sx={{ p: 2 }}>
        <Typography variant="h6" component="h3">{t('Slides')}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('Played in this order. Paste the address of a picture, a video (MP4), YouTube, Vimeo, an Instagram post or any web page.')}</Typography>
        <Stack spacing={1}>
          {s.slides.map((sl, i) => (
            <SlideRow key={sl.id} slide={sl} index={i} count={s.slides.length} screenSeconds={s.seconds} designs={designs}
              onChange={patch => setSlide(sl.id, patch)} onMove={by => moveSlide(i, by)} onRemove={() => set({ slides: s.slides.filter(x => x.id !== sl.id) })} />
          ))}
          {!s.slides.length && <Empty>{t('No slides yet.')}</Empty>}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
          <TextField size="small" sx={{ flex: 1 }} label={t('Paste an address')} placeholder={'https://…'} value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addAddress() }}
            helperText={address.trim() ? t('Kind: {kind}', { kind: tc('slide', kindLabel(kindOf(cleanUrl(address) ?? ''))) }) : ' '} />
          <Button variant="outlined" startIcon={<AddIcon />} onClick={addAddress} disabled={!address.trim()} sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 0.25 } }}>{t('Add slide')}</Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          {designs.length ? <>
            <TextField select size="small" sx={{ flex: 1 }} label={t('A digital menu')} value={menu} onChange={e => setMenu(e.target.value)}>
              {designs.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </TextField>
            <Button variant="outlined" startIcon={<MenuIcon />} disabled={!menu} onClick={() => { set({ slides: [...s.slides, menuSlide(menu)] }); setMenu('') }}>{t('Add the menu')}</Button>
          </> : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Your digital menus can play here too.')} <Button size="small" component={RouterLink} to="/menu/design?format=digital">{t('Make one on Menu design')}</Button>
            </Typography>
          )}
        </Stack>
      </Card>

      <Card component="section" aria-label={t('Offers on this screen')} sx={{ p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="h6" component="h3" sx={{ flex: 1 }}>{t('Offers on this screen')}</Typography>
          <Button size="small" startIcon={<OfferIcon />} component={RouterLink} to={`/offers?new=1&screen=${screen.id}`}>{t('New offer')}</Button>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: offers.length ? 1.5 : 0 }}>
          {offers.length ? t('Each shows from the minute it starts to the minute it ends, then comes off by itself.')
            : t('None coming up. An offer or a special from Offers & specials shows here for its time, then comes off by itself.')}
        </Typography>
        <Stack spacing={1}>
          {offers.map(o => (
            <Stack key={o.id} direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 1, borderRadius: 2, border: `1px solid ${tokens.line}` }}>
              <OfferIcon fontSize="small" sx={{ color: tokens.inkSoft }} />
              <Typography sx={{ fontWeight: 500 }}>{o.title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 140 }}>
                {`${offerWhenText(o)} · ${o.screen_mode === 'only' ? t('on its own') : t('in turn, {time} each time', { time: secondsText(o.seconds) })}`}
              </Typography>
              {offerState(o) === 'on' ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Showing now')}</Tag> : <Tag>{t('Coming up')}</Tag>}
            </Stack>
          ))}
        </Stack>
        {offers.length > 0 && <Button size="small" component={RouterLink} to="/offers" sx={{ mt: 1 }}>{t('Change them on Offers & specials')}</Button>}
      </Card>

      <Card sx={{ p: 2 }}>
        <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>{t('Settings')}</Typography>
        <Stack spacing={2.25}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Name')} value={s.name} onChange={e => set({ name: e.target.value })} slotProps={{ htmlInput: { maxLength: 80 } }} />
            <ToggleButtonGroup exclusive size="small" value={s.orientation} onChange={(_, v: ScreenInput['orientation'] | null) => v && set({ orientation: v })} aria-label={t('Orientation')}
              sx={{ alignSelf: { sm: 'center' }, flexShrink: 0 }}>
              <ToggleButton value="landscape">{t('Landscape')}</ToggleButton>
              <ToggleButton value="portrait">{t('Portrait')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Each slide shows for')} value={s.seconds} onChange={e => set({ seconds: Number(e.target.value) })}
              helperText={t('Unless a slide says otherwise.')}>
              {[...new Set([...SECONDS_CHOICES, s.seconds])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={n}>{secondsText(n)}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label={t('Change effect')} value={s.transition} onChange={e => set({ transition: e.target.value as ScreenInput['transition'] })}>
              {TRANSITIONS.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {s.transition !== 'none' && (
            <Box sx={{ px: 1 }}>
              <Typography variant="body2" id="speed-label">{t('Change speed: {s} s', { s: (s.transition_ms / 1000).toFixed(1) })}</Typography>
              <Slider aria-labelledby="speed-label" value={s.transition_ms} min={200} max={3000} step={100} onChange={(_, v) => set({ transition_ms: v as number })}
                marks={[{ value: 200, label: t('Quick') }, { value: 3000, label: t('Slow') }]} />
            </Box>
          )}
          <Box>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Pictures and videos')}</Typography>
            <RadioGroup row value={s.fit} onChange={e => set({ fit: e.target.value as ScreenInput['fit'] })}>
              <FormControlLabel value="cover" control={<Radio size="small" />} label={t('Fill the screen (edges may be cut)')} />
              <FormControlLabel value="contain" control={<Radio size="small" />} label={t('Show all of it (with borders)')} />
            </RadioGroup>
            <FormControlLabel control={<Switch checked={s.shuffle} onChange={e => set({ shuffle: e.target.checked })} />} label={t('Shuffle the order')} />
          </Box>
          <Box>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Music')}</Typography>
            <TextField fullWidth size="small" sx={{ mt: 1 }} label={t('Music address (optional)')} placeholder={t('An MP3, a radio stream, or a YouTube video or playlist')} value={s.music_url ?? ''}
              onChange={e => set({ music_url: e.target.value.trim() ? (cleanUrl(e.target.value) ?? null) : null })}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><MusicIcon fontSize="small" /></InputAdornment> } }} />
            {s.music_url && (
              <Box sx={{ px: 1, mt: 1 }}>
                <Typography variant="body2" id="volume-label">{t('Volume: {n}%', { n: s.music_volume })}</Typography>
                <Slider aria-labelledby="volume-label" value={s.music_volume} min={0} max={100} step={5} onChange={(_, v) => set({ music_volume: v as number })} />
              </Box>
            )}
            <FormControlLabel control={<Switch checked={s.video_sound} onChange={e => set({ video_sound: e.target.checked })} />}
              label={t('Videos play their own sound (the music pauses for them)')} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              {t('Playing music in the café needs the usual licences (SGAE and AGEDI/AIE in Spain): see Licences & renewals.')}
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('On top')}</Typography>
            <FormControlLabel control={<Switch checked={s.show_clock} onChange={e => set({ show_clock: e.target.checked })} />} label={t('The time, in a corner')} />
            <TextField fullWidth size="small" label={t('A line running along the bottom (optional)')} placeholder={t('e.g. Today’s special: pumpkin spice latte · Free Wi-Fi: EasyBeans')}
              value={s.ticker ?? ''} onChange={e => set({ ticker: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 280 } }} sx={{ mt: 1 }} />
          </Box>
          <FormControlLabel control={<Switch checked={s.active} onChange={e => set({ active: e.target.checked })} />}
            label={s.active ? t('Playing') : t('Switched off: the screen shows your name and logo')} />
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="contained" disabled={!dirty} onClick={save}>{t('Save changes')}</Button>
            {dirty && <Button onClick={() => setS(saved)}>{t('Undo changes')}</Button>}
            <Box sx={{ flex: 1 }} />
            {deleting ? <>
              <Typography variant="body2">{t('Delete {name}? Its link stops working.', { name: screen.name })}</Typography>
              <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
              <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
            </> : <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete screen')}</Button>}
          </Stack>
        </Stack>
      </Card>

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
    </Stack>
  )
}

function SlideRow({ slide: sl, index, count, screenSeconds, designs, onChange, onMove, onRemove }: {
  slide: Slide; index: number; count: number; screenSeconds: number; designs: MenuDesign[]
  onChange: (patch: Partial<Slide>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const design = sl.kind === 'menu' ? designs.find(d => d.id === sl.design_id) : undefined
  const name = sl.title || design?.name || sl.url || t('Slide')
  const own = sl.seconds === null ? '' : String(sl.seconds)
  return (
    <Box component="article" aria-label={name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: { xs: 'wrap', sm: 'nowrap' }, p: 1, borderRadius: 2,
      border: `1px solid ${tokens.line}`, opacity: sl.active ? 1 : 0.55 }}>
      <Box sx={{ width: 64, height: 40, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center', color: tokens.inkSoft }}>
        {sl.kind === 'image' && sl.url ? <Box component="img" src={sl.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ICON[sl.kind]}
      </Box>
      <Box sx={{ flex: 1, minWidth: 160 }}>
        <TextField variant="standard" fullWidth size="small" value={sl.title ?? ''} placeholder={design?.name ?? t('Name (optional)')} onChange={e => onChange({ title: e.target.value || null })}
          slotProps={{ htmlInput: { 'aria-label': t('Slide name'), maxLength: 120 } }} />
        <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', mt: 0.25, minWidth: 0 }}>
          <Chip size="small" label={tc('slide', kindLabel(sl.kind))} sx={{ height: 20, fontSize: '0.7rem' }} />
          {sl.kind === 'menu' && !design && <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('That menu was deleted')}</Tag>}
          {sl.url && <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0 }} title={sl.url}>{sl.url.startsWith('data:') ? t('A drawn picture') : sl.url}</Typography>}
        </Stack>
      </Box>
      <TextField select size="small" label={t('Shows for')} value={own} onChange={e => onChange({ seconds: e.target.value === '' ? null : Number(e.target.value) })} sx={{ width: 150 }}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
        <MenuItem value="">{sl.kind === 'video' ? t('To its end') : t('The usual ({time})', { time: secondsText(screenSeconds) })}</MenuItem>
        {[...new Set([...SECONDS_CHOICES, ...(sl.seconds ? [sl.seconds] : [])])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={String(n)}>{secondsText(n)}</MenuItem>)}
      </TextField>
      {(sl.kind === 'image' || sl.kind === 'web') && (
        <Tooltip title={t('Loaded fresh each time it shows (a webcam picture, a live page)')}>
          <FormControlLabel sx={{ mr: 0 }} control={<Switch size="small" checked={sl.live} onChange={e => onChange({ live: e.target.checked })} />} label={tc('slide', 'Live')} />
        </Tooltip>
      )}
      <Tooltip title={sl.active ? t('Playing') : t('Skipped')}>
        <Switch size="small" checked={sl.active} onChange={e => onChange({ active: e.target.checked })} slotProps={{ input: { 'aria-label': t('Play {name}', { name }) } }} />
      </Tooltip>
      <Stack direction="row">
        <IconButton size="small" aria-label={t('Move {name} up', { name })} disabled={index === 0} onClick={() => onMove(-1)}><UpIcon fontSize="small" /></IconButton>
        <IconButton size="small" aria-label={t('Move {name} down', { name })} disabled={index === count - 1} onClick={() => onMove(1)}><DownIcon fontSize="small" /></IconButton>
        <IconButton size="small" aria-label={t('Remove {name}', { name })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
      </Stack>
    </Box>
  )
}

function NewScreenDialog({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState<ScreenInput['orientation']>('landscape')
  const make = async () => {
    let id = ''
    const ok = await run(async () => { id = await api.saveScreen({ ...newScreen(name.trim()), orientation }) }, t('Added {name}', { name: name.trim() }))
    if (ok) { onMade(id); onClose() }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Add a screen')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus label={t('Name')} placeholder={t('e.g. Counter TV')} value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void make() }} />
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
