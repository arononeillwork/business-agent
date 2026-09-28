import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Tooltip, Typography } from '@mui/material'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import DriveIcon from '@mui/icons-material/AddToDriveOutlined'
import CloudIcon from '@mui/icons-material/CloudOutlined'
import FolderIcon from '@mui/icons-material/FolderSharedOutlined'
import ChatIcon from '@mui/icons-material/ForumOutlined'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import MusicIcon from '@mui/icons-material/MusicNote'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import SmsIcon from '@mui/icons-material/SmsOutlined'
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import type { ConnectorProvider, Integration } from '../../shared/types'
import { tokens } from '../theme'

type Category = 'communication' | 'email' | 'calendar' | 'files' | 'music'
interface Service { id: ConnectorProvider | 'sharepoint' | 'dropbox' | 'slack' | 'sms'; name: string; by: 'Google' | 'Microsoft' | 'Dropbox' | 'Slack' | 'Twilio'; category: Category; icon: ReactNode; does: string; soon?: boolean }

/** The communication, email and file services a business can connect (the "coming soon" ones are listed so people know). */
export const SERVICES: Service[] = [
  { id: 'gmail', name: 'Gmail', by: 'Google', category: 'email', icon: <MailIcon sx={{ color: '#EA4335' }} />, does: 'Team alerts for people who prefer email come from your café’s Gmail.' },
  { id: 'outlook', name: 'Outlook', by: 'Microsoft', category: 'email', icon: <MailIcon sx={{ color: '#0F6CBD' }} />, does: 'The same, from an Outlook.com or Microsoft 365 mailbox.' },
  { id: 'google_drive', name: 'Google Drive', by: 'Google', category: 'files', icon: <DriveIcon sx={{ color: '#1FA463' }} />, does: 'Save timecard and registro exports to a “Business Agent” folder. The app only sees files it creates.' },
  { id: 'onedrive', name: 'OneDrive', by: 'Microsoft', category: 'files', icon: <CloudIcon sx={{ color: '#0364B8' }} />, does: 'Save exports to a “Business Agent” folder in OneDrive (personal or work).' },
  { id: 'sharepoint', name: 'SharePoint', by: 'Microsoft', category: 'files', icon: <FolderIcon sx={{ color: '#038387' }} />, does: 'Save exports to a team site’s document library.', soon: true },
  { id: 'dropbox', name: 'Dropbox', by: 'Dropbox', category: 'files', icon: <CloudIcon sx={{ color: '#0061FE' }} />, does: 'Save exports to Dropbox.', soon: true },
  { id: 'slack', name: 'Slack', by: 'Slack', category: 'communication', icon: <ChatIcon sx={{ color: '#4A154B' }} />, does: 'Post rota changes and alerts to a Slack channel.', soon: true },
  { id: 'sms', name: 'Text messages (SMS)', by: 'Twilio', category: 'communication', icon: <SmsIcon sx={{ color: '#F22F46' }} />, does: 'Shift reminders by text for people who prefer SMS.', soon: true },
]

const CATEGORY: Record<Category, { title: string; hint: string }> = {
  communication: { title: 'Communication', hint: 'How the team hears about shifts and changes.' },
  calendar: { title: 'Calendar', hint: 'The rota, closures and events in the calendar you already use.' },
  email: { title: 'Email', hint: 'Send team alerts from your own address.' },
  files: { title: 'Files and storage', hint: 'Keep payroll exports where your gestoría can find them.' },
  music: { title: 'Music', hint: 'The café playlist on the speaker, and each person’s own music.' },
}

