import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, Link as MuiLink, Stack, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/SearchRounded'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import CloseIcon from '@mui/icons-material/CloseRounded'
import SendIcon from '@mui/icons-material/SendRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import { siInstagram, siMessenger, siTiktok, siWhatsapp } from 'simple-icons'
import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import { Brand, CAN, LinkedInLogo, DOES, KEYS_NEEDED, ago, useConnectResult } from '../components/Connectors'
import {
  INBOX_FILTERS, initials, matchesFilter, matchesSearch, needsReply, preview, replyWindow,
  type InboxConversation, type InboxFilter, type InboxMessage, type MessagePlatform, type TaggedPost,
} from '../../shared/messages'
import type { Integration } from '../../shared/types'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tr } from '../i18n'

// LinkedIn shows (greyed out, like TikTok) until its messages can be read.
const PLATFORMS: { id: MessagePlatform | 'linkedin'; name: string; icon: ReactNode; live: boolean }[] = [
  { id: 'instagram', name: 'Instagram', icon: <Brand icon={siInstagram} />, live: true },
  // WhatsApp: the chats Business Agent saved (WhatsApp can't be read back), with the WhatsApp connection.
  { id: 'whatsapp', name: 'WhatsApp', icon: <Brand icon={siWhatsapp} />, live: true },
  // Messenger comes with the Facebook connection (the Page's chats).
  { id: 'messenger', name: 'Messenger', icon: <Brand icon={siMessenger} />, live: true },
  { id: 'tiktok', name: 'TikTok', icon: <Brand icon={siTiktok} />, live: false },
  { id: 'linkedin', name: 'LinkedIn', icon: <LinkedInLogo />, live: false },
]

