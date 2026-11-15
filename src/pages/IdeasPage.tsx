import { Alert, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, Link as MuiLink, Stack, TextField, Tooltip, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/RefreshRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import HideIcon from '@mui/icons-material/VisibilityOffOutlined'
import BrokenIcon from '@mui/icons-material/HideImageOutlined'
import PlayIcon from '@mui/icons-material/PlayCircleOutlined'
import SearchIcon from '@mui/icons-material/SearchRounded'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { EMBED_HEADER_PX, IDEA_KINDS, IDEA_KIND_FILTERS, embedOf, filterIdeas, ideaCounts, type IdeaFilter, type IdeasCheck, type InstagramIdea } from '../../shared/instagramIdeas'
import { cleanInstagram } from '../../shared/reps'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn, tr } from '../i18n'

/** The kind chosen last on this device (the words searched for aren't kept). */
const FILTER_KEY = 'ideas-filter'
function readFilter(): IdeaFilter {
  try {
    const kind = (JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') as { kind?: string }).kind
    return { kind: IDEA_KIND_FILTERS.some(k => k.kind === kind) ? kind as IdeaFilter['kind'] : null, words: '' }
  } catch { return { kind: null, words: '' } }
}

/** A filter: its name and how many ideas it has; the chosen one filled in. */
function FilterChip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <Chip clickable onClick={onClick} aria-pressed={selected}
      label={<>{label}<Box component="span" sx={{ opacity: 0.7, ml: 0.75 }}>{count}</Box></>}
      sx={{ fontWeight: 500, bgcolor: selected ? tokens.ink : 'transparent', color: selected ? tokens.surface : 'text.primary',
        border: 1, borderColor: selected ? 'transparent' : 'divider', '&:hover': { bgcolor: selected ? tokens.ink : tokens.hover } }} />
  )
}

/** What Check now found, in words. */
function checked(r: IdeasCheck) {
  if (r.chat === 'not_connected') return t('Instagram isn’t connected')
  if (r.chat === 'missing') return t('The Ideas chat isn’t among the business’s latest chats. Send a message in it, then check again.')
  return r.added ? tn(r.added, '{n} new idea', '{n} new ideas') : t('Nothing new in the Ideas chat')
}

/**
 * Ideas: posts and reels the team wants to remember, sent to the Instagram Ideas chat: the
 * business's chat with itself, or with another account an admin chose. Instagram doesn't let apps read saved
 * posts or group chats; this chat is how a post is kept here. The Worker reads it every 15 minutes (worker/instagramIdeas.ts).
 */
