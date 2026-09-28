import {
  Alert, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import CloudIcon from '@mui/icons-material/CloudOutlined'
import FolderIcon from '@mui/icons-material/FolderSharedOutlined'
import ChatIcon from '@mui/icons-material/ForumOutlined'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import VerifiedIcon from '@mui/icons-material/TaskAltRounded'
import SmsIcon from '@mui/icons-material/SmsOutlined'
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined'
import CloseIcon from '@mui/icons-material/CloseRounded'
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined'
import DotIcon from '@mui/icons-material/FiberManualRecord'
import {
  siApple, siDropbox, siFacebook, siGmail, siGooglecalendar, siGoogledrive, siGooglemaps, siInstagram, siSpotify, siSquare, siStripe, siTiktok, siWhatsapp, siYoutubemusic,
  type SimpleIcon,
} from 'simple-icons'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { GROUPS, optionName, type ConnectionGroup, type ConnectionGroupInfo, type ConnectionOption } from '../../shared/connections'
import type { CalendarApp, ConnectorProvider, Integration, IntegrationProvider, IntegrationsState } from '../../shared/types'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

type OptionId = ConnectionOption['id']

/** A brand mark from Simple Icons (black marks follow the text colour, so they show in dark mode). */
function Brand({ icon }: { icon: SimpleIcon }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 22, height: 22, display: 'block' }}>
      <path d={icon.path} fill={icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`} />
    </Box>
  )
}

const LOGO: Record<OptionId, ReactNode> = {
  whatsapp: <Brand icon={siWhatsapp} />,
  slack: <ChatIcon sx={{ color: '#4A154B' }} />,
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
  sumup: <PaymentsIcon sx={{ color: '#1A1A1A' }} />,
  stripe: <Brand icon={siStripe} />,
}

const DOES: Partial<Record<OptionId, string>> = {
  whatsapp: 'Shift reminders, missed clock-ins and the weekly rota, from the café’s WhatsApp number.',
  slack: 'Rota changes and alerts in a Slack channel.',
  sms: 'Shift reminders by text for people who prefer SMS.',
  gmail: 'Team alerts for people who prefer email come from your café’s Gmail.',
  outlook: 'Team alerts come from an Outlook.com or Microsoft 365 mailbox.',
  google_calendar: 'The rota, closures and team events in Google Calendar, kept up to date.',
  outlook_calendar: 'The rota, closures and team events in Outlook, kept up to date.',
  google_drive: 'Timecard and registro exports, saved in a “Business Agent” folder.',
  onedrive: 'Exports saved in a “Business Agent” folder in OneDrive (personal or work).',
  sharepoint: 'Exports saved to a team site’s document library.',
  dropbox: 'Exports saved to Dropbox.',
  google_business: 'Opening hours, holiday closures and phone stay right on Google Maps and Search.',
  apple_maps: 'Hours and closures on Apple Maps.',
  instagram: 'Followers and recent posts here; plan and publish posts.',
  facebook: 'Plan and publish posts to your Facebook Page.',
  tiktok: 'Plan and publish photo posts to your TikTok account.',
  square: 'Your till’s takings on the Finances page, with the team’s cost as a share of sales.',
  sumup: 'Takings from a SumUp card reader.',
  stripe: 'Online payments and takings from Stripe.',
  spotify: 'The approved playlist; staff play or pause it on the café speaker.',
  youtube_music: 'The approved playlist; staff open it on the café device.',
}

/** What the connection can do once allowed (shown before connecting, like an AI connector). */
const CAN: Partial<Record<OptionId, string[]>> = {
  whatsapp: ['Send template messages from the café’s number to staff who switched them on', 'Staff reply STOP to turn them off'],
  gmail: ['Send email from this address: team alerts, and one confirmation to itself', 'It can’t read, delete or search your inbox'],
  outlook: ['Send email from this address: team alerts, and one confirmation to itself', 'See your name and email address', 'It can’t read your inbox'],
  google_calendar: ['Nothing to sign in to: Google Calendar subscribes to a private link to the team calendar', 'Reset the link on this page any time to cut it off'],
  outlook_calendar: ['Nothing to sign in to: Outlook subscribes to a private link to the team calendar', 'Reset the link on this page any time to cut it off'],
  google_drive: ['Create files in a “Business Agent” folder and open the ones it made', 'It can’t see anything else in your Drive'],
  onedrive: ['Create and update files; it only uses the “Business Agent” folder', 'See your name and email address'],
  google_business: ['Update opening hours, holiday closures and phone on your listing', 'Publish posts to your listing'],
  instagram: ['See your profile, follower count and recent posts', 'Publish the posts you plan here, at the time you choose'],
  facebook: ['See the Pages you manage and pick one', 'Publish the posts you plan here to that Page, at the time you choose'],
  tiktok: ['See your TikTok name and picture', 'Publish the photo posts you plan here, at the time you choose'],
  square: ['See your business name and locations', 'Read payments (takings) — it can’t take, refund or change anything'],
  spotify: ['See your playlists', 'Play and pause the approved playlist on the café speaker (Premium)'],
  youtube_music: ['See your playlists (read-only)'],
}

const KEYS_NEEDED: Partial<Record<OptionId, string>> = {
  gmail: 'the Google keys', google_drive: 'the Google keys', youtube_music: 'the Google keys', google_business: 'the Google keys',
  outlook: 'the Microsoft app', onedrive: 'the Microsoft app', spotify: 'the Spotify keys', instagram: 'the Instagram app keys',
  facebook: 'the Meta app keys', tiktok: 'the TikTok app keys', square: 'the Square app keys',
  whatsapp: 'the WhatsApp Business number', google_calendar: 'the calendar link key', outlook_calendar: 'the calendar link key',
}

const isCalendar = (p: string): p is CalendarApp => p === 'google_calendar' || p === 'outlook_calendar'
const isConnector = (p: string): p is ConnectorProvider => ['gmail', 'outlook', 'google_drive', 'onedrive', 'youtube_music'].includes(p)
const active = (i?: Integration) => !!i && ['connected', 'pending', 'error'].includes(i.status)

/** "just now", "5 min ago", "3 h ago", else the date. */
export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`
  return formatLocal(iso, 'd MMM, HH:mm')
}