/** Which connection each app's chats come from. */
type Source = 'instagram' | 'facebook' | 'whatsapp'
const SOURCE: Partial<Record<MessagePlatform, Source>> = { instagram: 'instagram', messenger: 'facebook', whatsapp: 'whatsapp' }
const ICON: Record<MessagePlatform, typeof siInstagram> = { instagram: siInstagram, messenger: siMessenger, whatsapp: siWhatsapp, tiktok: siTiktok }
const NAME: Record<MessagePlatform, string> = { instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp', tiktok: 'TikTok' }

/**
 * The business's direct messages in one place: Instagram, Messenger once Facebook is connected
 * (even before anyone has written), and WhatsApp once it's connected. The other apps show, greyed
 * out, until they're added. Connecting here is the same one click as on Connections (it's one
 * connection); WhatsApp is set up there.
 */
export function MessagesPage() {
  const { api } = useApp()
  const integ = useAsync('integrations', () => api.integrations(), [])
  useConnectResult(() => { void integ.reload() })
  const row = (p: Source) => integ.data?.integrations.find(i => i.provider === p)
  const on = (p: Source) => row(p)?.status === 'connected'
  const [app, setApp] = useState<MessagePlatform | 'all'>('all')
  // What to offer connecting: the chosen app's connection, or (All) every one that isn't connected yet.
  const any = on('instagram') || on('facebook') || on('whatsapp')
  const missing: Source[] = app === 'all' ? (any ? [] : ['instagram', 'facebook', 'whatsapp'])
    : SOURCE[app] && !on(SOURCE[app]!) ? [SOURCE[app]!] : []

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Messages')} />
      <Stack direction="row" role="group" aria-label={t('Apps')} sx={{ gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        {/* All: every app's chats together, newest first (the default). */}
        <Chip label={t('All')} clickable onClick={() => setApp('all')} aria-pressed={app === 'all'}
          color={app === 'all' ? 'primary' : 'default'} variant={app === 'all' ? 'filled' : 'outlined'} />
        {PLATFORMS.map(p => (
          <Tooltip key={p.id} title={p.live ? '' : t('{app} messages are coming soon', { app: p.name })}>
            <span>
              <Chip icon={<Box sx={{ display: 'flex', ml: 0.75, opacity: p.live ? 1 : 0.5 }}>{p.icon}</Box>}
                label={p.live ? p.name : t('{app} · soon', { app: p.name })} disabled={!p.live} aria-pressed={app === p.id}
                onClick={() => { if (p.live && p.id !== 'linkedin') setApp(p.id) }}
                color={app === p.id ? 'primary' : 'default'} variant={app === p.id ? 'filled' : 'outlined'} />
            </span>
          </Tooltip>
        ))}
      </Stack>
      <ErrorBox error={integ.error} />
      {integ.data && missing.length > 0 && (
        <Stack spacing={2}>
          {missing.map(p => <ConnectCard key={p} provider={p} row={row(p)} configured={!!integ.data!.configured[p]} />)}
        </Stack>
      )}
      {integ.data && missing.length === 0 && any && (
        <Inbox ig={on('instagram') ? row('instagram') : undefined} fb={on('facebook') ? row('facebook') : undefined}
          wa={on('whatsapp') ? row('whatsapp') : undefined} app={app} />
      )}
    </>
  )
}

const CONNECT_NAME: Record<Source, string> = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' }

/** Not connected yet: the same Connect as on Connections, coming back here afterwards (WhatsApp: set up there). */
function ConnectCard({ provider, row, configured }: { provider: Source; row?: Integration; configured: boolean }) {
  if (provider === 'whatsapp') return <WhatsAppCard row={row} />
  const { api, refresh } = useApp()
  const run = useAction()
  const name = CONNECT_NAME[provider]
  const connect = () => run(async () => {
    if (provider === 'instagram') await api.connectInstagram('messages')
    else await api.connectApp('facebook', 'messages')
    await refresh()
  })
  return (
    <Card component="section" aria-label={t('Connect {app}', { app: name })}>
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
            <Brand icon={provider === 'instagram' ? siInstagram : siMessenger} />
          </Box>
          <Box>
            <Typography variant="h6" component="h2">{t('Connect {app}', { app: name })}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {provider === 'instagram' ? t(DOES.instagram ?? '') : t('Messenger comes with the Facebook connection: your Page’s chats show here.')}
            </Typography>
          </Box>
        </Stack>
        {row?.last_error && <Alert severity="error" sx={{ mt: 1.5 }}>{row.last_error}</Alert>}
        {!configured && <Alert severity="warning" sx={{ mt: 1.5 }}>{t('Not set up yet: Business Agent needs {keys} before anyone can connect {app}. They’re added once, for every business; after that, connecting is one click.', { keys: t(KEYS_NEEDED[provider] ?? ''), app: name })}</Alert>}
        <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mt: 2 }}>{t('When you connect, it can')}</Typography>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, pl: 2.5 }}>
          {CAN[provider]!.map(c => <Typography key={c} component="li" variant="body2">{t(c)}</Typography>)}
        </Stack>
        <Button variant="contained" sx={{ mt: 2.5 }} disabled={!configured} onClick={connect}>
          {row?.status === 'error' ? t('Connect again') : t('Connect {app}', { app: name })}
        </Button>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
          {t('It’s the same connection as on Connections: connect here or there and both pages update.')}
        </Typography>
      </CardContent>
    </Card>
  )
}

/** WhatsApp is connected on Connections (a test message from the café's number proves it). */
function WhatsAppCard({ row }: { row?: Integration }) {
  return (
    <Card component="section" aria-label={t('Connect {app}', { app: 'WhatsApp' })}>
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
            <Brand icon={siWhatsapp} />
          </Box>
          <Box>
            <Typography variant="h6" component="h2">{t('Connect {app}', { app: 'WhatsApp' })}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Once WhatsApp is connected, the messages people send the café’s number show here, and you can reply.')}
            </Typography>
          </Box>
        </Stack>
        {row?.last_error && <Alert severity="error" sx={{ mt: 1.5 }}>{row.last_error}</Alert>}
        <Button variant="contained" sx={{ mt: 2 }} component={RouterLink} to="/connections">{t('Set up on Connections')}</Button>
      </CardContent>
    </Card>
  )
}

