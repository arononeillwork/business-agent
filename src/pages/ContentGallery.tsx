// The Content page's photos and videos as Google Photos shows a library: days one after another, newest
// first, each under its date, in rows of photos at their own shape that fill the width (src/lib/photoLayout.ts).
// A circle on each (and beside each date) chooses it; while any is chosen, a tap chooses rather than opens.
// Opened, one fills the screen on black, with arrows (or a swipe, or the arrow keys) to the next and an
// Info panel with its title, tags and details.
import {
  Box, ButtonBase, Checkbox, Chip, Dialog, Divider, IconButton, ListItemIcon, Menu, MenuItem, Stack, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import UncheckedIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import CheckedIcon from '@mui/icons-material/CheckCircleRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import PrevIcon from '@mui/icons-material/ChevronLeftRounded'
import NextIcon from '@mui/icons-material/ChevronRightRounded'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import PostIcon from '@mui/icons-material/ShareOutlined'
import HighlightIcon from '@mui/icons-material/AddCircleOutlineRounded'
import MoreIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/EditOutlined'
import LinkIcon from '@mui/icons-material/LinkRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DateIcon from '@mui/icons-material/EventOutlined'
import PhotoIcon from '@mui/icons-material/PhotoOutlined'
import VideoIcon from '@mui/icons-material/VideocamOutlined'
import UploadIcon from '@mui/icons-material/FileUploadOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { siGooglephotos } from 'simple-icons'
import { Brand } from '../components/Connectors'
import { aspectOf, byDay, justifiedRows, rowTarget } from '../lib/photoLayout'
import type { ContentItem } from '../../shared/content'
import { addDays, formatLocal, localDate, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

const GAP = 4
const DAY_GAP = 12
/** The room above a row where a day starts, for its date. */
const HEADER = 40

export const itemName = (i: ContentItem) => i.title ?? t(i.kind === 'video' ? 'Untitled video' : 'Untitled photo')

/** The day it was taken (or added, when that's not known), in the café's time. */
const dayOf = (i: ContentItem) => localDate(i.taken_at ?? i.created_at)

/** "Today", "Yesterday", "Fri, 1 Nov", or with the year when it isn't this year's. */
function dayLabel(day: string) {
  const now = today()
  if (day === now) return t('Today')
  if (day === addDays(now, -1)) return t('Yesterday')
  return formatLocal(`${day}T12:00:00Z`, day.slice(0, 4) === now.slice(0, 4) ? 'EEE, d MMM' : 'EEE, d MMM yyyy', 'UTC')
}

/** 75 → "1:15". */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** A video's address that shows its first frame before it plays (Safari shows nothing otherwise). */
const withFrame = (url: string) => (url.includes('#') ? url : `${url}#t=0.1`)

/** The element's width, kept up to date. */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

/** The photos and videos, day by day, in rows that fill the width. */
export function Gallery({ items, chosen, onChoose, onOpen }: {
  items: ContentItem[]
  chosen: readonly string[]
  /** Choose these (or stop choosing them). */
  onChoose: (ids: string[], on: boolean) => void
  onOpen: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const width = useWidth(box)
  const days = useMemo(() => byDay(items, dayOf), [items])
  const rows = useMemo(
    () => (width ? justifiedRows(days.map(d => d.items.map(aspectOf)), { width, target: rowTarget(width), gap: GAP, dayGap: DAY_GAP }) : []),
    [days, width],
  )
  const picked = new Set(chosen)
  const selecting = chosen.length > 0
  return (
    <Box ref={box} role="list" aria-label={t('Photos and videos')} sx={{ width: '100%' }}>
      {rows.map((r, n) => (
        <Box key={days[r.segments[0].day].items[r.segments[0].cells[0].index].id} sx={{ display: 'flex', mt: r.header && n ? 1.5 : 0, mb: `${GAP}px` }}>
          {r.segments.map((s, k) => {
            const day = days[s.day]
            return (
              <Box key={day.day} sx={{ width: s.width, flexShrink: 0, ml: k ? `${DAY_GAP}px` : 0 }}>
                {r.header && (
                  <Box sx={{ height: HEADER, display: 'flex', alignItems: 'center' }}>
                    {s.first && <DayHeader label={dayLabel(day.day)} ids={day.items.map(i => i.id)} picked={picked} selecting={selecting} onChoose={onChoose} />}
                  </Box>
                )}
                <Box sx={{ display: 'flex', gap: `${GAP}px` }}>
                  {s.cells.map(c => {
                    const i = day.items[c.index]
                    return (
                      <Tile key={i.id} item={i} width={c.width} height={r.height} chosen={picked.has(i.id)} selecting={selecting}
                        onToggle={() => onChoose([i.id], !picked.has(i.id))} onOpen={() => onOpen(i.id)} />
                    )
                  })}
                </Box>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

/** A day's date, with a circle (on hover, or while choosing) that chooses all of that day's. */
function DayHeader({ label, ids, picked, selecting, onChoose }: {
  label: string; ids: string[]; picked: Set<string>; selecting: boolean; onChoose: (ids: string[], on: boolean) => void
}) {
  const n = ids.filter(id => picked.has(id)).length
  const all = n === ids.length
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, '&:has(:focus-visible) .day-check': { width: 30, opacity: 1 },
      '@media (hover: hover)': { '&:hover .day-check': { width: 30, opacity: 1 } } }}>
      <Box className="day-check" sx={{ width: selecting ? 30 : 0, opacity: selecting ? 1 : 0, overflow: 'hidden', flexShrink: 0, transition: 'width .15s, opacity .15s' }}>
        <Checkbox size="small" checked={all} indeterminate={n > 0 && !all} onChange={() => onChoose(ids, !all)}
          icon={<UncheckedIcon fontSize="small" />} checkedIcon={<CheckedIcon fontSize="small" />} indeterminateIcon={<CheckedIcon fontSize="small" sx={{ opacity: 0.55 }} />}
          slotProps={{ input: { 'aria-label': t('Choose all from {day}', { day: label }) } }} sx={{ p: 0.5, ml: -0.5 }} />
      </Box>
      <Typography component="h2" variant="body2" noWrap title={label} sx={{ fontWeight: 500, minWidth: 0 }}>{label}</Typography>
    </Box>
  )
}

/** One photo or video in the rows: opens it, or (while choosing) chooses it. */
function Tile({ item: i, width, height, chosen, selecting, onToggle, onOpen }: {
  item: ContentItem; width: number; height: number; chosen: boolean; selecting: boolean; onToggle: () => void; onOpen: () => void
}) {
  const name = itemName(i)
  const [length, setLength] = useState<number | null>(null)
  const cover = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const
  return (
    <Box role="listitem" aria-label={name}
      sx={{ position: 'relative', width, height, flexShrink: 0, overflow: 'hidden', bgcolor: chosen ? tokens.roseSoft : tokens.surfaceAlt, transition: 'background-color .15s',
        '&:has(:focus-visible) .tile-shade, &:has(:focus-visible) .tile-check': { opacity: 1 },
        '@media (hover: hover)': { '&:hover .tile-shade, &:hover .tile-check': { opacity: 1 } } }}>
      <ButtonBase onClick={selecting ? onToggle : onOpen} {...(selecting ? { tabIndex: -1, 'aria-hidden': true } : { 'aria-label': t('Open {name}', { name }) })}
        sx={{ position: 'absolute', inset: 0, display: 'block', '&.Mui-focusVisible': { outline: `3px solid ${tokens.rose}`, outlineOffset: -3 } }}>
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: chosen ? 'scale(0.86)' : 'none', borderRadius: chosen ? '6px' : 0, transition: 'transform .15s, border-radius .15s' }}>
          {i.kind === 'video'
            ? <Box component="video" src={withFrame(i.url)} muted playsInline preload="metadata" sx={cover}
                onLoadedMetadata={e => { const d = e.currentTarget.duration; setLength(Number.isFinite(d) ? d : null) }} />
            : <Box component="img" src={i.url} alt="" loading="lazy" decoding="async" sx={cover} />}
        </Box>
      </ButtonBase>
      <Box className="tile-shade" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: selecting && !chosen ? 0.7 : 0, transition: 'opacity .15s',
        background: 'linear-gradient(180deg, rgba(0,0,0,.4), rgba(0,0,0,0) 38%)' }} />
      {i.kind === 'video' && (
        <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 0.25, color: '#fff', pointerEvents: 'none',
          fontSize: '0.8rem', fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,.6)', '& svg': { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' } }}>
          {length !== null && clock(length)}
          <PlayIcon fontSize="small" />
        </Box>
      )}
      <Checkbox className="tile-check" checked={chosen} onChange={onToggle}
        icon={<UncheckedIcon sx={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />}
        checkedIcon={<CheckedIcon sx={{ bgcolor: '#fff', borderRadius: '50%' }} />}
        slotProps={{ input: { 'aria-label': t('Choose {name}', { name }) } }}
        sx={{ position: 'absolute', top: 2, left: 2, p: 0.5, color: '#fff', opacity: chosen || selecting ? 1 : 0, transition: 'opacity .15s',
          '&.Mui-checked': { color: tokens.roseDeep }, '&.Mui-focusVisible': { opacity: 1 } }} />
    </Box>
  )
}

/**
 * One photo or video on the whole screen, as Google Photos opens one: the arrows (or a swipe, or the arrow
 * keys) go through the others as they're shown on the page; Info shows its title, tags and details.
 */
export function Viewer({ items, id, onId, onClose, onEdit, onCopy, onDelete, onPost, onHighlight }: {
  items: ContentItem[]
  id: string
  onId: (id: string) => void
  onClose: () => void
  onEdit: (i: ContentItem) => void
  onCopy: (i: ContentItem) => void
  onDelete: (i: ContentItem) => void
  onPost: (i: ContentItem) => void
  /** Into an Instagram highlight (./ContentHighlights). */
  onHighlight: (i: ContentItem) => void
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down('md'))
  const [info, setInfo] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const at = items.findIndex(i => i.id === id)
  const item = at >= 0 ? items[at] : null
  const prev = at > 0 ? items[at - 1] : null
  const next = at >= 0 ? (items[at + 1] ?? null) : null

  // Gone (taken off, or filtered away): back to the page.
  useEffect(() => { if (!item) onClose() }, [item, onClose])
  // The photos either side load while this one's looked at.
  useEffect(() => {
    for (const n of [prev, next]) if (n?.kind === 'photo') new Image().src = n.url
  }, [prev, next])
  // The arrow keys go to the one before and the next: here, not in a field, a video's controls, the menu or
  // a dialog on top (Title and tags).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (menu || e.defaultPrevented || (el !== document.body && !root.current?.contains(el)) || el.closest('input, textarea, video')) return
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null
      if (to) onId(to.id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [menu, prev, next, onId])
  if (!item) return null

  const name = itemName(item)
  const go = (to: ContentItem | null) => { if (to) onId(to.id) }
  const button = { color: '#fff', bgcolor: 'rgba(0,0,0,.35)', borderRadius: '50%', '&:hover': { bgcolor: 'rgba(0,0,0,.55)' } }

  return (
    <Dialog ref={root} open fullScreen onClose={onClose} aria-labelledby="viewer-title"
      slotProps={{ paper: { sx: { bgcolor: '#000', color: '#fff', backgroundImage: 'none', borderRadius: 0 } } }}>
      <Box sx={{ display: 'flex', height: '100%', position: 'relative' }}>
        <Box sx={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}
          onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={e => {
            const from = touch.current
            touch.current = null
            if (!from) return
            const dx = e.changedTouches[0].clientX - from.x, dy = e.changedTouches[0].clientY - from.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? next : prev)
          }}>
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: { xs: '56px 0', md: '64px 72px' } }}>
            {item.kind === 'video'
              ? <Box component="video" key={item.id} src={item.url} controls autoPlay playsInline sx={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
              : <Box component="img" key={item.id} src={item.url} alt={name} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />}
          </Box>

          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 0.5, p: 1, zIndex: 1,
            background: 'linear-gradient(180deg, rgba(0,0,0,.65), rgba(0,0,0,0))' }}>
            <Tooltip title={t('Close')}><IconButton color="inherit" aria-label={t('Close')} onClick={onClose}><BackIcon /></IconButton></Tooltip>
            <Typography id="viewer-title" noWrap sx={{ flexGrow: 1, minWidth: 0, fontWeight: 500, px: 0.5 }}>{name}</Typography>
            <Tooltip title={t('Add to highlight')}>
              <IconButton color="inherit" aria-label={t('Add to highlight')} onClick={() => onHighlight(item)}><HighlightIcon /></IconButton>
            </Tooltip>
            <Tooltip title={t('Make a post')}><IconButton color="inherit" aria-label={t('Make a post')} onClick={() => onPost(item)}><PostIcon /></IconButton></Tooltip>
            <Tooltip title={t('Info')}>
              <IconButton color="inherit" aria-label={t('Info')} aria-pressed={info} onClick={() => setInfo(v => !v)}
                sx={info ? { bgcolor: 'rgba(255,255,255,.18)' } : undefined}><InfoIcon /></IconButton>
            </Tooltip>
            <Tooltip title={t('Take off the page')}><IconButton color="inherit" aria-label={t('Take off the page')} onClick={() => onDelete(item)}><DeleteIcon /></IconButton></Tooltip>
            <Tooltip title={t('More')}><IconButton color="inherit" aria-label={t('More')} onClick={e => setMenu(e.currentTarget)}><MoreIcon /></IconButton></Tooltip>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem onClick={() => { setMenu(null); onEdit(item) }}><ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Title and tags')}</MenuItem>
              <MenuItem onClick={() => { setMenu(null); onCopy(item) }}><ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>{t('Copy link')}</MenuItem>
              <MenuItem component="a" href={item.url} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>
                <ListItemIcon><OpenIcon fontSize="small" /></ListItemIcon>{tc('verb', 'Open')}
              </MenuItem>
            </Menu>
          </Box>

          {prev && (
            <IconButton aria-label={t('Previous')} onClick={() => go(prev)}
              sx={{ ...button, position: 'absolute', left: { xs: 4, md: 12 }, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><PrevIcon fontSize="large" /></IconButton>
          )}
          {next && (
            <IconButton aria-label={t('Next')} onClick={() => go(next)}
              sx={{ ...button, position: 'absolute', right: { xs: 4, md: 12 }, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><NextIcon fontSize="large" /></IconButton>
          )}
        </Box>
        {info && <InfoPanel item={item} phone={phone} onEdit={() => onEdit(item)} />}
      </Box>
    </Dialog>
  )
}

/** What's known about one: title and tags (to change), when it was taken, its size, where it came from. */
function InfoPanel({ item, phone, onEdit }: { item: ContentItem; phone: boolean; onEdit: () => void }) {
  const when = item.taken_at ?? item.created_at
  return (
    <Box component="aside" aria-label={t('Info')}
      sx={{ bgcolor: 'background.paper', color: 'text.primary', overflowY: 'auto', p: 2.5,
        ...(phone
          ? { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '60%', borderRadius: '16px 16px 0 0', zIndex: 2, boxShadow: '0 -8px 24px rgba(0,0,0,.35)' }
          : { width: 360, flexShrink: 0, borderLeft: 1, borderColor: 'divider' }) }}>
      <Typography variant="h6" sx={{ mb: 2 }}>{t('Info')}</Typography>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{itemName(item)}</Typography>
          {item.tags.length
            ? <Stack direction="row" sx={{ gap: 0.5, mt: 1, flexWrap: 'wrap' }}>{item.tags.map(tag => <Chip key={tag} size="small" label={tag} />)}</Stack>
            : <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('No tags yet')}</Typography>}
        </Box>
        <Tooltip title={t('Title and tags')}>
          <IconButton size="small" aria-label={t('Title and tags')} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Details')}</Typography>
      <Stack spacing={2} sx={{ mt: 1 }}>
        <Detail icon={<DateIcon />} primary={formatLocal(when, 'EEE, d MMM yyyy')} secondary={formatLocal(when, 'HH:mm')} />
        <Detail icon={item.kind === 'video' ? <VideoIcon /> : <PhotoIcon />} primary={t(item.kind === 'video' ? 'Video' : 'Photo')}
          secondary={item.width && item.height ? `${item.width} × ${item.height}` : null} />
        <Detail icon={item.source === 'google_photos' ? <Box sx={{ display: 'grid', '& svg': { width: 22, height: 22 } }}><Brand icon={siGooglephotos} /></Box>
          : item.source === 'folder' ? <FolderIcon /> : <UploadIcon />}
          primary={item.source === 'google_photos' ? t('Google Photos') : item.source === 'folder' ? t('Synced folder') : t('Uploaded')}
          secondary={t('Added on {date}', { date: formatLocal(item.created_at, 'd MMM yyyy') })} />
      </Stack>
    </Box>
  )
}

function Detail({ icon, primary, secondary }: { icon: ReactNode; primary: string; secondary: string | null }) {
  return (
    <Stack direction="row" sx={{ gap: 2, alignItems: 'flex-start' }}>
      <Box sx={{ color: 'text.secondary', display: 'grid', pt: 0.25 }}>{icon}</Box>
      <Box>
        <Typography variant="body2">{primary}</Typography>
        {secondary && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{secondary}</Typography>}
      </Box>
    </Stack>
  )
}
