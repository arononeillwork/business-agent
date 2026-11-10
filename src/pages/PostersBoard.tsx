// Sales reps & rewards → People who post about us (admins), first on the page: everyone who posted about
// the café on Instagram (collab reels, tags, story mentions, ones added by their link), ranked by the
// followers the café gained in their posts' days over the usual, then views and likes (shared/creators.ts).
// Each person is a card: who they are, whether they're a rep (or waiting for an owner's OK, or not one
// yet), and their posts inside it, each with every figure Instagram gives: the post's own (views, likes,
// comments, shares, saves) and what the café's account did the day it went out and the two after (new
// followers, accounts reached, profile visits, accounts engaged, link taps), against a usual three days.
import { Avatar, Box, Button, Card, CardContent, Link, Stack, Typography } from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import TrophyIcon from '@mui/icons-material/EmojiEventsRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import StarIcon from '@mui/icons-material/AutoAwesomeOutlined'
import { useState } from 'react'
import { Empty, SectionTitle, Tag } from '../components/common'
import { RepAvatar } from '../components/RepBits'
import { t, tn } from '../i18n'
import { addDays, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import type { Creator } from '../../shared/creators'
import type { PostImpact } from '../../shared/postImpact'
import type { AccountFigures } from '../../shared/mentions'
import { formatReach, type RepReward, type SalesRep } from '../../shared/reps'
import { CASHBACK_MIN, cashbackDue, cashbackFor, isCashback, type CashbackRates } from '../../shared/cashback'
import { fonts, tokens } from '../theme'
import { CollabsNotice } from './PostImpact'
import type { collabsBlocked } from '../../shared/mentions'

/** People shown before Show all. */
const SHOWN = 10
/** Each person's posts shown before Show all their posts. */
const POSTS_SHOWN = 3
/** The café's account figures for a post are read once its days are in, for posts of the last 90 days. */
const WINDOW_DAYS = 90

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
  const [value, label, good] = c.extra !== null ? [`+${formatNumber(c.extra)}`, t('followers over the usual'), c.extra > 0]
    : c.gained !== null ? [`+${formatNumber(c.gained)}`, t('new followers in their days'), false] : [null, t('Followers not known'), false]
  return (
    <Box sx={{ textAlign: 'right', maxWidth: { xs: 100, sm: 'none' }, flexShrink: 0 }}>
      {value && <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.25rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        color: good ? tokens.goodFg : undefined }}>{value}</Typography>}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>{label}</Typography>
    </Box>
  )
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

/** One figure: its number, what it is, and what's usual for as many days (when that's known). */
function Figure({ label, value, usual, plus }: { label: string; value: number | null; usual?: number | null; plus?: boolean }) {
  const above = usual !== undefined && usual !== null && value !== null && value > usual
  return (
    <Box role="group" aria-label={label} sx={{ px: 1.25, py: 1, borderRadius: 2, bgcolor: tokens.surfaceAlt, minWidth: 0 }}>
      <Typography component="div" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
        color: above ? tokens.goodFg : undefined }}>
        {value === null ? '–' : `${plus ? '+' : ''}${formatNumber(value)}`}
      </Typography>
      <Typography component="div" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3 }}>{label}</Typography>
      {usual !== undefined && usual !== null && (
        <Typography component="div" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3, fontSize: '0.7rem' }}>{t('usually {n}', { n: formatNumber(usual) })}</Typography>
      )}
    </Box>
  )
}

