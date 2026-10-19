import {
  Alert, AlertTitle, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, Switch, Tooltip, Typography,
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
import CloseIcon from '@mui/icons-material/CloseRounded'
import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { addDays, formatLocal, localDate, localTime, today, zonedIso } from '../../shared/time'
import type { Sport, SportsCompetition, SportsEvent, SportsFavourite } from '../../shared/sports'
import { fonts, tokens } from '../theme'
import { EventAlertButton } from '../components/NotificationBell'
import { msg, t } from '../i18n'

const DAYS = 21

type Filter = 'all' | Sport | 'big' | 'national' | 'fav'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: msg('All') }, { key: 'fav', label: msg('★ Favourites') }, { key: 'big', label: msg('Big nights') }, { key: 'football', label: msg('Football') },
  { key: 'national', label: msg('National teams') }, { key: 'ufc', label: 'UFC' }, { key: 'boxing', label: msg('Boxing') },
]

const SPORT: Record<Sport, { icon: ReactNode; fg: string; bg: string; label: string }> = {
  football: { icon: <FootballIcon fontSize="small" />, fg: tokens.matchaDeep, bg: tokens.matchaSoft, label: msg('Football') },
  ufc: { icon: <FightIcon fontSize="small" />, fg: tokens.danger, bg: tokens.dangerSoft, label: 'UFC' },
  boxing: { icon: <BoxingIcon fontSize="small" />, fg: tokens.ubeDeep, bg: tokens.ubeSoft, label: msg('Boxing') },
}

const ago = (iso: string | null) => {
  if (!iso) return t('not yet')
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 48 * 60 ? t('{n} h ago', { n: Math.round(m / 60) }) : t('{n} days ago', { n: Math.round(m / 1440) })
}

/** Sports is a business-wide switch, off until an admin turns it on here. */
export function SportsPage() {
  const { business } = useApp()
  return business?.sports_enabled ? <Fixtures /> : <SportsOff />
}