/** The toast after Google / Microsoft / Instagram / Spotify send people back with ?connected=…. */
export function connectedMessage(p: string) {
  const proves = GROUPS.flatMap(g => g.options).find(o => o.id === p)?.proves
  return `${optionName(p)} connected.${proves ? ` ${proves}` : ''}`
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
  const stateOf = (o: ConnectionOption, g: ConnectionGroupInfo): OptionState => {
    const find = (id: string) => data.data?.integrations.find(i => i.provider === id)
    const row = o.soon ? undefined : find(o.id)
    return {
      o, row, configured: !o.soon && !!data.data?.configured[o.id as IntegrationProvider], status: row?.status ?? 'disconnected',
      current: g.pickOne ? g.options.find(x => x.id !== o.id && active(find(x.id))) : undefined,
    }
  }
  const openGroup = GROUPS.find(g => g.options.some(o => o.id === open))
  return (
    <Stack spacing={3.5}>
      {GROUPS.filter(g => groups.includes(g.key)).map(g => (
        <Box key={g.key} component="section" aria-label={g.title}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h2">{g.title}</Typography>
            {g.pickOne && g.options.filter(o => !o.soon).length > 1 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>· choose one</Typography>}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{g.hint}</Typography>
          <Card>
            {g.options.map(o => <Tile key={o.id} s={stateOf(o, g)} back={back} reload={data.reload} onOpen={() => setOpen(o.id)} loading={!data.data} />)}
          </Card>
        </Box>
      ))}
      {!data.data && data.error && <Alert severity="error">{data.error}</Alert>}
      {open && openGroup && (
        <ConnectorDialog s={stateOf(openGroup.options.find(o => o.id === open)!, openGroup)} back={back} reload={data.reload} onClose={() => setOpen(null)} />
      )}
    </Stack>
  )
}

