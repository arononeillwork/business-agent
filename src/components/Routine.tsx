// The weekly routine on the Calendar and Today: each day's activities (the stock take, the cleaner's
// run, the accounts talk…) as small chips in their category's colour under the day's theme, with
// filters to hide a category or one activity (kept in each person's preferences), an activity's
// checklist and a tick for done; and the Calendar's Routine tab, where admins set the week up.
import {
  Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, ListSubheader,
  MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import StockIcon from '@mui/icons-material/Inventory2Outlined'
import CleaningIcon from '@mui/icons-material/CleaningServicesOutlined'
import SuppliersIcon from '@mui/icons-material/LocalShippingOutlined'
import AccountsIcon from '@mui/icons-material/ReceiptLongOutlined'
import MeetingsIcon from '@mui/icons-material/GroupsOutlined'
import MaintenanceIcon from '@mui/icons-material/BuildOutlined'
import MarketingIcon from '@mui/icons-material/CampaignOutlined'
import TeamIcon from '@mui/icons-material/BadgeOutlined'
import ThemeIcon from '@mui/icons-material/PaletteOutlined'
import RoutineIcon from '@mui/icons-material/EventRepeatOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useEffect, useMemo, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Tag } from './common'
import { DayThemeDialog, TodayTheme, closedWeekday, useCoffees, useThemeDays } from './ThemeDays'
import {
  ROUTINE_CATEGORIES, ROUTINE_EVERY, ROUTINE_LIMITS, categoryOf, checklistFrom, everyOf, fromEvery, routineOn, routineOnWeekday, routineProblem,
  shownRoutine, slotOf, type CalendarShow, type RoutineCategory, type RoutineDone, type RoutineEvery, type RoutineItem,
} from '../../shared/routine'
import { WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_SHORT, inkOn, themeOn, type Weekday } from '../../shared/themeDays'
import type { CalendarEvent, Profile } from '../../shared/types'
import { addDays, formatLocal, localTime, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const ICONS: Record<RoutineCategory, ReactNode> = {
  stock: <StockIcon />, cleaning: <CleaningIcon />, suppliers: <SuppliersIcon />, accounts: <AccountsIcon />,
  meetings: <MeetingsIcon />, maintenance: <MaintenanceIcon />, marketing: <MarketingIcon />, team: <TeamIcon />,
}

/**
 * A tick that shows at once while it saves (the list catches up after), and goes back if saving fails.
 * The saved value wins again as soon as it changes.
 */
function useTick(saved: boolean): [boolean, (next: boolean, save: () => Promise<boolean>) => void] {
  const [pending, setPending] = useState<boolean | null>(null)
  useEffect(() => setPending(null), [saved])
  const set = (next: boolean, save: () => Promise<boolean>) => {
    setPending(next)
    void save().then(ok => { if (!ok) setPending(null) })
  }
  return [pending ?? saved, set]
}
/** A category's colour, soft, behind text in the ink colour (light and dark). */
const soft = (colour: string, n = 16) => `color-mix(in srgb, ${colour} ${n}%, transparent)`
const onTeam = (me: Profile | null) => !!me?.active && (me.role === 'admin' || me.role === 'employee')
const dateLabel = (day: string) => formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')

/** The routine's activities (none for anyone not on the team). */
export function useRoutineItems() {
  const { api, me } = useApp()
  const staff = onTeam(me)
  return useAsync('routine-items', () => (staff ? api.routineItems() : Promise.resolve([] as RoutineItem[])), [staff])
}

/** What this person shows on their calendar, kept in their preferences (shown on screen straight away while it saves). */
export function useCalendarShow(): [CalendarShow, (next: CalendarShow) => void] {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const saved = me?.preferences?.calendarShow
  const [show, setShow] = useState<CalendarShow>(saved ?? {})
  useEffect(() => { setShow(saved ?? {}) }, [saved])
  return [show, (next: CalendarShow) => {
    setShow(next)
    if (me) void run(async () => { await api.updateProfile(me.id, { preferences: { ...me.preferences, calendarShow: next } }); await refresh() })
  }]
}

/** "Shop Manager", "Julio", or null: who does an activity. */
export function whoOf(r: Pick<RoutineItem, 'profile_id' | 'job_role_id'>, profiles: Profile[], roles: { id: string; name: string }[]) {
  if (r.profile_id) return profiles.find(p => p.id === r.profile_id)?.full_name ?? null
  if (r.job_role_id) return roles.find(x => x.id === r.job_role_id)?.name ?? null
  return null
}

/** A category's label with its icon, in its colour. */
export function CategoryTag({ category }: { category: RoutineCategory }) {
  const c = categoryOf(category)
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, borderRadius: 1.5, fontSize: '0.75rem', fontWeight: 500,
      lineHeight: 1.8, whiteSpace: 'nowrap', bgcolor: soft(c.colour), color: 'text.primary', '& svg': { fontSize: 14, color: c.colour } }}>
      {ICONS[c.id]}{t(c.label)}
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// On the calendar
// ---------------------------------------------------------------------------------------------
const CLOSURE = /closed|cerrad|closure/i

/**
 * Everything the calendar needs for the theme days and the routine between two dates: what each day
 * has, after this person's filters, and which dialog is open.
 */
export function useCalendarExtras(from: string, to: string, events: CalendarEvent[]) {
  const { api, me, business } = useApp()
  const staff = onTeam(me)
  const days = useThemeDays()
  const coffees = useCoffees()
  const items = useRoutineItems()
  const done = useAsync('routine-done', () => (staff ? api.routineDone(from, to) : Promise.resolve([] as RoutineDone[])), [from, to, staff])
  const [show, setShow] = useCalendarShow()
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<{ item: RoutineItem; day: string } | null>(null)
  // Days a closure on the calendar closes the business (as its listing on Google is closed then).
  const closures = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) {
      if (e.category !== 'business' || !CLOSURE.test(e.title)) continue
      for (let d = e.starts_on; d <= (e.ends_on ?? e.starts_on) && s.size < 400; d = addDays(d, 1)) s.add(d)
    }
    return s
  }, [events])
  const shown = shownRoutine(items.data ?? [], show)
  return {
    staff, show, setShow, closures, openDay, setOpenDay, openItem, setOpenItem,
    days: days.data, coffees: coffees.data ?? [], items: items.data ?? [], error: days.error ?? items.error,
    /** The theme on a date, unless this person hid the themes. */
    themeOn: (day: string) => (staff && show.themes !== false ? themeOn(day, days.data, { hours: business?.opening_hours, closures }) : null),
    routineFor: (day: string) => (staff ? routineOn(shown, day) : []),
    doneOf: (itemId: string, day: string) => (done.data ?? []).find(x => x.item_id === itemId && x.day === day) ?? null,
  }
}
export type CalendarExtras = ReturnType<typeof useCalendarExtras>

