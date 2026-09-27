import {
  Alert, Avatar, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, Tooltip, Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import TuneIcon from '@mui/icons-material/TuneOutlined'
import FootballIcon from '@mui/icons-material/SportsSoccerOutlined'
import FightIcon from '@mui/icons-material/SportsMmaOutlined'
import BoxingIcon from '@mui/icons-material/SportsKabaddiOutlined'
import TvIcon from '@mui/icons-material/LiveTvOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import StarIcon from '@mui/icons-material/StarRounded'
import StarOutlineIcon from '@mui/icons-material/StarOutlineRounded'
import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Stat, StatRow, Tag } from '../components/common'
import { addDays, formatLocal, localDate, localTime, today, zonedIso } from '../../shared/time'
import type { Sport, SportsCompetition, SportsEvent, SportsFavourite } from '../../shared/sports'
import { fonts, tokens } from '../theme'
import { EventAlertButton } from '../components/NotificationBell'

const DAYS = 21

type Filter = 'all' | Sport | 'big' | 'national' | 'fav'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'fav', label: '★ Favourites' }, { key: 'big', label: 'Big nights' }, { key: 'football', label: 'Football' },
  { key: 'national', label: 'National teams' }, { key: 'ufc', label: 'UFC' }, { key: 'boxing', label: 'Boxing' },
]

const SPORT: Record<Sport, { icon: ReactNode; fg: string; bg: string; label: string }> = {
  football: { icon: <FootballIcon fontSize="small" />, fg: tokens.matchaDeep, bg: tokens.matchaSoft, label: 'Football' },
  ufc: { icon: <FightIcon fontSize="small" />, fg: tokens.danger, bg: tokens.dangerSoft, label: 'UFC' },
  boxing: { icon: <BoxingIcon fontSize="small" />, fg: tokens.ubeDeep, bg: tokens.ubeSoft, label: 'Boxing' },
}

