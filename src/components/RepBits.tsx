import { Avatar, Box, LinearProgress, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { REACH_TIERS, formatReach, nextTier, reachTier, type RepKind, type RewardRule, type SalesRep } from '../../shared/reps'
import { formatMoney, formatNumber } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t } from '../i18n'

// What Sales reps & rewards and each rep's own page share: their photo, the code on their cards,
// their reach's step, and the ladder that shows how a reward grows with reach.

/** Each kind of rep's colours. */
export const KIND_TONE: Record<RepKind, { fg: string; bg: string }> = {
  customer: { fg: tokens.goodFg, bg: tokens.goodBg }, ambassador: { fg: tokens.infoFg, bg: tokens.infoBg }, team: { fg: tokens.roseDeep, bg: tokens.roseSoft },
}
/** Each step of reach's colours: from the plain one up to the brand's rose. */
export const TIER_TONE = [
  { fg: tokens.inkSoft, bg: tokens.surfaceAlt, bar: tokens.lineStrong },
  { fg: tokens.matchaDeep, bg: tokens.matchaSoft, bar: tokens.matcha },
  { fg: tokens.ubeDeep, bg: tokens.ubeSoft, bar: tokens.ube },
  { fg: tokens.roseDeep, bg: tokens.roseSoft, bar: tokens.rose },
]
const tierIndex = (reach: number | null | undefined) => REACH_TIERS.indexOf(reachTier(reach))

/** Their profile photo (from Instagram), or their initials when there's none or its link has run out. */
export function RepAvatar({ rep, size = 40 }: { rep: Pick<SalesRep, 'name' | 'kind' | 'picture_url'>; size?: number }) {
  const [broken, setBroken] = useState(false)
  const initials = rep.name.replace(/[“”"«»]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const tone = KIND_TONE[rep.kind]
  return (
    <Avatar src={rep.picture_url && !broken ? rep.picture_url : undefined} alt="" slotProps={{ img: { onError: () => setBroken(true), referrerPolicy: 'no-referrer' } }}
      sx={{ width: size, height: size, bgcolor: tone.bg, color: tone.fg, fontFamily: fonts.display, fontWeight: 600, fontSize: size * 0.38 }}>
      {initials}
    </Avatar>
  )
}

/** The code as it's printed on the cards. */
export function RepCode({ code, big = false }: { code: string; big?: boolean }) {
  return (
    <Box component="span" sx={{ display: 'inline-block', px: big ? 1.75 : 1, py: big ? 0.75 : 0.25, borderRadius: 1.5, border: `1px dashed ${tokens.lineStrong}`,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: big ? '1.5rem' : '0.8rem', letterSpacing: '0.08em', fontWeight: 600 }}>{code}</Box>
  )
}

/** Their step of reach, with its multiplier: "Big voice ×3". */
export function ReachBadge({ reach }: { reach: number }) {
  const tier = reachTier(reach)
  const tone = TIER_TONE[tierIndex(reach)]
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 999, bgcolor: tone.bg, color: tone.fg,
      fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {t(tier.label)}{tier.multiplier > 1 && <Box component="span" sx={{ fontFamily: fonts.display }}>{`×${tier.multiplier}`}</Box>}
    </Box>
  )
}

/** What a reward on the list is worth, in words: "€1.00 credit", "€3.00", "10% of the sale". */
export function worth(r: Pick<RewardRule, 'basis' | 'amount' | 'who'>) {
  if (r.basis === 'percent') return t('{n}% of the sale', { n: r.amount })
  return r.who === 'customers' ? t('{amount} credit', { amount: formatMoney(r.amount) }) : formatMoney(r.amount)
}

/**
 * The four steps of reach: what each takes and how much more a reward that grows with reach is
 * worth there. With `reach`, their own step is lit and how far the next one is shows; with
 * `example`, each step shows what that reward comes to.
 */
export function ReachLadder({ reach, example }: { reach?: number; example?: Pick<RewardRule, 'amount'> }) {
  const here = reach === undefined ? -1 : tierIndex(reach)
  const next = reach === undefined ? null : nextTier(reach)
  return (
    <Box>
      <Box component="ol" aria-label={t('The bigger their reach, the bigger the reward')}
        sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
        {REACH_TIERS.map((tier, i) => {
          const tone = TIER_TONE[i]
          const lit = i === here
          return (
            <Box component="li" key={tier.id} aria-current={lit ? 'step' : undefined}
              aria-label={`${t(tier.label)}: ${tier.from ? t('from {n} people', { n: formatReach(tier.from) }) : t('anyone')}, ×${tier.multiplier}`}
              sx={{ p: 1.5, borderRadius: 3, bgcolor: tone.bg, border: 2, borderColor: lit ? tone.bar : 'transparent', position: 'relative',
                minHeight: 92, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: tone.fg }}>{t(tier.label)}</Typography>
                <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '1.35rem', lineHeight: 1, color: tone.fg }}>{`×${tier.multiplier}`}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {tier.from ? t('From {n} people', { n: formatReach(tier.from) }) : t('Anyone who talks about us')}
              </Typography>
              {example && <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatMoney(example.amount * tier.multiplier)}</Typography>}
              {lit && <Typography variant="caption" sx={{ fontWeight: 600, color: tone.fg }}>{t('You’re here')}</Typography>}
            </Box>
          )
        })}
      </Box>
      {next && reach !== undefined && (
        <Box sx={{ mt: 1.5 }}>
          <LinearProgress variant="determinate" value={Math.min(100, (reach - REACH_TIERS[here].from) / (next.tier.from - REACH_TIERS[here].from) * 100)}
            aria-label={t('On the way to {tier}', { tier: t(next.tier.label) })}
            sx={{ height: 8, borderRadius: 4, bgcolor: tokens.surfaceAlt, '& .MuiLinearProgress-bar': { bgcolor: TIER_TONE[here + 1].bar, borderRadius: 4 } }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            {t('{n} more people to {tier}: rewards that grow with reach go up to ×{x}', { n: formatNumber(next.more), tier: t(next.tier.label), x: next.tier.multiplier })}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
