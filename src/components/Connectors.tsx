import {
  Alert, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import CloudIcon from '@mui/icons-material/CloudOutlined'
import FolderIcon from '@mui/icons-material/FolderSharedOutlined'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import VerifiedIcon from '@mui/icons-material/TaskAltRounded'
import SmsIcon from '@mui/icons-material/SmsOutlined'
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined'
import CloseIcon from '@mui/icons-material/CloseRounded'
import DotIcon from '@mui/icons-material/FiberManualRecord'
import {
  siApple, siDropbox, siFacebook, siGmail, siGooglecalendar, siGoogledrive, siGooglemaps, siGooglesearchconsole, siInstagram, siSpotify, siSquare, siStripe, siTiktok,
  siWhatsapp, siYoutubemusic,
  type SimpleIcon,
} from 'simple-icons'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { FEATURES } from '../app/features'
import { GROUPS, optionName, type ConnectionGroup, type ConnectionGroupInfo, type ConnectionOption } from '../../shared/connections'
import type { CalendarApp, ConnectorProvider, Integration, IntegrationProvider, IntegrationsState } from '../../shared/types'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn, tr, tc } from '../i18n'

type OptionId = ConnectionOption['id']

/** A brand mark from Simple Icons (black marks follow the text colour, so they show in dark mode). */
export function Brand({ icon }: { icon: SimpleIcon }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22, display: 'block' }}>
      <path d={icon.path} fill={icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`} />
    </Box>
  )
}

// Marks Simple Icons doesn't carry (their owners asked it not to), drawn here in their colours.
const SLACK = [
  ['#E01E5A', 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z'],
  ['#36C5F0', 'M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z'],
  ['#2EB67D', 'M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z'],
  ['#ECB22E', 'M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z'],
]
const Mark = ({ children }: { children: ReactNode }) => (
  <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22, display: 'block' }}>{children}</Box>
)
const SlackLogo = () => <Mark>{SLACK.map(([fill, d]) => <path key={fill} fill={fill} d={d} />)}</Mark>
const LinkedInLogo = () => (
  <Mark>
    <rect width="24" height="24" rx="4" fill="#0A66C2" />
    <circle cx="6.9" cy="6.9" r="1.75" fill="#fff" />
    <path fill="#fff" d="M5.4 9.6h3v9.4h-3zM10.3 9.6h2.85v1.3c.4-.75 1.4-1.55 2.9-1.55 3.05 0 3.6 2 3.6 4.6V19h-3v-4.4c0-1.05-.02-2.4-1.47-2.4-1.47 0-1.7 1.15-1.7 2.33V19h-3.18z" />
  </Mark>
)
const SumUpLogo = () => (
  <Mark>
    <rect width="24" height="24" rx="5" fill="#1A1A1A" />
    <path fill="#fff" d="M7 6.5h8.2A2.8 2.8 0 0 1 18 9.3v3.2h-3.2V9.7H7zM17 17.5H8.8A2.8 2.8 0 0 1 6 14.7v-3.2h3.2v2.8H17z" />
  </Mark>
)

const LOGO: Record<OptionId, ReactNode> = {
  whatsapp: <Brand icon={siWhatsapp} />,
  slack: <SlackLogo />,
  sms: <SmsIcon sx={{ color: '#F22F46' }} />,
  gmail: <Brand icon={siGmail} />,
  outlook: <MailIcon sx={{ color: '#0F6CBD' }} />,
  google_calendar: <Brand icon={siGooglecalendar} />,
  outlook_calendar: <CalendarIcon sx={{ color: '#0F6CBD' }} />,
  google_drive: <Brand icon={siGoogledrive} />,
  onedrive: <CloudIcon sx={{ color: '#0364B8' }} />,
  sharepoint: <FolderIcon sx={{ color: '#038387' }} />,
  dropbox: <Brand icon={siDropbox} />,
  google_business: <Brand icon={siGooglemaps} />,
  apple_maps: <Brand icon={siApple} />,
  instagram: <Brand icon={siInstagram} />,
  facebook: <Brand icon={siFacebook} />,
  tiktok: <Brand icon={siTiktok} />,
  spotify: <Brand icon={siSpotify} />,
  youtube_music: <Brand icon={siYoutubemusic} />,
  square: <Brand icon={siSquare} />,
  stripe: <Brand icon={siStripe} />,
  sumup: <SumUpLogo />,
  linkedin: <LinkedInLogo />,
  search_console: <Brand icon={siGooglesearchconsole} />,
}

export const DOES: Partial<Record<OptionId, string>> = {
  whatsapp: msg('Shift reminders, missed clock-ins and the weekly rota, from the café’s WhatsApp number.'),
  slack: msg('Rota changes and alerts in a Slack channel.'),
  sms: msg('Shift reminders by text for people who prefer SMS.'),
  gmail: msg('Team alerts for people who prefer email come from your café’s Gmail.'),
  outlook: msg('Team alerts come from an Outlook.com or Microsoft 365 mailbox.'),
  google_calendar: msg('The rota, closures and team events in Google Calendar, kept up to date.'),
  outlook_calendar: msg('The rota, closures and team events in Outlook, kept up to date.'),
  google_drive: msg('Timecard and registro exports, saved in a “Business Agent” folder.'),
  onedrive: msg('Exports saved in a “Business Agent” folder in OneDrive (personal or work).'),
  sharepoint: msg('Exports saved to a team site’s document library.'),
  dropbox: msg('Exports saved to Dropbox.'),
  google_business: msg('Opening hours, holiday closures and phone stay right on Google Maps and Search.'),
  apple_maps: msg('Hours and closures on Apple Maps.'),
  instagram: msg('Followers and recent posts here; plan and publish posts; read and answer DMs on Messages.'),
  facebook: msg('Plan and publish posts to your Facebook Page.'),
  tiktok: msg('Plan and publish photo posts to your TikTok account.'),
  square: msg('Your till’s takings on the Finances page, with the team’s cost as a share of sales.'),
  stripe: msg('Takings from Stripe on the Finances page, with the team’s cost as a share of sales.'),
  sumup: msg('Takings from your SumUp card reader on Finances and Sales, with the team’s cost as a share of sales.'),
  linkedin: msg('Plan and publish posts to your LinkedIn company Page (or your own profile).'),
  search_console: msg('How people find your website on Google: searches, clicks and top pages, on the Analytics page.'),
  spotify: msg('The approved playlist; staff play or pause it on the café speaker.'),
  youtube_music: msg('The approved playlist; staff open it on the café device.'),
}

/** What the connection can do once allowed (shown before connecting, like an AI connector). */
export const CAN: Partial<Record<OptionId, string[]>> = {
  whatsapp: [msg('Send template messages from the café’s number to staff who switched them on'), msg('Staff reply STOP to turn them off')],
  gmail: [msg('Send email from this address: team alerts, and one confirmation to itself'), msg('It can’t read, delete or search your inbox')],
  outlook: [msg('Send email from this address: team alerts, and one confirmation to itself'), msg('See your name and email address'), msg('It can’t read your inbox')],
  google_calendar: [msg('Nothing to sign in to: Google Calendar subscribes to a private link to the team calendar'), msg('Reset the link on this page any time to cut it off')],
  outlook_calendar: [msg('Nothing to sign in to: Outlook subscribes to a private link to the team calendar'), msg('Reset the link on this page any time to cut it off')],
  google_drive: [msg('Create files in a “Business Agent” folder and open the ones it made'), msg('It can’t see anything else in your Drive')],
  onedrive: [msg('Create and update files; it only uses the “Business Agent” folder'), msg('See your name and email address')],
  google_business: [msg('Update opening hours, holiday closures and phone on your listing'), msg('Publish posts to your listing')],
  instagram: [msg('See your profile, follower count and recent posts'), msg('Publish the posts you plan here, at the time you choose'),
    msg('Read and answer your direct messages on the Messages page'), msg('See posts you’re tagged in')],
  facebook: [msg('See the Pages you manage and pick one'), msg('Publish the posts you plan here to that Page, at the time you choose')],
  tiktok: [msg('See your TikTok name and picture'), msg('Publish the photo posts you plan here, at the time you choose')],
  square: [msg('See your business name and locations'), msg('Read payments (takings) — it can’t take, refund or change anything')],
  stripe: [msg('See your business name'), msg('Read payments and refunds (takings) — it can’t take, refund or change anything')],
  sumup: [msg('See your business name'), msg('Read your sales history (takings) — it can’t take, refund or change anything')],
  linkedin: [msg('See your name and the company Pages you manage'), msg('Publish the posts you plan here to the Page you pick, at the time you choose')],
  search_console: [msg('See the websites in your Search Console'), msg('Read search data for your website (read-only)')],
  spotify: [msg('See your playlists'), msg('Play and pause the approved playlist on the café speaker (Premium)')],
  youtube_music: [msg('See your playlists (read-only)')],
}

export const KEYS_NEEDED: Partial<Record<OptionId, string>> = {
  gmail: msg('the Google keys'), google_drive: msg('the Google keys'), youtube_music: msg('the Google keys'), google_business: msg('the Google keys'),
  outlook: msg('the Microsoft app'), onedrive: msg('the Microsoft app'), spotify: msg('the Spotify keys'), instagram: msg('the Instagram app keys'),
  facebook: msg('the Meta app keys'), tiktok: msg('the TikTok app keys'), square: msg('the Square app keys'), stripe: msg('the Stripe platform keys'),
  sumup: msg('the SumUp app keys'), linkedin: msg('the LinkedIn app keys'), search_console: msg('the Google keys'),
  whatsapp: msg('the WhatsApp Business number'), google_calendar: msg('the calendar link key'), outlook_calendar: msg('the calendar link key'),
}

const isCalendar = (p: string): p is CalendarApp => p === 'google_calendar' || p === 'outlook_calendar'
// Signed in with Google or Microsoft (see CONNECTORS in worker/connections.ts).
const isConnector = (p: string): p is ConnectorProvider => ['gmail', 'outlook', 'google_drive', 'onedrive', 'youtube_music', 'search_console'].includes(p)
const active = (i?: Integration) => !!i && ['connected', 'pending', 'error'].includes(i.status)

/** "just now", "5 min ago", "3 h ago", else the date. */
export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return t('just now')
  if (min < 60) return t('{n} min ago', { n: min })
  if (min < 24 * 60) return t('{n} h ago', { n: Math.round(min / 60) })
  return formatLocal(iso, 'd MMM, HH:mm')
}

/** The toast after Google / Microsoft / Instagram / Spotify send people back with ?connected=…. */
export function connectedMessage(p: string) {
  const proves = GROUPS.flatMap(g => g.options).find(o => o.id === p)?.proves
  return `${t('{app} connected.', { app: optionName(p) })}${proves ? ` ${t(proves)}` : ''}`
}

/** Show the result of a connection when Google / Microsoft / Instagram send people back here. */
export function useConnectResult(after?: () => void) {
  const notify = useNotify()
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('connected')) notify(connectedMessage(q.get('connected')!), 'success')
    if (q.get('connect_error')) notify(q.get('connect_error')!, 'error')
    if (q.has('connected') || q.has('connect_error')) {
      history.replaceState(null, '', location.pathname)
      after?.()
    }
  }, [notify, after])
}

interface OptionState { o: ConnectionOption; row?: Integration; configured: boolean; status: Integration['status']; current?: ConnectionOption }

/**
 * The business's apps, like an AI's connector directory: one tile per app, in groups. In each group
 * the business picks ONE (Gmail or Outlook, Google Drive or OneDrive…). An app shows "Connected"
 * only once it has really worked. `back`: where the sign-in sends you afterwards.
 */
export function ServiceConnections({ back = 'connections', groups = GROUPS.map(g => g.key) }: { back?: 'setup' | 'connections'; groups?: ConnectionGroup[] }) {
  const { api } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  const [open, setOpen] = useState<OptionId | null>(null)
  const find = (id: string) => data.data?.integrations.find(i => i.provider === id)
  const inUse = (g: ConnectionGroupInfo) => (g.pickOne ? g.options.find(o => !o.soon && active(find(o.id))) : undefined)
  const stateOf = (o: ConnectionOption, g: ConnectionGroupInfo): OptionState => {
    const row = o.soon ? undefined : find(o.id)
    return {
      o, row, configured: !o.soon && !!data.data?.configured[o.id as IntegrationProvider], status: row?.status ?? 'disconnected',
      current: g.pickOne ? g.options.find(x => x.id !== o.id && active(find(x.id))) : undefined,
    }
  }
  const openGroup = GROUPS.find(g => g.options.some(o => o.id === open))
  // What's connected comes first: the kinds with an app in use, and in each kind its connected apps.
  const rank = (o: ConnectionOption) => (o.soon ? 3 : find(o.id)?.status === 'connected' ? 0 : active(find(o.id)) ? 1 : 2)
  const shown = GROUPS.filter(g => groups.includes(g.key))
    .map(g => ({ ...g, options: [...g.options].sort((a, b) => rank(a) - rank(b)) }))
    .sort((a, b) => Math.min(...a.options.map(rank)) - Math.min(...b.options.map(rank)))
  return (
    <Stack spacing={3.5}>
      {shown.map(g0 => {
        // Square can be switched off (src/app/features.ts); its option is then hidden.
        const g = { ...g0, options: g0.options.filter(o => o.id !== 'square' || FEATURES.square) }
        // Choose-one groups show just the app in use, with the alternatives as small chips underneath.
        const current = inUse(g)
        const others = current ? g.options.filter(o => o !== current) : []
        return (
          <Box key={g.key} component="section" aria-label={t(g.title)}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap', mb: 1.25 }}>
              <Typography variant="h6" component="h2">{t(g.title)}</Typography>
              {g.pickOne && !current && g.options.filter(o => !o.soon).length > 1 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('· choose one')}</Typography>}
            </Stack>
            <Card>
              {(current ? [current] : g.options).map(o => <Tile key={o.id} s={stateOf(o, g)} back={back} reload={data.reload} onOpen={() => setOpen(o.id)} loading={!data.data} />)}
              {others.length > 0 && (
                <Stack direction="row" role="group" aria-label={t('Other {kind} apps', { kind: t(g.title).toLowerCase() })} useFlexGap
                  sx={{ borderTop: `1px solid ${tokens.line}`, px: 2, py: 1.25, alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: tokens.surfaceAlt }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mr: 0.5 }}>{t('Also works with')}</Typography>
                  {others.map(o => (
                    <Chip key={o.id} variant="outlined" size="small" disabled={o.soon}
                      onClick={o.soon ? undefined : () => setOpen(o.id)}
                      aria-label={o.soon ? t('{app}, coming soon', { app: o.name }) : t('Use {app} instead', { app: o.name })}
                      avatar={<Box sx={{ display: 'grid', placeItems: 'center', bgcolor: 'transparent !important', '& svg': { width: 16, height: 16 } }}>{LOGO[o.id]}</Box>}
                      label={o.soon ? t('{app} · soon', { app: o.name }) : o.name}
                      sx={{ bgcolor: tokens.surface, '&.Mui-disabled': { opacity: 0.6 } }} />
                  ))}
                </Stack>
              )}
            </Card>
          </Box>
        )
      })}
      {!data.data && data.error && <Alert severity="error">{data.error}</Alert>}
      {open && openGroup && (
        <ConnectorDialog s={stateOf(openGroup.options.find(o => o.id === open)!, openGroup)} back={back} reload={data.reload} onClose={() => setOpen(null)} />
      )}
    </Stack>
  )
}

function StatusChip({ s }: { s: OptionState }) {
  if (s.o.soon) return <Chip size="small" label={t('Coming soon')} sx={{ bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />
  if (s.status === 'connected') return <Chip size="small" icon={<CheckIcon sx={{ color: `${tokens.goodFg} !important` }} />} label={t('Connected')} sx={{ bgcolor: tokens.goodBg, color: tokens.goodFg }} />
  if (s.status === 'pending') return <Chip size="small" label={t('Waiting')} sx={{ bgcolor: tokens.warnBg, color: tokens.warnFg }} />
  if (s.status === 'error') return <Chip size="small" label={t('Not working')} sx={{ bgcolor: tokens.badBg, color: tokens.badFg }} />
  if (!s.configured) return <Chip size="small" label={t('Needs setup')} sx={{ bgcolor: tokens.neutralBg, color: tokens.neutralFg }} />
  return null
}

const Logo = ({ id, size = 44 }: { id: OptionId; size?: number }) => (
  <Box sx={{ width: size, height: size, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`, flexShrink: 0, color: tokens.ink }}>{LOGO[id]}</Box>
)