const ago = (iso: string | null) => {
  if (!iso) return 'not yet'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

/** Upcoming football (leagues, cups, national teams), UFC and boxing, refreshed automatically. */
export function SportsPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [managing, setManaging] = useState(false)
  const from = today()
  const data = useAsync('sports', async () => {
    const [competitions, events] = await Promise.all([
      api.sportsCompetitions(),
      api.sportsEvents(zonedIso(from, '00:00'), zonedIso(addDays(from, DAYS), '00:00')),
    ])
    return { competitions, events }
  }, [from], { refetchInterval: 10 * 60_000 })

  const favs = useAsync('sports-favourites', () => api.sportsFavourites(), [])
  const fav = useMemo(() => {
    const list = favs.data ?? []
    const teams = new Set(list.filter(f => f.kind === 'team').map(f => f.ref))
    const competitions = new Set(list.filter(f => f.kind === 'competition').map(f => f.ref))
    return { list, teams, competitions,
      has: (e: SportsEvent) => competitions.has(e.competition) || (!!e.home && teams.has(e.home)) || (!!e.away && teams.has(e.away)) }
  }, [favs.data])
  const toggleFav = (f: SportsFavourite, on: boolean, name: string) =>
    run(async () => { await api.setSportsFavourite(f, on); await favs.reload() }, on ? `${name} added to favourites` : `${name} removed from favourites`)

  const comps = useMemo(() => new Map((data.data?.competitions ?? []).map(c => [c.code, c])), [data.data])
  const followed = (data.data?.competitions ?? []).filter(c => c.followed)
  const events = (data.data?.events ?? []).filter(e => {
    const c = comps.get(e.competition)
    if (!c?.followed) return false
    if (filter === 'all') return true
    if (filter === 'fav') return fav.has(e)
    if (filter === 'big') return e.big
    if (filter === 'national') return c.kind === 'national'
    return e.sport === filter
  })
  const byDay = useMemo(() => {
    const m = new Map<string, SportsEvent[]>()
    for (const e of events) {
      const d = localDate(e.starts_at)
      m.set(d, [...(m.get(d) ?? []), e])
    }
    return [...m.entries()]
  }, [events])

  const lastRefresh = followed.map(c => c.refreshed_at).filter(Boolean).sort().at(0) ?? null
  const errors = followed.filter(c => c.last_error)
  const all = data.data?.events.filter(e => comps.get(e.competition)?.followed) ?? []
  const thisWeek = all.filter(e => localDate(e.starts_at) < addDays(from, 7))
  const nextBig = all.find(e => e.big && e.status !== 'finished' && Date.parse(e.starts_at) > Date.now() - 2 * 3_600_000)

  return (
    <>
      <PageHeader eyebrow="What's on TV" title="Sports"
        subtitle={`Football, UFC and boxing for the next ${DAYS / 7} weeks, in Madrid time. Updated ${ago(lastRefresh)}; refreshes by itself every few hours.`}
        actions={isAdmin && <>
          <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setManaging(true)}>Competitions</Button>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => run(async () => {
            const n = await api.refreshSports(); await data.reload(); return n
          }, 'Fixtures updated')}>Refresh now</Button>
        </>} />
      <ErrorBox error={data.error} />
      {isAdmin && errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Couldn't update {errors.map(c => c.name).join(', ')} last time. It retries automatically.
        </Alert>
      )}

      {nextBig && comps.get(nextBig.competition) && <NextBigNight e={nextBig} c={comps.get(nextBig.competition)!} />}

      <StatRow>
        <Stat label="This week" value={thisWeek.length} note="fixtures you follow" />
        <Stat label="Big nights" value={thisWeek.filter(e => e.big).length} note="this week · expect fans" tone={thisWeek.some(e => e.big) ? 'warning' : undefined} />
        <Stat label="Following" value={followed.length} note="competitions" />
      </StatRow>

      <Favourites favs={fav.list} upcoming={all.filter(fav.has)} comps={comps} events={data.data?.events ?? []}
        onRemove={(f, name) => toggleFav(f, false, name)} onShowAll={() => setFilter('fav')} />

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2.5 }} role="group" aria-label="Show">
        {FILTERS.map(f => (
          <Chip key={f.key} label={f.label} clickable onClick={() => setFilter(f.key)}
            color={filter === f.key ? 'primary' : 'default'} variant={filter === f.key ? 'filled' : 'outlined'}
            aria-pressed={filter === f.key} />
        ))}
      </Stack>

      {data.data && byDay.length === 0 && (
        <Empty>{followed.length === 0 ? 'No competitions followed yet.'
          : filter === 'fav' ? 'None of your favourites play in the next three weeks. Tap ☆ next to a team to add it.'
          : 'Nothing scheduled in the next three weeks for this filter.'}
          {isAdmin && followed.length === 0 && <Box sx={{ mt: 1 }}><Button onClick={() => setManaging(true)}>Choose competitions</Button></Box>}
        </Empty>
      )}

      <Stack spacing={3}>
        {byDay.map(([day, list]) => (
          <Box key={day} component="section" aria-label={dayLabel(day)}>
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.05rem', mb: 1.25, position: 'sticky', top: { xs: 56, md: 60 },
              bgcolor: 'background.default', py: 0.75, zIndex: 1 }}>
              {dayLabel(day)} <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: '0.9rem' }}>· {list.length}</Typography>
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
              {list.map(e => <EventCard key={e.id} e={e} c={comps.get(e.competition)!} fav={fav} onFav={toggleFav} />)}
            </Box>
          </Box>
        ))}
      </Stack>

      {managing && <CompetitionsDialog competitions={data.data?.competitions ?? []} onClose={() => setManaging(false)} />}
    </>
  )
}

function dayLabel(day: string) {
  const t = today()
  const pretty = formatLocal(zonedIso(day, '12:00'), 'EEEE d MMMM')
  return day === t ? `Today · ${pretty}` : day === addDays(t, 1) ? `Tomorrow · ${pretty}` : pretty
}

// Team initials in a colour picked from the name, so the same team always looks the same.
const CREST = [
  [tokens.roseSoft, tokens.roseDeep], [tokens.ubeSoft, tokens.ubeDeep], [tokens.matchaSoft, tokens.matchaDeep],
  [tokens.infoBg, tokens.infoFg], [tokens.warnBg, tokens.warnFg], [tokens.neutralBg, tokens.neutralFg],
]
const initials = (name: string) => {
  const words = name.replace(/\b(FC|CF|SC|AC|CD|UD|RC|SL|AFC|Club|de|del)\b/g, '').trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 3)).toUpperCase()
}