function StatusChip({ s }: { s: OptionState }) {
  if (s.o.soon) return <Chip size="small" label="Coming soon" sx={{ bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />
  if (s.status === 'connected') return <Chip size="small" icon={<CheckIcon sx={{ color: `${tokens.goodFg} !important` }} />} label="Connected" sx={{ bgcolor: tokens.goodBg, color: tokens.goodFg }} />
  if (s.status === 'pending') return <Chip size="small" label="Waiting" sx={{ bgcolor: tokens.warnBg, color: tokens.warnFg }} />
  if (s.status === 'error') return <Chip size="small" label="Not working" sx={{ bgcolor: tokens.badBg, color: tokens.badFg }} />
  if (!s.configured) return <Chip size="small" label="Needs setup" sx={{ bgcolor: tokens.neutralBg, color: tokens.neutralFg }} />
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
    if (p === 'facebook' || p === 'tiktok' || p === 'square') return api.connectApp(p, back)
    if (isCalendar(p)) {
      // Open the tab now (popup blockers allow it on a click), then point it at the calendar app.
      const tab = window.open('', '_blank')
      const { url } = await api.chooseCalendar(p)
      if (tab) tab.location.href = url
      else location.assign(url)
      await reload()
    }
  }, isCalendar(p) ? `Add the team calendar in ${s.o.name}. It shows as connected once ${s.o.name} has fetched it.` : undefined)
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
      <CardActionArea disabled={o.soon} onClick={onOpen} aria-label={`${o.name} details`}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, borderRadius: '12px', p: 0.5 }}>
        <Logo id={o.id} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ lineHeight: 1.35 }} noWrap>
            {o.name} <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>· {o.by}</Box>
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
            {status === 'connected' && row?.account_label
              ? <><Box component="span" sx={{ color: 'text.primary' }}>{row.account_label}</Box>{row.last_checked_at ? ` · checked ${ago(row.last_checked_at)}` : ''}</>
              : DOES[o.id]}
          </Typography>
        </Box>
      </CardActionArea>
      {!loading && (
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
          <StatusChip s={s} />
          {!o.soon && <>
            {oneClick && !s.current && <Button size="small" variant="contained" aria-label={`${isCalendar(o.id) ? 'Add to' : 'Connect'} ${o.name}`} onClick={connect}>{isCalendar(o.id) ? 'Add' : 'Connect'}</Button>}
            {oneClick && s.current && <Button size="small" variant="outlined" aria-label={`Switch to ${o.name}`} onClick={() => setConfirm(true)}>Switch</Button>}
            {status === 'error' && <Button size="small" variant="contained" color="error" onClick={onOpen} aria-label={`Fix ${o.name}`}>Fix</Button>}
            {(status === 'connected' || status === 'pending') && <Button size="small" onClick={onOpen} aria-label={`Manage ${o.name}`}>Manage</Button>}
            {(!s.configured || (o.id === 'whatsapp' && status === 'disconnected')) && <Button size="small" onClick={onOpen} aria-label={`Set up ${o.name}`}>Set up</Button>}
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
      <DialogTitle>Switch to {s.o.name}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary' }}>
          {isCalendar(s.o.id)
            ? `${s.current?.name} stops counting as the team calendar straight away. You then add the calendar in ${s.o.name}.`
            : `${s.current?.name} stays connected until ${s.o.name} has signed in and passed its check. Then ${s.current?.name} is disconnected.`}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>Switch to {s.o.name}</Button>
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
    if (r?.status === 'error') throw new Error(r.last_error ?? `${o.name} isn’t working`)
    if (r?.status === 'pending') throw new Error(isCalendar(p) ? `${o.name} hasn’t fetched the team calendar yet. Add it there, then check again in a few minutes.` : 'Pick the Page to post to first.')
  }, `${o.name} works`)
  const label = status === 'error' ? `Connect ${o.name} again` : isCalendar(p) ? `Add to ${o.name}` : `Connect ${o.name}`

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="connector-title">
      <DialogTitle component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', pr: 6 }}>
        <Logo id={o.id} size={48} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="connector-title" variant="h6" component="h2">{o.name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>by {o.by}</Typography>
        </Box>
        <StatusChip s={s} />
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 10, top: 10 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary' }}>{DOES[o.id]}</Typography>

        {status === 'connected' && <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', bgcolor: tokens.goodBg }}>
          {row?.account_label && <Typography sx={{ fontWeight: 500 }}>{row.account_label}</Typography>}
          {o.proves && <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'flex-start', color: tokens.goodFg }}>
            <VerifiedIcon sx={{ fontSize: 18, mt: '1px' }} /><Typography variant="body2">{o.proves}</Typography>
          </Stack>}
          {row?.last_checked_at && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            Last checked {ago(row.last_checked_at)}. Checked again every night; admins get a notification if it stops working.</Typography>}
        </Box>}
        {status === 'pending' && <Alert severity="info" sx={{ mt: 2 }}>
          {isCalendar(p) ? `Waiting for ${o.name} to fetch the team calendar. Add it in the tab that opened; it usually shows as connected within minutes.`
            : 'This account manages more than one Page. Pick the one to post to below.'}
        </Alert>}
        {row?.last_error && status !== 'connected' && <Alert severity="error" sx={{ mt: 2 }}>{row.last_error}</Alert>}
        {!s.configured && <Alert severity="warning" sx={{ mt: 2 }}>Needs {KEYS_NEEDED[o.id]} first. The steps are in docs/sign-in-setup.md and docs/INTEGRATIONS.md; then every business connects with one click.</Alert>}

        {CAN[o.id] && <>
          <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mt: 2.5 }}>
            {status === 'connected' ? 'What it can do' : 'When you connect, it can'}
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {CAN[o.id]!.map(c => <Stack component="li" key={c} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <DotIcon sx={{ fontSize: 8, mt: 1, color: tokens.inkFaint }} /><Typography variant="body2">{c}</Typography>
            </Stack>)}
          </Stack>
        </>}
        {status !== 'connected' && o.proves && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
          It shows as connected only once it has really worked: {o.proves.charAt(0).toLowerCase() + o.proves.slice(1)}
        </Typography>}

        {p === 'whatsapp' && s.configured && <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2.5, alignItems: 'center' }}>
          <WhatsAppTest onDone={reload} label={status === 'connected' ? 'Send a test' : 'Send a test to connect'} />
        </Stack>}
        {status === 'connected' && (p === 'spotify' || p === 'youtube_music') && <CafePlaylist provider={p} />}
        {p === 'facebook' && (row?.external.pages?.length ?? 0) > 1 && (
          <TextField select size="small" label="Page to post to" value={row?.external.page_id ?? ''} sx={{ mt: 2.5, maxWidth: 380 }}
            onChange={e => run(async () => { await api.chooseFacebookPage(e.target.value); await reload() }, 'Page chosen')}>
            {row!.external.pages!.map(pg => <MenuItem key={pg.id} value={pg.id}>{pg.name}</MenuItem>)}
          </TextField>
        )}
        {p === 'tiktok' && status === 'connected' && row?.external.private_only && <Alert severity="info" sx={{ mt: 2 }}>
          Posts go to TikTok as private (only this account sees them) until TikTok approves the app for public posting.
        </Alert>}
        {p === 'square' && status === 'connected' && <Typography variant="body2" sx={{ mt: 2 }}>Takings show on the <b>Finances</b> page.</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        {active(row) && <Button color="error" onClick={() => run(async () => { await api.disconnect(p); await reload(); onClose() }, `${o.name} disconnected`)} sx={{ mr: 'auto' }}>
          {status === 'pending' ? 'Cancel' : 'Disconnect'}
        </Button>}
        {active(row) && <Button variant="outlined" onClick={check}>Check now</Button>}
        {status === 'connected' && (p === 'gmail' || p === 'outlook') && <Button variant="outlined" onClick={() => setTesting(true)}>Send a test</Button>}
        {status === 'pending' && isCalendar(p) && <Button variant="contained" onClick={connect}>Add to {o.name} again</Button>}
        {p !== 'whatsapp' && (status === 'disconnected' || status === 'error' || status === 'needs_setup') && (
          s.current && status !== 'error'
            ? <Button variant="contained" disabled={!s.configured} onClick={() => setConfirm(true)}>Switch to {o.name}</Button>
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
    <TextField size="small" label="Test number" value={to} onChange={e => setTo(e.target.value)} sx={{ width: 200 }} />
    <Button variant="contained" onClick={() => run(async () => { await api.whatsappTest(to); await onDone() }, 'Test message sent. WhatsApp is connected.')}>{label}</Button>
  </>
}

/** The approved café playlist, from the connected Spotify or YouTube Music account. */
function CafePlaylist({ provider }: { provider: 'spotify' | 'youtube_music' }) {
  const { api } = useApp()
  const run = useAction()
  const lists = useAsync('cafe-playlists', () => api.cafePlaylists(), [provider])
  return (
    <Stack sx={{ gap: 1.25, mt: 2.5 }}>
      <TextField select size="small" label="Approved playlist" value={lists.data?.approved?.id ?? ''} sx={{ maxWidth: 380 }}
        onChange={e => {
          const pl = lists.data?.playlists.find(x => x.id === e.target.value)
          if (pl) run(async () => { await api.chooseCafePlaylist(pl); await lists.reload() }, `“${pl.name}” is now the café playlist`)
        }}>
        {(lists.data?.playlists ?? []).map(pl => <MenuItem key={pl.id} value={pl.id}>{pl.name} · {pl.tracks} songs</MenuItem>)}
      </TextField>
      {lists.error && <Typography variant="body2" sx={{ color: tokens.badFg }}>{lists.error}</Typography>}
      <Alert severity="warning">
        {provider === 'spotify' ? 'Spotify’s standard plans are for personal use only.' : 'YouTube Music is for personal use.'} Playing music in the café also needs
        SGAE/AGEDI licences. Business music services (such as Soundtrack Your Brand) cover both.
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
      <DialogTitle>Send a test email</DialogTitle>
      <DialogContent><TextField autoFocus label="Send to" type="email" value={to} onChange={e => setTo(e.target.value)} sx={{ mt: 1 }} /></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => { if (await run(() => api.sendTestEmail(to), `Test email sent to ${to}`)) onClose() }}>Send</Button>
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
      if (bad.length) throw new Error(`${bad.map(r => optionName(r.provider)).join(', ')}: ${bad[0].last_error ?? 'not working'}`)
    }, 'Every connection works')}>Check all connections</Button>
  )
}

/** Is this app connected (for showing its settings card)? */
export const isConnected = (state: IntegrationsState | null, p: IntegrationProvider) => state?.integrations.some(i => i.provider === p && i.status === 'connected') ?? false
