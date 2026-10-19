import {
  Alert, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress,
  Radio, RadioGroup, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import PostIcon from '@mui/icons-material/ImageOutlined'
import CarouselIcon from '@mui/icons-material/ViewCarouselOutlined'
import ReelIcon from '@mui/icons-material/MovieOutlined'
import StoryIcon from '@mui/icons-material/WebStoriesOutlined'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import BellIcon from '@mui/icons-material/NotificationsActiveOutlined'
import ListIcon from '@mui/icons-material/ViewAgendaOutlined'
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined'
import TableIcon from '@mui/icons-material/TableRowsOutlined'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import DoneIcon from '@mui/icons-material/TaskAltOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import LeftIcon from '@mui/icons-material/ArrowBackRounded'
import RightIcon from '@mui/icons-material/ArrowForwardRounded'
import CloseIcon from '@mui/icons-material/CloseRounded'
import AutoIcon from '@mui/icons-material/BoltOutlined'
import { siFacebook, siGooglemaps, siInstagram, siTiktok, type SimpleIcon } from 'simple-icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { SortCell, useSort } from '../components/tables'
import { formatLocal, localDate, localTime, today, zonedIso } from '../../shared/time'
import { KINDS, kindInfo, matchesMedia, monthWeeks, postProblem, shiftMonth, type MediaFilter } from '../../shared/social'
import type { IntegrationProvider, IntegrationsState, PostKind, PostMedia, SocialNetwork, SocialPost } from '../../shared/types'
import { readyPhoto, readyVideo, videoSeconds } from '../lib/media'
import { tokens } from '../theme'
import { msg, t, tc } from '../i18n'

type Icon = Pick<SimpleIcon, 'path' | 'hex'>
// LinkedIn asked Simple Icons to drop its mark, so it's kept here.
const siLinkedin: Icon = { hex: '0A66C2', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' }

/** The networks the planner posts to, and which connection each needs. */
const NETWORKS: { id: SocialNetwork; name: string; icon: Icon; provider: IntegrationProvider; limit: number }[] = [
  { id: 'instagram', name: 'Instagram', icon: siInstagram, provider: 'instagram', limit: 2200 },
  { id: 'facebook', name: 'Facebook', icon: siFacebook, provider: 'facebook', limit: 2200 },
  { id: 'tiktok', name: 'TikTok', icon: siTiktok, provider: 'tiktok', limit: 2200 },
  { id: 'linkedin', name: 'LinkedIn', icon: siLinkedin, provider: 'linkedin', limit: 3000 },
  { id: 'google', name: 'Google Maps', icon: siGooglemaps, provider: 'google_business', limit: 1500 },
]
const networkOf = (id: SocialNetwork) => NETWORKS.find(n => n.id === id)!

const KIND_ICON: Record<PostKind, ReactNode> = {
  post: <PostIcon fontSize="small" />, carousel: <CarouselIcon fontSize="small" />, reel: <ReelIcon fontSize="small" />, story: <StoryIcon fontSize="small" />,
}
/** Each kind's colour on the calendar (tags and dots): one hue each, from the brand. */
const KIND_TONE: Record<PostKind, { fg: string; bg: string }> = {
  post: { fg: tokens.roseDeep, bg: tokens.roseSoft }, carousel: { fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  reel: { fg: tokens.matchaDeep, bg: tokens.matchaSoft }, story: { fg: tokens.warnFg, bg: tokens.warnBg },
}
const STORAGE_NAME = { google_drive: 'Google Drive', onedrive: 'OneDrive', r2: msg('Business Agent’s photo storage') } as const

function Mark({ icon, size = 16 }: { icon: Icon; size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}>
      <path d={icon.path} fill={icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`} />
    </Box>
  )
}

const dayLabel = (iso: string) => (localDate(iso) === today() ? t('Today') : formatLocal(iso, 'EEEE d MMMM'))
/** Monday to Sunday (1 to 7 January 2024), for day names in the current language. */
const weekday = (i: number) => `2024-01-0${i + 1}T12:00:00Z`
/** When a post is on the calendar: its planned time, or when it went out. */
const whenOf = (p: SocialPost) => p.scheduled_at ?? p.published_at
/** "Instagram and Facebook" (every name joined with "and"). */
const joinAnd = (names: string[]) => (names.length ? names.reduce((a, b) => t('{a} and {b}', { a, b })) : '')
const sentOf = (p: SocialPost) => ['publishing', 'published', 'partly', 'failed'].includes(p.status)

type View = 'list' | 'calendar' | 'table'
const remembered = <T extends string>(key: string, fallback: T): T => {
  try { return (localStorage.getItem(key) as T | null) ?? fallback } catch { return fallback }
}
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* private window */ } }

/**
 * Admins: plan posts, carousels, reels and stories for every social account at once. Each goes out
 * by itself at its time (once a storage app holds the photos and videos), or is a reminder to post
 * it yourself. Tabs per kind, photos or videos, and three ways to look: list, calendar, table.
 */
export function SocialPlannerPage() {
  const { api } = useApp()
  const posts = useAsync('social-posts', () => api.socialPosts(), [], { refetchInterval: 30_000 })
  const integ = useAsync('integrations', () => api.integrations(), [])
  const [editing, setEditing] = useState<Partial<SocialPost> | null>(null)
  const [kind, setKind] = useState<'all' | PostKind>(() => remembered<'all' | PostKind>('planner-kind', 'all'))
  const [media, setMedia] = useState<MediaFilter>('all')
  const [view, setView] = useState<View>(() => remembered<View>('planner-view', 'list'))
  const connected = (p: IntegrationProvider) => integ.data?.integrations.find(i => i.provider === p && i.status === 'connected')
  const storage = integ.data?.media_storage ?? null

  const all = posts.data ?? []
  const shown = all.filter(p => (kind === 'all' || p.kind === kind) && matchesMedia(p, media))
  const count = (k: 'all' | PostKind) => all.filter(p => (k === 'all' || p.kind === k) && matchesMedia(p, media)).length
  const newPost = (date?: string) => setEditing({ kind: kind === 'all' ? 'post' : kind, caption: '', targets: [], media: [],
    ...(date ? { scheduled_at: zonedIso(date, '10:00') } : {}) })

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Social planner')}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => newPost()}>{t('New post')}</Button>} />
      <ErrorBox error={posts.error} />

      <Stack spacing={3}>
        <Accounts integ={integ.data} storage={storage} connected={connected} />

        <Box>
          {/* What to show (kind, photos or videos) on the left; how to look at it on the right. */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' }, mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={kind} onChange={(_, v: 'all' | PostKind) => { setKind(v); remember('planner-kind', v) }} variant="scrollable" allowScrollButtonsMobile
              aria-label={t('Kinds of post')} sx={{ flex: 1, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none' } }}>
              <Tab value="all" label={<TabLabel n={count('all')}>{t('All')}</TabLabel>} />
              {KINDS.map(k => <Tab key={k.kind} value={k.kind} icon={KIND_ICON[k.kind] as never} iconPosition="start"
                label={<TabLabel n={count(k.kind)}>{t(k.plural)}</TabLabel>} />)}
            </Tabs>
            <Stack direction="row" spacing={1} sx={{ pb: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <ToggleButtonGroup exclusive size="small" value={media} aria-label={t('Photos or videos')} onChange={(_, v: MediaFilter | null) => v && setMedia(v)}>
                <ToggleButton value="all" sx={{ px: 1.5 }}>{t('All')}</ToggleButton>
                <ToggleButton value="image" sx={{ px: 1.5 }}>{t('Photos')}</ToggleButton>
                <ToggleButton value="video" sx={{ px: 1.5 }}>{t('Videos')}</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup exclusive size="small" value={view} aria-label={t('View')} onChange={(_, v: View | null) => { if (v) { setView(v); remember('planner-view', v) } }}>
                <ToggleButton value="list" aria-label={t('List')}><Tooltip title={t('List')}><ListIcon fontSize="small" /></Tooltip></ToggleButton>
                <ToggleButton value="calendar" aria-label={t('Calendar')}><Tooltip title={t('Calendar')}><CalendarIcon fontSize="small" /></Tooltip></ToggleButton>
                <ToggleButton value="table" aria-label={t('Table')}><Tooltip title={t('Table')}><TableIcon fontSize="small" /></Tooltip></ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Stack>

          {view === 'list' && <ListView posts={shown} loaded={!!posts.data} onEdit={setEditing} reload={posts.reload} />}
          {view === 'calendar' && <CalendarView posts={shown} onEdit={setEditing} onNew={newPost} reload={posts.reload} />}
          {view === 'table' && <TableView posts={shown} loaded={!!posts.data} onEdit={setEditing} />}
        </Box>
      </Stack>

      {editing && <Composer post={editing} storage={storage} isConnected={p => !!connected(p)} onClose={() => setEditing(null)} onSaved={posts.reload} />}
    </>
  )
}

function TabLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <span>{children}</span>
      <Box component="span" sx={{ fontSize: '0.72rem', color: 'text.secondary', bgcolor: tokens.neutralBg, borderRadius: 1, px: 0.75, lineHeight: 1.6 }}>{n}</Box>
    </Stack>
  )
}

/** The accounts posts go to, and where photos and videos are kept. */
function Accounts({ integ, storage, connected }: { integ: IntegrationsState | null; storage: IntegrationsState['media_storage'] | null; connected: (p: IntegrationProvider) => unknown }) {
  const row = (p: IntegrationProvider) => integ?.integrations.find(i => i.provider === p && i.status === 'connected')
  const line = { alignItems: 'center', px: { xs: 2, sm: 2.75 }, py: 1.5, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }
  return (
    <Card component="section" aria-label={tc('social', 'Accounts')}>
      {NETWORKS.map(n => (
        <Stack key={n.id} direction="row" spacing={1.5} sx={line}>
          <Box sx={{ color: tokens.ink }}><Mark icon={n.icon} size={20} /></Box>
          <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>{n.name}</Typography>
          {connected(n.provider)
            ? <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{row(n.provider)?.account_label ?? t('Connected')}</Typography>
            : <Button size="small" component={RouterLink} to="/connections">{t('Connect')}</Button>}
        </Stack>
      ))}
      <Stack direction="row" spacing={1.5} sx={line} aria-label={t('Photos and videos')}>
        <Box sx={{ color: tokens.inkSoft, display: 'flex' }}><FolderIcon sx={{ fontSize: 20 }} /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap>{t('Photos and videos')}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {storage ? (storage === 'r2' ? t('Kept for posting automatically') : t('Business Agent › Social, a folder for each kind')) : t('Connect storage to add photos and videos and post automatically')}
          </Typography>
        </Box>
        {storage
          ? <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{storage === 'r2' ? t('Ready') : `${t(STORAGE_NAME[storage])}${row(storage)?.account_label ? ` · ${row(storage)!.account_label}` : ''}`}</Typography>
          : <Button size="small" component={RouterLink} to="/connections">{t('Connect')}</Button>}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// The three views
// ---------------------------------------------------------------------------------------------
function ListView({ posts, loaded, onEdit, reload }: { posts: SocialPost[]; loaded: boolean; onEdit: (p: SocialPost) => void; reload: () => Promise<void> }) {
  const due = posts.filter(p => p.status === 'due').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const upcoming = posts.filter(p => p.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const drafts = posts.filter(p => p.status === 'draft')
  const sent = posts.filter(sentOf).sort((a, b) => (whenOf(b) ?? '').localeCompare(whenOf(a) ?? ''))
  const byDay = upcoming.reduce<[string, SocialPost[]][]>((acc, p) => {
    const d = dayLabel(p.scheduled_at!)
    const last = acc.at(-1)
    if (last?.[0] === d) last[1].push(p); else acc.push([d, [p]])
    return acc
  }, [])
  return (
    <Stack spacing={3}>
      {due.length > 0 && (
        <Box component="section" aria-label={t('Your turn to post')}>
          <SectionTitle>{t('Your turn to post')}</SectionTitle>
          <Card sx={{ borderColor: tokens.rose, bgcolor: tokens.roseWash }}>{due.map(p => <DueRow key={p.id} p={p} onEdit={() => onEdit(p)} reload={reload} />)}</Card>
        </Box>
      )}

      <Box component="section" aria-label={t('Coming up')}>
        <SectionTitle>{t('Coming up')}</SectionTitle>
        {loaded && upcoming.length === 0 && <Empty>{t('Nothing scheduled here. Press New post to plan one.')}</Empty>}
        <Stack spacing={2}>
          {byDay.map(([day, list]) => (
            <Box key={day}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{day}</Typography>
              <Card>{list.map(p => <PostRow key={p.id} p={p} onEdit={() => onEdit(p)} reload={reload} />)}</Card>
            </Box>
          ))}
        </Stack>
      </Box>

      {drafts.length > 0 && (
        <Box component="section" aria-label={t('Drafts')}>
          <SectionTitle>{t('Drafts')}</SectionTitle>
          <Card>{drafts.map(p => <PostRow key={p.id} p={p} onEdit={() => onEdit(p)} reload={reload} />)}</Card>
        </Box>
      )}

      <Box component="section" aria-label={t('Sent')}>
        <SectionTitle>{t('Sent')}</SectionTitle>
        {loaded && sent.length === 0 && <Empty>{t('Posts that have gone out show here, with a link to each one.')}</Empty>}
        {sent.length > 0 && <Card>{sent.map(p => <PostRow key={p.id} p={p} reload={reload} />)}</Card>}
      </Box>
    </Stack>
  )
}

/** A month of posts: a grid on a computer, a grid of dots and the chosen day's posts on a phone. */
function CalendarView({ posts, onEdit, onNew, reload }: {
  posts: SocialPost[]; onEdit: (p: SocialPost) => void; onNew: (date: string) => void; reload: () => Promise<void>
}) {
  const wide = useMediaQuery(useTheme().breakpoints.up('md'))
  const [month, setMonth] = useState(today().slice(0, 7))
  const [picked, setPicked] = useState(today())
  const weeks = monthWeeks(month)
  const on = (d: string) => posts.filter(p => whenOf(p) && localDate(whenOf(p)!) === d).sort((a, b) => whenOf(a)!.localeCompare(whenOf(b)!))
  const title = formatLocal(`${month}-15T12:00:00Z`, 'MMMM yyyy')
  const days = Array.from({ length: 7 }, (_, i) => formatLocal(weekday(i), 'EEE'))
  return (
    <Box component="section" aria-label={t('Calendar')}>
      <Stack direction="row" role="toolbar" aria-label={t('Month')} spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Button variant="outlined" size="small" disabled={month === today().slice(0, 7)} onClick={() => { setMonth(today().slice(0, 7)); setPicked(today()) }}>{t('Today')}</Button>
        <Tooltip title={t('Previous month')}><IconButton aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></IconButton></Tooltip>
        <Tooltip title={t('Next month')}><IconButton aria-label={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></IconButton></Tooltip>
        <Typography variant="h6" component="h2" aria-live="polite" sx={{ textTransform: 'capitalize' }}>{title}</Typography>
      </Stack>
      <Card>
        <Box role="grid" aria-label={title} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {days.map(d => (
            <Box key={d} role="columnheader" sx={{ px: 1, py: 0.75, fontWeight: 500, fontSize: 13, borderBottom: 1, borderColor: 'divider', bgcolor: tokens.surfaceAlt }}>
              {wide ? d : d[0]}
            </Box>
          ))}
          {weeks.flat().map(d => {
            const list = on(d)
            const out = d.slice(0, 7) !== month
            return (
              <Box key={d} role="gridcell" aria-label={formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')} aria-selected={!wide && d === picked}
                onClick={() => (wide ? d >= today() && onNew(d) : setPicked(d))}
                sx={{ minHeight: wide ? 118 : 52, p: 0.75, borderRight: 1, borderBottom: 1, borderColor: 'divider', '&:nth-of-type(7n)': { borderRight: 0 },
                  bgcolor: d === today() ? tokens.today : out ? tokens.surfaceAlt : undefined, cursor: 'pointer',
                  outline: !wide && d === picked ? `2px solid ${tokens.rose}` : undefined, outlineOffset: -2 }}>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.25, fontWeight: d === today() ? 700 : 400, color: out ? 'text.disabled' : 'text.primary' }}>
                  {Number(d.slice(8))}
                </Typography>
                {wide ? (
                  <Stack spacing={0.5} onClick={e => e.stopPropagation()}>
                    {list.slice(0, 3).map(p => <CalendarChip key={p.id} p={p} onOpen={() => onEdit(p)} />)}
                    {list.length > 3 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('+{n} more', { n: list.length - 3 })}</Typography>}
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.25} sx={{ flexWrap: 'wrap' }} aria-hidden>
                    {list.slice(0, 4).map(p => <Box key={p.id} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: KIND_TONE[p.kind].fg }} />)}
                  </Stack>
                )}
              </Box>
            )
          })}
        </Box>
      </Card>
      {!wide && (
        <Box component="section" aria-label={formatLocal(`${picked}T12:00:00Z`, 'EEEE d MMMM')} sx={{ mt: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1, textTransform: 'capitalize' }}>{dayLabel(`${picked}T12:00:00Z`)}</Typography>
            {picked >= today() && <Button size="small" startIcon={<AddIcon />} onClick={() => onNew(picked)}>{t('Plan one')}</Button>}
          </Stack>
          {on(picked).length === 0
            ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing planned.')}</Typography>
            : <Card>{on(picked).map(p => (p.status === 'due' ? <DueRow key={p.id} p={p} onEdit={() => onEdit(p)} reload={reload} />
              : <PostRow key={p.id} p={p} onEdit={sentOf(p) ? undefined : () => onEdit(p)} reload={reload} />))}</Card>}
        </Box>
      )}
      <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.5 }} aria-label={t('Key')}>
        {KINDS.map(k => (
          <Stack key={k.kind} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: KIND_TONE[k.kind].fg }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(k.plural)}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

/** One post on the calendar: time, kind, a glimpse of the photo and the caption. */
function CalendarChip({ p, onOpen }: { p: SocialPost; onOpen: () => void }) {
  const tone = KIND_TONE[p.kind]
  const info = kindInfo(p.kind)
  return (
    <Box component="button" type="button" onClick={onOpen} aria-label={t('{kind} at {time}: {caption}', { kind: t(info.label), time: localTime(whenOf(p)!), caption: p.caption.slice(0, 40) || t('no caption') })}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', minWidth: 0, p: 0.25, pr: 0.75, border: 0, borderRadius: 1, cursor: 'pointer',
        bgcolor: tone.bg, color: tone.fg, font: 'inherit', fontSize: 12, textAlign: 'left', opacity: sentOf(p) && p.status !== 'publishing' ? 0.75 : 1 }}>
      {p.media[0] ? <Thumb m={p.media[0]} size={20} radius={4} /> : <Box sx={{ display: 'flex', '& svg': { fontSize: 16 } }}>{KIND_ICON[p.kind]}</Box>}
      <Box component="span" sx={{ fontWeight: 600, flexShrink: 0 }}>{localTime(whenOf(p)!)}</Box>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.ink }}>{p.caption || t(info.label)}</Box>
    </Box>
  )
}

function TableView({ posts, loaded, onEdit }: { posts: SocialPost[]; loaded: boolean; onEdit: (p: SocialPost) => void }) {
  const { rows, sort } = useSort(posts, {
    when: p => whenOf(p), kind: p => t(kindInfo(p.kind).label), caption: p => p.caption, where: p => p.targets.map(net => networkOf(net).name).join(', '),
    how: p => (p.auto ? 0 : 1), status: p => t(STATUS[p.status].label),
  }, { by: 'when', dir: 'desc' }, ['when'])
  if (loaded && rows.length === 0) return <Empty>{t('No posts here yet. Press New post to plan one.')}</Empty>
  return (
    <Card>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={t('Posts')} sx={{ minWidth: 720, '& th, & td': { px: 1.25 } }}>
          <TableHead>
            <TableRow>
              <SortCell sort={sort} id="when">{t('When')}</SortCell>
              <SortCell sort={sort} id="kind">{t('Kind')}</SortCell>
              <TableCell>{t('Media')}</TableCell>
              <SortCell sort={sort} id="caption">{t('Caption')}</SortCell>
              <SortCell sort={sort} id="where">{t('Where')}</SortCell>
              <SortCell sort={sort} id="how">{t('How')}</SortCell>
              <SortCell sort={sort} id="status">{t('Status')}</SortCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(p => {
              const st = STATUS[p.status]
              return (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{whenOf(p) ? formatLocal(whenOf(p)!, 'EEE d MMM, HH:mm') : '—'}</TableCell>
                  <TableCell><KindTag kind={p.kind} /></TableCell>
                  <TableCell>
                    {p.media.length
                      ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>{p.media.slice(0, 3).map((m, i) => <Thumb key={i} m={m} size={30} radius={6} />)}{p.media.length > 3 && <Typography variant="caption">+{p.media.length - 3}</Typography>}</Stack>
                      : <Typography variant="body2" sx={{ color: 'text.secondary' }}>—</Typography>}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap>{p.caption || '—'}</Typography></TableCell>
                  <TableCell><Stack direction="row" spacing={0.75}>{p.targets.map(net => <Tooltip key={net} title={networkOf(net).name}><Box aria-label={networkOf(net).name}><Mark icon={networkOf(net).icon} /></Box></Tooltip>)}</Stack></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.auto ? t('Automatically') : t('Reminder')}</TableCell>
                  <TableCell><Tag fg={st.fg} bg={st.bg}>{t(st.label)}</Tag></TableCell>
                  <TableCell padding="checkbox">
                    {!sentOf(p) && <Tooltip title={t('Edit')}><IconButton size="small" aria-label={t('Edit post')} onClick={() => onEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------
const STATUS: Record<SocialPost['status'], { label: string; fg: string; bg: string }> = {
  draft: { label: msg('Draft'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  scheduled: { label: msg('Scheduled'), fg: tokens.infoFg, bg: tokens.infoBg },
  due: { label: msg('Your turn'), fg: tokens.roseDeep, bg: tokens.roseSoft },
  publishing: { label: msg('Posting…'), fg: tokens.warnFg, bg: tokens.warnBg },
  published: { label: msg('Posted'), fg: tokens.goodFg, bg: tokens.goodBg },
  partly: { label: msg('Partly posted'), fg: tokens.warnFg, bg: tokens.warnBg },
  failed: { label: msg('Not posted'), fg: tokens.badFg, bg: tokens.badBg },
}

function KindTag({ kind }: { kind: PostKind }) {
  const tone = KIND_TONE[kind]
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.125, borderRadius: 1.5, fontSize: '0.72rem', fontWeight: 500,
      color: tone.fg, bgcolor: tone.bg, whiteSpace: 'nowrap', '& svg': { fontSize: 14 } }}>
      {KIND_ICON[kind]}{t(kindInfo(kind).label)}
    </Box>
  )
}

/** A photo, or a video's first frame with a play mark. */
function Thumb({ m, size, radius = 10 }: { m: PostMedia; size: number; radius?: number }) {
  const [broken, setBroken] = useState(false)
  const box = { width: size, height: size, borderRadius: `${radius}px`, objectFit: 'cover' as const, flexShrink: 0, border: `1px solid ${tokens.line}`, display: 'block' }
  if (m.type === 'image') return <Box component="img" src={m.url} alt="" sx={box} />
  return (
    <Box sx={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      {broken || m.url.startsWith('data:image')
        ? <Box component={m.url.startsWith('data:image') ? 'img' : 'div'} src={m.url.startsWith('data:image') ? m.url : undefined} sx={{ ...box, bgcolor: tokens.ink }} />
        : <Box component="video" src={`${m.url}#t=0.1`} muted playsInline preload="metadata" onError={() => setBroken(true)} sx={{ ...box, bgcolor: tokens.ink }} />}
      <Box aria-label={t('Video')} sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', pointerEvents: 'none' }}>
        <PlayIcon sx={{ fontSize: Math.max(12, size * 0.45), filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />
      </Box>
    </Box>
  )
}

/** The cover, and how many more photos or videos there are. */
function Cover({ p, size = 56 }: { p: SocialPost; size?: number }) {
  if (!p.media.length) {
    return <Box sx={{ width: size, height: size, borderRadius: '10px', flexShrink: 0, bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`,
      display: 'grid', placeItems: 'center', color: tokens.inkFaint }}>{KIND_ICON[p.kind]}</Box>
  }
  return (
    <Box sx={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start', width: size, height: size }}>
      <Thumb m={p.media[0]} size={size} />
      {p.media.length > 1 && (
        <Box sx={{ position: 'absolute', right: 4, bottom: 4, px: 0.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
          {p.media.length}
        </Box>
      )}
    </Box>
  )
}

/** One post as a row: when, what kind, where; and for sent posts, what happened on each network. */
function PostRow({ p, onEdit, reload }: { p: SocialPost; onEdit?: () => void; reload: () => Promise<void> }) {
  const { api } = useApp()
  const run = useAction()
  const st = STATUS[p.status]
  const sent = sentOf(p)
  return (
    <Box component="article" aria-label={t('Post: {caption}', { caption: p.caption.slice(0, 40) || t(kindInfo(p.kind).label) })}
      sx={{ display: 'flex', gap: 1.5, px: { xs: 2, sm: 2.75 }, py: 1.75, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Cover p={p} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          {whenOf(p) && <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {sent ? formatLocal(whenOf(p)!, 'd MMM, HH:mm') : localTime(p.scheduled_at!)}
          </Typography>}
          <KindTag kind={p.kind} />
          <Tag fg={st.fg} bg={st.bg}>{t(st.label)}</Tag>
          {!p.auto && p.status !== 'published' && <Tag><BellIcon sx={{ fontSize: 13, mr: 0.25 }} />{t('Reminder')}</Tag>}
          <Stack direction="row" spacing={0.75} sx={{ color: tokens.ink }}>
            {p.targets.map(net => <Tooltip key={net} title={networkOf(net).name}><Box aria-label={networkOf(net).name}><Mark icon={networkOf(net).icon} /></Box></Tooltip>)}
          </Stack>
        </Stack>
        <Typography sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {p.caption || <Box component="span" sx={{ color: 'text.secondary' }}>{p.kind === 'story' ? t('Story') : t('Photo only')}</Box>}
        </Typography>
        {sent && (
          <Stack component="ul" aria-label={t('Where it went')} sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.75, gap: 0.25 }}>
            {p.targets.map(net => {
              const r = p.results[net]
              const ok = r?.status === 'published'
              return (
                <Stack component="li" key={net} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ color: tokens.ink }}><Mark icon={networkOf(net).icon} size={14} /></Box>
                  <Typography variant="body2" sx={{ color: ok ? tokens.goodFg : r?.status === 'failed' ? tokens.badFg : 'text.secondary' }}>
                    {networkOf(net).name}: {ok ? (r?.manual ? t('posted by hand') : t('posted')) : r?.status === 'failed' ? t('not posted ({error})', { error: r.error ?? t('failed') }) : r?.status === 'retrying' ? t('trying again ({error})', { error: r.error ?? '' }) : t('sending')}
                  </Typography>
                  {ok && r?.url && <IconButton size="small" component="a" href={r.url} target="_blank" rel="noreferrer" aria-label={t('Open on {network}', { network: networkOf(net).name })}><OpenIcon sx={{ fontSize: 15 }} /></IconButton>}
                </Stack>
              )
            })}
          </Stack>
        )}
      </Box>
      <Stack direction="row" sx={{ alignItems: 'flex-start', flexShrink: 0 }}>
        {onEdit && <Tooltip title={t('Edit')}><IconButton size="small" aria-label={t('Edit post')} onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>}
        {p.status !== 'publishing' && (
          <Tooltip title={sent ? t('Remove from the list (it stays on the networks)') : t('Delete')}>
            <IconButton size="small" aria-label={t('Delete post')} onClick={() => run(async () => { await api.deleteSocialPost(p.id); await reload() }, sent ? t('Removed from the list') : t('Post deleted'))}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )
}

/** A reminder whose time has come: everything to post it by hand, then mark it posted. */
function DueRow({ p, onEdit, reload }: { p: SocialPost; onEdit: () => void; reload: () => Promise<void> }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const copy = async () => {
    try { await navigator.clipboard.writeText(p.caption); notify(t('Caption copied')) } catch { notify(t('Couldn’t copy here: select the caption and copy it'), 'error') }
  }
  return (
    <Box component="article" aria-label={t('To post: {caption}', { caption: p.caption.slice(0, 40) || t(kindInfo(p.kind).label) })}
      sx={{ display: 'flex', gap: 1.5, px: { xs: 2, sm: 2.75 }, py: 1.75, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Cover p={p} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <KindTag kind={p.kind} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Planned for {when} on {networks}', { when: formatLocal(p.scheduled_at!, 'EEE d MMM, HH:mm'), networks: joinAnd(p.targets.map(net => networkOf(net).name)) })}
          </Typography>
        </Stack>
        {p.caption && <Typography sx={{ mt: 0.5, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{p.caption}</Typography>}
        <Stack direction="row" spacing={1} sx={{ mt: 1.25, flexWrap: 'wrap', rowGap: 1 }}>
          {p.caption && <Button size="small" variant="outlined" startIcon={<CopyIcon />} onClick={copy}>{t('Copy caption')}</Button>}
          {p.media.map((m, i) => (
            <Button key={m.url} size="small" variant="outlined" startIcon={<DownloadIcon />} component="a" href={m.url} download target="_blank" rel="noreferrer">
              {p.media.length > 1 ? (m.type === 'video' ? t('Video {n}', { n: i + 1 }) : t('Photo {n}', { n: i + 1 })) : m.type === 'video' ? t('Video') : t('Photo')}
            </Button>
          ))}
          {p.targets.includes('instagram') && <Button size="small" startIcon={<OpenIcon />} component="a" href="https://www.instagram.com/" target="_blank" rel="noreferrer">{t('Open Instagram')}</Button>}
          <Button size="small" variant="contained" startIcon={<DoneIcon />} onClick={() => run(async () => { await api.markPosted(p.id); await reload() }, t('Marked as posted'))}>
            {t('Mark as posted')}
          </Button>
        </Stack>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'flex-start', flexShrink: 0 }}>
        <Tooltip title={t('Edit or move it')}><IconButton size="small" aria-label={t('Edit post')} onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------------------------
/** Write or edit a post: its kind, photos and videos, caption, accounts, when, and how it goes out. */
function Composer({ post, storage, isConnected, onClose, onSaved }: {
  post: Partial<SocialPost>; storage: IntegrationsState['media_storage'] | null; isConnected: (p: IntegrationProvider) => boolean
  onClose: () => void; onSaved: () => Promise<void>
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const file = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<PostKind>(post.kind ?? 'post')
  const [caption, setCaption] = useState(post.caption ?? '')
  const [media, setMedia] = useState<PostMedia[]>(post.media ?? [])
  const [targets, setTargets] = useState<SocialNetwork[]>(post.targets?.length ? post.targets
    : NETWORKS.filter(n => isConnected(n.provider) && kindInfo(post.kind ?? 'post').networks.includes(n.id)).map(n => n.id))
  const [when, setWhen] = useState<'now' | 'later'>(post.scheduled_at ? 'later' : 'now')
  const [date, setDate] = useState(post.scheduled_at ? localDate(post.scheduled_at) : today())
  const [time, setTime] = useState(post.scheduled_at ? localTime(post.scheduled_at) : '10:00')
  // Posting by itself needs somewhere for the photos and videos to wait for the networks.
  const [auto, setAuto] = useState(post.id ? (post.auto ?? true) && !!storage : !!storage)
  const chose = useRef(false)
  // Storage known only after the page loaded it: follow it until the admin picks for themselves.
  useEffect(() => { if (!chose.current) setAuto(post.id ? (post.auto ?? true) && !!storage : !!storage) }, [storage, post.id, post.auto])
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null)
  const info = kindInfo(kind)
  const chosen = NETWORKS.filter(n => targets.includes(n.id))
  // The tightest limit of the networks picked (LinkedIn alone takes 3000).
  const limit = chosen.length ? Math.min(...chosen.map(n => n.limit)) : 2200
  const problem = postProblem({ kind, caption, media, targets, auto, status: 'scheduled' })
  const room = info.max - media.length

  const changeKind = (k: PostKind | null) => {
    if (!k) return
    setKind(k)
    const allowed = kindInfo(k).networks
    const kept = targets.filter(net => allowed.includes(net))
    setTargets(kept.length ? kept : NETWORKS.filter(n => isConnected(n.provider) && allowed.includes(n.id)).map(n => n.id))
  }

  const add = (files: File[]) => run(async () => {
    const list = files.slice(0, room)
    setUploading({ done: 0, of: list.length })
    try {
      for (const [i, f] of list.entries()) {
        let ready: File
        if (f.type.startsWith('video/')) {
          if (!info.accepts.includes('video')) throw new Error(t('{kinds} take photos. Choose Reel for a video.', { kinds: t(info.plural) }))
          ready = readyVideo(f)
          const secs = await videoSeconds(f)
          if (secs !== null && kind === 'story' && secs > 60) throw new Error(t('Stories can be up to 60 seconds. Trim it, or post it as a reel.'))
          if (secs !== null && kind === 'reel' && (secs < 3 || secs > 900)) throw new Error(t('Reels are 3 seconds to 15 minutes long'))
          if (secs !== null && kind === 'carousel' && secs > 60) throw new Error(t('Videos in a carousel can be up to 60 seconds'))
        } else {
          if (!info.accepts.includes('image')) throw new Error(t('Reels are videos. Choose Post or Story for a photo.'))
          ready = await readyPhoto(f, kind === 'post' || kind === 'carousel')
        }
        const m = await api.uploadMedia(ready, info.folder)
        setMedia(prev => [...prev, m])
        setUploading({ done: i + 1, of: list.length })
      }
    } finally { setUploading(null) }
  }, files.length > room ? t('Only {max} fit in a {kind}: the first {n} were added', { max: info.max, kind: t(info.label).toLowerCase(), n: room }) : undefined)

  const move = (i: number, by: number) => setMedia(m => {
    const next = [...m]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x)
    return next
  })

  const save = (status: 'draft' | 'scheduled') => run(async () => {
    const scheduled_at = status === 'draft' ? (when === 'later' ? zonedIso(date, time) : null) : when === 'now' ? new Date().toISOString() : zonedIso(date, time)
    if (status === 'scheduled' && when === 'later' && Date.parse(scheduled_at!) < Date.now() - 60_000) throw new Error(t('That time has passed. Pick a later one, or choose Now.'))
    if (status === 'scheduled' && problem) throw new Error(t(problem))
    await api.saveSocialPost({ id: post.id, kind, caption, media, targets, status, scheduled_at, auto })
    await onSaved()
    onClose()
  }, status === 'draft' ? t('Draft saved')
    : !auto ? (when === 'now' ? t('Added to Your turn to post') : t('Reminder set for {when}', { when: formatLocal(zonedIso(date, time), 'EEE d MMM, HH:mm') }))
    : when === 'now' ? t('Posting now') : t('Scheduled for {when}', { when: formatLocal(zonedIso(date, time), 'EEE d MMM, HH:mm') }))

  // Where the photos and videos are kept (the folder names are the real ones in the storage app).
  const where = storage ? `${t(STORAGE_NAME[storage])}${storage === 'r2' ? '' : ` › Business Agent › Social › ${info.folder}`}` : ''
  const accept = info.accepts.map(a => (a === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/quicktime')).join(',')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{post.id ? t('Edit post') : t('New post')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box>
            <ToggleButtonGroup exclusive fullWidth size="small" value={kind} onChange={(_, k: PostKind | null) => changeKind(k)} aria-label={t('Type of post')}>
              {KINDS.map(k => (
                <ToggleButton key={k.kind} value={k.kind} sx={{ gap: 0.75, textTransform: 'none', flexDirection: { xs: 'column', sm: 'row' } }}>
                  {KIND_ICON[k.kind]}{t(k.label)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t(info.hint)}</Typography>
          </Box>

          <Box role="group" aria-label={t('Photos and videos')}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {kind === 'post' ? t('Photo') : kind === 'reel' ? t('Video') : kind === 'story' ? t('Photo or video') : t('Photos and videos ({n} of up to 10)', { n: media.length })}
            </Typography>
            {!storage ? (
              <Alert severity="info" action={<Button size="small" component={RouterLink} to="/connections">{t('Connect')}</Button>}>
                {t('Connect Google Drive or OneDrive to add photos and videos, and to post automatically. They’re kept in its Business Agent › Social folder.')}
              </Alert>
            ) : (
              <>
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  {media.map((m, i) => (
                    <Box key={`${m.url}-${i}`} sx={{ position: 'relative' }}>
                      <Thumb m={m} size={88} />
                      <IconButton size="small" aria-label={m.type === 'video' ? t('Remove video {n}', { n: i + 1 }) : t('Remove photo {n}', { n: i + 1 })} onClick={() => setMedia(media.filter((_, j) => j !== i))}
                        sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,.55)', color: '#fff', p: 0.25, '&:hover': { bgcolor: 'rgba(0,0,0,.75)' } }}>
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      {kind === 'carousel' && media.length > 1 && (
                        <Stack direction="row" sx={{ position: 'absolute', bottom: 2, left: 2, right: 2, justifyContent: 'space-between' }}>
                          <IconButton size="small" aria-label={t('Move {n} earlier', { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}
                            sx={{ bgcolor: 'rgba(0,0,0,.55)', color: '#fff', p: 0.25, visibility: i === 0 ? 'hidden' : undefined }}><LeftIcon sx={{ fontSize: 16 }} /></IconButton>
                          <IconButton size="small" aria-label={t('Move {n} later', { n: i + 1 })} disabled={i === media.length - 1} onClick={() => move(i, 1)}
                            sx={{ bgcolor: 'rgba(0,0,0,.55)', color: '#fff', p: 0.25, visibility: i === media.length - 1 ? 'hidden' : undefined }}><RightIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Stack>
                      )}
                    </Box>
                  ))}
                  {room > 0 && (
                    <Button variant="outlined" startIcon={<PhotoIcon />} disabled={!!uploading} onClick={() => file.current?.click()}
                      sx={{ height: media.length ? 88 : undefined }}>
                      {kind === 'reel' ? t('Add the video') : kind === 'post' ? t('Add a photo') : kind === 'story' ? t('Add a photo or video') : t('Add photos or videos')}
                    </Button>
                  )}
                </Stack>
                {uploading && (
                  <Box sx={{ mt: 1.5 }} role="status">
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{uploading.of > 1 ? t('Uploading {n} of {total}… (videos can take a minute)', { n: uploading.done + 1, total: uploading.of }) : t('Uploading … (videos can take a minute)')}</Typography>
                    <LinearProgress sx={{ mt: 0.5, borderRadius: 1 }} />
                  </Box>
                )}
                <input ref={file} type="file" accept={accept} multiple={kind === 'carousel'} hidden aria-label={t('Photo or video file')} onChange={e => {
                  const files = [...(e.target.files ?? [])]
                  if (files.length) void add(files)
                  e.target.value = ''
                }} />
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                  {(kind === 'post' || kind === 'carousel' ? t('Saved in {where}. Photos are sent as JPEG, cropped to a shape Instagram takes.', { where }) : t('Saved in {where}. Photos are sent as JPEG.', { where }))}
                </Typography>
              </>
            )}
          </Box>

          <TextField label={kind === 'story' ? t('Note (for you: stories have no caption)') : t('Caption')} multiline minRows={kind === 'story' ? 2 : 4} value={caption}
            onChange={e => setCaption(e.target.value)} error={caption.length > limit}
            helperText={kind === 'story' ? t('Add stickers, music or a link in the Instagram app (choose Remind me).')
              : chosen.some(n => n.id === 'google') ? t('{n} / {limit} (Google Maps allows 1500)', { n: caption.length, limit }) : `${caption.length} / ${limit}`} />

          <Box role="group" aria-label={t('Post to')}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>{t('Post to')}</Typography>
            <Stack>
              {NETWORKS.map(n => {
                const ok = isConnected(n.provider)
                const fits = info.networks.includes(n.id)
                return (
                  <FormControlLabel key={n.id} disabled={!ok || !fits}
                    control={<Checkbox checked={targets.includes(n.id)} onChange={e => setTargets(e.target.checked ? [...targets, n.id] : targets.filter(net => net !== n.id))} />}
                    label={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Mark icon={n.icon} /><span>{n.name}</span>
                      {!ok ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('not connected')}</Typography>
                        : !fits && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('posts only')}</Typography>}
                    </Stack>} />
                )
              })}
            </Stack>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>{t('When')}</Typography>
            <RadioGroup row value={when} onChange={e => setWhen(e.target.value as 'now' | 'later')}>
              <FormControlLabel value="now" control={<Radio />} label={t('Now')} />
              <FormControlLabel value="later" control={<Radio />} label={t('Schedule')} />
            </RadioGroup>
            {when === 'later' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1 }}>
                <TextField type="date" label={t('Date')} value={date} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }} />
                <TextField type="time" label={t('Time (Madrid)')} value={time} onChange={e => setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            )}
          </Box>

          <Box role="radiogroup" aria-label={t('How it goes out')}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>{t('How it goes out')}</Typography>
            <RadioGroup value={auto ? 'auto' : 'remind'} onChange={e => { chose.current = true; setAuto(e.target.value === 'auto') }}>
              <FormControlLabel value="auto" disabled={!storage} control={<Radio />} label={
                <Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><AutoIcon sx={{ fontSize: 18 }} /><span>{t('Post it automatically')}</span></Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {storage ? t('It goes out by itself at the time.') : t('Needs Google Drive or OneDrive connected: that’s where the photos and videos wait for Instagram.')}
                  </Typography>
                </Box>} sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { pt: 0.5 } }} />
              <FormControlLabel value="remind" control={<Radio />} label={
                <Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><BellIcon sx={{ fontSize: 18 }} /><span>{t('Remind me to post it myself')}</span></Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {t('At the time, admins get a reminder with the caption and photos ready, for stickers, music or anything the app can’t add.')}
                  </Typography>
                </Box>} sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.5 } }} />
            </RadioGroup>
          </Box>
          {problem && <Alert severity="warning">{t(problem)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} sx={{ mr: 'auto' }}>{t('Cancel')}</Button>
        <Button variant="outlined" disabled={!!uploading} onClick={() => save('draft')}>{t('Save draft')}</Button>
        <Button variant="contained" disabled={!!uploading} onClick={() => save('scheduled')}>
          {!auto ? (when === 'now' ? t('Add to my list') : t('Set reminder')) : when === 'now' ? t('Post now') : t('Schedule')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