const GRID = { display: 'grid', gap: 0.75, gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' } as const

/** A post about the café, with every figure Instagram gives. */
function Post({ p, cashback, onReward }: { p: PostImpact; cashback: string | null; onReward: (() => void) | null }) {
  const own: [string, number | null][] = [[t('Views'), p.views], [t('Likes'), p.likes], [t('Comments'), p.comments], [t('Shares'), p.shares], [t('Saves'), p.saves]]
  const known = own.filter(([, v]) => v !== null)
  const a = p.account ?? null
  const usual = (k: keyof AccountFigures) => a?.usual?.[k] ?? null
  const recent = p.at.slice(0, 10) >= addDays(today(), -WINDOW_DAYS)
  return (
    // On a phone the figures take the post's whole width, under its picture; wider, they sit beside it.
    <Box component="article" aria-label={`${what(p)} · ${formatLocal(p.at, 'd MMM yyyy')}`}
      sx={{ display: 'grid', gridTemplateColumns: { xs: '48px minmax(0, 1fr)', sm: '72px minmax(0, 1fr)' }, columnGap: 1.5, rowGap: 1, alignItems: 'start',
        gridTemplateAreas: { xs: '"thumb head" "body body"', sm: '"thumb head" "thumb body"' },
        p: { xs: 1.25, sm: 1.5 }, borderRadius: 3, border: `1px solid ${tokens.line}`, bgcolor: tokens.surface }}>
      <Box component={p.url ? 'a' : 'div'} {...(p.url ? { href: p.url, target: '_blank', rel: 'noreferrer', 'aria-hidden': true, tabIndex: -1 } : {})}
        sx={{ gridArea: 'thumb', position: 'relative', width: { xs: 48, sm: 72 }, height: { xs: 64, sm: 96 }, borderRadius: 2, overflow: 'hidden',
          bgcolor: tokens.roseSoft, border: `1px solid ${tokens.line}`, display: 'block' }}>
        {p.thumbnail && <Box component="img" src={p.thumbnail} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        {p.video && <PlayIcon sx={{ position: 'absolute', right: 2, bottom: 2, fontSize: 18, color: '#fff', filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />}
      </Box>
      <Box sx={{ gridArea: 'head', minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {what(p)} · {formatLocal(p.at, 'd MMM yyyy')}
          {p.url && <> · <Link href={p.url} target="_blank" rel="noreferrer" sx={{ fontWeight: 500 }}>{t('See it')}</Link></>}
        </Typography>
        {p.caption && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption}</Typography>}
      </Box>
      <Box sx={{ gridArea: 'body', minWidth: 0 }}>

        {known.length > 0
          ? <Box sx={{ ...GRID, mb: 1 }}>{known.map(([label, v]) => <Figure key={label} label={label} value={v} />)}</Box>
          : <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              {p.by === 'story' ? t('Instagram doesn’t share a story’s views or likes with the café.') : t('Instagram doesn’t share a tagged post’s views or likes with the café.')}
            </Typography>}

        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600, mb: 0.5 }}>
          {t('Your Instagram the day it went out and the 2 after')}
        </Typography>
        {p.soon
          ? <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Too soon to tell: Instagram counts each day a day or two later.')}</Typography>
          : <Box sx={GRID}>
              <Figure label={t('New followers')} value={p.gained} usual={p.usual} plus />
              {a && <>
                <Figure label={t('Accounts reached')} value={a.reach} usual={usual('reach')} />
                <Figure label={t('Profile visits')} value={a.profile_visits} usual={usual('profile_visits')} />
                <Figure label={t('Accounts engaged')} value={a.engaged} usual={usual('engaged')} />
                <Figure label={t('Link taps')} value={a.link_taps} usual={usual('link_taps')} />
              </>}
            </Box>}
        {!p.soon && !a && recent && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            {t('Reach and profile visits come in once its three days are in.')}
          </Typography>
        )}

        {(cashback || onReward) && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
            {cashback && <Typography variant="body2" sx={{ color: tokens.goodFg, fontWeight: 500 }}>{cashback}</Typography>}
            {onReward && <Button size="small" startIcon={<StarIcon />} onClick={onReward} sx={{ ml: -0.75 }}>{t('Reward')}</Button>}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

/** Someone who posted about the café, with their posts. */
function Person({ c, place, rep, ledger, rates, onAdd, onReward }: {
  c: Creator; place: number; rep: SalesRep | null; ledger: RepReward[]; rates: CashbackRates; onAdd: () => void; onReward: (rep: SalesRep, post: PostImpact) => void
}) {
  const [all, setAll] = useState(false)
  const who = `@${c.username}`
  const lines = new Map(ledger.filter(r => r.mention_id && r.status !== 'rejected').map(r => [r.mention_id!, r]))
  const earned = c.posts.reduce((n, p) => { const l = lines.get(p.id); return n + (l && isCashback(l) ? l.amount : 0) }, 0)
  const followers = rep?.instagram_followers ?? null
  const summary = [
    c.reels ? tn(c.reels, '{n} reel', '{n} reels') : null,
    c.posts.length - c.reels ? tn(c.posts.length - c.reels, '{n} post or story', '{n} posts and stories') : null,
    c.views ? t('{n} views', { n: formatNumber(c.views) }) : null,
    c.likes ? t('{n} likes', { n: formatNumber(c.likes) }) : null,
    earned > 0 ? t('{amount} cashback', { amount: formatMoney(earned) }) : null,
  ].filter(Boolean).join(' · ')
  const shown = all ? c.posts : c.posts.slice(0, POSTS_SHOWN)
  return (
    <Box component="li" aria-label={t('{place}. {name}', { place, name: who })}
      sx={{ p: { xs: 1.25, sm: 2 }, borderRadius: 4, border: `1px solid ${tokens.line}`, bgcolor: place === 1 ? tokens.roseSoft : tokens.surface }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Place place={place} />
        {/* On a phone the place says enough: the name and figures get the room. */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          {rep ? <RepAvatar rep={rep} size={48} />
            : <Avatar sx={{ width: 48, height: 48, bgcolor: tokens.ubeSoft, color: tokens.ubeDeep, fontFamily: fonts.display, fontWeight: 600, fontSize: 18 }}>
                {c.username.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}
              </Avatar>}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noreferrer" underline="hover" color="inherit"
              sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.05rem' }}>{who}</Link>
            {rep ? (rep.approved ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Rep')}</Tag> : <Tag fg={tokens.roseDeep} bg={tokens.surface}>{t('Waiting for your OK')}</Tag>)
              : <Tag fg={tokens.inkSoft} bg={tokens.surfaceAlt}>{t('Not a rep yet')}</Tag>}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
            {[rep && rep.name !== who ? rep.name : null, followers ? t('{n} followers', { n: formatReach(followers) }) : null, summary || null].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Followers c={c} />
      </Stack>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, ml: { sm: 10.5 } }}>
        {!rep && <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={onAdd} aria-label={t('Add {name} as a rep', { name: who })}>{t('Add as a rep')}</Button>}
        {/* Nothing is sent to them by itself: this opens a chat with them on Instagram, for whoever wants to write. */}
        <Button size="small" startIcon={<ChatIcon />} href={`https://ig.me/m/${encodeURIComponent(c.username)}`} target="_blank" rel="noreferrer"
          aria-label={t('Message {name} on Instagram', { name: who })}>{t('Message')}</Button>
      </Stack>
      <Stack component="section" aria-label={t('{name}’s posts', { name: who })} spacing={1} sx={{ mt: 1.5 }}>
        {shown.map(p => {
          const line = lines.get(p.id)
          const cashback = cashbackText(p, line && isCashback(line) ? line : undefined, rates, rep)
          // A reward by hand for a post nothing else rewards (no cashback coming, nothing logged for it).
          const reward = rep?.approved && rep.active && !line && !cashback ? () => onReward(rep, p) : null
          return <Post key={p.id} p={p} cashback={cashback} onReward={reward} />
        })}
        {c.posts.length > POSTS_SHOWN && (
          <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setAll(x => !x)}>
            {all ? t('Show fewer') : t('Show all {n} posts', { n: c.posts.length })}
          </Button>
        )}
      </Stack>
    </Box>
  )
}

/** Everyone who posted about the café, best first, each with their posts. */
export function PostersBoard({ creators, reps, ledger, rates, collabs = null, onAdd, onReward }: {
  creators: Creator[] | null; reps: SalesRep[]; ledger: RepReward[]; rates: CashbackRates
  /** Why collab reels don't come in (null: they do). */
  collabs?: ReturnType<typeof collabsBlocked>
  onAdd: (username: string) => void; onReward: (rep: SalesRep, post: PostImpact) => void
}) {
  const [all, setAll] = useState(false)
  const title = t('People who post about us')
  const repOf = (username: string) => reps.find(r => r.instagram === username) ?? null
  const list = creators ?? []
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        <CollabsNotice blocked={collabs} />
        {!list.length
          ? <Empty>{creators ? t('Nobody has posted about the café yet. Collab reels and tags come in by themselves; add one Instagram missed on Analytics → Instagram.') : t('Loading…')}</Empty>
          : <>
              {list[0].extra !== null && list[0].extra > 0 && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <TrophyIcon sx={{ color: tokens.roseDeep }} />
                  <Typography variant="body2">
                    {t('{name} brought the most: {n} more followers than usual.', { name: `@${list[0].username}`, n: formatNumber(list[0].extra) })}
                  </Typography>
                </Stack>
              )}
              <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {(all ? list : list.slice(0, SHOWN)).map((c, i) => (
                  <Person key={c.username} c={c} place={i + 1} rep={repOf(c.username)} ledger={ledger} rates={rates} onAdd={() => onAdd(c.username)} onReward={onReward} />
                ))}
              </Stack>
              {list.length > SHOWN && (
                <Button size="small" sx={{ mt: 1 }} onClick={() => setAll(x => !x)}>{all ? t('Show fewer') : t('Show all {n}', { n: list.length })}</Button>
              )}
            </>}
      </CardContent>
    </Card>
  )
}