/** How to connect each app: sign in with it (most), subscribe (calendars) or send a test (WhatsApp). */
function useConnect(s: OptionState, back: 'setup' | 'connections', reload: () => Promise<void>) {
  const { api } = useApp()
  const run = useAction()
  const p = s.o.id as IntegrationProvider
  return () => run(async () => {
    if (isConnector(p)) return api.connectService(p, back)
    if (p === 'spotify') return api.connectSpotify()
    if (p === 'instagram') return api.connectInstagram(back)
    if (p === 'google_business') return api.connectGoogle(back)
    if (p === 'facebook' || p === 'tiktok' || p === 'square' || p === 'stripe' || p === 'sumup' || p === 'linkedin') return api.connectApp(p, back)
    if (isCalendar(p)) {
      // Open the tab now (popup blockers allow it on a click), then point it at the calendar app.
      const tab = window.open('', '_blank')
      const { url } = await api.chooseCalendar(p)
      if (tab) tab.location.href = url
      else location.assign(url)
      await reload()
    }
  }, isCalendar(p) ? t('Add the team calendar in {app}. It shows as connected once {app} has fetched it.', { app: s.o.name }) : undefined)
}

/** One app as a row in its group's card: logo, name, what it does (or its account), status and one action. */
function Tile({ s, back, reload, onOpen, loading }: { s: OptionState; back: 'setup' | 'connections'; reload: () => Promise<void>; onOpen: () => void; loading: boolean }) {
  const connect = useConnect(s, back, reload)
  const [confirm, setConfirm] = useState(false)
  const { o, status, row } = s
  const oneClick = s.configured && o.id !== 'whatsapp' && status === 'disconnected'
  return (
    <Box component="article" aria-label={o.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' },
      px: { xs: 1.5, sm: 2 }, py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 },
      ...(status === 'connected' ? { boxShadow: `inset 3px 0 0 ${tokens.matcha}` } : {}),
      ...(status === 'error' ? { boxShadow: `inset 3px 0 0 ${tokens.badFg}` } : {}), ...(o.soon ? { opacity: 0.65 } : {}) }}>
      <CardActionArea disabled={o.soon} onClick={onOpen} aria-label={t('{app} details', { app: o.name })}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, borderRadius: '12px', p: 0.5 }}>
        <Logo id={o.id} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ lineHeight: 1.35 }} noWrap>
            {o.name} <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>· {o.by}</Box>
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
            {status === 'connected' && row?.account_label
              ? <><Box component="span" sx={{ color: 'text.primary' }}>{row.account_label}</Box>{row.last_checked_at ? ` · ${t('checked {when}', { when: ago(row.last_checked_at) })}` : ''}</>
              : DOES[o.id] && t(DOES[o.id]!)}
          </Typography>
        </Box>
      </CardActionArea>
      {!loading && (
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
          <StatusChip s={s} />
          {!o.soon && <>
            {oneClick && !s.current && <Button size="small" variant="contained" aria-label={isCalendar(o.id) ? t('Add to {app}', { app: o.name }) : t('Connect {app}', { app: o.name })} onClick={connect}>{isCalendar(o.id) ? t('Add') : t('Connect')}</Button>}
            {oneClick && s.current && <Button size="small" variant="outlined" aria-label={t('Switch to {app}', { app: o.name })} onClick={() => setConfirm(true)}>{t('Switch')}</Button>}
            {status === 'error' && <Button size="small" variant="contained" color="error" onClick={onOpen} aria-label={t('Fix {app}', { app: o.name })}>{t('Fix')}</Button>}
            {(status === 'connected' || status === 'pending') && <Button size="small" onClick={onOpen} aria-label={t('Manage {app}', { app: o.name })}>{t('Manage')}</Button>}
            {(!s.configured || (o.id === 'whatsapp' && status === 'disconnected')) && <Button size="small" onClick={onOpen} aria-label={t('Set up {app}', { app: o.name })}>{tc('verb', 'Set up')}</Button>}
          </>}
        </Stack>
      )}
      <SwitchDialog open={confirm} s={s} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void connect() }} />
    </Box>
  )
}

