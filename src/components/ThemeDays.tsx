// Theme days on the Calendar, Today and Music pages: each day's theme (a colour, a flag and a name),
// the coffee it serves with its bag's photo, and its playlist with a button that plays it on the café
// speaker (or opens it). Also the Calendar's Themes tab, where admins make the themes, set the weekly
// rotation and set dates apart; the team sees the same read-only.
import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CoffeeIcon from '@mui/icons-material/CoffeeOutlined'
import MusicIcon from '@mui/icons-material/MusicNote'
import OpenIcon from '@mui/icons-material/OpenInNew'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import CloseIcon from '@mui/icons-material/CloseRounded'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useCafeMusic } from '../app/CafeSpeaker'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from './common'
import {
  BREWS, PROCESSES, ROASTS, THEME_COLOURS, THEME_EMOJIS, THEME_LIMITS, WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_SHORT, flagOf, inkOn, isoWeekday, playlistFromLink,
  sortThemes, themeOn, themeProblem, weekdaysOf, type Coffee, type DayTheme, type DayThemeInput, type ThemeDays, type ThemePlaylist,
} from '../../shared/themeDays'
import { DAY_KEYS, type OpeningHours, type Profile } from '../../shared/types'
import { addDays, formatLocal, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { locale, t, tc } from '../i18n'

const onTeam = (me: Profile | null) => !!me?.active && (me.role === 'admin' || me.role === 'employee')

/** The themes, rotation and dates (null for anyone not on the team). */
export function useThemeDays() {
  const { api, me } = useApp()
  const staff = onTeam(me)
  return useAsync('theme-days', () => (staff ? api.themeDays() : Promise.resolve(null)), [staff])
}

/** The coffees, those in use first. */
export function useCoffees() {
  const { api, me } = useApp()
  const staff = onTeam(me)
  return useAsync('coffees', () => (staff ? api.coffees() : Promise.resolve([] as Coffee[])), [staff])
}

/** A country's name in the language the app is in: CO → Colombia. */
export function countryName(code: string) {
  try { return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code } catch { return code }
}
/** "🇨🇴 Colombia · Huila". */
export const originOf = (c: Pick<Coffee, 'country' | 'region'>) =>
  [c.country ? `${flagOf(c.country)} ${countryName(c.country)}` : null, c.region].filter(Boolean).join(' · ')
export const roastLabel = (c: Pick<Coffee, 'roast'>) => (c.roast ? t(ROASTS.find(r => r.id === c.roast)!.label) : null)
export const processLabel = (c: Pick<Coffee, 'process'>) => (c.process ? t(PROCESSES.find(p => p.id === c.process)!.label) : null)
export const brewLabel = (c: Pick<Coffee, 'brew'>) => t(BREWS.find(b => b.id === c.brew)?.label ?? BREWS[2].label)

/** Whether the business is closed on a weekday by its opening hours (not set yet: open). */
export const closedWeekday = (weekday: number, hours: OpeningHours | null | undefined) =>
  !!hours && Object.keys(hours).length > 0 && !hours[DAY_KEYS[weekday - 1]]

/** A bag's photo (taller than wide), or the coffee's flag on a soft card until it has one. */
export function CoffeePhoto({ coffee, size = 56 }: { coffee: Pick<Coffee, 'name' | 'photo' | 'country'>; size?: number }) {
  const sx = { width: size, height: Math.round(size * 1.25), borderRadius: size > 60 ? 3 : 2, flexShrink: 0, border: `1px solid ${tokens.line}` }
  if (coffee.photo) return <Box component="img" src={coffee.photo} alt={coffee.name} sx={{ ...sx, objectFit: 'cover', display: 'block' }} />
  const flag = flagOf(coffee.country)
  return (
    <Box role="img" aria-label={t('{name} has no photo yet', { name: coffee.name })}
      sx={{ ...sx, display: 'grid', placeItems: 'center', bgcolor: tokens.roseWash, color: tokens.inkSoft, fontSize: size * 0.4, lineHeight: 1 }}>
      {flag || <CoffeeIcon sx={{ fontSize: size * 0.45 }} />}
    </Box>
  )
}

/** A theme as a small coloured label: 🇨🇴 Colombian day. */
export function ThemeBadge({ theme, small }: { theme: Pick<DayTheme, 'name' | 'emoji' | 'colour'>; small?: boolean }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: small ? 0.75 : 1, py: small ? 0 : 0.25, borderRadius: 1.5, maxWidth: '100%',
      bgcolor: theme.colour, color: inkOn(theme.colour), fontWeight: 500, fontSize: small ? '0.72rem' : '0.85rem', lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {theme.emoji && <span aria-hidden>{theme.emoji}</span>}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{theme.name}</Box>
    </Box>
  )
}

