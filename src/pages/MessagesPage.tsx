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
import { siInstagram, siMessenger, siTiktok, siWhatsapp, type SimpleIcon } from 'simple-icons'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import { Brand, CAN, DOES, KEYS_NEEDED, ago, useConnectResult } from '../components/Connectors'
import {
  INBOX_FILTERS, initials, matchesFilter, matchesSearch, needsReply, preview, replyWindow,
  type InboxConversation, type InboxFilter, type InboxMessage, type MessagePlatform, type TaggedPost,
} from '../../shared/messages'
import type { Integration } from '../../shared/types'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

const PLATFORMS: { id: MessagePlatform; name: string; icon: SimpleIcon; live: boolean }[] = [
  { id: 'instagram', name: 'Instagram', icon: siInstagram, live: true },
  { id: 'whatsapp', name: 'WhatsApp', icon: siWhatsapp, live: false },
  { id: 'messenger', name: 'Messenger', icon: siMessenger, live: false },
  { id: 'tiktok', name: 'TikTok', icon: siTiktok, live: false },
]

/**
 * The business's direct messages in one place. Instagram for now; the other apps show, greyed out,
 * until they're added. Connecting here is the same one click as on Connections (it's one connection).
 */
export function MessagesPage() {
  const { api } = useApp()
  const integ = useAsync('integrations', () => api.integrations(), [])
  useConnectResult(() => { void integ.reload() })
  const ig = integ.data?.integrations.find(i => i.provider === 'instagram')
  const connected = ig?.status === 'connected'
  const [app, setApp] = useState<MessagePlatform | 'all'>('all')

  return (
    <>
      <PageHeader eyebrow="Business" title="Messages" />
      <Stack direction="row" role="group" aria-label="Apps" sx={{ gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        {/* All: every app's chats together, newest first (the default). */}
        <Chip label="All" clickable onClick={() => setApp('all')} aria-pressed={app === 'all'}
          color={app === 'all' ? 'primary' : 'default'} variant={app === 'all' ? 'filled' : 'outlined'} />
        {PLATFORMS.map(p => (
          <Tooltip key={p.id} title={p.live ? '' : `${p.name} messages are coming soon`}>
            <span>
              <Chip icon={<Box sx={{ display: 'flex', ml: 0.75, opacity: p.live ? 1 : 0.5 }}><Brand icon={p.icon} /></Box>}
                label={p.live ? p.name : `${p.name} · soon`} disabled={!p.live} aria-pressed={app === p.id}
                onClick={() => { if (p.live) setApp(p.id) }}
                color={app === p.id ? 'primary' : 'default'} variant={app === p.id ? 'filled' : 'outlined'} />
            </span>
          </Tooltip>
        ))}
      </Stack>
      <ErrorBox error={integ.error} />
      {integ.data && !connected && <ConnectInstagram row={ig} configured={!!integ.data.configured.instagram} />}
      {connected && <Inbox ig={ig!} app={app} />}
    </>
  )
}

/** Not connected yet: the same Connect as on Connections, coming back here afterwards. */
function ConnectInstagram({ row, configured }: { row?: Integration; configured: boolean }) {
  const { api, refresh } = useApp()
  const run = useAction()
  return (
    <Card component="section" aria-label="Connect Instagram">
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
            <Brand icon={siInstagram} />
          </Box>
          <Box>
            <Typography variant="h6" component="h2">Connect Instagram</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{DOES.instagram}</Typography>
          </Box>
        </Stack>
        {row?.last_error && <Alert severity="error" sx={{ mt: 1.5 }}>{row.last_error}</Alert>}
        {!configured && <Alert severity="warning" sx={{ mt: 1.5 }}>Not set up yet: Business Agent needs {KEYS_NEEDED.instagram} before anyone can connect Instagram. They’re added once, for every business; after that, connecting is one click.</Alert>}
        <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mt: 2 }}>When you connect, it can</Typography>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, pl: 2.5 }}>
          {CAN.instagram!.map(c => <Typography key={c} component="li" variant="body2">{c}</Typography>)}
        </Stack>
        <Button variant="contained" sx={{ mt: 2.5 }} disabled={!configured} onClick={() => run(async () => { await api.connectInstagram('messages'); await refresh() })}>
          {row?.status === 'error' ? 'Connect again' : 'Connect Instagram'}
        </Button>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
          It’s the same connection as on Connections: connect here or there and both pages update.
        </Typography>
      </CardContent>
    </Card>
  )
}