/** Read live, every minute; a failed read is shown, not retried in a loop. Shares 'instagram-inbox' with the menu's badge. */
function useInbox<T>(key: string, enabled: boolean, fn: () => Promise<T>) {
  const q = useQuery({ queryKey: [key], queryFn: fn, enabled, refetchInterval: 60_000, retry: false, placeholderData: prev => prev })
  return {
    data: enabled ? q.data ?? null : null, loaded: !enabled || q.data !== undefined || !!q.error,
    error: enabled && q.error ? (q.error instanceof Error ? q.error.message : String(q.error)) : null,
    reload: async () => { if (enabled) await q.refetch() },
  }
}

function Inbox({ ig, fb, wa, app }: { ig?: Integration; fb?: Integration; wa?: Integration; app: MessagePlatform | 'all' }) {
  const { api } = useApp()
  const run = useAction()
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const showsInstagram = !!ig && (app === 'all' || app === 'instagram'), showsMessenger = !!fb && (app === 'all' || app === 'messenger')
  const showsWhatsApp = !!wa && (app === 'all' || app === 'whatsapp')
  const insta = useInbox('instagram-inbox', showsInstagram, () => api.instagramInbox())
  const messenger = useInbox('messenger-inbox', showsMessenger, () => api.messengerInbox())
  const whats = useInbox('whatsapp-inbox', showsWhatsApp, () => api.whatsappInbox())
  const reload = async () => { await Promise.all([insta.reload(), messenger.reload(), whats.reload()]) }
  const loaded = insta.loaded && messenger.loaded && whats.loaded
  // Newest first, every app together: the chat with the latest message (from either side) at the top.
  const all = useMemo(() => [...insta.data?.conversations ?? [], ...messenger.data?.conversations ?? [], ...whats.data?.conversations ?? []]
    .filter(c => app === 'all' || c.platform === app)
    .sort((a, b) => lastAt(b) - lastAt(a)), [insta.data, messenger.data, whats.data, app])
  const shown = all.filter(c => matchesFilter(c, filter) && matchesSearch(c, search))
  const count = (f: InboxFilter) => all.filter(c => matchesFilter(c, f)).length
  // Chats are told apart by app and id (two apps could use the same id).
  const chosen = all.find(c => key(c) === open) ?? null
  const mixed = [showsInstagram, showsMessenger, showsWhatsApp].filter(Boolean).length > 1

  // One app not answering (or needing a reconnect) doesn't hide the other's chats.
  const problems = (
    <>
      {insta.error && (
        <Alert severity="warning" sx={{ mb: 1.5 }} action={/Connect Instagram again/.test(insta.error)
          && <Button color="inherit" onClick={() => run(() => api.connectInstagram('messages'))}>{t('Connect again')}</Button>}>
          {insta.error}
        </Alert>
      )}
      {messenger.error && (
        <Alert severity="warning" sx={{ mb: 1.5 }} action={/Connect Facebook again/.test(messenger.error)
          && <Button color="inherit" onClick={() => run(() => api.connectApp('facebook', 'messages'))}>{t('Connect again')}</Button>}>
          {messenger.error}
        </Alert>
      )}
      {whats.error && <Alert severity="warning" sx={{ mb: 1.5 }}>{whats.error}</Alert>}
    </>
  )
  if ((insta.error || !showsInstagram) && (messenger.error || !showsMessenger) && (whats.error || !showsWhatsApp)) return problems

  const list = (
    <Box component="section" aria-label={t('Chats')} sx={{ minWidth: 0 }}>
      {/* Search across every chat: who it's with and what was said. */}
      <TextField value={search} onChange={e => setSearch(e.target.value)} size="small" fullWidth placeholder={t('Search chats')}
        aria-label={t('Search chats')} sx={{ mb: 1.5 }}
        slotProps={{ input: {
          startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label={t('Clear search')} onClick={() => setSearch('')}><CloseIcon fontSize="small" /></IconButton>
            </InputAdornment>
          ) : undefined,
        } }} />
      <Stack direction="row" role="group" aria-label={t('Show')} sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {INBOX_FILTERS.map(f => (
          <Chip key={f.key} size="small" clickable onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            label={f.key === 'all' ? t(f.label) : `${t(f.label)} ${count(f.key)}`}
            color={filter === f.key ? 'primary' : 'default'} variant={filter === f.key ? 'filled' : 'outlined'} />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ color: 'text.secondary', mb: 1.5, alignItems: 'flex-start' }}>
        <InfoIcon sx={{ fontSize: 16, mt: '2px' }} />
        <Typography variant="caption">
          {app === 'whatsapp' || (showsWhatsApp && !showsInstagram && !showsMessenger)
            ? t('WhatsApp doesn’t let apps read chats back, so these are the messages Business Agent saved as they came and went, kept for as long as Data retention on My account says. You can reply for 24 hours after someone’s last message.')
            : showsInstagram
              ? t('Instagram doesn’t share its Primary, General and Requests folders with other apps, so every chat is here. You can reply for 24 hours after someone’s last message, and for up to 7 days as a personal reply you write yourself.')
              : t('Your Facebook Page’s Messenger chats. You can reply for 24 hours after someone’s last message, and for up to 7 days as a personal reply you write yourself.')}
        </Typography>
      </Stack>
      {loaded && shown.length === 0 && (
        <Empty>
          {search.trim() ? t('No chats match “{search}”.', { search: search.trim() })
            : filter !== 'all' ? t('Nothing here right now.')
              : app === 'instagram' ? t('No Instagram messages yet.') : app === 'messenger' ? t('No Messenger messages yet.')
                : app === 'whatsapp' ? t('No WhatsApp messages yet.') : t('No messages yet.')}
        </Empty>
      )}
      <Stack component="ul" aria-label={t('Chats')} sx={{ m: 0, p: 0, listStyle: 'none', gap: 0.5 }}>
        {shown.map(c => <ChatRow key={key(c)} c={c} selected={key(c) === open} roomy={wide && !chosen} mixed={mixed} onOpen={() => setOpen(key(c))} />)}
      </Stack>
      {filter === 'mentions' && showsInstagram && <Tagged posts={insta.data?.tagged ?? null} note={insta.data?.taggedNote} />}
    </Box>
  )

  return (
    <>
      {problems}
      <Card>
        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {[showsInstagram && ig?.account_label, showsMessenger && fb?.account_label && `${'Messenger'} · ${fb.account_label}`,
              showsWhatsApp && wa?.account_label && `${'WhatsApp'} · ${wa.account_label}`].filter(Boolean).join(' · ')}
          </Typography>
          {/* A computer: the chats fill the card until one is open, then chats and chat side by side. A phone: one at a time. */}
          {wide && chosen ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 2.5, alignItems: 'start' }}>
              {list}
              <Thread c={chosen} onSent={reload} onClose={() => setOpen(null)} />
            </Box>
          ) : chosen ? <Thread c={chosen} onSent={reload} onBack={() => setOpen(null)} /> : list}
        </CardContent>
      </Card>
    </>
  )
}