/**
 * Play a theme's playlist: on the café speaker when the café's music is YouTube Music (the device
 * playing starts it, or it's up next), otherwise open it in YouTube Music or Spotify.
 */
export function PlaylistButton({ playlist }: { playlist: ThemePlaylist }) {
  const music = useCafeMusic()
  const run = useAction()
  const name = playlist.name
  if (music?.enabled && playlist.provider !== 'spotify') {
    return (
      <Button size="small" variant="contained" startIcon={<PlayIcon />} aria-label={t('Play {name} on the café speaker', { name })} sx={{ flexShrink: 0 }}
        onClick={() => run(() => music.playPlaylist({ id: playlist.id, name, image: playlist.image, tracks: playlist.tracks ?? 0, url: playlist.url }),
          music.live ? t('Playing {name}', { name }) : t('{name} is up next. Press Play on this device, or on the café tablet.', { name }))}>
        {t('Play')}
      </Button>
    )
  }
  return (
    <Button size="small" variant="outlined" endIcon={<OpenIcon fontSize="small" />} href={playlist.url} target="_blank" rel="noreferrer"
      aria-label={t('Open {name}', { name })} sx={{ flexShrink: 0 }}>
      {tc('verb', 'Open')}
    </Button>
  )
}

/** A theme's coffee (with its photo), its playlist (with its button) and its notes. */
export function ThemeSummary({ theme, coffees }: { theme: DayTheme; coffees: Coffee[] }) {
  const coffee = coffees.find(c => c.id === theme.coffee_id)
  return (
    <Stack spacing={1.25}>
      {coffee ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <CoffeePhoto coffee={coffee} size={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>{t('Coffee')}</Typography>
            <Typography sx={{ fontWeight: 500 }}>{coffee.name}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[originOf(coffee), roastLabel(coffee)].filter(Boolean).join(' · ')}</Typography>
          </Box>
        </Stack>
      ) : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No coffee picked for this theme yet.')}</Typography>}
      {theme.playlist && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center',
            background: `linear-gradient(135deg, ${theme.colour} 0%, ${tokens.espresso} 130%)` }}>
            {theme.playlist.image ? <Box component="img" src={theme.playlist.image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <MusicIcon sx={{ color: '#fff', fontSize: 22 }} />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>{t('Playlist')}</Typography>
            <Typography sx={{ fontWeight: 500 }} noWrap>{theme.playlist.name}</Typography>
          </Box>
          <PlaylistButton playlist={theme.playlist} />
        </Stack>
      )}
      {theme.notes && <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{theme.notes}</Typography>}
    </Stack>
  )
}

/**
 * Today's theme, big: its flag and name, the coffee and the playlist. On the Calendar it leads the
 * page with the next six days under it; elsewhere it's the card's top.
 */