/** Every app connection, grouped by what it does. `back`: where Google/Microsoft send you after connecting. */
export function ServiceConnections({ back = 'connections', categories = ['communication', 'email', 'calendar', 'files', 'music'] }: { back?: 'setup' | 'connections'; categories?: Category[] }) {
  const { api } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  return (
    <Stack spacing={3}>
      {categories.map(cat => (
        <Box key={cat} component="section" aria-label={CATEGORY[cat].title}>
          <Typography variant="h6" component="h2">{CATEGORY[cat].title}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{CATEGORY[cat].hint}</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
            {cat === 'communication' && <WhatsAppTile row={data.data?.integrations.find(i => i.provider === 'whatsapp')} ready={!!data.data?.configured.whatsapp} />}
            {cat === 'calendar' && <CalendarTiles />}
            {cat === 'music' && <MusicTiles spotify={data.data?.integrations.find(i => i.provider === 'spotify')} spotifyReady={!!data.data?.configured.spotify} reload={data.reload} />}
            {SERVICES.filter(s => s.category === cat).map(s => (
              <ServiceTile key={s.id} s={s} back={back} reload={data.reload}
                row={s.soon ? undefined : data.data?.integrations.find(i => i.provider === s.id)}
                configured={s.soon ? false : !!data.data?.configured[s.id as ConnectorProvider]} />
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  )
}

function ServiceTile({ s, row, configured, back, reload }: { s: Service; row?: Integration; configured: boolean; back: 'setup' | 'connections'; reload: () => unknown }) {
  const { api } = useApp()
  const run = useAction()
  const [testing, setTesting] = useState(false)
  const connected = row?.status === 'connected'
  const provider = s.id as ConnectorProvider
  return (
    <Card component="article" aria-label={s.name} sx={{ display: 'flex', flexDirection: 'column', ...(connected ? { borderColor: tokens.matcha } : {}) }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>{s.icon}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{s.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>by {s.by}</Typography>
          </Box>
          {s.soon ? <Chip size="small" label="Coming soon" sx={{ bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />
            : connected ? <Chip size="small" icon={<CheckIcon sx={{ color: `${tokens.goodFg} !important` }} />} label="Connected" sx={{ bgcolor: tokens.goodBg, color: tokens.goodFg }} />
            : row?.status === 'error' ? <Chip size="small" label="Problem" sx={{ bgcolor: tokens.badBg, color: tokens.badFg }} /> : null}
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{s.does}</Typography>
        {connected && row?.account_label && <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.account_label}</Typography>}
        {row?.last_error && <Typography variant="body2" sx={{ color: tokens.badFg }}>{row.last_error}</Typography>}
        {!s.soon && (
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {!connected && (
              <Tooltip title={configured ? '' : `Needs the ${s.by} keys first (see docs/sign-in-setup.md)`}>
                <span>
                  <Button size="small" variant="contained" disabled={!configured} onClick={() => run(async () => { await api.connectService(provider, back); await reload() })}>
                    Connect {s.name}
                  </Button>
                </span>
              </Tooltip>
            )}
            {connected && s.category === 'email' && <Button size="small" variant="outlined" onClick={() => setTesting(true)}>Send a test</Button>}
            {connected && <Button size="small" color="error" onClick={() => run(async () => { await api.disconnect(provider); await reload() }, `${s.name} disconnected`)}>Disconnect</Button>}
          </Stack>
        )}
        {!s.soon && !configured && <Typography variant="caption" sx={{ color: tokens.warnFg }}>Needs setup: {s.by} keys aren’t added yet.</Typography>}
      </CardContent>
      {testing && <TestEmailDialog onClose={() => setTesting(false)} />}
    </Card>
  )
}

/** A tile's frame: icon, name, who it's from, status and what it does. */
function Tile({ name, by, icon, does, status, children }: { name: string; by: string; icon: ReactNode; does: string; status?: ReactNode; children?: ReactNode }) {
  return (
    <Card component="article" aria-label={name} sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>{icon}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{by}</Typography>
          </Box>
          {status}
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{does}</Typography>
        {children}
      </CardContent>
    </Card>
  )
}

const connectedChip = <Chip size="small" icon={<CheckIcon sx={{ color: `${tokens.goodFg} !important` }} />} label="Connected" sx={{ bgcolor: tokens.goodBg, color: tokens.goodFg }} />

/** WhatsApp is the café's business number (set up once with Meta); the test and details are further down the page. */
function WhatsAppTile({ row, ready }: { row?: Integration; ready: boolean }) {
  const on = row?.status === 'connected'
  return (
    <Tile name="WhatsApp" by="Meta" icon={<WhatsAppIcon sx={{ color: '#1f9e55' }} />} status={on ? connectedChip : null}
      does="Shift reminders, missed clock-ins and the weekly rota go to staff who opted in, from the café’s WhatsApp number.">
      {on && row?.account_label && <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.account_label}</Typography>}
      {!ready && <Typography variant="caption" sx={{ color: tokens.warnFg }}>Needs setup: the WhatsApp Business number isn’t linked yet (docs/INTEGRATIONS.md).</Typography>}
      {ready && !on && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Send a test message below to switch it on.</Typography>}
    </Tile>
  )
}

/**
 * Google Calendar and Outlook: subscribe to the team calendar link (rota, closures, events). No
 * extra keys needed: the calendar app fetches the link and keeps it up to date by itself.
 */
function CalendarTiles() {
  const { api } = useApp()
  const run = useAction()
  const feeds = useAsync('calendar-feeds', () => api.calendarFeeds(), [])
  const url = feeds.data?.business
  const webcal = url?.replace(/^https?:/, 'webcal:')
  const make = () => run(async () => { await api.makeCalendarFeed('business'); await feeds.reload() }, 'Calendar link created')
  const tile = (name: string, by: string, colour: string, href?: string) => (
    <Tile key={name} name={name} by={by} icon={<CalendarIcon sx={{ color: colour }} />} status={url ? <Chip size="small" label="Link ready" sx={{ bgcolor: tokens.goodBg, color: tokens.goodFg }} /> : null}
      does={`See the rota, closures and team events in ${name}. It updates by itself.`}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        {url
          ? <Button size="small" variant="contained" href={href ?? ""} target="_blank" rel="noreferrer">Add to {name}</Button>
          : <Button size="small" variant="contained" onClick={make}>Create calendar link</Button>}
      </Stack>
    </Tile>
  )
  return <>
    {tile('Google Calendar', 'Google', '#1A73E8', webcal && `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`)}
    {tile('Outlook Calendar', 'Microsoft', '#0F6CBD', url && `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Team calendar')}`)}
  </>
}

/** Spotify for the café speaker (the business's account), and YouTube Music for each person. */
function MusicTiles({ spotify, spotifyReady, reload }: { spotify?: Integration; spotifyReady: boolean; reload: () => unknown }) {
  const { api } = useApp()
  const run = useAction()
  const mine = useAsync('my-music', () => api.myMusic(), [])
  const yt = mine.data?.accounts.find(a => a.provider === 'youtube')
  const spotifyOn = spotify?.status === 'connected'
  return <>
    <Tile name="Spotify" by="for the café speaker" icon={<MusicIcon sx={{ color: '#1db954' }} />} status={spotifyOn ? connectedChip : null}
      does="The café’s Spotify: pick the approved playlist and staff can play or pause it on the speaker.">
      {spotifyOn && spotify?.account_label && <Typography variant="body2" sx={{ fontWeight: 500 }}>{spotify.account_label}</Typography>}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        {spotifyOn
          ? <Button size="small" color="error" onClick={() => run(async () => { await api.disconnect('spotify'); await reload() }, 'Spotify disconnected')}>Disconnect</Button>
          : <Button size="small" variant="contained" disabled={!spotifyReady} onClick={() => run(async () => { await api.connectSpotify(); await reload() })}>Connect Spotify</Button>}
      </Stack>
      {!spotifyReady && <Typography variant="caption" sx={{ color: tokens.warnFg }}>Needs setup: Spotify keys aren’t added yet.</Typography>}
    </Tile>
    <Tile name="YouTube Music" by="your own account" icon={<MusicIcon sx={{ color: '#FF0000' }} />} status={yt ? connectedChip : null}
      does="Your own YouTube Music playlists on the Music page. Each person connects their own; nobody else sees it.">
      {yt?.account_label && <Typography variant="body2" sx={{ fontWeight: 500 }}>{yt.account_label}</Typography>}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        {yt
          ? <Button size="small" color="error" onClick={() => run(async () => { await api.disconnectMyMusic('youtube'); await mine.reload() }, 'YouTube Music disconnected')}>Disconnect</Button>
          : <Button size="small" variant="contained" disabled={mine.data?.configured.youtube === false}
              onClick={() => run(async () => { await api.connectMyMusic('youtube'); await mine.reload() }, 'YouTube Music connected')}>Connect YouTube Music</Button>}
      </Stack>
    </Tile>
  </>
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

/** After connecting, the provider sends people back with ?connected=… or ?connect_error=…. */
export const serviceName = (p: string) => SERVICES.find(s => s.id === p)?.name ?? (p === 'spotify' ? 'Spotify' : 'Google')
