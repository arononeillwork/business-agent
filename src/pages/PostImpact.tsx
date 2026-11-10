// Analytics → Instagram → What each post did: the café's own posts and the ones about it (a customer's
// collab reel, a tag, a story mention), each with how it did and the new followers the café gained the
// day it went out and the two after, against a usual three days (shared/postImpact.ts). New followers
// day by day above them. A post Instagram doesn't list can be added by its link.
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddLinkIcon from '@mui/icons-material/AddLinkRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlineRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { BarChart, type BarPoint } from '../components/charts'
import { Empty, SectionTitle, Tag } from '../components/common'
import { t, tn } from '../i18n'
import { addDays, formatLocal, formatNumber, today } from '../../shared/time'
import { IMPACT_DAYS, extraFollowers, type PostBy, type PostImpact } from '../../shared/postImpact'
import type { SocialDay } from '../../shared/socialAnalytics'
import { tokens } from '../theme'

type Show = 'all' | 'you' | 'about'
const SHOWN = 12

/** Who posted it, as a tag. */
function ByTag({ p }: { p: PostImpact }) {
  const what: Record<PostBy, string> = {
    you: p.video ? t('Your reel') : t('Your post'),
    collab: p.video ? t('Collab reel') : t('Collab post'),
    tagged: t('Tagged you'),
    story: t('Story mention'),
  }
  return p.by === 'you' ? <Tag>{what.you}</Tag> : <Tag fg={tokens.roseDeep} bg={tokens.roseSoft}>{what[p.by]}</Tag>
}

/** The followers it brought: the number, and against what's usual. */
function Followers({ p }: { p: PostImpact }) {
  if (p.soon) return <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Too soon to tell')}</Typography>
  if (p.gained === null) {
    return (
      <Tooltip title={t('Instagram keeps new followers day by day for 30 days; the app keeps them from when Analytics was first opened.')}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Followers not known')}</Typography>
      </Tooltip>
    )
  }
  const extra = extraFollowers(p)
  return (
    <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
      <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {tn(p.gained, '+{n} follower', '+{n} followers', { n: formatNumber(p.gained) })}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
        {[p.days < IMPACT_DAYS ? t('so far ({n} of {of} days)', { n: p.days, of: IMPACT_DAYS }) : t('in {n} days', { n: p.days }),
          p.usual !== null ? t('usually {n}', { n: formatNumber(p.usual) }) : null].filter(Boolean).join(' · ')}
      </Typography>
      {extra !== null && extra > 0 && (
        <Typography variant="caption" sx={{ display: 'block', color: tokens.goodFg, fontWeight: 600 }}>
          {t('{n} more than usual', { n: formatNumber(extra) })}
        </Typography>
      )}
      {p.shared && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('with another post those days')}</Typography>}
    </Box>
  )
}