export function TodayTheme({ days, coffees, closures, withWeek, onSetUp }: {
  days: ThemeDays | null; coffees: Coffee[]; closures?: Set<string>; withWeek?: boolean; onSetUp?: () => void
}) {
  const { business, isAdmin } = useApp()
  const d = today()
  if (!days) return null
  if (!days.themes.length) {
    return isAdmin && onSetUp ? (
      <Card component="section" aria-label={t('Theme days')} sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ flex: 1, minWidth: 220 }}>{t('Give each day a theme: a coffee to serve and a playlist to go with it, like a Colombian day.')}</Typography>
          <Button variant="outlined" onClick={onSetUp}>{t('Set up theme days')}</Button>
        </CardContent>
      </Card>
    ) : null
  }
  const hours = business?.opening_hours
  const on = themeOn(d, days, { hours, closures })
  const theme = on.theme
  const note = on.source === 'date' ? days.dates.find(x => x.day === d)?.note : null
  return (
    <Card component="section" aria-label={t('Today’s theme')} sx={{ mb: withWeek ? 2 : 0, overflow: 'hidden', borderLeft: `6px solid ${theme?.colour ?? tokens.line}` }}>
      <Stack direction={{ xs: 'column', md: withWeek ? 'row' : 'column' }} spacing={2} sx={{ p: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: tokens.roseDeep, textTransform: 'capitalize' }}>{t('Today')} · {formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')}</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {theme?.emoji && <Box aria-hidden sx={{ fontSize: '2rem', lineHeight: 1 }}>{theme.emoji}</Box>}
            <Typography variant="h5" component="h2" sx={{ fontFamily: fonts.display }}>
              {theme ? theme.name : on.closed ? t('Closed today: no theme') : t('No theme today')}
            </Typography>
          </Stack>
          {theme?.description && <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>{theme.description}</Typography>}
          {note && <Typography variant="body2" sx={{ mt: 0.5 }}>{note}</Typography>}
        </Box>
        {theme && <Box sx={{ flex: 1.2, minWidth: 0 }}><ThemeSummary theme={theme} coffees={coffees} /></Box>}
      </Stack>
      {withWeek && (
        <Box role="list" aria-label={t('The next few days')}
          sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))' }, borderTop: `1px solid ${tokens.line}` }}>
          {[1, 2, 3, 4, 5, 6].map(n => {
            const day = addDays(d, n)
            const x = themeOn(day, days, { hours, closures })
            const label = formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')
            return (
              <Box key={day} role="listitem" aria-label={`${label}: ${x.theme ? x.theme.name : x.closed ? t('Closed') : t('No theme')}`}
                sx={{ px: 1.25, py: 1, minWidth: 0, borderLeft: `1px solid ${tokens.line}`, '&:first-of-type': { borderLeft: 0 } }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textTransform: 'capitalize' }}>{formatLocal(`${day}T12:00:00Z`, 'EEE d')}</Typography>
                {x.theme ? <ThemeBadge theme={x.theme} small /> : <Typography variant="caption" sx={{ color: 'text.disabled' }}>{x.closed ? t('Closed') : '—'}</Typography>}
              </Box>
            )
          })}
        </Box>
      )}
    </Card>
  )
}

