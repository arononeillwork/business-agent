// Sales reps & rewards → Posts about us (admins): a leaderboard of everyone who posted about the café on
// Instagram (collab reels, tags, story mentions, ones added by their link), ranked by the followers the
// café gained in their posts' days over the usual, then views and likes (shared/creators.ts). Each shows
// whether they're a rep, waiting for an owner's OK, or not yet one (Add as a rep), and opens to their posts.
import { Avatar, Box, Button, Card, CardContent, Collapse, Link, Stack, Typography } from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import ExpandIcon from '@mui/icons-material/ExpandMoreRounded'
import TrophyIcon from '@mui/icons-material/EmojiEventsRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import { useState } from 'react'
import { Empty, SectionTitle, Tag } from '../components/common'
import { RepAvatar } from '../components/RepBits'
import { t, tn } from '../i18n'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import type { Creator } from '../../shared/creators'
import type { PostImpact } from '../../shared/postImpact'
import type { RepReward, SalesRep } from '../../shared/reps'
import { CASHBACK_MIN, cashbackDue, cashbackFor, isCashback, type CashbackRates } from '../../shared/cashback'
import { fonts, tokens } from '../theme'

const SHOWN = 10

/** Their place: the top three in the café's colours. */
function Place({ place }: { place: number }) {
  const bg = place === 1 ? tokens.rose : place === 2 ? tokens.ube : place === 3 ? tokens.matcha : tokens.surfaceAlt
  return (
    <Box aria-hidden sx={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: bg,
      color: place <= 3 ? '#2B2522' : tokens.inkSoft, fontFamily: fonts.display, fontWeight: 600, fontSize: '0.85rem' }}>{place}</Box>
  )
}

const what = (p: PostImpact) => (p.by === 'collab' ? (p.video ? t('Collab reel') : t('Collab post')) : p.by === 'story' ? t('Story mention') : t('Tagged you'))

/** The followers in their days: more than usual when that's known, else what came in. */
function Followers({ c }: { c: Creator }) {
  if (c.extra !== null) {
    return (
      <Box sx={{ textAlign: 'right', maxWidth: { xs: 96, sm: 'none' }, flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, color: c.extra > 0 ? tokens.goodFg : undefined }}>
          {`+${formatNumber(c.extra)}`}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('followers over the usual')}</Typography>
      </Box>
    )
  }
  if (c.gained !== null) {
    return (
      <Box sx={{ textAlign: 'right', maxWidth: { xs: 96, sm: 'none' }, flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{`+${formatNumber(c.gained)}`}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('new followers in their days')}</Typography>
      </Box>
    )
  }
  return <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right', maxWidth: { xs: 80, sm: 'none' } }}>{t('Followers not known')}</Typography>
}

/** A post's cashback: logged (waiting or counted), or what it will earn once its days are in. */
function cashbackText(p: PostImpact, line: RepReward | undefined, rates: CashbackRates, rep: SalesRep | null) {
  if (line) {
    return line.status === 'pending' ? t('{amount} cashback, waiting for your OK', { amount: formatMoney(line.amount) })
      : line.status === 'approved' ? t('{amount} cashback', { amount: formatMoney(line.amount) }) : null
  }
  if (!rates.cashback_on || !rep?.active) return null
  const { amount } = cashbackFor(p, rates)
  if (amount < CASHBACK_MIN) return null
  if (!rep.approved) return t('{amount} cashback once they’re a rep', { amount: formatMoney(amount) })
  return cashbackDue(p, today()) ? t('{amount} cashback tonight', { amount: formatMoney(amount) }) : t('About {amount} cashback once its days are in', { amount: formatMoney(amount) })
}