function PostRow({ p, onRemove }: { p: PostImpact; onRemove?: () => void }) {
  const figures = [
    p.reach !== null ? t('{n} reached', { n: formatNumber(p.reach) }) : null,
    p.views !== null ? t('{n} views', { n: formatNumber(p.views) }) : null,
    p.likes !== null ? t('{n} likes', { n: formatNumber(p.likes) }) : null,
    p.comments !== null ? t('{n} comments', { n: formatNumber(p.comments) }) : null,
    p.follows !== null && p.follows > 0 ? t('{n} followed from it', { n: formatNumber(p.follows) }) : null,
  ].filter(Boolean)
  const title = p.by === 'you' ? null : p.username ? `@${p.username}` : t('Someone')
  return (
    <Stack role="group" aria-label={title ? t('{who}: {when}', { who: title, when: formatLocal(p.at, 'd MMM') }) : t('Your post: {when}', { when: formatLocal(p.at, 'd MMM') })}
      direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
      sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 }, alignItems: { sm: 'center' } }}>
      <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
        <Box sx={{ position: 'relative', width: 48, height: 60, flexShrink: 0, borderRadius: '8px', overflow: 'hidden', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
          {p.thumbnail && <Box component="img" src={p.thumbnail} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
          {p.video && <PlayIcon sx={{ position: 'absolute', right: 2, bottom: 2, fontSize: 18, color: '#fff', filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {title && <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>}
            <ByTag p={p} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatLocal(p.at, 'EEE d MMM')}</Typography>
          </Stack>
          <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', typography: 'body2', color: 'text.secondary' }}>
            {p.url
              ? <Link href={p.url} target="_blank" rel="noreferrer" underline="hover" color="inherit">{p.caption || t('Open it on Instagram')}</Link>
              : p.caption || t('(no caption)')}
          </Box>
          {figures.length > 0 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{figures.join(' · ')}</Typography>}
        </Box>
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' }, minWidth: { sm: 190 } }}>
        <Followers p={p} />
        {onRemove && (
          <IconButton size="small" aria-label={t('Take off {who}’s post', { who: title ?? '' })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton>
        )}
      </Stack>
    </Stack>
  )
}

/** New followers each day of the period, with the posts of each day in its tooltip. */
function FollowersChart({ days, posts, from, to, periodName }: { days: SocialDay[]; posts: PostImpact[]; from: string; to: string; periodName: string }) {
  const by = new Map(days.map(d => [d.date, d.value]))
  const shown = days.filter(d => d.date >= from && d.date <= to)
  if (!shown.length) return null
  const first = shown[0].date, last = shown[shown.length - 1].date
  const n = Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) + 1
  const many = n > 10
  const points: BarPoint[] = Array.from({ length: n }, (_, i) => {
    const date = addDays(first, i)
    const that = posts.filter(p => p.at.slice(0, 10) === date)
    const who = that.map(p => (p.by === 'you' ? (p.video ? t('your reel') : t('your post')) : `@${p.username ?? '?'}`)).join(', ')
    return {
      label: formatLocal(`${date}T12:00:00Z`, many ? 'd MMM' : 'EEE d'),
      title: who ? `${formatLocal(`${date}T12:00:00Z`, 'EEEE d MMMM')} · ${who}` : formatLocal(`${date}T12:00:00Z`, 'EEEE d MMMM'),
      value: by.get(date) ?? 0,
    }
  })
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('New followers each day')}</Typography>
      <BarChart points={points} height={170} format={v => tn(Math.round(v), '{n} new follower', '{n} new followers', { n: formatNumber(Math.round(v)) })}
        axisFormat={v => formatNumber(Math.round(v))} label={t('New followers per day, {period}', { period: periodName.toLowerCase() })} />
    </Box>
  )
}

export function PostImpactCard({ impact, followerDays, from, to, periodName, collabsListed = true }: {
  impact: PostImpact[]; followerDays: SocialDay[] | null | undefined; from: string; to: string; periodName: string
  /** False when Instagram doesn't list collab posts for this connection: they're added by their link. */
  collabsListed?: boolean
}) {
  const { api } = useApp()
  const run = useAction()
  const [show, setShow] = useState<Show>('all')
  const [all, setAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const about = impact.filter(p => p.by !== 'you')
  const list = impact.filter(p => show === 'all' || (show === 'you' ? p.by === 'you' : p.by !== 'you'))
  const fromAbout = about.reduce((n, p) => n + (p.gained ?? 0), 0)
  const title = t('What each post did')
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Button size="small" startIcon={<AddLinkIcon />} onClick={() => setAdding(true)} sx={{ whiteSpace: 'nowrap' }}>{t('Add a post')}</Button>}>{title}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Your posts, and the ones customers made about you: collab reels, tags and story mentions. Each shows the followers you gained the day it went out and the two days after, against a usual three days.')}
        </Typography>
        {!collabsListed && (
          <Alert severity="info" sx={{ mb: 2 }} action={<Button size="small" component={RouterLink} to="/connections" sx={{ whiteSpace: 'nowrap' }}>{t('Connections')}</Button>}>
            {t('Collab reels come in through your Facebook Page: connect Facebook again on Connections and allow access to Instagram. From then on they come in by themselves, and whoever posted them goes on Sales reps & rewards.')}
          </Alert>
        )}
        <FollowersChart days={followerDays ?? []} posts={impact} from={from} to={to} periodName={periodName} />
        {about.length > 0 && fromAbout > 0 && (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {t('Posts about you this period: {n}, with {followers} new followers in their days.', { n: about.length, followers: formatNumber(fromAbout) })}
          </Typography>
        )}
        {impact.length > 0 && (
          <ToggleButtonGroup size="small" exclusive value={show} onChange={(_, v: Show | null) => { if (v) setShow(v) }} aria-label={t('Show')} sx={{ mb: 1, flexWrap: 'wrap' }}>
            <ToggleButton value="all" sx={{ px: 1.25, py: 0.25 }}>{t('All')}</ToggleButton>
            <ToggleButton value="you" sx={{ px: 1.25, py: 0.25 }}>{t('Your posts')}</ToggleButton>
            <ToggleButton value="about" sx={{ px: 1.25, py: 0.25 }}>{t('About you ({n})', { n: about.length })}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {!list.length
          ? <Empty>{show === 'about' ? t('No posts about you in this period yet.') : t('No posts in this period.')}</Empty>
          : <Box>
              {(all ? list : list.slice(0, SHOWN)).map(p => (
                <PostRow key={p.id} p={p} onRemove={p.added ? () => void run(() => api.removePostByLink(p.id), t('Taken off')) : undefined} />
              ))}
            </Box>}
        {list.length > SHOWN && (
          <Button size="small" sx={{ mt: 1 }} onClick={() => setAll(x => !x)}>{all ? t('Show fewer') : t('Show all {n}', { n: list.length })}</Button>
        )}
        {!followerDays?.length && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
            {t('Instagram shares new followers day by day once an account has 100 followers, for the last 30 days. The app keeps them from then on.')}
          </Typography>
        )}
      </CardContent>
      {adding && <AddByLinkDialog onClose={() => setAdding(false)} />}
    </Card>
  )
}

/** A post or reel about the café that Instagram didn't list, by its link. */
function AddByLinkDialog({ onClose }: { onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [link, setLink] = useState('')
  const [username, setUsername] = useState('')
  const [on, setOn] = useState(today())
  const save = async () => {
    let put = false
    const ok = await run(async () => { put = (await api.addPostByLink({ link: link.trim(), username: username.trim(), on })).put_forward })
    if (!ok) return
    onClose()
    notify(put ? t('Added. @{who} is waiting for your OK on Sales reps & rewards.', { who: username.trim().replace(/^@/, '').toLowerCase() }) : t('Added'), 'success')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="post-link-title">
      <DialogTitle id="post-link-title">{t('Add a post by its link')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Collab reels and posts that tag you come in by themselves. If one is missing (say it only names you in the caption), add it here. Whoever posted it goes on Sales reps & rewards too, waiting for your OK.')}
          </Typography>
          <TextField label={t('Link to the post or reel')} value={link} onChange={e => setLink(e.target.value)} autoFocus
            placeholder={'https://www.instagram.com/reel/…'} inputMode="url" />
          <TextField label={t('Who posted it')} value={username} onChange={e => setUsername(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
          <TextField type="date" label={t('Day it went out')} value={on} onChange={e => setOn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!link.trim() || !username.trim()}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