function Crest({ src, name }: { src: string | null; name: string | null }) {
  const n = name ?? '?'
  const [bg, fg] = CREST[[...n].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % CREST.length]
  return (
    <Avatar src={src ?? undefined} alt="" variant="rounded" slotProps={{ img: { loading: 'lazy' } }}
      sx={{ width: 34, height: 34, bgcolor: src ? tokens.surfaceAlt : bg, color: fg, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', '& img': { objectFit: 'contain' } }}>
      {initials(n)}
    </Avatar>
  )
}

/** Your favourite teams and competitions, and when they're next on. */
function Favourites({ favs, upcoming, comps, events, onRemove, onShowAll }: {
  favs: SportsFavourite[]; upcoming: SportsEvent[]; comps: Map<string, SportsCompetition>; events: SportsEvent[]
  onRemove: (f: SportsFavourite, name: string) => void; onShowAll: () => void
}) {
  const badge = (team: string) => events.find(e => e.home === team)?.home_badge ?? events.find(e => e.away === team)?.away_badge ?? null
  return (
    <Card component="section" aria-label="Favourites" sx={{ mb: 3 }}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <StarIcon sx={{ color: tokens.warning, fontSize: 20 }} />
            <Typography variant="h6" component="h2">Favourites</Typography>
          </Stack>
          {upcoming.length > 3 && <Button size="small" onClick={onShowAll}>All {upcoming.length}</Button>}
        </Stack>
        {favs.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Tap the ☆ next to any team or competition below to keep it here, with its next games. Only you see your favourites.
          </Typography>
        ) : <>
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: upcoming.length ? 2 : 0 }}>
            {favs.map(f => {
              const name = f.kind === 'competition' ? comps.get(f.ref)?.name ?? f.ref : f.ref
              const img = f.kind === 'team' ? badge(f.ref) : null
              return (
                <Chip key={`${f.kind}:${f.ref}`} label={name} onDelete={() => onRemove(f, name)}
                  avatar={img ? <Avatar src={img} alt="" sx={{ bgcolor: 'transparent', '& img': { objectFit: 'contain' } }} /> : undefined}
                  slotProps={{ deleteIcon: { 'aria-label': `Remove ${name} from favourites` } } as never}
                  sx={{ bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }} />
              )
            })}
          </Stack>
          {upcoming.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nothing on for your favourites in the next three weeks.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
              {upcoming.slice(0, 3).map(e => (
                <Box key={e.id} sx={{ p: 1.5, borderRadius: '14px', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: tokens.roseDeep, fontWeight: 600 }}>
                    {dayLabel(localDate(e.starts_at)).split(' · ')[0]} · {e.time_tbc ? 'TBC' : localTime(e.starts_at)}
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }} noWrap>{e.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{comps.get(e.competition)?.name}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </>}
      </Box>
    </Card>
  )
}

/** The next big night, large, so the team sees it at a glance. */
function NextBigNight({ e, c }: { e: SportsEvent; c: SportsCompetition }) {
  const s = SPORT[e.sport]
  const day = localDate(e.starts_at)
  return (
    <Card component="section" aria-label="Next big night" sx={{ mb: 3, p: { xs: 2.25, md: 3 }, position: 'relative', overflow: 'hidden', border: 'none',
      background: `linear-gradient(120deg, ${tokens.espresso} 0%, #4A3B36 100%)`, color: '#fff' }}>
      <Box aria-hidden sx={{ position: 'absolute', right: -30, top: -30, opacity: 0.08, '& svg': { fontSize: 220 } }}>{s.icon}</Box>
      <Typography variant="overline" sx={{ color: tokens.rose, fontWeight: 600, letterSpacing: '0.12em' }}>Next big night</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: { xs: 1.5, md: 3 }, alignItems: { md: 'center' }, mt: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: { xs: '1.35rem', md: '1.75rem' }, lineHeight: 1.2 }}>{e.title}</Typography>
          <Typography sx={{ opacity: 0.75, mt: 0.5 }}>{c.name}{e.venue ? ` · ${e.venue}` : ''}{e.city ? `, ${e.city}` : ''}</Typography>
        </Box>
        <Box sx={{ textAlign: { md: 'right' }, flexShrink: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.2rem' }}>{dayLabel(day).split(' · ')[0]}</Typography>
          <Typography sx={{ opacity: 0.75 }}>{e.time_tbc ? 'Time to be confirmed' : `${localTime(e.starts_at)} Madrid time`}</Typography>
        </Box>
      </Stack>
    </Card>
  )
}

interface FavState { teams: Set<string>; competitions: Set<string>; has: (e: SportsEvent) => boolean }
type OnFav = (f: SportsFavourite, on: boolean, name: string) => void

/** The little star: add or remove a team or competition from your favourites. */
function Star({ on, name, onClick, size = 18 }: { on: boolean; name: string; onClick: () => void; size?: number }) {
  const label = on ? `Remove ${name} from favourites` : `Add ${name} to favourites`
  return (
    <Tooltip title={on ? 'In your favourites' : 'Add to favourites'}>
      <IconButton size="small" aria-label={label} aria-pressed={on} onClick={onClick}
        sx={{ p: 0.4, color: on ? tokens.warning : tokens.inkFaint, opacity: on ? 1 : 0.7, '&:hover': { color: tokens.warning, opacity: 1, bgcolor: 'transparent' } }}>
        {on ? <StarIcon sx={{ fontSize: size }} /> : <StarOutlineIcon sx={{ fontSize: size }} />}
      </IconButton>
    </Tooltip>
  )
}

function EventCard({ e, c, fav, onFav }: { e: SportsEvent; c: SportsCompetition; fav: FavState; onFav: OnFav }) {
  const s = SPORT[e.sport]
  const compFav = fav.competitions.has(c.code)
  const teams = e.home && e.away
  return (
    <Card component="article" sx={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden', ...(e.big ? { borderColor: tokens.rose, boxShadow: `inset 4px 0 0 ${tokens.rose}` } : {}) }}
      aria-label={`${e.time_tbc ? 'Time to be confirmed' : localTime(e.starts_at)} ${e.title}`}>
      <Box sx={{ width: 76, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: e.big ? tokens.roseSoft : tokens.surfaceAlt, px: 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: e.time_tbc ? '1rem' : '1.2rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {e.time_tbc ? 'TBC' : localTime(e.starts_at)}
          </Typography>
          {e.time_tbc && e.status === 'scheduled' && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              {e.sport === 'football' ? 'kick-off' : 'start time'}
            </Typography>
          )}
          {e.status !== 'scheduled' && (
            <Typography variant="caption" sx={{ fontWeight: 600, color: e.status === 'live' ? tokens.danger : 'text.secondary' }}>
              {e.status === 'live' ? 'LIVE' : e.status === 'postponed' ? 'Postponed' : 'Full time'}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ p: 1.75, minWidth: 0, flex: 1 }}>
        <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          <Tag fg={s.fg} bg={s.bg}><Box component="span" sx={{ display: 'inline-flex', mr: 0.5, '& svg': { fontSize: 14 } }}>{s.icon}</Box>{c.name}</Tag>
          <Star on={compFav} name={c.name} size={16} onClick={() => onFav({ kind: 'competition', ref: c.code }, !compFav, c.name)} />
          {e.round && e.sport === 'football' && Number(e.round) < 60 && <Tag>Matchday {e.round}</Tag>}
          {e.big && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>Big night</Tag>}
        </Stack>
        {teams ? (
          <Stack spacing={0.75}>
            {[[e.home, e.home_badge], [e.away, e.away_badge]].map(([name, badge]) => (
              <Stack key={name} direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Crest src={badge} name={name} />
                <Typography sx={{ fontWeight: 600 }} noWrap>{name}</Typography>
                {name && <Star on={fav.teams.has(name)} name={name} onClick={() => onFav({ kind: 'team', ref: name }, !fav.teams.has(name), name)} />}
              </Stack>
            ))}
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            {e.image && <Avatar src={e.image} alt="" variant="rounded" sx={{ width: 52, height: 52 }} />}
            <Typography sx={{ fontWeight: 600, lineHeight: 1.3 }}>{e.title}</Typography>
          </Stack>
        )}
        {(e.venue || e.city) && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }} noWrap>
            <PlaceIcon sx={{ fontSize: 14 }} />{[e.venue, e.city, e.sport !== 'football' ? e.country : null].filter(Boolean).join(', ')}
          </Typography>
        )}
      </Box>
      <Stack sx={{ alignItems: 'center', justifyContent: 'center', px: 1, gap: 0.5 }}>
        {e.big && (
          <Tooltip title="Likely busy: put it on the TV and plan staff">
            <Box sx={{ display: 'grid', placeItems: 'center', color: tokens.roseDeep }}><TvIcon /></Box>
          </Tooltip>
        )}
        {e.status === 'scheduled' && <EventAlertButton kind="sports" refId={e.id} title={e.title} />}
      </Stack>
    </Card>
  )
}

function CompetitionsDialog({ competitions, onClose }: { competitions: SportsCompetition[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const regions = [...new Set(competitions.map(c => c.region))]
  // Ticks change straight away; the saved list catches up in the background.
  const [on, setOn] = useState(() => new Set(competitions.filter(c => c.followed).map(c => c.code)))
  const toggle = (c: SportsCompetition, follow: boolean) => {
    setOn(prev => { const next = new Set(prev); if (follow) next.add(c.code); else next.delete(c.code); return next })
    run(() => api.setSportsFollowed(c.code, follow), follow ? `Following ${c.name}` : `Stopped following ${c.name}`)
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Competitions to follow</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Fixtures for these appear on the Sports page and refresh every few hours.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {regions.map(r => (
            <Box key={r}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{r}</Typography>
              {competitions.filter(c => c.region === r).map(c => (
                <FormControlLabel key={c.code} sx={{ display: 'flex' }} label={c.name}
                  control={<Checkbox checked={on.has(c.code)} onChange={e => toggle(c, e.target.checked)} />} />
              ))}
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Done</Button></DialogActions>
    </Dialog>
  )
}