/** While Sports is off: nothing is fetched, and admins get the switch to turn it on. */
function SportsOff() {
  const { isAdmin } = useApp()
  return (
    <>
      <PageHeader eyebrow={t("What's on TV")} title={t('Sports')} actions={isAdmin && <SportsSwitch on={false} />} />
      <Card component="section" aria-label={t('Sports is off')}>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>{t('Sports is off')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Football, UFC and boxing fixtures, live scores and big nights on Today are hidden, and nothing is fetched.')}
            {' '}{isAdmin ? t('Turn it back on with the switch above.') : t('An admin can turn it back on.')}
          </Typography>
        </CardContent>
      </Card>
    </>
  )
}

/** On/off for the whole business. Turning it on explains match days first. */
function SportsSwitch({ on }: { on: boolean }) {
  const { api, refresh } = useApp()
  const run = useAction()
  const [asking, setAsking] = useState(false)
  const set = (enabled: boolean) => run(async () => {
    await api.updateBusiness({ sports_enabled: enabled })
    if (enabled) await api.refreshSports().catch(() => 0)
    setAsking(false)
    await refresh()
  }, enabled ? t('Sports is on') : t('Sports is off'))
  return (
    <>
      <FormControlLabel sx={{ mr: 0 }} label={t('Sports')}
        control={<Switch checked={on} onChange={e => (e.target.checked ? setAsking(true) : set(false))} />} />
      <Dialog open={asking} onClose={() => setAsking(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('Turn on Sports?')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t('Shows upcoming football, UFC and boxing with live scores, and big nights on Today, for the whole team. Fixtures update automatically every few hours.')}
          </Typography>
          <Alert severity="warning">
            <AlertTitle>{t('On match days')}</AlertTitle>
            {t("During LaLiga matches, Movistar, Vodafone, Orange, DIGI and Masmovil block large parts of Cloudflare, where this app runs, so the app may not load on those connections while a match is on. That happens whether Sports is on or off. If it won't load, use the free 1.1.1.1 app (WARP) or mobile data from another provider.")}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setAsking(false)}>{t('Cancel')}</Button>
          <Button variant="contained" onClick={() => set(true)}>{t('Turn on')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** Upcoming football (leagues, cups, national teams), UFC and boxing, refreshed automatically. */
function Fixtures() {
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
    run(async () => { await api.setSportsFavourite(f, on); await favs.reload() }, on ? t('{name} added to favourites', { name }) : t('{name} removed from favourites', { name }))

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
  const nextBig = all.find(e => e.big && e.status !== 'finished' && Date.parse(e.starts_at) > Date.now() - 2 * 3_600_000)

  return (
    <>
      <PageHeader eyebrow={t("What's on TV")} title={t('Sports')}
        actions={isAdmin && <>
          <SportsSwitch on />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Updated {ago}', { ago: ago(lastRefresh) })}</Typography>
          <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setManaging(true)}>{t('Competitions')}</Button>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => run(async () => {
            const n = await api.refreshSports(); await data.reload(); return n
          }, t('Fixtures updated'))}>{t('Refresh now')}</Button>
        </>} />
      <ErrorBox error={data.error} />
      {isAdmin && errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("Couldn't update {names} last time. It retries automatically.", { names: errors.map(c => c.name).join(', ') })}
        </Alert>
      )}

      {nextBig && comps.get(nextBig.competition) && <NextBigNight e={nextBig} c={comps.get(nextBig.competition)!} />}

      <Favourites favs={fav.list} upcoming={all.filter(fav.has)} comps={comps} events={data.data?.events ?? []}
        onRemove={(f, name) => toggleFav(f, false, name)} onShowAll={() => setFilter('fav')} />

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2.5 }} role="group" aria-label={t('Show')}>
        {FILTERS.map(f => (
          <Chip key={f.key} label={t(f.label)} clickable onClick={() => setFilter(f.key)}
            color={filter === f.key ? 'primary' : 'default'} variant={filter === f.key ? 'filled' : 'outlined'}
            aria-pressed={filter === f.key} />
        ))}
      </Stack>

      {data.data && byDay.length === 0 && (
        <Empty>{followed.length === 0 ? t('No competitions followed yet.')
          : filter === 'fav' ? t('None of your favourites play in the next three weeks. Tap ☆ next to a team to add it.')
          : t('Nothing scheduled in the next three weeks for this filter.')}
          {isAdmin && followed.length === 0 && <Box sx={{ mt: 1 }}><Button onClick={() => setManaging(true)}>{t('Choose competitions')}</Button></Box>}
        </Empty>
      )}

      <Stack spacing={3}>
        {byDay.map(([day, list]) => (
          <Box key={day} component="section" aria-label={dayLabel(day)}>
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.05rem', mb: 1.25, position: 'sticky', top: { xs: 56, md: 60 },
              bgcolor: 'background.default', py: 0.75, zIndex: 1 }}>
              {dayLabel(day)} <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: '0.9rem' }}>· {list.length}</Typography>
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              {list.map(e => <EventCard key={e.id} e={e} c={comps.get(e.competition)!} fav={fav} onFav={toggleFav} />)}
            </Box>
          </Box>
        ))}
      </Stack>

      {managing && <CompetitionsDialog competitions={data.data?.competitions ?? []} onClose={() => setManaging(false)} />}
    </>
  )
}

/** "Today", "Tomorrow" or "Sat 17 Oct". */
function shortDay(iso: string) {
  const d = localDate(iso), now = today()
  return d === now ? t('Today') : d === addDays(now, 1) ? t('Tomorrow') : formatLocal(iso, 'EEE d MMM')
}