/** Music page: today's theme and its playlist, one press away. */
export function ThemeMusicShortcut() {
  const { business } = useApp()
  const days = useThemeDays()
  const on = themeOn(today(), days.data, { hours: business?.opening_hours })
  const theme = on.theme
  if (!theme?.playlist) return null
  return (
    <Card component="section" aria-label={t('Today’s theme playlist')} sx={{ borderLeft: `6px solid ${theme.colour}` }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        {theme.emoji && <Box aria-hidden sx={{ fontSize: '1.6rem', lineHeight: 1 }}>{theme.emoji}</Box>}
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>{t('Today’s theme playlist')} · {theme.name}</Typography>
          <Typography sx={{ fontWeight: 500 }}>{theme.playlist.name}</Typography>
        </Box>
        <PlaylistButton playlist={theme.playlist} />
      </Stack>
    </Card>
  )
}

/** A day on the calendar: its theme, its coffee and playlist, and for admins the theme for that date. */
export function DayThemeDialog({ day, days, coffees, closures, onClose }: {
  day: string; days: ThemeDays; coffees: Coffee[]; closures?: Set<string>; onClose: () => void
}) {
  const { api, business, isAdmin } = useApp()
  const run = useAction()
  const on = themeOn(day, days, { hours: business?.opening_hours, closures })
  const set = days.dates.find(x => x.day === day)
  const fromRotation = days.themes.find(x => x.id === days.rotation[isoWeekday(day)])
  const label = formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')
  const value = set ? set.theme_id ?? 'none' : 'rotation'
  const change = (v: string) => {
    const theme = days.themes.find(x => x.id === v)
    void run(() => api.setThemeDate(day, v === 'rotation' ? undefined : v === 'none' ? null : v),
      v === 'rotation' ? t('{date} follows the weekly rotation again', { date: label })
        : theme ? t('{theme} on {date}', { theme: theme.name, date: label }) : t('No theme on {date}', { date: label }))
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ textTransform: 'capitalize' }}>{label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {on.theme ? (
            <Box>
              <ThemeBadge theme={on.theme} />
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                {on.source === 'date' ? t('Set for this date') : t('From the weekly rotation')}{set?.note ? ` · ${set.note}` : ''}
              </Typography>
              {on.theme.description && <Typography variant="body2" sx={{ mt: 1 }}>{on.theme.description}</Typography>}
            </Box>
          ) : <Typography sx={{ color: 'text.secondary' }}>{on.closed && on.source !== 'date' ? t('Closed: no theme') : t('No theme this day')}</Typography>}
          {on.theme && <ThemeSummary theme={on.theme} coffees={coffees} />}
          {isAdmin && (
            <TextField select label={t('Theme on this date')} value={value} onChange={e => change(e.target.value)}
              helperText={t('Just this date: the weekly rotation stays as it is.')}>
              <MenuItem value="rotation">{fromRotation ? t('Weekly rotation ({name})', { name: fromRotation.name }) : t('Weekly rotation (no theme)')}</MenuItem>
              {sortThemes(days.themes).map(x => <MenuItem key={x.id} value={x.id}>{x.emoji ? `${x.emoji} ` : ''}{x.name}</MenuItem>)}
              <MenuItem value="none">{t('No theme this day')}</MenuItem>
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Close')}</Button></DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// The Themes tab
// ---------------------------------------------------------------------------------------------

/** Calendar → Themes: the weekly rotation, the themes, and the dates set apart. Admins change them. */
export function ThemesTab() {
  const { api, business, isAdmin } = useApp()
  const run = useAction()
  const days = useThemeDays()
  const coffees = useCoffees()
  const [editing, setEditing] = useState<DayTheme | 'new' | null>(null)
  const [newDate, setNewDate] = useState({ day: addDays(today(), 1), theme: '', note: '' })
  const list = coffees.data ?? []
  const data = days.data
  if (!data) return <ErrorBox error={days.error} />
  const themes = sortThemes(data.themes)
  const hours = business?.opening_hours
  const byId = (id: string | null | undefined) => themes.find(x => x.id === id)
  const coming = data.dates.filter(x => x.day >= today())
  const shortDays = (id: string) => weekdaysOf(id, data.rotation).map(w => t(WEEKDAY_SHORT[w - 1])).join(', ')

  return (
    <Stack spacing={3}>
      <ErrorBox error={days.error ?? coffees.error} />
      <Card component="section" aria-label={t('Weekly rotation')}>
        <CardContent>
          <SectionTitle>{t('Weekly rotation')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>
            {t('Each day of the week has its theme, with its coffee and playlist. A day the café is closed has none; a date set apart below comes first.')}
          </Typography>
          <Box role="list" aria-label={t('Weekly rotation')}>
            {WEEKDAYS.map(w => {
              const day = t(WEEKDAY_NAMES[w - 1])
              const theme = byId(data.rotation[w])
              const closed = closedWeekday(w, hours)
              const coffee = list.find(c => c.id === theme?.coffee_id)
              return (
                <Box key={w} role="listitem" aria-label={day}
                  sx={{ display: 'grid', gap: 1.5, alignItems: 'center', py: 1.25, borderTop: `1px solid ${tokens.line}`, opacity: closed ? 0.55 : 1,
                    gridTemplateColumns: { xs: '1fr', md: '120px minmax(200px, 1fr) minmax(0, 1.2fr) minmax(0, 1.2fr)' } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 500 }}>{day}</Typography>
                    {closed && <Tag>{t('Closed')}</Tag>}
                  </Stack>
                  {isAdmin ? (
                    <TextField select size="small" label={t('{day}: theme', { day })} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={theme?.id ?? ''} disabled={closed}
                      onChange={e => run(() => api.setThemeRotation(w, e.target.value || null),
                        e.target.value ? t('{theme} every {day}', { theme: byId(e.target.value)?.name ?? '', day }) : t('No theme on {day}s', { day }))}>
                      <MenuItem value="">{t('No theme')}</MenuItem>
                      {themes.map(x => <MenuItem key={x.id} value={x.id}>{x.emoji ? `${x.emoji} ` : ''}{x.name}</MenuItem>)}
                    </TextField>
                  ) : (
                    <Box>{theme && !closed ? <ThemeBadge theme={theme} /> : <Typography sx={{ color: 'text.disabled' }}>{closed ? t('Closed') : t('No theme')}</Typography>}</Box>
                  )}
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    {coffee && !closed && <><CoffeePhoto coffee={coffee} size={28} /><Typography variant="body2" noWrap>{coffee.name}</Typography></>}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    {theme?.playlist && !closed && <>
                      <MusicIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{theme.playlist.name}</Typography>
                    </>}
                  </Stack>
                </Box>
              )
            })}
          </Box>
        </CardContent>
      </Card>

      <Box component="section" aria-label={t('Themes')}>
        <SectionTitle action={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add a theme')}</Button>}>
          {t('Themes')}
        </SectionTitle>
        {themes.length === 0 && <Empty>{isAdmin ? t('No themes yet. Add one: a Colombian day with a Colombian coffee and playlist, say.') : t('No themes yet.')}</Empty>}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
          {themes.map(x => (
            <Card key={x.id} component="article" aria-label={x.name} sx={{ overflow: 'hidden' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1.25, bgcolor: x.colour, color: inkOn(x.colour) }}>
                {x.emoji && <Box aria-hidden sx={{ fontSize: '1.5rem', lineHeight: 1 }}>{x.emoji}</Box>}
                <Typography variant="h6" component="h3" sx={{ flex: 1, minWidth: 0, color: 'inherit' }} noWrap>{x.name}</Typography>
                {isAdmin && <Button size="small" onClick={() => setEditing(x)} sx={{ color: 'inherit' }}>{t('Edit')}</Button>}
              </Stack>
              <CardContent>
                {x.description && <Typography variant="body2" sx={{ mb: 1.5 }}>{x.description}</Typography>}
                <ThemeSummary theme={x} coffees={list} />
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                  {shortDays(x.id) ? t('Every {days}', { days: shortDays(x.id) }) : t('Not on the weekly rotation')}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      <Card component="section" aria-label={t('Dates set apart')}>
        <CardContent>
          <SectionTitle>{t('Dates set apart')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>
            {t('A date with another theme, or none, whatever the rotation says: St Patrick’s Day is an Irish day. Also set from the day on the calendar.')}
          </Typography>
          {coming.length === 0 && <Typography sx={{ color: 'text.secondary', mb: 1 }}>{t('No dates set apart.')}</Typography>}
          <Box role="list" aria-label={t('Dates set apart')}>
            {coming.map(x => {
              const label = formatLocal(`${x.day}T12:00:00Z`, 'EEEE d MMMM yyyy')
              const theme = byId(x.theme_id)
              return (
                <Stack key={x.day} role="listitem" aria-label={label} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1, borderTop: `1px solid ${tokens.line}` }}>
                  <Typography sx={{ minWidth: 200, textTransform: 'capitalize' }}>{label}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {theme ? <ThemeBadge theme={theme} /> : <Typography sx={{ color: 'text.secondary' }}>{t('No theme')}</Typography>}
                    {x.note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{x.note}</Typography>}
                  </Box>
                  {isAdmin && (
                    <Tooltip title={t('Back to the weekly rotation')}>
                      <IconButton aria-label={t('Put {date} back on the weekly rotation', { date: label })}
                        onClick={() => run(() => api.setThemeDate(x.day, undefined), t('{date} follows the weekly rotation again', { date: label }))}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              )
            })}
          </Box>
          {isAdmin && (
            <Box component="form" aria-label={t('Set a date apart')} onSubmit={e => {
              e.preventDefault()
              void run(async () => {
                await api.setThemeDate(newDate.day, newDate.theme === 'none' ? null : newDate.theme, newDate.note)
                setNewDate({ day: addDays(newDate.day, 1), theme: '', note: '' })
              }, t('Date set apart'))
            }} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start', mt: 2 }}>
              <TextField type="date" size="small" label={t('Date')} value={newDate.day} slotProps={{ inputLabel: { shrink: true } }}
                onChange={e => setNewDate({ ...newDate, day: e.target.value })} sx={{ width: { xs: '100%', sm: 180 } }} />
              <TextField select size="small" label={t('Theme')} value={newDate.theme} sx={{ width: { xs: '100%', sm: 220 } }}
                onChange={e => setNewDate({ ...newDate, theme: e.target.value })}>
                {themes.map(x => <MenuItem key={x.id} value={x.id}>{x.emoji ? `${x.emoji} ` : ''}{x.name}</MenuItem>)}
                <MenuItem value="none">{t('No theme this day')}</MenuItem>
              </TextField>
              <TextField size="small" label={t('Note (optional)')} value={newDate.note} onChange={e => setNewDate({ ...newDate, note: e.target.value })}
                slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ flex: '1 1 180px', width: 'auto' }} />
              <Button type="submit" variant="outlined" disabled={!newDate.day || !newDate.theme}>{t('Set apart')}</Button>
            </Box>
          )}
        </CardContent>
      </Card>
      {editing && <ThemeDialog theme={editing === 'new' ? undefined : editing} themes={themes} coffees={list} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

/** Add a theme or change one: its name, flag, colour, coffee, playlist and notes. */
function ThemeDialog({ theme, themes, coffees, onClose }: { theme?: DayTheme; themes: DayTheme[]; coffees: Coffee[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const music = useCafeMusic()
  const [form, setForm] = useState<DayThemeInput>(theme ?? { name: '', emoji: '', colour: THEME_COLOURS[0], description: '', coffee_id: null, playlist: null, notes: '' })
  const [link, setLink] = useState({ on: false, url: '', name: '' })
  const set = (p: Partial<DayThemeInput>) => setForm(f => ({ ...f, ...p }))
  const lib = music?.library
  const provider = lib?.provider === 'spotify' ? 'spotify' as const : 'youtube' as const
  const fromLibrary: ThemePlaylist[] = [...(lib?.playlists ?? [])]
    .map(p => ({ id: p.id, name: p.name, url: p.url, image: p.image, tracks: p.tracks, provider }))
  const options = form.playlist && !fromLibrary.some(p => p.id === form.playlist!.id) ? [form.playlist, ...fromLibrary] : fromLibrary
  const save = () => run(async () => {
    let playlist = form.playlist ?? null
    if (link.on) {
      playlist = playlistFromLink(link.url, link.name)
      if (!playlist || !playlist.name) throw new Error(link.name.trim() ? t('Paste a YouTube Music or Spotify playlist link') : t('Give the playlist a name'))
    }
    const next = { ...form, name: (form.name ?? '').trim(), playlist }
    const problem = themeProblem(next)
    if (problem) throw new Error(t(problem))
    if (themes.some(x => x.id !== theme?.id && x.name.toLowerCase() === next.name.toLowerCase())) throw new Error(t('There’s already a theme called {name}', { name: next.name }))
    await api.saveDayTheme({ ...next, id: theme?.id })
    onClose()
  }, theme ? t('Saved') : t('{name} added', { name: (form.name ?? '').trim() }))
  const coffeeChoices = coffees.filter(c => c.active || c.id === form.coffee_id)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{theme ? theme.name : t('Add a theme')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={form.name} onChange={e => set({ name: e.target.value })} autoFocus={!theme}
            placeholder={t('Colombian day')} slotProps={{ htmlInput: { maxLength: THEME_LIMITS.name } }} />
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField label={t('Flag or emoji')} value={form.emoji ?? ''} onChange={e => set({ emoji: e.target.value })} sx={{ width: 140 }}
                slotProps={{ htmlInput: { maxLength: THEME_LIMITS.emoji } }} />
              <Box role="group" aria-label={t('Quick picks')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                {THEME_EMOJIS.map(e => (
                  <IconButton key={e} size="small" aria-label={e} aria-pressed={form.emoji === e} onClick={() => set({ emoji: e })}
                    sx={{ fontSize: '1.2rem', width: 34, height: 34, bgcolor: form.emoji === e ? tokens.roseSoft : undefined }}>{e}</IconButton>
                ))}
              </Box>
            </Stack>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('Colour on the calendar')}</Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label={t('Colour on the calendar')}>
              {THEME_COLOURS.map(c => (
                <Box key={c} component="button" type="button" aria-label={c} aria-pressed={form.colour === c} onClick={() => set({ colour: c })}
                  sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: c, cursor: 'pointer', p: 0,
                    border: form.colour === c ? `3px solid ${tokens.ink}` : `1px solid ${tokens.lineStrong}` }} />
              ))}
              <Box component="input" type="color" aria-label={t('Another colour')} value={form.colour ?? THEME_COLOURS[0]} onChange={e => set({ colour: e.target.value.toUpperCase() })}
                sx={{ width: 40, height: 32, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }} />
              {form.name?.trim() && <ThemeBadge theme={{ name: form.name.trim(), emoji: form.emoji ?? null, colour: form.colour ?? THEME_COLOURS[0] }} />}
            </Stack>
          </Box>
          <TextField label={t('Description (optional)')} value={form.description ?? ''} onChange={e => set({ description: e.target.value })} multiline minRows={2}
            slotProps={{ htmlInput: { maxLength: THEME_LIMITS.description } }} />
          <TextField select label={t('Coffee it serves')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={form.coffee_id ?? ''} onChange={e => set({ coffee_id: e.target.value || null })}
            helperText={coffees.length ? undefined : t('Add the coffees on the Coffees page first.')}>
            <MenuItem value="">{t('No coffee')}</MenuItem>
            {coffeeChoices.map(c => <MenuItem key={c.id} value={c.id}>{c.country ? `${flagOf(c.country)} ` : ''}{c.name}</MenuItem>)}
          </TextField>
          <TextField select label={t('Playlist it plays')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={link.on ? 'link' : form.playlist?.id ?? ''}
            onChange={e => {
              const v = e.target.value
              if (v === 'link') { setLink({ ...link, on: true }); return }
              setLink({ ...link, on: false })
              set({ playlist: options.find(p => p.id === v) ?? null })
            }}
            helperText={lib?.playlists.length ? t('The café’s playlists, or any YouTube Music or Spotify playlist by its link.') : t('Paste a playlist’s link, or connect the café’s music on Connections to pick from its playlists.')}>
            <MenuItem value="">{t('No playlist')}</MenuItem>
            {options.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            <MenuItem value="link">{t('Paste a link…')}</MenuItem>
          </TextField>
          {link.on && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label={t('Playlist link')} value={link.url} onChange={e => setLink({ ...link, url: e.target.value })} sx={{ flex: 2 }}
                placeholder={'https://music.youtube.com/playlist?list=…'} />
              <TextField label={t('Playlist name')} value={link.name} onChange={e => setLink({ ...link, name: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
          )}
          <TextField label={t('Notes (optional)')} value={form.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            helperText={t('A food special, the decorations, anything else for the day.')} slotProps={{ htmlInput: { maxLength: THEME_LIMITS.notes } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {theme && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => { await api.deleteDayTheme(theme.id); onClose() }, t('{name} removed', { name: theme.name }))}>
          {t('Remove')}
        </Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!form.name?.trim()} onClick={save}>{theme ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Coffees page: the themes that serve a coffee, with their days, linking to the Themes tab. */
export function ServedOn({ coffee, days }: { coffee: Coffee; days: ThemeDays | null }) {
  const themes = sortThemes(days?.themes ?? []).filter(x => x.coffee_id === coffee.id)
  if (!themes.length) return null
  return (
    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Served on')}</Typography>
      {themes.map(x => {
        const on = weekdaysOf(x.id, days!.rotation).map(w => t(WEEKDAY_SHORT[w - 1])).join(', ')
        return (
          <Box key={x.id} component={Link} to="/calendar?tab=themes" sx={{ textDecoration: 'none', display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
            <ThemeBadge theme={x} small />
            {on && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{on}</Typography>}
          </Box>
        )
      })}
    </Stack>
  )
}