export function IdeasPage() {
  const { api, isAdmin, settings, refresh } = useApp()
  const notify = useNotify()
  const run = useAction()
  const list = useAsync('instagram-ideas', () => api.instagramIdeas(), [])
  // Admins: messages in the Ideas chat that Instagram left empty, so they aren't here.
  const status = useAsync('instagram-ideas-status', () => (isAdmin ? api.ideasChatStatus() : Promise.resolve(null)), [isAdmin])
  const unread = status.data?.unread?.length ?? 0
  // Admins: whether Instagram is connected (and as whom), and where pictures are kept.
  const integ = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  const instagram = integ.data?.integrations.find(i => i.provider === 'instagram')
  const connected = instagram?.status === 'connected'
  const business = instagram?.account_label ?? t('the business’s Instagram')
  // The account an admin chose for the Ideas chat; none: the business's chat with itself.
  const chat = settings?.idea_chat ?? null
  const [editing, setEditing] = useState(false)
  const [checking, setChecking] = useState(false)
  const ideas = list.data ?? []
  // Filters: by kind and by words in a note (remembered on this device), all on the page itself.
  const [filter, setFilter] = useState<IdeaFilter>(readFilter)
  const choose = (f: Partial<IdeaFilter>) => {
    const next = { ...filter, ...f }
    setFilter(next)
    try { localStorage.setItem(FILTER_KEY, JSON.stringify({ kind: next.kind })) } catch { /* storage unavailable */ }
  }
  const counts = ideaCounts(ideas)
  const shown = filterIdeas(ideas, filter)
  const notKept = ideas.some(i => !i.media_kept)

  const check = async () => {
    setChecking(true)
    try {
      const r = await api.checkIdeasChat()
      notify(checked(r), r.chat === 'read' ? 'success' : 'info')
      await Promise.all([list.reload(), status.reload()])
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Box>
      <PageHeader title={t('Ideas')} actions={
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={check} disabled={checking}>{checking ? t('Checking…') : t('Check now')}</Button>
      } />
      <Typography sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 720 }}>
        {chat
          ? tr('Posts and reels sent to the Ideas chat on Instagram: {business}’s chat with {who}. New ones show here within 15 minutes.', { business: <b>{business}</b>, who: <b>@{chat}</b> })
          : tr('Posts and reels {business} sends to itself on Instagram, in its chat with itself. New ones show here within 15 minutes.', { business: <b>{business}</b> })}
        {isAdmin && !editing && <> <MuiLink component="button" onClick={() => setEditing(true)} sx={{ verticalAlign: 'baseline' }}>{t('Change')}</MuiLink></>}
      </Typography>
      <ErrorBox error={list.error} />

      {isAdmin && integ.data && !connected && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} to="/connections" color="inherit" size="small">{t('Connections')}</Button>}>
          {t('Connect Instagram, with messages allowed, so the Ideas chat can be read.')}
        </Alert>
      )}
      {isAdmin && editing && (
        <SetUp business={business} chat={chat} onCancel={() => setEditing(false)}
          onSave={async username => {
            await run(async () => { await api.updateSettings({ idea_chat: username }); await refresh() }, t('Saved'))
            setEditing(false)
          }} />
      )}
      {isAdmin && unread > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tn(unread, 'Instagram didn’t share what was in {n} message of the Ideas chat, so it isn’t here.', 'Instagram didn’t share what was in {n} messages of the Ideas chat, so they aren’t here.')}
        </Alert>
      )}
      {isAdmin && connected && notKept && integ.data?.media_storage === null && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button component={Link} to="/connections" color="inherit" size="small">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive so the pictures are kept: Instagram’s links to them stop working after a few days.')}
        </Alert>
      )}

      {!list.data ? null : ideas.length === 0 ? (
        <Empty>
          {chat
            ? t('Nothing in the Ideas chat yet. On Instagram, tap the paper plane under a post or reel and send it to the Ideas chat.')
            : tr('Nothing in the Ideas chat yet. On Instagram, as {business}, tap the paper plane under a post or reel and send it to yourself.', { business })}
        </Empty>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction="row" useFlexGap role="group" aria-label={t('Filter by type')} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              <FilterChip label={t('All')} count={ideas.length} selected={!filter.kind} onClick={() => choose({ kind: null })} />
              {IDEA_KIND_FILTERS.filter(k => counts[k.kind] || filter.kind === k.kind).map(k => (
                <FilterChip key={k.kind} label={t(k.label)} count={counts[k.kind] ?? 0} selected={filter.kind === k.kind}
                  onClick={() => choose({ kind: filter.kind === k.kind ? null : k.kind })} />
              ))}
            </Stack>
            <TextField size="small" type="search" value={filter.words} onChange={e => choose({ words: e.target.value })}
              placeholder={t('Search the notes')} sx={{ width: { xs: '100%', sm: 260 } }}
              slotProps={{ htmlInput: { 'aria-label': t('Search the notes') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          </Stack>
          {shown.length === 0 ? (
            <Empty>{t('No ideas match. Try another type, or other words.')}</Empty>
          ) : (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
              {shown.map(i => (
                <IdeaCard key={i.id} idea={i} onHide={isAdmin ? () => run(async () => { await api.hideInstagramIdea(i.id); await list.reload() }, t('Taken off the Ideas page')) : undefined} />
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

/**
 * Admins: which chat is the Ideas chat. The business's chat with itself (no username: settings.idea_chat
 * empty), how to pin it on Instagram, or a chat with another account of theirs.
 */
function SetUp({ business, chat, onSave, onCancel }: { business: string; chat: string | null; onSave: (username: string | null) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(chat ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const username = cleanInstagram(value)
    if (!username) { setProblem(t('Type an Instagram username, like @maria.ideas')); return }
    setProblem(null)
    await onSave(username)
  }
  const step = { pl: 0.5, mb: 1, lineHeight: 1.6 }
  return (
    <Card variant="outlined" sx={{ mb: 3, maxWidth: 760 }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('The Ideas chat')}</Typography>
        <Typography sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Instagram doesn’t let apps read saved posts or group chats, so ideas come from one chat. It isn’t shown on the Messages page.')}
        </Typography>
        <Typography sx={{ fontWeight: 600, mb: 0.75 }}>{tr('{business}’s chat with itself', { business })}</Typography>
        <Box component="ol" sx={{ m: 0, mb: 1.5, pl: 2.5 }}>
          <Box component="li" sx={step}>{tr('On Instagram, as {business}, open Messages, search for {business} and send yourself a post or reel.', { business: <b>{business}</b> })}</Box>
          <Box component="li" sx={step}>{t('Press and hold the chat and tap Pin, so it stays at the top.')}</Box>
          <Box component="li" sx={step}>{t('From then on, share posts and reels to yourself with the paper plane. Anything you write with one is kept as its note.')}</Box>
        </Box>
        {chat
          ? <Button variant="contained" onClick={() => onSave(null)} sx={{ mb: 2.5 }}>{t('Use this chat')}</Button>
          : <Box sx={{ mb: 2.5 }}><Tag>{t('In use')}</Tag></Box>}
        <Typography sx={{ fontWeight: 600, mb: 0.75 }}>{t('Or a chat with another account of yours')}</Typography>
        <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
          {tr('From that account, send {business} a message, then type its username here.', { business: <b>{business}</b> })}
        </Typography>
        <Stack component="form" onSubmit={submit} direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'flex-start' } }}>
          <TextField size="small" label={t('Their Instagram username')} placeholder={'@maria.ideas'} value={value} onChange={e => setValue(e.target.value)}
            error={!!problem} helperText={problem ?? ' '} sx={{ minWidth: 260 }} slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }} />
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button type="submit" variant={chat ? 'contained' : 'outlined'}>{t('Save')}</Button>
            <Button onClick={onCancel}>{t('Cancel')}</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

/** One idea: its picture (or video), what kind, who sent it and when, its note, and where to open it. */
function IdeaCard({ idea: i, onHide }: { idea: InstagramIdea; onHide?: () => void }) {
  const [broken, setBroken] = useState(false)
  const who = `@${i.username}`
  // No picture from Instagram (a shared reel comes with its address only), or it stopped working: Instagram's
  // own embed of the post, its header (who posted it) cut off so the post fills the card as a picture would.
  const embed = !i.media_url || broken ? embedOf(i.permalink) : null
  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden', bgcolor: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.line}` }}>
        {embed && (
          <Box component="iframe" src={embed} title={t('{kind} from {who}', { kind: t(IDEA_KINDS[i.kind]), who })} loading="lazy" scrolling="no"
            sx={{ position: 'absolute', left: 0, top: -EMBED_HEADER_PX, width: '100%', height: `calc(100% + ${EMBED_HEADER_PX}px)`, border: 0, display: 'block', bgcolor: tokens.surfaceAlt }} />
        )}
        {!embed && i.media_url && !broken && (i.media_type === 'video'
          ? <Box component="video" src={i.media_url} controls muted playsInline preload="metadata" aria-label={t('{kind} from {who}', { kind: t(IDEA_KINDS[i.kind]), who })}
              onError={() => setBroken(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <Box component="img" src={i.media_url} alt={t('{kind} from {who}', { kind: t(IDEA_KINDS[i.kind]), who })} loading="lazy"
              onError={() => setBroken(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />)}
        {!embed && (!i.media_url || broken) && (
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 1, p: 2, color: 'text.secondary', textAlign: 'center' }}>
            <BrokenIcon />
            <Typography variant="caption">{t('Instagram didn’t share a picture of this one')}</Typography>
          </Stack>
        )}
        {i.kind === 'reel' && i.media_type !== 'video' && !broken && i.media_url && (
          <PlayIcon sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />
        )}
      </Box>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', flexDirection: 'column', gap: 0.75, flex: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Tag>{t(IDEA_KINDS[i.kind])}</Tag>
          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {who} · {formatLocal(i.shared_at, 'd MMM')}
          </Typography>
        </Stack>
        {i.note && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {i.note}
          </Typography>
        )}
        <Stack direction="row" sx={{ mt: 'auto', pt: 0.5, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {i.permalink
            ? <Button size="small" href={i.permalink} target="_blank" rel="noreferrer" endIcon={<OpenIcon fontSize="small" />} sx={{ ml: -0.75 }}>{t('Open on Instagram')}</Button>
            : <span />}
          {onHide && (
            <Tooltip title={t('Take off the Ideas page')}>
              <IconButton size="small" onClick={onHide} aria-label={t('Take {who}’s {kind} off the Ideas page', { who, kind: t(IDEA_KINDS[i.kind]).toLowerCase() })}>
                <HideIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export default IdeasPage