function Inbox({ ig, app }: { ig: Integration; app: MessagePlatform | 'all' }) {
  const { api } = useApp()
  const run = useAction()
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const data = useAsync('instagram-inbox', () => api.instagramInbox(), [], { refetchInterval: 60_000 })
  // Newest first: the chat with the latest message (from either side) at the top.
  const all = useMemo(() => (data.data?.conversations ?? [])
    .filter(c => app === 'all' || c.platform === app)
    .sort((a, b) => lastAt(b) - lastAt(a)), [data.data, app])
  const shown = all.filter(c => matchesFilter(c, filter) && matchesSearch(c, search))
  const count = (f: InboxFilter) => all.filter(c => matchesFilter(c, f)).length
  const chosen = all.find(c => c.id === open) ?? null

  if (data.error) {
    const reconnect = /Connect Instagram again/.test(data.error)
    return (
      <Alert severity="warning" action={reconnect && <Button color="inherit" onClick={() => run(() => api.connectInstagram('messages'))}>Connect again</Button>}>
        {data.error}
      </Alert>
    )
  }

  const list = (
    <Box component="section" aria-label="Chats" sx={{ minWidth: 0 }}>
      {/* Search across every chat: who it's with and what was said. */}
      <TextField value={search} onChange={e => setSearch(e.target.value)} size="small" fullWidth placeholder="Search chats"
        aria-label="Search chats" sx={{ mb: 1.5 }}
        slotProps={{ input: {
          startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => setSearch('')}><CloseIcon fontSize="small" /></IconButton>
            </InputAdornment>
          ) : undefined,
        } }} />
      <Stack direction="row" role="group" aria-label="Show" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {INBOX_FILTERS.map(f => (
          <Chip key={f.key} size="small" clickable onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            label={f.key === 'all' ? f.label : `${f.label} ${count(f.key)}`}
            color={filter === f.key ? 'primary' : 'default'} variant={filter === f.key ? 'filled' : 'outlined'} />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ color: 'text.secondary', mb: 1.5, alignItems: 'flex-start' }}>
        <InfoIcon sx={{ fontSize: 16, mt: '2px' }} />
        <Typography variant="caption">
          Instagram doesn’t share its Primary, General and Requests folders with other apps, so every chat is here.
          You can reply for 24 hours after someone’s last message, and for up to 7 days as a personal reply you write yourself.
        </Typography>
      </Stack>
      {data.data && shown.length === 0 && (
        <Empty>
          {search.trim() ? `No chats match “${search.trim()}”.`
            : filter === 'all' ? (app === 'all' ? 'No messages yet.' : 'No Instagram messages yet.') : 'Nothing here right now.'}
        </Empty>
      )}
      <Stack component="ul" aria-label="Instagram chats" sx={{ m: 0, p: 0, listStyle: 'none', gap: 0.5 }}>
        {shown.map(c => <ChatRow key={c.id} c={c} selected={c.id === open} roomy={wide && !chosen} onOpen={() => setOpen(c.id)} />)}
      </Stack>
      {filter === 'mentions' && <Tagged posts={data.data?.tagged ?? null} note={data.data?.taggedNote} />}
    </Box>
  )

  return (
    <Card>
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{ig.account_label}</Typography>
        {/* A computer: the chats fill the card until one is open, then chats and chat side by side. A phone: one at a time. */}
        {wide && chosen ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 2.5, alignItems: 'start' }}>
            {list}
            <Thread c={chosen} onSent={data.reload} onClose={() => setOpen(null)} />
          </Box>
        ) : chosen ? <Thread c={chosen} onSent={data.reload} onBack={() => setOpen(null)} /> : list}
      </CardContent>
    </Card>
  )
}