function SwitchDialog({ open, s, onClose, onConfirm }: { open: boolean; s: OptionState; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Switch to {app}?', { app: s.o.name })}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary' }}>
          {isCalendar(s.o.id)
            ? t('{current} stops counting as the team calendar straight away. You then add the calendar in {app}.', { current: s.current?.name ?? '', app: s.o.name })
            : t('{current} stays connected until {app} has signed in and passed its check. Then {current} is disconnected.', { current: s.current?.name ?? '', app: s.o.name })}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={onConfirm}>{t('Switch to {app}', { app: s.o.name })}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Everything about one app: what it can do, what "connected" proved, its account and checks. */
function ConnectorDialog({ s, back, reload, onClose }: { s: OptionState; back: 'setup' | 'connections'; reload: () => Promise<void>; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const connect = useConnect(s, back, reload)
  const [confirm, setConfirm] = useState(false)
  const [testing, setTesting] = useState(false)
  const { o, row, status } = s
  const p = o.id as IntegrationProvider
  const check = () => run(async () => {
    const r = await api.checkConnection(p)
    await reload()
    if (r?.status === 'error') throw new Error(r.last_error ?? t('{app} isn’t working', { app: o.name }))
    if (r?.status === 'pending') throw new Error(isCalendar(p) ? t('{app} hasn’t fetched the team calendar yet. Add it there, then check again in a few minutes.', { app: o.name })
      : p === 'search_console' ? t('Pick the website first.') : t('Pick the Page to post to first.'))
  }, t('{app} works', { app: o.name }))
  const label = status === 'error' ? t('Connect {app} again', { app: o.name }) : isCalendar(p) ? t('Add to {app}', { app: o.name }) : t('Connect {app}', { app: o.name })

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="connector-title">
      {/* Its own id, so the dialog is named by the app's name alone (not "by …" and the close button). */}
      <DialogTitle component="div" id="connector-head" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', pr: 6 }}>
        <Logo id={o.id} size={48} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="connector-title" variant="h6" component="h2">{o.name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('by {company}', { company: o.by })}</Typography>
        </Box>
        <StatusChip s={s} />
        <IconButton aria-label={t('Close')} onClick={onClose} sx={{ position: 'absolute', right: 10, top: 10 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary' }}>{DOES[o.id] && t(DOES[o.id]!)}</Typography>

        {status === 'connected' && <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', bgcolor: tokens.goodBg }}>
          {row?.account_label && <Typography sx={{ fontWeight: 500 }}>{row.account_label}</Typography>}
          {o.proves && <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'flex-start', color: tokens.goodFg }}>
            <VerifiedIcon sx={{ fontSize: 18, mt: '1px' }} /><Typography variant="body2">{t(o.proves)}</Typography>
          </Stack>}
          {row?.last_checked_at && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            {t('Last checked {when}. Checked again every night; admins get a notification if it stops working.', { when: ago(row.last_checked_at) })}</Typography>}
        </Box>}
        {status === 'pending' && <Alert severity="info" sx={{ mt: 2 }}>
          {isCalendar(p) ? t('Waiting for {app} to fetch the team calendar. Add it in the tab that opened; it usually shows as connected within minutes.', { app: o.name })
            : p === 'search_console' ? t('This Google account has more than one website in Search Console. Pick the one to show below.')
            : t('This account manages more than one Page. Pick the one to post to below.')}
        </Alert>}
        {row?.last_error && status !== 'connected' && <Alert severity="error" sx={{ mt: 2 }}>{row.last_error}</Alert>}
        {!s.configured && <Alert severity="warning" sx={{ mt: 2 }}>{t('Not set up yet: Business Agent needs {keys} before anyone can connect {app}. They’re added once, for every business; after that, connecting is one click.', { keys: KEYS_NEEDED[o.id] ? t(KEYS_NEEDED[o.id]!) : '', app: o.name })}</Alert>}

        {CAN[o.id] && <>
          <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mt: 2.5 }}>
            {status === 'connected' ? t('What it can do') : t('When you connect, it can')}
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {CAN[o.id]!.map(c => <Stack component="li" key={c} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <DotIcon sx={{ fontSize: 8, mt: 1, color: tokens.inkFaint }} /><Typography variant="body2">{t(c)}</Typography>
            </Stack>)}
          </Stack>
        </>}
        {status !== 'connected' && o.proves && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
          {t('It shows as connected only once it has really worked: {proof}', { proof: t(o.proves).charAt(0).toLowerCase() + t(o.proves).slice(1) })}
        </Typography>}

        {p === 'whatsapp' && s.configured && <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2.5, alignItems: 'center' }}>
          <WhatsAppTest onDone={reload} label={status === 'connected' ? t('Send a test') : t('Send a test to connect')} />
        </Stack>}
        {status === 'connected' && (p === 'spotify' || p === 'youtube_music') && <CafePlaylist provider={p} />}
        {p === 'facebook' && (row?.external.pages?.length ?? 0) > 1 && (
          <TextField select size="small" label={t('Page to post to')} value={row?.external.page_id ?? ''} sx={{ mt: 2.5, maxWidth: 380 }}
            onChange={e => run(async () => { await api.chooseFacebookPage(e.target.value); await reload() }, t('Page chosen'))}>
            {row!.external.pages!.map(pg => <MenuItem key={pg.id} value={pg.id}>{pg.name}</MenuItem>)}
          </TextField>
        )}
        {p === 'linkedin' && active(row) && (row?.external.pages?.length ?? 0) > 0 && (
          <TextField select size="small" label={t('Post as')} value={row?.external.page_id ?? ''} sx={{ mt: 2.5, maxWidth: 380 }}
            onChange={e => run(async () => { await api.chooseLinkedInPage(e.target.value); await reload() }, t('Saved'))}>
            {row!.external.pages!.map(pg => <MenuItem key={pg.id} value={pg.id}>{pg.name}</MenuItem>)}
            <MenuItem value="me">{t('My own profile ({name})', { name: String((row?.external.member as { name?: string } | undefined)?.name ?? '') })}</MenuItem>
          </TextField>
        )}
        {p === 'search_console' && active(row) && (row?.external.sites?.length ?? 0) > 1 && (
          <TextField select size="small" label={t('Website')} value={row?.external.site ?? ''} sx={{ mt: 2.5, maxWidth: 380 }}
            onChange={e => run(async () => { await api.chooseSearchConsoleSite(e.target.value); await reload() }, t('Website chosen'))}>
            {(row!.external.sites as string[]).map(site => <MenuItem key={site} value={site}>{site.replace(/^sc-domain:/, '')}</MenuItem>)}
          </TextField>
        )}
        {p === 'search_console' && status === 'connected' && <Typography variant="body2" sx={{ mt: 2 }}>{tr('Search data shows on the {page} page.', { page: <b>{t('Analytics')}</b> })}</Typography>}
        {p === 'tiktok' && status === 'connected' && row?.external.private_only && <Alert severity="info" sx={{ mt: 2 }}>
          {t('Posts go to TikTok as private (only this account sees them) until TikTok approves the app for public posting.')}
        </Alert>}
        {(p === 'square' || p === 'stripe' || p === 'sumup') && status === 'connected' && <Typography variant="body2" sx={{ mt: 2 }}>{tr('Takings show on the {finances} page, and what sold under {sales}.', { finances: <b>{t('Finances')}</b>, sales: <b>{t('Sales')}</b> })}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        {active(row) && <Button color="error" onClick={() => run(async () => { await api.disconnect(p); await reload(); onClose() }, t('{app} disconnected', { app: o.name }))} sx={{ mr: 'auto' }}>
          {status === 'pending' ? t('Cancel') : t('Disconnect')}
        </Button>}
        {active(row) && <Button variant="outlined" onClick={check}>{t('Check now')}</Button>}
        {status === 'connected' && (p === 'gmail' || p === 'outlook') && <Button variant="outlined" onClick={() => setTesting(true)}>{t('Send a test')}</Button>}
        {status === 'pending' && isCalendar(p) && <Button variant="contained" onClick={connect}>{t('Add to {app} again', { app: o.name })}</Button>}
        {p !== 'whatsapp' && (status === 'disconnected' || status === 'error' || status === 'needs_setup') && (
          s.current && status !== 'error'
            ? <Button variant="contained" disabled={!s.configured} onClick={() => setConfirm(true)}>{t('Switch to {app}', { app: o.name })}</Button>
            : <Button variant="contained" disabled={!s.configured} onClick={connect}>{label}</Button>
        )}
      </DialogActions>
      <SwitchDialog open={confirm} s={s} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void connect() }} />
      {testing && <TestEmailDialog onClose={() => setTesting(false)} />}
    </Dialog>
  )
}