const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }

/** In a calendar day: its theme as a coloured band, a button to its coffee and playlist (admins set the day's theme there). */
export function DayTheme({ x, day }: { x: CalendarExtras; day: string }) {
  const { isAdmin } = useApp()
  const on = x.themeOn(day)
  if (!on) return null
  const label = dateLabel(day)
  if (on.theme) {
    return (
      <Box component="button" type="button" onClick={stop(() => x.setOpenDay(day))} aria-label={`${label}: ${on.theme.name}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', border: 0, borderRadius: 0.75, px: 0.5, mb: 0.5, cursor: 'pointer', font: 'inherit',
          fontSize: 11, fontWeight: 600, lineHeight: 1.7, textAlign: 'left', bgcolor: on.theme.colour, color: inkOn(on.theme.colour), overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {on.theme.emoji && <span aria-hidden>{on.theme.emoji}</span>}
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{on.theme.name}</Box>
      </Box>
    )
  }
  // No theme that day: admins give it one from here (it shows when the day is pointed at).
  if (!isAdmin || !x.days?.themes.length) return null
  return (
    <Box component="button" type="button" onClick={stop(() => x.setOpenDay(day))} aria-label={t('Theme for {date}', { date: label })}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', border: `1px dashed ${tokens.lineStrong}`, borderRadius: 0.75, px: 0.5, mb: 0.5,
        cursor: 'pointer', font: 'inherit', fontSize: 11, lineHeight: 1.5, bgcolor: 'transparent', color: 'text.secondary', opacity: 0, '&:focus-visible': { opacity: 1 },
        '[role=gridcell]:hover &, .MuiCard-root:hover &': { opacity: 1 }, '@media (hover: none)': { opacity: 0.8 } }}>
      <ThemeIcon sx={{ fontSize: 13 }} />{t('Theme')}
    </Box>
  )
}

/** In a calendar day: its routine, in time order (after its events). */
export function DayRoutine({ x, day, compact }: { x: CalendarExtras; day: string; compact?: boolean }) {
  const routine = x.routineFor(day)
  if (!routine.length) return null
  return (
    <Box sx={{ mt: 0.5 }}>
      {routine.map(r => <RoutineChip key={r.id} item={r} done={!!x.doneOf(r.id, day)} compact={compact} onClick={stop(() => x.setOpenItem({ item: r, day }))} />)}
    </Box>
  )
}

/** One activity on a calendar day: its time and name, in its category's colour; struck through once done. */
function RoutineChip({ item, done, compact, onClick }: { item: RoutineItem; done: boolean; compact?: boolean; onClick: (e: MouseEvent) => void }) {
  const c = categoryOf(item.category)
  const time = item.starts_at?.slice(0, 5)
  return (
    <Box component="button" type="button" onClick={onClick} aria-label={`${time ? `${time} ` : ''}${done ? t('{name}, done', { name: item.name }) : item.name}`}
      sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, width: '100%', border: 0, borderLeft: `3px solid ${c.colour}`, borderRadius: 0.75, px: 0.5, mb: 0.25,
        cursor: 'pointer', font: 'inherit', fontSize: compact ? 11 : 12, lineHeight: compact ? 1.6 : 1.4, py: compact ? 0 : 0.25, textAlign: 'left', bgcolor: soft(c.colour, 10),
        color: 'text.primary', opacity: done ? 0.6 : 1, overflow: 'hidden', whiteSpace: compact ? 'nowrap' : 'normal' }}>
      {time && <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{time}</Box>}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{item.name}</Box>
      {done && <Box component="span" aria-hidden sx={{ color: tokens.matchaDeep, ml: 'auto', flexShrink: 0 }}>✓</Box>}
    </Box>
  )
}

/** The dialogs a calendar day opens: its theme, or one of its activities. */
export function ExtrasDialogs({ x }: { x: CalendarExtras }) {
  return (
    <>
      {x.openDay && x.days && <DayThemeDialog day={x.openDay} days={x.days} coffees={x.coffees} closures={x.closures} onClose={() => x.setOpenDay(null)} />}
      {x.openItem && <RoutineDayDialog item={x.openItem.item} day={x.openItem.day} done={x.doneOf(x.openItem.item.id, x.openItem.day)}
        show={x.show} setShow={x.setShow} onClose={() => x.setOpenItem(null)} />}
    </>
  )
}

/** An activity on a day: when and who, its checklist, done or not; hide it for yourself, or (admins) for everyone. */
export function RoutineDayDialog({ item, day, done, show, setShow, onClose }: {
  item: RoutineItem; day: string; done: RoutineDone | null; show: CalendarShow; setShow: (s: CalendarShow) => void; onClose: () => void
}) {
  const { api, me, isAdmin, profiles, jobRoles } = useApp()
  const run = useAction()
  const who = whoOf(item, profiles, jobRoles)
  const slot = slotOf(item)
  const every = everyOf(item)
  const label = dateLabel(day)
  const ticker = done?.done_by ? profiles.find(p => p.id === done.done_by)?.full_name : null
  const canUntick = !done || done.done_by === me?.id || isAdmin
  const [ticked, tick] = useTick(!!done)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{item.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <CategoryTag category={item.category} />
            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{label}{slot ? ` · ${slot}` : ''}</Typography>
          </Stack>
          {(who || every !== 'w1') && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {[who ? t('Who: {who}', { who }) : null, every !== 'w1' ? t(ROUTINE_EVERY.find(e => e.id === every)!.label) : null].filter(Boolean).join(' · ')}
            </Typography>
          )}
          {item.checklist.length > 0 && (
            <Box component="ul" aria-label={t('Checklist')} sx={{ m: 0, pl: 2.5 }}>
              {item.checklist.map((l, i) => <Typography key={i} component="li" variant="body2" sx={{ py: 0.25 }}>{l}</Typography>)}
            </Box>
          )}
          {item.notes && <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{item.notes}</Typography>}
          <Box sx={{ p: 1, borderRadius: '12px', bgcolor: tokens.surfaceAlt }}>
            <FormControlLabel label={t('Done for {date}', { date: label })} disabled={!canUntick}
              control={<Checkbox checked={ticked} onChange={e => { const on = e.target.checked; tick(on, () => run(() => api.setRoutineDone(item.id, day, on),
                on ? t('{name} done', { name: item.name }) : t('{name} not done yet', { name: item.name }))) }} />} />
            {done && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', ml: 4 }}>
                {ticker ? t('Ticked by {name} at {time}', { name: ticker, time: localTime(done.done_at) }) : t('Ticked at {time}', { time: localTime(done.done_at) })}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Button onClick={() => { setShow({ ...show, hiddenItems: [...new Set([...(show.hiddenItems ?? []), item.id])] }); onClose() }}>{t('Hide for me')}</Button>
        {isAdmin && (
          <Button color="error" onClick={() => run(async () => {
            await api.saveRoutineItem({ id: item.id, name: item.name, category: item.category, weekdays: item.weekdays, active: false })
            onClose()
          }, t('{name} is off the calendar for everyone', { name: item.name }))}>{t('Switch off for everyone')}</Button>
        )}
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The calendar's filters: theme days and the routine on or off, the routine's categories one by one, and what you hid. */
export function CalendarShowBar({ x }: { x: CalendarExtras }) {
  if (!x.staff || (!x.items.length && !x.days?.themes.length)) return null
  const { show, setShow } = x
  const hiddenCats = show.hiddenCategories ?? []
  const hiddenItems = (show.hiddenItems ?? []).filter(id => x.items.some(r => r.id === id))
  const used = ROUTINE_CATEGORIES.filter(c => x.items.some(r => r.active && r.category === c.id))
  const toggle = (on: boolean, label: string, icon: ReactNode, onClick: () => void, colour?: string) => (
    <Chip key={label} size="small" icon={icon as ReactElement} label={label} aria-pressed={on} onClick={onClick} variant="outlined"
      sx={{ bgcolor: on ? soft(colour ?? tokens.ube, 18) : 'transparent', color: on ? 'text.primary' : 'text.secondary', borderColor: colour ?? tokens.lineStrong,
        textDecoration: on ? 'none' : 'line-through', '& .MuiChip-icon': { color: colour ?? 'inherit', fontSize: 16 } }} />
  )
  return (
    <Stack direction="row" role="group" aria-label={t('Show on the calendar')} spacing={0.5} sx={{ mb: 2, mt: -1, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
      {!!x.days?.themes.length && toggle(show.themes !== false, t('Theme days'), <ThemeIcon />, () => setShow({ ...show, themes: show.themes === false }))}
      {x.items.length > 0 && toggle(show.routine !== false, t('Routine'), <RoutineIcon />, () => setShow({ ...show, routine: show.routine === false }))}
      {show.routine !== false && used.map(c => toggle(!hiddenCats.includes(c.id), t(c.label), ICONS[c.id], () => setShow({
        ...show, hiddenCategories: hiddenCats.includes(c.id) ? hiddenCats.filter(k => k !== c.id) : [...hiddenCats, c.id],
      }), c.colour))}
      {show.routine !== false && hiddenItems.length > 0 && (
        <Button size="small" onClick={() => setShow({ ...show, hiddenItems: [] })}>
          {tn(hiddenItems.length, 'Show the {n} activity you hid', 'Show the {n} activities you hid')}
        </Button>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------------------------

/** The Today page: today's theme with its coffee and playlist, and today's routine to tick off. */
export function TodayThemeCard() {
  const { api, me, profiles, jobRoles } = useApp()
  const run = useAction()
  const staff = onTeam(me)
  const days = useThemeDays()
  const coffees = useCoffees()
  const items = useRoutineItems()
  const [show] = useCalendarShow()
  const d = today()
  const done = useAsync('routine-done', () => (staff ? api.routineDone(d, d) : Promise.resolve([] as RoutineDone[])), [d, d, staff])
  const list = routineOn(shownRoutine(items.data ?? [], show), d)
  if (!staff || (!days.data?.themes.length && !list.length)) return null
  return (
    <Box>
      {days.data?.themes.length ? <TodayTheme days={days.data} coffees={coffees.data ?? []} /> : null}
      {list.length > 0 && (
        <Card component="section" aria-label={t('Today’s routine')} sx={{ mt: days.data?.themes.length ? 1.5 : 0 }}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{t('Today’s routine')}</Typography>
              <Button size="small" component={Link} to="/calendar?tab=routine">{t('The week')}</Button>
            </Stack>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {list.map(r => {
                const saved = (done.data ?? []).some(x => x.item_id === r.id)
                const who = whoOf(r, profiles, jobRoles)
                return (
                  <TodayRoutineRow key={r.id} saved={saved} name={r.name} onTick={on => run(() => api.setRoutineDone(r.id, d, on), on ? t('{name} done', { name: r.name }) : undefined)}>
                    {ticked => <>
                      <Box sx={{ width: 4, alignSelf: 'stretch', my: 0.75, borderRadius: 1, bgcolor: categoryOf(r.category).colour, flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ textDecoration: ticked ? 'line-through' : 'none', color: ticked ? 'text.secondary' : 'text.primary' }} noWrap>{r.name}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{[slotOf(r), who].filter(Boolean).join(' · ') || t(categoryOf(r.category).label)}</Typography>
                      </Box>
                    </>}
                  </TodayRoutineRow>
                )
              })}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// The Routine tab
// ---------------------------------------------------------------------------------------------

/** Calendar → Routine: the week day by day, every activity (switched-off ones too). Admins add, change and switch them off. */
export function RoutineTab() {
  const { api, business, isAdmin, profiles, jobRoles } = useApp()
  const run = useAction()
  const items = useRoutineItems()
  const [editing, setEditing] = useState<RoutineItem | 'new' | null>(null)
  const all = items.data ?? []
  return (
    <Stack spacing={2}>
      <ErrorBox error={items.error} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Typography sx={{ flex: 1, maxWidth: 760 }}>
          {t('What’s done on set days, every week or less often: it shows on the calendar under each day’s theme, where each person can hide a category or an activity for themselves.')}
        </Typography>
        {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ flexShrink: 0 }}>{t('Add an activity')}</Button>}
      </Stack>
      {WEEKDAYS.map(w => {
        const day = t(WEEKDAY_NAMES[w - 1])
        const list = routineOnWeekday(all, w)
        const closed = closedWeekday(w, business?.opening_hours)
        return (
          <Card key={w} component="section" aria-label={day}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Typography variant="h6" component="h2">{day}</Typography>
                {closed && <Tag>{t('Closed')}</Tag>}
              </Stack>
              {list.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing on {day}s.', { day })}</Typography>}
              <Box role="list" aria-label={t('{day}’s routine', { day })}>
                {list.map(r => {
                  const every = everyOf(r)
                  const who = whoOf(r, profiles, jobRoles)
                  return (
                    <Stack key={r.id} role="listitem" aria-label={r.name} direction="row" spacing={1.5}
                      sx={{ alignItems: 'center', py: 0.75, borderTop: `1px solid ${tokens.line}`, opacity: r.active ? 1 : 0.55 }}>
                      {isAdmin && (
                        <Tooltip title={r.active ? t('On the calendar') : t('Switched off')}>
                          <Switch size="small" checked={r.active} slotProps={{ input: { 'aria-label': t('{name} on the calendar', { name: r.name }) } }}
                            onChange={e => run(() => api.saveRoutineItem({ id: r.id, name: r.name, category: r.category, weekdays: r.weekdays, active: e.target.checked }),
                              e.target.checked ? t('{name} is back on the calendar', { name: r.name }) : t('{name} is off the calendar for everyone', { name: r.name }))} />
                        </Tooltip>
                      )}
                      <Typography variant="body2" sx={{ width: 92, flexShrink: 0, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{slotOf(r) || t('Any time')}</Typography>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 500 }}>{r.name}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {[every !== 'w1' ? t(ROUTINE_EVERY.find(e => e.id === every)!.label) : null, who, r.checklist.length ? tn(r.checklist.length, '{n} thing to check', '{n} things to check') : null]
                            .filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <CategoryTag category={r.category} />
                      {!r.active && !isAdmin && <Tag>{t('Off')}</Tag>}
                      {isAdmin && (
                        <Tooltip title={t('Edit')}>
                          <IconButton size="small" aria-label={t('Edit {name}', { name: r.name })} onClick={() => setEditing(r)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  )
                })}
              </Box>
            </CardContent>
          </Card>
        )
      })}
      {editing && <RoutineDialog item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

/** Add an activity or change one. */
function RoutineDialog({ item, onClose }: { item?: RoutineItem; onClose: () => void }) {
  const { api, profiles, jobRoles } = useApp()
  const run = useAction()
  const [f, setF] = useState({
    name: item?.name ?? '', category: item?.category ?? 'stock' as RoutineCategory, weekdays: item?.weekdays ?? [1] as Weekday[],
    every: item ? everyOf(item) : 'w1' as RoutineEvery, starts_on: item?.starts_on ?? today(), starts_at: item?.starts_at ?? '', ends_at: item?.ends_at ?? '',
    who: item?.profile_id ? `p:${item.profile_id}` : item?.job_role_id ? `r:${item.job_role_id}` : '',
    checklist: (item?.checklist ?? []).join('\n'), notes: item?.notes ?? '', active: item?.active ?? true,
  })
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
  const save = () => run(async () => {
    const input = {
      id: item?.id, name: f.name.trim(), category: f.category, weekdays: [...f.weekdays].sort((a, b) => a - b), ...fromEvery(f.every), starts_on: f.starts_on || today(),
      starts_at: f.starts_at || null, ends_at: f.ends_at || null,
      profile_id: f.who.startsWith('p:') ? f.who.slice(2) : null, job_role_id: f.who.startsWith('r:') ? f.who.slice(2) : null,
      checklist: checklistFrom(f.checklist), notes: f.notes.trim() || null, active: f.active,
    }
    const problem = routineProblem(input)
    if (problem) throw new Error(t(problem))
    await api.saveRoutineItem(input)
    onClose()
  }, item ? t('Saved') : t('{name} added', { name: f.name.trim() }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{item ? item.name : t('Add an activity')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={f.name} onChange={e => set({ name: e.target.value })} autoFocus={!item}
            placeholder={t('Stock take and buying list')} slotProps={{ htmlInput: { maxLength: ROUTINE_LIMITS.name } }} />
          <TextField select label={t('Category')} value={f.category} onChange={e => set({ category: e.target.value as RoutineCategory })}>
            {ROUTINE_CATEGORIES.map(c => (
              <MenuItem key={c.id} value={c.id}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, '& svg': { fontSize: 18, color: c.colour } }}>{ICONS[c.id]}{t(c.label)}</Box>
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('Days')}</Typography>
            <ToggleButtonGroup size="small" value={f.weekdays} aria-label={t('Days')} onChange={(_, v: Weekday[]) => { if (v.length) set({ weekdays: v }) }} sx={{ flexWrap: 'wrap' }}>
              {WEEKDAYS.map(w => <ToggleButton key={w} value={w} aria-label={t(WEEKDAY_NAMES[w - 1])} sx={{ px: 1.5 }}>{t(WEEKDAY_SHORT[w - 1])}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label={t('How often')} value={f.every} onChange={e => set({ every: e.target.value as RoutineEvery })} sx={{ flex: 1 }}>
              {ROUTINE_EVERY.map(e => <MenuItem key={e.id} value={e.id}>{t(e.label)}</MenuItem>)}
            </TextField>
            <TextField type="date" label={t('Starting')} value={f.starts_on} onChange={e => set({ starts_on: e.target.value })} sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }} helperText={['w2', 'w3', 'w4'].includes(f.every) ? t('Every few weeks counts from this week.') : undefined} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField type="time" label={t('From (optional)')} value={f.starts_at} onChange={e => set({ starts_at: e.target.value })} sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="time" label={t('To (optional)')} value={f.ends_at} onChange={e => set({ ends_at: e.target.value })} sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <TextField select label={t('Who does it')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={f.who} onChange={e => set({ who: e.target.value })}>
            <MenuItem value="">{t('Nobody in particular')}</MenuItem>
            {jobRoles.length > 0 && <ListSubheader>{t('Roles')}</ListSubheader>}
            {jobRoles.map(r => <MenuItem key={r.id} value={`r:${r.id}`}>{r.name}</MenuItem>)}
            <ListSubheader>{t('People')}</ListSubheader>
            {team.map(p => <MenuItem key={p.id} value={`p:${p.id}`}>{p.full_name}</MenuItem>)}
          </TextField>
          <TextField label={t('Checklist (optional)')} value={f.checklist} onChange={e => set({ checklist: e.target.value })} multiline minRows={3}
            helperText={t('One thing per line.')} />
          <TextField label={t('Notes (optional)')} value={f.notes} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            slotProps={{ htmlInput: { maxLength: ROUTINE_LIMITS.notes } }} />
          <FormControlLabel control={<Switch checked={f.active} onChange={e => set({ active: e.target.checked })} />} label={t('On the calendar')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {item && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => { await api.deleteRoutineItem(item.id); onClose() }, t('{name} removed', { name: item.name }))}>
          {t('Remove')}
        </Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!f.name.trim() || !f.weekdays.length} onClick={save}>{item ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** One of today's routine on Today: its tick shows at once while it saves. */
function TodayRoutineRow({ saved, name, onTick, children }: { saved: boolean; name: string; onTick: (on: boolean) => Promise<boolean>; children: (ticked: boolean) => ReactNode }) {
  const [ticked, tick] = useTick(saved)
  return (
    <Stack component="li" aria-label={name} direction="row" spacing={1}
      sx={{ alignItems: 'center', py: 0.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Checkbox size="small" checked={ticked} slotProps={{ input: { 'aria-label': t('Done: {name}', { name }) } }}
        onChange={e => { const on = e.target.checked; tick(on, () => onTick(on)) }} />
      {children(ticked)}
    </Stack>
  )
}