/** When a chat last moved: its newest message, or Instagram's own updated time. */
const lastAt = (c: InboxConversation) => Math.max(Date.parse(c.updatedAt) || 0, ...c.recent.map(m => Date.parse(m.at) || 0))

const KIND_TAG: Partial<Record<InboxMessage['kind'], string>> = { story_mention: 'Story mention', story_reply: 'Story reply', share: 'Shared post' }

/** Their Instagram profile photo, or their initials (also when the photo's link has expired). */
function PersonAvatar({ who, size }: { who: InboxConversation['with']; size: number }) {
  return (
    <Avatar src={who.picture} alt="" aria-hidden slotProps={{ img: { referrerPolicy: 'no-referrer', loading: 'lazy' } }}
      sx={{ width: size, height: size, fontSize: size * 0.4, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep, fontWeight: 600, flexShrink: 0 }}>
      {initials(who)}
    </Avatar>
  )
}

function ChatRow({ c, selected, roomy, onOpen }: { c: InboxConversation; selected: boolean; roomy: boolean; onOpen: () => void }) {
  const last = c.recent[0]
  const waiting = needsReply(c)
  const tag = c.recent.find(m => !m.fromMe && KIND_TAG[m.kind])
  return (
    <Box component="li" aria-label={`@${c.with.username}`}>
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
            {roomy && c.with.name && (
              <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{c.with.username}</Typography>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, ml: 'auto' }}>{ago(c.updatedAt)}</Typography>
          </Stack>
          <Typography variant={roomy ? 'body2' : 'caption'} component="p" sx={{ color: waiting ? 'text.primary' : 'text.secondary', overflow: 'hidden',
            ...(roomy ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
            {preview(last)}
          </Typography>
          {(waiting || tag) && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
              {waiting && <Chip size="small" label="Needs reply" sx={{ height: 20, bgcolor: tokens.roseSoft, color: tokens.roseDeep }} />}
              {tag && <Chip size="small" label={KIND_TAG[tag.kind]} sx={{ height: 20, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep }} />}
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
  const t = useAsync('instagram-thread', () => api.instagramThread(c.id), [c.id], { refetchInterval: 30_000 })
  const messages = t.data?.messages ?? []
  const can = useMemo(() => replyWindow(messages), [messages])
  const who = t.data?.conversation.with ?? c.with
  const send = () => run(async () => {
    await api.replyInstagram(c.id, text)
    setText('')
    await Promise.all([t.reload(), onSent()])
  }, 'Sent')

  return (
    <Box component="section" aria-label={`Chat with @${c.with.username}`} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {onBack && <IconButton aria-label="Back to chats" onClick={onBack} edge="start"><BackIcon /></IconButton>}
        <PersonAvatar who={who} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.name ?? who.username}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{who.username}</Typography>
        </Box>
        <Button size="small" endIcon={<OpenIcon />} href="https://www.instagram.com/direct/inbox/" target="_blank" rel="noreferrer">Instagram</Button>
        {onClose && <Tooltip title="Close chat"><IconButton aria-label="Close chat" onClick={onClose}><CloseIcon /></IconButton></Tooltip>}
      </Stack>
      <ErrorBox error={t.error} />
      <Stack component="ol" aria-label="Messages" sx={{ m: 0, p: 1.5, listStyle: 'none', gap: 1, bgcolor: tokens.surfaceAlt, borderRadius: '14px',
        maxHeight: { md: 460 }, overflowY: 'auto', minHeight: 160 }}>
        {messages.map((m, i) => (
          // Instagram style: their photo beside the last message of each run of theirs.
          <Bubble key={m.id} m={m} who={m.fromMe ? undefined : who} showAvatar={!m.fromMe && (messages[i + 1]?.fromMe ?? true)} />
        ))}
        {t.data && messages.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>No messages Instagram can share.</Typography>}
      </Stack>
      {t.data && can.mode === 'human_agent' && (
        <Alert severity="info" variant="outlined" role="note" aria-label="Personal reply">
          It’s been more than 24 hours since their last message, so Instagram takes this as a personal reply (its “human agent” tag):
          write it yourself, and no promotions. Allowed until {formatLocal(can.until, 'EEE d MMM, HH:mm')}.
        </Alert>
      )}
      {can.mode !== 'closed' ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
          <TextField label="Reply" value={text} onChange={e => setText(e.target.value)} multiline maxRows={4} fullWidth size="small"
            helperText={can.mode === 'normal' ? `You can reply until ${formatLocal(can.until, 'EEE HH:mm')}.` : 'Sent as a personal reply.'}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); void send() } }} />
          <IconButton aria-label="Send" color="primary" disabled={!text.trim()} onClick={() => void send()} sx={{ mb: 3 }}><SendIcon /></IconButton>
        </Stack>
      ) : t.data && (
        <Alert severity="info">
          Instagram only allows replies from other apps up to 7 days after their last message.{' '}
          <MuiLink href="https://www.instagram.com/direct/inbox/" target="_blank" rel="noreferrer">Reply in the Instagram app</MuiLink> instead.
        </Alert>
      )}
    </Box>
  )
}

