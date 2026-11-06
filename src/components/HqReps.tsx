// Business Agent HQ's side of Sales reps & rewards (the hq_reps migration, docs/REPS_PLAN.md): the kinds
// of business each rep covers, and the businesses that signed up with a rep's code, by kind and one by
// one, with how each is getting on and what it has earned its rep. Only HQ has any.
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { planName } from '../app/plan'
import { SectionTitle, Tag } from './common'
import { BUSINESS_KINDS, PAID_MONTHS, businessKindLabel, byCategory, introStage, stageInfo, type BusinessKind } from '../../shared/hqReps'
import type { RepReward, SalesRep } from '../../shared/reps'
import { plan as planById } from '../../shared/plans'
import { formatLocal, formatMoney } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t, tn } from '../i18n'

const TONE = {
  good: { fg: tokens.goodFg, bg: tokens.goodBg }, info: { fg: tokens.infoFg, bg: tokens.infoBg }, warn: { fg: tokens.warnFg, bg: tokens.warnBg },
  bad: { fg: tokens.badFg, bg: tokens.badBg }, neutral: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}

/** The kinds of business a rep covers, picked on their card (HQ's admins). */
export function RepCategoriesField({ value, onChange }: { value: BusinessKind[]; onChange: (v: BusinessKind[]) => void }) {
  return (
    <Box role="group" aria-labelledby="rep-categories">
      <Typography id="rep-categories" variant="subtitle2">{t('The businesses they cover')}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
        {t('Their code works for any business; these are the ones they lead.')}
      </Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {BUSINESS_KINDS.map(k => {
          const on = value.includes(k.id)
          return (
            <Chip key={k.id} label={t(k.label)} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} aria-pressed={on}
              onClick={() => onChange(on ? value.filter(x => x !== k.id) : [...value, k.id])} />
          )
        })}
      </Stack>
    </Box>
  )
}

/** The kinds of business a rep leads, as tags on their card. */
export function CategoryTags({ categories }: { categories?: BusinessKind[] }) {
  if (!categories?.length) return null
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {categories.map(c => <Tag key={c} fg={tokens.ubeDeep} bg={tokens.ubeSoft}>{t(businessKindLabel(c))}</Tag>)}
    </Stack>
  )
}

/** HQ's admins: the businesses its reps brought, by kind and one by one. */
export function HqBusinessesCard({ reps, ledger }: { reps: SalesRep[]; ledger: RepReward[] }) {
  const { api } = useApp()
  const intros = useAsync('rep-introductions', () => api.repIntroductions(), [])
  const opens = useAsync('rep-code-opens', () => api.repCodeOpens(), [])
  const list = intros.data ?? []
  const counts = byCategory(list, reps.map(r => ({ categories: r.categories ?? [], active: r.active })))
  const visits = Object.values(opens.data ?? {}).reduce((a, n) => a + n, 0)
  const repName = (id: string | null) => reps.find(r => r.id === id)?.name ?? t('No rep now')
  const earned = (id: string) => ledger.filter(l => l.introduction_id === id && l.status !== 'rejected' && !l.bonus_for).reduce((a, l) => a + l.amount, 0)
  const months = (id: string) => ledger.filter(l => l.introduction_id === id && l.kind === 'earn' && l.status !== 'rejected').reduce((a, l) => a + (l.months ?? 0), 0)

  return (
    <Card component="section" aria-label={t('Businesses from your reps')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Businesses from your reps')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Every business that signed up with a rep’s code. Each payment earns its rep commission for its first {n} paid months, counting 30 days after it’s paid.', { n: PAID_MONTHS })}
          {visits > 0 ? ` ${t('Reps’ links opened {n} times.', { n: visits })}` : ''}
        </Typography>

        {counts.length > 0 && (
          <Box component="dl" sx={{ m: 0, mb: 2.5, display: 'grid', gap: 1.25, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' } }}>
            {counts.map(c => (
              <Box key={c.kind} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>{t(businessKindLabel(c.kind))}</Typography>
                <Typography component="dd" variant="caption" sx={{ m: 0, color: 'text.secondary', display: 'block' }}>
                  {t('{signed} signed up · {set} set up · {paying} paying', { signed: c.signedUp, set: c.setUp, paying: c.paying })}
                </Typography>
                <Typography component="dd" variant="caption" sx={{ m: 0, color: c.reps ? 'text.secondary' : tokens.warnFg, display: 'block' }}>
                  {c.reps ? tn(c.reps, '{n} rep leads it', '{n} reps lead it') : t('No rep leads it yet')}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {list.length === 0
          ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Businesses that sign up with a rep’s code show here.')}</Typography>
          : <Stack component="ul" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {list.map(i => {
                const stage = stageInfo(introStage(i))
                const m = months(i.id)
                return (
                  <Stack key={i.id} component="li" aria-label={i.name} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1.5 }}
                    sx={{ alignItems: { sm: 'center' }, py: 1.25, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{i.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {[repName(i.rep_id), t(businessKindLabel(i.kind)), t('since {date}', { date: formatLocal(i.created_at, 'd MMM yyyy') }),
                          i.plan !== 'free' ? planName(planById(i.plan)) : null,
                          m > 0 ? t('{n} of {total} months', { n: m, total: PAID_MONTHS }) : null].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Tag {...TONE[stage.tone]}>{t(stage.label)}</Tag>
                      <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, minWidth: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(earned(i.id))}
                      </Typography>
                    </Stack>
                  </Stack>
                )
              })}
            </Stack>}
      </CardContent>
    </Card>
  )
}