function dayLabel(day: string) {
  const now = today()
  const pretty = formatLocal(zonedIso(day, '12:00'), 'EEEE d MMMM')
  return day === now ? `${t('Today')} · ${pretty}` : day === addDays(now, 1) ? `${t('Tomorrow')} · ${pretty}` : pretty
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
      sx={{ width: 34, height: 34, bgcolor: src ? tokens.surfaceAlt : bg, color: fg, fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', '& img': { objectFit: 'contain' } }}>
      {initials(n)}
    </Avatar>
  )
}

/** Your favourite teams and competitions as tiles, each with when it's next on. */
function Favourites({ favs, upcoming, comps, events, onRemove, onShowAll }: {
  favs: SportsFavourite[]; upcoming: SportsEvent[]; comps: Map<string, SportsCompetition>; events: SportsEvent[]
  onRemove: (f: SportsFavourite, name: string) => void; onShowAll: () => void
}) {
  const badge = (team: string) => events.find(e => e.home === team)?.home_badge ?? events.find(e => e.away === team)?.away_badge ?? null
  const next = (f: SportsFavourite) => upcoming.find(e => (f.kind === 'competition' ? e.competition === f.ref : e.home === f.ref || e.away === f.ref))
  return (
    <Card component="section" aria-label={t('Favourites')} sx={{ mb: 3 }}>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <StarIcon sx={{ color: tokens.warning, fontSize: 20 }} />
            <Typography variant="h6" component="h2">{t('Favourites')}</Typography>
          </Stack>
          {upcoming.length > 0 && <Button size="small" onClick={onShowAll}>{t('Their games ({n})', { n: upcoming.length })}</Button>}
        </Stack>
        {favs.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Tap the ☆ next to any team or competition below to keep it here, with its next game. Only you see your favourites.')}
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
            {favs.map(f => {
              const name = f.kind === 'competition' ? comps.get(f.ref)?.name ?? f.ref : f.ref
              const e = next(f)
              const versus = e && f.kind === 'team' ? (e.home === f.ref ? e.away : e.home) : null
              return (
                <Stack component="li" key={`${f.kind}:${f.ref}`} aria-label={name} direction="row" spacing={1.25}
                  sx={{ alignItems: 'center', p: 1.25, pr: 0.5, borderRadius: '14px', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`, minWidth: 0,
                    ...(e?.big ? { boxShadow: `inset 3px 0 0 ${tokens.rose}` } : {}) }}>
                  {f.kind === 'team' ? <Crest src={badge(f.ref)} name={f.ref} />
                    : <Avatar variant="rounded" sx={{ width: 34, height: 34, bgcolor: tokens.warnBg, color: tokens.warning }}><StarIcon fontSize="small" /></Avatar>}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>{name}</Typography>
                    <Typography variant="body2" sx={{ color: e ? tokens.roseDeep : 'text.secondary' }} noWrap>
                      {e ? `${shortDay(e.starts_at)} · ${e.time_tbc ? t('TBC') : localTime(e.starts_at)}${versus ? ` · ${t('v {team}', { team: versus })}` : ''}`
                        : f.kind === 'team' ? t('Team') : t('Competition')}
                    </Typography>
                  </Box>
                  <IconButton size="small" aria-label={t('Remove {name} from favourites', { name })} onClick={() => onRemove(f, name)} sx={{ color: tokens.inkFaint }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )
            })}
          </Box>
        )}
      </Box>
    </Card>
  )
}

/** The next big night, large, so the team sees it at a glance. */
function NextBigNight({ e, c }: { e: SportsEvent; c: SportsCompetition }) {
  const s = SPORT[e.sport]
  const day = localDate(e.starts_at)
  return (
    <Card component="section" aria-label={t('Next big night')} sx={{ mb: 3, p: { xs: 2.25, md: 3 }, position: 'relative', overflow: 'hidden', border: 'none',
      background: `linear-gradient(120deg, ${tokens.espresso} 0%, #4A3B36 100%)`, color: '#fff' }}>
      <Box aria-hidden sx={{ position: 'absolute', right: -30, top: -30, opacity: 0.08, '& svg': { fontSize: 220 } }}>{s.icon}</Box>
      <Typography variant="overline" sx={{ color: tokens.rose, fontWeight: 500, letterSpacing: '0.12em' }}>{t('Next big night')}</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: { xs: 1.5, md: 3 }, alignItems: { md: 'center' }, mt: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: { xs: '1.35rem', md: '1.75rem' }, lineHeight: 1.2 }}>{e.title}</Typography>
          <Typography sx={{ opacity: 0.75, mt: 0.5 }}>{c.name}{e.venue ? ` · ${e.venue}` : ''}{e.city ? `, ${e.city}` : ''}</Typography>
        </Box>
        <Box sx={{ textAlign: { md: 'right' }, flexShrink: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.2rem' }}>{dayLabel(day).split(' · ')[0]}</Typography>
          <Typography sx={{ opacity: 0.75 }}>{e.time_tbc ? t('Time to be confirmed') : t('{time} Madrid time', { time: localTime(e.starts_at) })}</Typography>
        </Box>
      </Stack>
    </Card>
  )
}

interface FavState { teams: Set<string>; competitions: Set<string>; has: (e: SportsEvent) => boolean }
type OnFav = (f: SportsFavourite, on: boolean, name: string) => void

/** The little star: add or remove a team or competition from your favourites. */
function Star({ on, name, onClick, size = 18 }: { on: boolean; name: string; onClick: () => void; size?: number }) {
  const label = on ? t('Remove {name} from favourites', { name }) : t('Add {name} to favourites', { name })
  return (
    <Tooltip title={on ? t('In your favourites') : t('Add to favourites')}>
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
      aria-label={`${e.time_tbc ? t('Time to be confirmed') : localTime(e.starts_at)} ${e.title}`}>
      <Box sx={{ width: 76, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: e.big ? tokens.roseSoft : tokens.surfaceAlt, px: 1 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: e.time_tbc ? '1rem' : '1.2rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {e.time_tbc ? t('TBC') : localTime(e.starts_at)}
          </Typography>
          {e.time_tbc && e.status === 'scheduled' && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              {e.sport === 'football' ? t('kick-off') : t('start time')}
            </Typography>
          )}
          {e.status !== 'scheduled' && (
            <Typography variant="caption" sx={{ fontWeight: 500, color: e.status === 'live' ? tokens.danger : 'text.secondary' }}>
              {e.status === 'live' ? t('LIVE') : e.status === 'postponed' ? t('Postponed') : t('Full time')}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ p: 1.75, minWidth: 0, flex: 1 }}>
        <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          <Tag fg={s.fg} bg={s.bg}><Box component="span" sx={{ display: 'inline-flex', mr: 0.5, '& svg': { fontSize: 14 } }}>{s.icon}</Box>{c.name}</Tag>
          <Star on={compFav} name={c.name} size={16} onClick={() => onFav({ kind: 'competition', ref: c.code }, !compFav, c.name)} />
          {e.round && e.sport === 'football' && Number(e.round) < 60 && <Tag>{t('Matchday {n}', { n: e.round })}</Tag>}
          {e.big && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Big night')}</Tag>}
        </Stack>
        {teams ? (
          <Stack spacing={0.75}>
            {[[e.home, e.home_badge], [e.away, e.away_badge]].map(([name, badge]) => (
              <Stack key={name} direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Crest src={badge} name={name} />
                <Typography sx={{ fontWeight: 500 }} noWrap>{name}</Typography>
                {name && <Star on={fav.teams.has(name)} name={name} onClick={() => onFav({ kind: 'team', ref: name }, !fav.teams.has(name), name)} />}
              </Stack>
            ))}
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            {e.image && <Avatar src={e.image} alt="" variant="rounded" sx={{ width: 52, height: 52 }} />}
            <Typography sx={{ fontWeight: 500, lineHeight: 1.3 }}>{e.title}</Typography>
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
          <Tooltip title={t('Likely busy: put it on the TV and plan staff')}>
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
    run(() => api.setSportsFollowed(c.code, follow), follow ? t('Following {name}', { name: c.name }) : t('Stopped following {name}', { name: c.name }))
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Competitions to follow')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Fixtures for these appear on the Sports page and refresh every few hours.')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5 }}>
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
      <DialogActions><Button variant="contained" onClick={onClose}>{t('Done')}</Button></DialogActions>
    </Dialog>
  )
}