const LABEL: Partial<Record<InboxMessage['kind'], string>> = {
  story_mention: 'Mentioned you in their story', story_reply: 'Replied to your story', share: 'Shared a post',
  video: 'Video', audio: 'Voice message', file: 'File',
}

const BUBBLE_AVATAR = 28

function Bubble({ m, who, showAvatar }: { m: InboxMessage; who?: InboxConversation['with']; showAvatar?: boolean }) {
  const mine = m.fromMe
  const label = LABEL[m.kind]
  return (
    <Box component="li" aria-label={`${mine ? 'You' : 'Them'}: ${label ?? ''}${label && m.text ? ' · ' : ''}${m.text}`}
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
            : m.kind === 'file'
              ? <MuiLink href={m.mediaUrl} target="_blank" rel="noreferrer">Open file</MuiLink>
              : <Box component="img" src={m.mediaUrl} alt="" sx={{ display: 'block', width: 160, maxWidth: '100%', borderRadius: '10px', mb: m.text ? 0.75 : 0 }} />)}
          {m.kind === 'unsupported'
            ? <Typography variant="body2" sx={{ fontStyle: 'italic' }}>A message Instagram doesn’t share with other apps. Open Instagram to see it.</Typography>
            : m.text && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</Typography>}
          {m.link && <MuiLink href={m.link} target="_blank" rel="noreferrer" variant="caption">Open on Instagram</MuiLink>}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textAlign: mine ? 'right' : 'left', mt: 0.25 }}>
          {formatLocal(m.at, 'd MMM, HH:mm')}{m.reactions?.length ? ` · ${m.reactions.join(' ')}` : ''}
        </Typography>
      </Box>
    </Box>
  )
}

/** Posts other accounts tagged the business in. */
function Tagged({ posts, note }: { posts: TaggedPost[] | null; note?: string }) {
  return (
    <Box component="section" aria-label="Posts you’re tagged in" sx={{ mt: 2.5 }}>
      <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary' }}>Posts you’re tagged in</Typography>
      {note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{note}</Typography>}
      {posts && posts.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>No one has tagged you in a post lately.</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1, mt: 1 }}>
        {posts?.map(p => (
          <MuiLink key={p.id} href={p.permalink} target="_blank" rel="noreferrer" aria-label={`Post by @${p.username ?? 'someone'}: ${p.caption ?? ''}`} underline="none">
            {p.mediaUrl && <Box component="img" src={p.mediaUrl} alt="" sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '10px', display: 'block' }} />}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>@{p.username ?? 'someone'}</Typography>
          </MuiLink>
        ))}
      </Box>
    </Box>
  )
}