/** WhatsApp is the café's business number (set up once with Meta): connected once a test message goes out. */
function WhatsAppTest({ onDone, label }: { onDone: () => Promise<void>; label: string }) {
  const { api, business } = useApp()
  const run = useAction()
  const [to, setTo] = useState(business?.phone ?? '')
  return <>
    <TextField size="small" label={t('Test number')} value={to} onChange={e => setTo(e.target.value)} sx={{ width: 200 }} />
    <Button variant="contained" onClick={() => run(async () => { await api.whatsappTest(to); await onDone() }, t('Test message sent. WhatsApp is connected.'))}>{label}</Button>
  </>
}

/** The approved café playlist, from the connected Spotify or YouTube Music account. */
function CafePlaylist({ provider }: { provider: 'spotify' | 'youtube_music' }) {
  const { api } = useApp()
  const run = useAction()
  const lists = useAsync('cafe-playlists', () => api.cafePlaylists(), [provider])
  return (
    <Stack sx={{ gap: 1.25, mt: 2.5 }}>
      <TextField select size="small" label={t('Approved playlist')} value={lists.data?.approved?.id ?? ''} sx={{ maxWidth: 380 }}
        onChange={e => {
          const pl = lists.data?.playlists.find(x => x.id === e.target.value)
          if (pl) run(async () => { await api.chooseCafePlaylist(pl); await lists.reload() }, t('“{name}” is now the café playlist', { name: pl.name }))
        }}>
        {(lists.data?.playlists ?? []).map(pl => <MenuItem key={pl.id} value={pl.id}>{pl.name} · {tn(pl.tracks, '{n} song', '{n} songs')}</MenuItem>)}
      </TextField>
      {lists.error && <Typography variant="body2" sx={{ color: tokens.badFg }}>{lists.error}</Typography>}
      <Alert severity="warning">
        {provider === 'spotify' ? t('Spotify’s standard plans are for personal use only.') : t('YouTube Music is for personal use.')}{' '}
        {t('Playing music in the café also needs SGAE/AGEDI licences. Business music services (such as Soundtrack Your Brand) cover both.')}
      </Alert>
    </Stack>
  )
}

function TestEmailDialog({ onClose }: { onClose: () => void }) {
  const { api, me } = useApp()
  const run = useAction()
  const [to, setTo] = useState(me?.email ?? '')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Send a test email')}</DialogTitle>
      <DialogContent><TextField autoFocus label={t('Send to')} type="email" value={to} onChange={e => setTo(e.target.value)} sx={{ mt: 1 }} /></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={async () => { if (await run(() => api.sendTestEmail(to), t('Test email sent to {email}', { email: to }))) onClose() }}>{t('Send')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** "Check all": prove every connection still works, now. */
export function CheckAllButton() {
  const { api } = useApp()
  const run = useAction()
  return (
    <Button variant="outlined" onClick={() => run(async () => {
      const rows = await api.checkConnections()
      const bad = rows.filter(r => r.status === 'error')
      if (bad.length) throw new Error(`${bad.map(r => optionName(r.provider)).join(', ')}: ${bad[0].last_error ?? t('not working')}`)
    }, t('Every connection works'))}>{t('Check all connections')}</Button>
  )
}

/** Is this app connected (for showing its settings card)? */
export const isConnected = (state: IntegrationsState | null, p: IntegrationProvider) => state?.integrations.some(i => i.provider === p && i.status === 'connected') ?? false