/** Who a chat is with, as each app names people: an @handle on Instagram, a name on Messenger, a name or number on WhatsApp. */
const handle = (c: InboxConversation) => (c.platform === 'instagram' ? `@${c.with.username}` : c.with.name ?? c.with.username)
/** A chat, told apart from other apps' chats. */
const key = (c: InboxConversation) => `${c.platform}:${c.id}`

/** When a chat last moved: its newest message, or Instagram's own updated time. */
const lastAt = (c: InboxConversation) => Math.max(Date.parse(c.updatedAt) || 0, ...c.recent.map(m => Date.parse(m.at) || 0))

const KIND_TAG: Partial<Record<InboxMessage['kind'], string>> = { story_mention: msg('Story mention'), story_reply: msg('Story reply'), share: msg('Shared post') }

/** Their Instagram profile photo, or their initials (also when the photo's link has expired). */
function PersonAvatar({ who, size }: { who: InboxConversation['with']; size: number }) {
  return (
    <Avatar src={who.picture} alt="" aria-hidden slotProps={{ img: { referrerPolicy: 'no-referrer', loading: 'lazy' } }}
      sx={{ width: size, height: size, fontSize: size * 0.4, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep, fontWeight: 600, flexShrink: 0 }}>
      {initials(who)}
    </Avatar>
  )
}