function Post({ p, cashback }: { p: PostImpact; cashback: string | null }) {
  const figures = [
    p.views !== null ? t('{n} views', { n: formatNumber(p.views) }) : null,
    p.likes !== null ? t('{n} likes', { n: formatNumber(p.likes) }) : null,
    p.comments !== null ? t('{n} comments', { n: formatNumber(p.comments) }) : null,
    p.soon ? t('Too soon to tell') : p.gained !== null
      ? p.usual !== null ? t('+{n} followers in {days} days, usually {usual}', { n: formatNumber(p.gained), days: p.days, usual: formatNumber(p.usual) })
        : t('+{n} followers in {days} days', { n: formatNumber(p.gained), days: p.days })
      : null,
  ].filter(Boolean)
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', py: 0.75 }}>
      <Box sx={{ position: 'relative', width: 36, height: 46, flexShrink: 0, borderRadius: '6px', overflow: 'hidden', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
        {p.thumbnail && <Box component="img" src={p.thumbnail} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        {p.video && <PlayIcon sx={{ position: 'absolute', right: 1, bottom: 1, fontSize: 14, color: '#fff', filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {what(p)} · {formatLocal(p.at, 'd MMM yyyy')}
          {p.url && <> · <Link href={p.url} target="_blank" rel="noreferrer">{t('See it')}</Link></>}
        </Typography>
        {p.caption && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption}</Typography>}
        {figures.length > 0 && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{figures.join(' · ')}</Typography>}
        {cashback && <Typography variant="caption" sx={{ display: 'block', color: tokens.goodFg, fontWeight: 500 }}>{cashback}</Typography>}
      </Box>
    </Stack>
  )
}

function Row({ c, place, rep, ledger, rates, onAdd }: {
  c: Creator; place: number; rep: SalesRep | null; ledger: RepReward[]; rates: CashbackRates; onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const who = `@${c.username}`
  const lines = new Map(ledger.filter(r => isCashback(r) && r.mention_id && r.status !== 'rejected').map(r => [r.mention_id!, r]))
  const earned = c.posts.reduce((n, p) => n + (lines.get(p.id)?.amount ?? 0), 0)
  const summary = [
    c.reels ? tn(c.reels, '{n} reel', '{n} reels') : null,
    c.posts.length - c.reels ? tn(c.posts.length - c.reels, '{n} post or story', '{n} posts and stories') : null,
    c.views ? t('{n} views', { n: formatNumber(c.views) }) : null,
    c.likes ? t('{n} likes', { n: formatNumber(c.likes) }) : null,
    earned > 0 ? t('{amount} cashback', { amount: formatMoney(earned) }) : null,
  ].filter(Boolean).join(' · ')
  return (
    <Box component="li" aria-label={t('{place}. {name}', { place, name: who })} sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Place place={place} />
        {/* On a phone the place says enough: the name and figures get the room. */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          {rep ? <RepAvatar rep={rep} size={36} />
            : <Avatar sx={{ width: 36, height: 36, bgcolor: tokens.roseSoft, color: tokens.roseDeep, fontFamily: fonts.display, fontWeight: 600, fontSize: 14 }}>
                {c.username.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}
              </Avatar>}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noreferrer" underline="hover" color="inherit" variant="body2" sx={{ fontWeight: 600 }}>{who}</Link>
            {rep && rep.name !== who && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{rep.name}</Typography>}
            {rep ? (rep.approved ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Rep')}</Tag> : <Tag fg={tokens.roseDeep} bg={tokens.roseSoft}>{t('Waiting for your OK')}</Tag>) : null}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{summary}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ ml: -0.75, flexWrap: 'wrap' }}>
            <Button size="small" endIcon={<ExpandIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
              aria-expanded={open} onClick={() => setOpen(x => !x)} sx={{ whiteSpace: 'nowrap' }}>
              {open ? t('Hide their posts') : t('Their posts')}
            </Button>
            {!rep && <Button size="small" startIcon={<PersonAddIcon />} onClick={onAdd} aria-label={t('Add {name} as a rep', { name: who })} sx={{ whiteSpace: 'nowrap' }}>{t('Add as a rep')}</Button>}
            {/* Nothing is sent to them by itself: this opens a chat with them on Instagram, for whoever wants to write. */}
            <Button size="small" startIcon={<ChatIcon />} href={`https://ig.me/m/${encodeURIComponent(c.username)}`} target="_blank" rel="noreferrer"
              aria-label={t('Message {name} on Instagram', { name: who })} sx={{ whiteSpace: 'nowrap' }}>{t('Message')}</Button>
          </Stack>
        </Box>
        <Followers c={c} />
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: { xs: 0, sm: 9 }, pt: 0.5 }}>{c.posts.map(p => <Post key={p.id} p={p} cashback={cashbackText(p, lines.get(p.id), rates, rep)} />)}</Box>
      </Collapse>
    </Box>
  )
}

/** Everyone who posted about the café, best first. */
export function PostersBoard({ creators, reps, ledger, rates, onAdd }: {
  creators: Creator[] | null; reps: SalesRep[]; ledger: RepReward[]; rates: CashbackRates; onAdd: (username: string) => void
}) {
  const [all, setAll] = useState(false)
  const title = t('Posts about us: who brings the most')
  const repOf = (username: string) => reps.find(r => r.instagram === username) ?? null
  const list = creators ?? []
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Everyone who posted about the café on Instagram: collab reels, tags and story mentions. Ranked by the followers you gained the day each post went out and the two after, over a usual three days, then by views.')}
        </Typography>
        {!list.length
          ? <Empty>{creators ? t('Nobody has posted about the café yet. Collab reels and tags come in by themselves; add one Instagram missed on Analytics → Instagram.') : t('Loading…')}</Empty>
          : <>
              {list[0].extra !== null && list[0].extra > 0 && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                  <TrophyIcon sx={{ color: tokens.roseDeep }} />
                  <Typography variant="body2">
                    {t('{name} brought the most: {n} more followers than usual.', { name: `@${list[0].username}`, n: formatNumber(list[0].extra) })}
                  </Typography>
                </Stack>
              )}
              <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {(all ? list : list.slice(0, SHOWN)).map((c, i) => (
                  <Row key={c.username} c={c} place={i + 1} rep={repOf(c.username)} ledger={ledger} rates={rates} onAdd={() => onAdd(c.username)} />
                ))}
              </Box>
              {list.length > SHOWN && (
                <Button size="small" sx={{ mt: 1 }} onClick={() => setAll(x => !x)}>{all ? t('Show fewer') : t('Show all {n}', { n: list.length })}</Button>
              )}
            </>}
      </CardContent>
    </Card>
  )
}