function ChatRow({ c, selected, roomy, mixed, onOpen }: { c: InboxConversation; selected: boolean; roomy: boolean; mixed: boolean; onOpen: () => void }) {
  const last = c.recent[0]
  const waiting = needsReply(c)
  const tag = c.recent.find(m => !m.fromMe && KIND_TAG[m.kind])
  return (
    <Box component="li" aria-label={handle(c)}>
      <Box component="button" type="button" onClick={onOpen} aria-current={selected || undefined}
        sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', gap: roomy ? 1.75 : 1.25, alignItems: 'center',
          p: roomy ? 1.75 : 1.25, borderRadius: '12px', bgcolor: selected ? tokens.roseSoft : 'transparent', '&:hover': { bgcolor: selected ? tokens.roseSoft : tokens.hover },
          '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }}>
        <PersonAvatar who={c.with} size={roomy ? 52 : 44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography variant="body2" sx={{ fontWeight: waiting ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: roomy ? '0 1 auto' : 1 }}>
              {c.with.name ?? c.with.username}
            </Typography>
            {roomy && c.with.name && c.platform !== 'messenger' && (
              <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.platform === 'whatsapp' ? c.with.username : `@${c.with.username}`}
              </Typography>
            )}
            {/* All apps together: which one the chat is on. */}
            {mixed && (
              <Box title={NAME[c.platform]} sx={{ display: 'flex', flexShrink: 0, ml: 'auto', '& svg': { width: 14, height: 14 } }}>
                <Brand icon={ICON[c.platform]} />
              </Box>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, ml: mixed ? 0 : 'auto' }}>{ago(c.updatedAt)}</Typography>
          </Stack>
          <Typography variant={roomy ? 'body2' : 'caption'} component="p" sx={{ color: waiting ? 'text.primary' : 'text.secondary', overflow: 'hidden',
            ...(roomy ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
            {preview(last, t)}
          </Typography>
          {(waiting || tag) && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
              {waiting && <Chip size="small" label={t('Needs reply')} sx={{ height: 20, bgcolor: tokens.roseSoft, color: tokens.roseDeep }} />}
              {tag && <Chip size="small" label={t(KIND_TAG[tag.kind] ?? '')} sx={{ height: 20, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function Thread({ c, onSent, onBack, onClose }: { c: InboxConversation; onSent: () => Promise<void>; onBack?: () => void; onClose?: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [text, setText] = useState('')
  const fb = c.platform === 'messenger', wa = c.platform === 'whatsapp'
  const thread = useAsync(`${c.platform}-thread`, () => (wa ? api.whatsappThread(c.id) : fb ? api.messengerThread(c.id) : api.instagramThread(c.id)), [c.id], { refetchInterval: 30_000 })
  const messages = thread.data?.messages ?? []
  const can = useMemo(() => replyWindow(messages, Date.now(), c.platform), [messages, c.platform])
  const who = thread.data?.conversation.with ?? c.with
  // WhatsApp: the café's number lives on Business Agent, so there's no other app to open.
  const appLink = wa ? null : fb ? 'https://business.facebook.com/latest/inbox/all' : 'https://www.instagram.com/direct/inbox/'
  const send = () => run(async () => {
    await (wa ? api.replyWhatsApp(c.id, text) : fb ? api.replyMessenger(c.id, text) : api.replyInstagram(c.id, text))
    setText('')
    await Promise.all([thread.reload(), onSent()])
  }, t('Sent'))

  return (
    <Box component="section" aria-label={c.platform === 'instagram' ? t('Chat with @{username}', { username: c.with.username }) : t('Chat with {name}', { name: handle(c) })}
      sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {onBack && <IconButton aria-label={t('Back to chats')} onClick={onBack} edge="start"><BackIcon /></IconButton>}
        <PersonAvatar who={who} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.name ?? who.username}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{wa ? `${'WhatsApp'} · ${who.username}` : fb ? 'Messenger' : `@${who.username}`}</Typography>
        </Box>
        {appLink && <Button size="small" endIcon={<OpenIcon />} href={appLink} target="_blank" rel="noreferrer">{fb ? 'Messenger' : 'Instagram'}</Button>}
        {onClose && <Tooltip title={t('Close chat')}><IconButton aria-label={t('Close chat')} onClick={onClose}><CloseIcon /></IconButton></Tooltip>}
      </Stack>
      <ErrorBox error={thread.error} />
      <Stack component="ol" aria-label={t('Messages')} sx={{ m: 0, p: 1.5, listStyle: 'none', gap: 1, bgcolor: tokens.surfaceAlt, borderRadius: '14px',
        maxHeight: { md: 460 }, overflowY: 'auto', minHeight: 160 }}>
        {messages.map((m, i) => (
          // Instagram style: their photo beside the last message of each run of theirs.
          <Bubble key={m.id} m={m} who={m.fromMe ? undefined : who} showAvatar={!m.fromMe && (messages[i + 1]?.fromMe ?? true)} platform={c.platform} />
        ))}
        {thread.data && messages.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{c.platform === 'instagram' ? t('No messages Instagram can share.') : t('No messages yet.')}</Typography>}
      </Stack>
      {thread.data && can.mode === 'human_agent' && (
        <Alert severity="info" variant="outlined" role="note" aria-label={t('Personal reply')}>
          {fb
            ? t('It’s been more than 24 hours since their last message, so Messenger takes this as a personal reply (its “human agent” tag): write it yourself, and no promotions. Allowed until {until}.', { until: formatLocal(can.until, 'EEE d MMM, HH:mm') })
            : t('It’s been more than 24 hours since their last message, so Instagram takes this as a personal reply (its “human agent” tag): write it yourself, and no promotions. Allowed until {until}.', { until: formatLocal(can.until, 'EEE d MMM, HH:mm') })}
        </Alert>
      )}
      {can.mode !== 'closed' ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <TextField label={t('Reply')} value={text} onChange={e => setText(e.target.value)} multiline maxRows={4} fullWidth size="small"
            helperText={can.mode === 'normal' ? t('You can reply until {until}.', { until: formatLocal(can.until, 'EEE HH:mm') }) : t('Sent as a personal reply.')}
            slotProps={{ htmlInput: { maxLength: wa ? 4096 : fb ? 2000 : 1000 } }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); void send() } }} />
          <IconButton aria-label={t('Send')} color="primary" disabled={!text.trim()} onClick={() => void send()} sx={{ mb: 3 }}><SendIcon /></IconButton>
        </Stack>
      ) : thread.data && (
        <Alert severity="info">
          {wa ? t('WhatsApp only allows free replies for 24 hours after their last message. After that, the café can only send approved templates (like shift reminders).')
            : fb
            ? tr('Messenger only allows replies from other apps up to 7 days after their last message. {link} instead.', {
              link: <MuiLink href={appLink ?? undefined} target="_blank" rel="noreferrer">{t('Reply in Meta Business Suite')}</MuiLink>,
            })
            : tr('Instagram only allows replies from other apps up to 7 days after their last message. {link} instead.', {
              link: <MuiLink href={appLink ?? undefined} target="_blank" rel="noreferrer">{t('Reply in the Instagram app')}</MuiLink>,
            })}
        </Alert>
      )}
    </Box>
  )
}

const LABEL: Partial<Record<InboxMessage['kind'], string>> = {
  story_mention: msg('Mentioned you in their story'), story_reply: msg('Replied to your story'), share: msg('Shared a post'),
  video: msg('Video'), audio: msg('Voice message'), file: msg('File'), location: msg('Location'),
}

/** How far one of the café's WhatsApp messages got. */
const STATUS: Record<NonNullable<InboxMessage['status']>, string> = { sent: msg('Sent'), delivered: msg('Delivered'), read: msg('Read'), failed: msg('Not delivered') }

const BUBBLE_AVATAR = 28

function Bubble({ m, who, showAvatar, platform }: { m: InboxMessage; who?: InboxConversation['with']; showAvatar?: boolean; platform: MessagePlatform }) {
  const mine = m.fromMe
  const label = LABEL[m.kind] && t(LABEL[m.kind]!)
  const said = `${label ?? ''}${label && m.text ? ' · ' : ''}${m.text}`
  return (
    <Box component="li" aria-label={mine ? t('You: {text}', { text: said }) : t('Them: {text}', { text: said })}
      sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
      {who && (showAvatar
        ? <Box sx={{ mb: 2.5 }}><PersonAvatar who={who} size={BUBBLE_AVATAR} /></Box>
        : <Box sx={{ width: BUBBLE_AVATAR, flexShrink: 0 }} />)}
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ px: 1.5, py: 1, borderRadius: '16px', bgcolor: mine ? tokens.rose : tokens.surface, color: mine ? '#2B2522' : 'text.primary',
          border: mine ? 'none' : `1px solid ${tokens.line}` }}>
          {label && <Typography variant="caption" component="p" sx={{ fontWeight: 600, mb: m.text || m.mediaUrl ? 0.5 : 0 }}>{label}</Typography>}
          {m.mediaUrl && (m.kind === 'audio'
            ? <Box component="audio" controls src={m.mediaUrl} sx={{ display: 'block', maxWidth: 240 }} />
            : m.kind === 'video' && platform === 'whatsapp'
              ? <Box component="video" controls src={m.mediaUrl} sx={{ display: 'block', width: 220, maxWidth: '100%', borderRadius: '10px', mb: m.text ? 0.75 : 0 }} />
            : m.kind === 'file'
              ? <MuiLink href={m.mediaUrl} target="_blank" rel="noreferrer">{t('Open file')}</MuiLink>
              : <Box component="img" src={m.mediaUrl} alt="" sx={{ display: 'block', width: 160, maxWidth: '100%', borderRadius: '10px', mb: m.text ? 0.75 : 0 }} />)}
          {m.kind === 'unsupported'
            ? <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{t('A message Instagram doesn’t share with other apps. Open Instagram to see it.')}</Typography>
            : m.kind === 'other'
              ? <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{t('A kind of message Business Agent can’t show yet (a poll or an order, for example).')}</Typography>
              : m.text && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</Typography>}
          {m.link && <MuiLink href={m.link} target="_blank" rel="noreferrer" variant="caption">{m.kind === 'location' ? t('Open map') : t('Open on Instagram')}</MuiLink>}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textAlign: mine ? 'right' : 'left', mt: 0.25 }}>
          {formatLocal(m.at, 'd MMM, HH:mm')}{m.reactions?.length ? ` · ${m.reactions.join(' ')}` : ''}
          {mine && m.status && <Box component="span" title={m.error} sx={{ color: m.status === 'failed' ? 'error.main' : undefined }}>{` · ${t(STATUS[m.status])}`}</Box>}
        </Typography>
      </Box>
    </Box>
  )
}

/** Posts other accounts tagged the business in. */
function Tagged({ posts, note }: { posts: TaggedPost[] | null; note?: string }) {
  return (
    <Box component="section" aria-label={t('Posts you’re tagged in')} sx={{ mt: 2.5 }}>
      <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary' }}>{t('Posts you’re tagged in')}</Typography>
      {note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{note}</Typography>}
      {posts && posts.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No one has tagged you in a post lately.')}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1, mt: 1 }}>
        {posts?.map(p => (
          <MuiLink key={p.id} href={p.permalink} target="_blank" rel="noreferrer" aria-label={t('Post by @{username}: {caption}', { username: p.username ?? t('someone'), caption: p.caption ?? '' })} underline="none">
            {p.mediaUrl && <Box component="img" src={p.mediaUrl} alt="" sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '10px', display: 'block' }} />}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{p.username ?? t('someone')}</Typography>
          </MuiLink>
        ))}
      </Box>
    </Box>
  )
}
