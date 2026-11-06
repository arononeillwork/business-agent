// The Compare page (/compare): Business Agent next to GoHighLevel and Square, for a café in Spain. What
// each route costs a month and over three years for a team of the size picked, how long each takes to
// learn, every job feature by feature, and where each falls short, with the sources and the method at
// the foot. The figures all come from shared/compare.ts; this page only lays them out.
import { Box, Container, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import AddOnIcon from '@mui/icons-material/AddCircleOutlineRounded'
import PartIcon from '@mui/icons-material/ContrastRounded'
import CloseIcon from '@mui/icons-material/CloseRounded'
import { useEffect, useState, type ReactNode } from 'react'
import {
  CHECKED_ON, CURVE_WEEKS, FEATURE_GROUPS, FEATURE_ROWS, HIGHLEVEL_USD, PRODUCTS, SOURCES, SQUARE, TEAM_DEFAULT, TEAM_SIZES, USD_PER_EUR,
  businessAgentPlan, coverage, familiarity, missing, monthlyCost, routeItems, type Has, type Product, type ProductId,
} from '../../shared/compare'
import { locale, msg, t, tn, tr, useLanguage } from '../i18n'
import { ClosingCta, Faq } from './LoginPage'
import { money } from './marketing/plans'
import { BA, Eyebrow, MarketingFrame, SectionIntro, display, figures, glow } from './marketing/site'
import { FiguresTable, Legend, LineChart, PRODUCT_COLOR, type Series } from './marketing/compareCharts'

const YEARS = 3
const MONTHS = YEARS * 12
const OURS: ProductId = 'business_agent'
const RIVALS = PRODUCTS.filter(p => p.id !== OURS)

const HAS: Record<Has, { label: string; icon: ReactNode }> = {
  yes: { label: msg('Built in'), icon: <CheckIcon sx={{ fontSize: 20, color: BA.roseDeep }} /> },
  extra: { label: msg('Paid add-on'), icon: <AddOnIcon sx={{ fontSize: 19, color: BA.soft }} /> },
  partial: { label: msg('In part'), icon: <PartIcon sx={{ fontSize: 18, color: BA.soft }} /> },
  no: { label: msg('Not available'), icon: <CloseIcon sx={{ fontSize: 18, color: BA.limewash }} /> },
}

const FAQ = [
  { q: msg('Can I keep my Square till?'), a: msg('Yes. Business Agent isn’t a till: it works with Square, SumUp or Stripe, reads the takings and shows them next to what the rota costs. Square’s free plan is all you need for payments.') },
  { q: msg('Aren’t they cheaper paid by the year?'), a: msg('So are we. Business Agent {plan} is {yearly} a year ({monthly} a month) and HighLevel Starter ${ghl} a year. The gap stays, and GoHighLevel still needs a rota app, its add-ons and its usage charges on top.') },
  { q: msg('What if I only need a rota?'), a: msg('Then start on our Free plan: the rota, clock-ins and the registro de jornada for up to 3 people, free for ever. To be fair, Square Shifts is free up to 5 people too; it’s everything else a café needs that adds up.') },
  { q: msg('How did you work out the learning curve?'), a: msg('It’s our estimate, not a measured study: how many separate apps and logins each route needs, who each product is made for, and how much has to be set up before the first rota goes out. Try Business Agent free and judge for yourself.') },
  { q: msg('How old are these prices?'), a: msg('We read every price from each company’s own website on {date}. Prices change, so check theirs before you decide; the links are under “How we worked it out”.') },
]

/** One product's name in the site's serif, with its chart colour beside it. */
function ProductName({ p, size = '1.5rem' }: { p: Product; size?: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: PRODUCT_COLOR[p.id], flexShrink: 0 }} />
      <Typography component="h3" sx={{ fontFamily: display, fontWeight: 500, fontSize: size, lineHeight: 1.1 }}>{p.name}</Typography>
    </Stack>
  )
}

/** A white card with a title (and a line under it) around a chart. */
function ChartCard({ title, subtitle, children, label }: { title: string; subtitle: string; children: ReactNode; label: string }) {
  return (
    <Box component="figure" aria-label={label} sx={{ m: 0, p: { xs: 2.25, md: 3.5 }, borderRadius: '24px', bgcolor: '#fff', border: `1px solid ${BA.line}`, boxShadow: '0 40px 80px -60px rgba(43,37,34,0.35)' }}>
      <Typography component="figcaption" sx={{ mb: 2 }}>
        <Box component="span" sx={{ display: 'block', fontWeight: 600, fontSize: '1.12rem' }}>{title}</Box>
        <Box component="span" sx={{ display: 'block', color: BA.soft, fontSize: '0.95rem', mt: 0.25 }}>{subtitle}</Box>
      </Typography>
      {children}
    </Box>
  )
}

/** A big figure with what it means under it. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', p: { xs: 2.25, md: 2.75 }, borderRadius: '20px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
      <Typography component="dt" sx={{ order: 2, color: BA.soft, fontSize: '0.92rem', lineHeight: 1.45, mt: 0.5 }}>{label}</Typography>
      <Typography component="dd" sx={{ order: 1, m: 0, ...figures, fontSize: { xs: '1.9rem', md: '2.3rem' }, lineHeight: 1.1, color: BA.ink }}>{value}</Typography>
    </Box>
  )
}

/** What one route costs a month, line by line, and what it still doesn't do. */
function Receipt({ p, people }: { p: Product; people: number }) {
  const items = routeItems(p.id, people)
  const total = monthlyCost(p.id, people)
  const ours = p.id === OURS
  const more = total - monthlyCost(OURS, people)
  const gaps = missing(p.id)
  return (
    <Box component="article" aria-label={p.name} sx={{ display: 'flex', flexDirection: 'column', p: { xs: 2.5, md: 3 }, borderRadius: '24px', bgcolor: ours ? '#fff' : BA.bg,
      border: ours ? `2px solid ${BA.roseDeep}` : `1px solid ${BA.line}`, boxShadow: ours ? '0 40px 80px -50px rgba(168,90,104,0.45)' : 'none' }}>
      <ProductName p={p} />
      <Typography sx={{ color: BA.soft, fontSize: '0.92rem', mt: 0.75 }}>{t('Made for: {who}', { who: t(p.madeFor) })}</Typography>
      <Box component="ul" aria-label={t('What you pay for')} sx={{ listStyle: 'none', m: 0, p: 0, mt: 2.25, borderTop: `1px solid ${BA.line}` }}>
        {items.map((i, n) => (
          <Box component="li" key={n} sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between', py: 1.25, borderBottom: `1px dashed ${BA.line}` }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.96rem', lineHeight: 1.35 }}>{t(i.label, i.vars)}</Typography>
              <Typography sx={{ color: BA.soft, fontSize: '0.84rem', lineHeight: 1.4, mt: 0.25 }}>{t(i.covers)}</Typography>
              <Typography sx={{ color: BA.faint, fontSize: '0.8rem', lineHeight: 1.4, mt: 0.25 }}>{t(i.basis, i.vars)}</Typography>
            </Box>
            <Typography sx={{ ...figures, fontWeight: 600, fontSize: '0.98rem', whiteSpace: 'nowrap' }}>{money(i.monthly)}</Typography>
          </Box>
        ))}
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mt: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>{t('A month')}</Typography>
        <Typography sx={{ ...figures, fontSize: '2rem', color: ours ? BA.roseDeep : BA.ink }} aria-label={t('{amount} a month', { amount: money(total) })}>{money(total)}</Typography>
      </Stack>
      <Typography sx={{ color: BA.soft, fontSize: '0.92rem', textAlign: 'right' }}>{t('{amount} over {n} years', { amount: money(total * MONTHS), n: YEARS })}</Typography>
      {p.usageCharges && <Typography sx={{ color: BA.soft, fontSize: '0.88rem', mt: 1, textAlign: 'right' }}>{t(p.usageCharges)}</Typography>}
      {!ours && (
        <Box sx={{ mt: 1.75, alignSelf: 'flex-start', px: 1.25, py: 0.5, borderRadius: '999px', bgcolor: BA.roseSoft, color: BA.accentDeep, fontSize: '0.86rem', fontWeight: 600 }}>
          {t('{amount} a month more than Business Agent', { amount: money(more) })}
        </Box>
      )}
      <Box sx={{ pt: 2.5 }}>
        {gaps.length ? (
          <>
            <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{tn(gaps.length, 'Still missing: {n} job no {name} product does', 'Still missing: {n} jobs no {name} product does', { name: p.name })}</Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25, color: BA.soft, fontSize: '0.88rem', '& li': { mb: 0.25, lineHeight: 1.45 } }}>
              {gaps.map(g => <li key={g}>{t(g)}</li>)}
            </Box>
          </>
        ) : (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <CheckIcon sx={{ fontSize: 18, color: BA.roseDeep }} />
            <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{t('Nothing else to add')}</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  )
}

/** How many jobs each route does: a bar in its colour, darker for built in, lighter for add-ons and in part. */
function Coverage() {
  const total = FEATURE_ROWS.length
  const shade: Record<Has, number> = { yes: 1, extra: 0.55, partial: 0.28, no: 0 }
  return (
    <Stack component="ul" aria-label={t('Jobs each one does')} spacing={2.25} sx={{ listStyle: 'none', m: 0, p: 0, mb: { xs: 4, md: 5 } }}>
      {PRODUCTS.map(p => {
        const c = coverage(p.id)
        const parts = (['yes', 'extra', 'partial'] as Has[]).filter(h => c[h])
        return (
          <Box component="li" key={p.id} aria-label={t('{name}: {n} of {total} built in', { name: p.name, n: c.yes, total })}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: p.id === OURS ? 600 : 500 }}>{p.name}</Typography>
              <Typography sx={{ color: BA.soft, fontSize: '0.92rem' }}>
                {[t('{n} of {total} built in', { n: c.yes, total }), c.extra && tn(c.extra, '{n} paid add-on', '{n} paid add-ons'), c.partial && tn(c.partial, '{n} in part', '{n} in part'),
                  c.no && tn(c.no, '{n} not available', '{n} not available')].filter(Boolean).join(' · ')}
              </Typography>
            </Stack>
            <Box sx={{ display: 'flex', gap: '2px', mt: 0.75, height: 12, borderRadius: '6px', bgcolor: BA.lineSoft, overflow: 'hidden' }}>
              {parts.map(h => <Box key={h} sx={{ width: `${(c[h] / total) * 100}%`, bgcolor: PRODUCT_COLOR[p.id], opacity: shade[h] }} />)}
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

export function ComparePage() {
  const lang = useLanguage()
  const [people, setPeople] = useState(TEAM_DEFAULT)
  useEffect(() => {
    const before = document.title
    document.title = t('Compare · Business Agent')
    return () => { document.title = before }
  }, [lang])
  const date = new Date(`${CHECKED_ON}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  const ours = PRODUCTS.find(p => p.id === OURS)!
  const square = PRODUCTS.find(p => p.id === 'square')!
  const ghl = PRODUCTS.find(p => p.id === 'gohighlevel')!
  const cost = (id: ProductId) => monthlyCost(id, people)
  const cheaperRival = Math.min(...RIVALS.map(p => cost(p.id)))
  const total = FEATURE_ROWS.length
  const covered = (id: ProductId) => coverage(id).yes
  const plan = businessAgentPlan(people)

  const spend: Series[] = PRODUCTS.map(p => ({ id: p.id, name: p.name, values: Array.from({ length: MONTHS + 1 }, (_, m) => Math.round(cost(p.id) * m)) }))
  const curve: Series[] = PRODUCTS.map(p => ({ id: p.id, name: p.name, values: Array.from({ length: CURVE_WEEKS + 1 }, (_, w) => familiarity(p.id, w)) }))
  const whole = (n: number) => money(Math.round(n))
  const pct = (n: number) => `${n}%`

  return (
    <MarketingFrame>
      <Box component="main">
        {/* The headline, the team size and what it comes to */}
        <Box sx={{ backgroundImage: glow('50%', '-200px') }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 10 } }}>
            <Box sx={{ textAlign: 'center', maxWidth: 800, mx: 'auto' }}>
              <Eyebrow>{t('Business Agent vs GoHighLevel vs Square')}</Eyebrow>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.9rem', md: '4.5rem' }, lineHeight: 0.98, letterSpacing: '-0.02em', mt: 1.75 }}>
                {tr('One app for the café. {em}', { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('Not three bills.')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                {t('What each costs a café in Spain, how much of the work each one does, and how long each takes to learn. Their list prices, from their own websites on {date}.', { date })}
              </Typography>
            </Box>
            <Stack sx={{ alignItems: 'center', mt: { xs: 4, md: 5 } }} spacing={1.25}>
              <Typography id="team-size" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{t('People on your team')}</Typography>
              <ToggleButtonGroup exclusive value={people} onChange={(_, v) => v && setPeople(v)} aria-labelledby="team-size"
                sx={{ bgcolor: BA.tint, p: 0.5, borderRadius: '999px', '& .MuiToggleButton-root': {
                  border: 0, borderRadius: '999px !important', px: { xs: 1.75, sm: 2.5 }, py: 0.75, textTransform: 'none', fontWeight: 600, color: BA.soft, fontVariantNumeric: 'tabular-nums',
                  '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(43,37,34,0.14)', '&:hover': { bgcolor: '#fff' } } } }}>
                {TEAM_SIZES.map(n => <ToggleButton key={n} value={n}>{n}</ToggleButton>)}
              </ToggleButtonGroup>
            </Stack>
            <Box component="dl" aria-label={t('At a glance')} sx={{ m: 0, mt: { xs: 4, md: 5 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
              <Stat value={money(Math.round((cheaperRival - cost(OURS)) * MONTHS))} label={t('saved over {n} years, against the cheaper of the other two', { n: YEARS })} />
              <Stat value={t('{n} of {total}', { n: covered(OURS), total })} label={t('jobs built in, against {square} for Square and {ghl} for GoHighLevel', { square: covered('square'), ghl: covered('gohighlevel') })} />
              <Stat value={tn(ours.apps, '{n} app', '{n} apps')} label={t('to learn and log in to, instead of {n}', { n: Math.min(...RIVALS.map(p => p.apps)) })} />
              <Stat value={tn(ours.weeksTo80, '{n} week', '{n} weeks')} label={t('to feel at home, against {a} to {b} weeks (our estimate)', { a: square.weeksTo80, b: ghl.weeksTo80 })} />
            </Box>
          </Container>
        </Box>

        {/* What it costs */}
        <Box component="section" aria-label={t('What it costs')} id="cost" sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}`, scrollMarginTop: 64 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow={t('What it costs')} title={tr('The same work, {em}', { em: <em>{t('a much smaller bill.')}</em> })}
              text={t('What a café of {n} pays each month to cover what Business Agent does, with each company’s own products at list price. VAT not included, and card fees left out: they’re the same on every route.', { n: people })} />
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'start' }}>
              {PRODUCTS.map(p => <Receipt key={p.id} p={p} people={people} />)}
            </Box>
            <Box sx={{ mt: { xs: 4, md: 5 } }}>
              <ChartCard label={t('What you’ll have paid, month by month')} title={t('What you’ll have paid, month by month')}
                subtitle={t('A team of {n}, over {years} years: the gap grows every month', { n: people, years: YEARS })}>
                <Box sx={{ mb: 1.5 }}><Legend series={spend} /></Box>
                <LineChart series={spend} endLabels format={whole} label={t('What each route has cost after each month, over {n} years', { n: YEARS })}
                  xLabel={m => (m ? tn(m, 'After {n} month', 'After {n} months') : t('Today'))}
                  xTicks={[{ at: 0, text: t('Today') }, ...Array.from({ length: YEARS }, (_, i) => ({ at: (i + 1) * 12, text: tn(i + 1, '{n} year', '{n} years') }))]} />
                <FiguresTable caption={t('What each route has cost, for a team of {n}', { n: people })} columns={['', t('A month'), ...Array.from({ length: YEARS }, (_, i) => tn(i + 1, '{n} year', '{n} years'))]}
                  rows={PRODUCTS.map(p => ({ head: p.name, cells: [money(cost(p.id)), ...Array.from({ length: YEARS }, (_, i) => whole(cost(p.id) * 12 * (i + 1)))] }))} />
              </ChartCard>
            </Box>
          </Container>
        </Box>

        {/* The learning curve */}
        <Box component="section" aria-label={t('Learning curve')} id="learning-curve" sx={{ scrollMarginTop: 64 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow={t('Learning curve')} title={tr('Running it in days, {em}', { em: <em>{t('not months.')}</em> })}
              text={t('How much of the everyday work a new owner does without help, week by week. One app made for cafés is quicker to learn than three made for something else.')} />
            <ChartCard label={t('Everyday jobs you can do without help')} title={t('Everyday jobs you can do without help')} subtitle={t('Week by week, from the day you start. Our estimate, not a measured study.')}>
              <Box sx={{ mb: 1.5 }}><Legend series={curve} /></Box>
              <LineChart series={curve} max={100} format={pct} guide={{ value: 80, text: t('80%: at home in it') }} label={t('The share of everyday jobs done without help, week by week, for each product')}
                xLabel={w => (w ? tn(w, 'After {n} week', 'After {n} weeks') : t('The first day'))}
                xTicks={Array.from({ length: CURVE_WEEKS / 2 + 1 }, (_, i) => ({ at: i * 2, text: i ? t('Week {n}', { n: i * 2 }) : t('Start') }))} />
              <FiguresTable caption={t('The share of everyday jobs done without help')} columns={['', ...[1, 2, 4, 8, 12].map(w => t('Week {n}', { n: w }))]}
                rows={PRODUCTS.map(p => ({ head: p.name, cells: [1, 2, 4, 8, 12].map(w => pct(familiarity(p.id, w))) }))} />
            </ChartCard>
            <Box sx={{ mt: 2.5, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
              {PRODUCTS.map(p => (
                <Box key={p.id} component="article" aria-label={t('Learning {name}', { name: p.name })}
                  sx={{ p: { xs: 2.5, md: 3 }, borderRadius: '22px', bgcolor: '#fff', border: p.id === OURS ? `2px solid ${BA.roseDeep}` : `1px solid ${BA.line}` }}>
                  <ProductName p={p} size="1.35rem" />
                  <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                    <Box>
                      <Typography sx={{ ...figures, fontSize: '1.7rem', lineHeight: 1.1 }}>{tn(p.weeksTo80, '{n} week', '{n} weeks')}</Typography>
                      <Typography sx={{ color: BA.soft, fontSize: '0.86rem' }}>{t('to 80%')}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ ...figures, fontSize: '1.7rem', lineHeight: 1.1 }}>{p.apps}</Typography>
                      <Typography sx={{ color: BA.soft, fontSize: '0.86rem' }}>{tn(p.apps, 'app to learn', 'apps to learn')}</Typography>
                    </Box>
                  </Stack>
                  <Box component="ul" sx={{ m: 0, mt: 2, pl: 2.25, color: BA.soft, fontSize: '0.94rem', '& li': { mb: 0.75, lineHeight: 1.5 } }}>
                    {p.why.map(w => <li key={w}>{t(w)}</li>)}
                  </Box>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Feature by feature */}
        <Box component="section" aria-label={t('Feature by feature')} id="features" sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}`, scrollMarginTop: 64 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow={t('Feature by feature')} title={tr('Everything a café runs on, {em}', { em: <em>{t('side by side')}</em> })}
              text={t('{a} of the {n} jobs are built into Business Agent. Square does {b} on its own and GoHighLevel {c}: the rest take add-ons, other apps, or can’t be done.', { a: covered(OURS), n: total, b: covered('square'), c: covered('gohighlevel') })} />
            <Coverage />
            <Stack direction="row" component="ul" aria-label={t('Key')} sx={{ listStyle: 'none', m: 0, p: 0, mb: 2, flexWrap: 'wrap', columnGap: 3, rowGap: 1 }}>
              {(Object.keys(HAS) as Has[]).map(h => (
                <Stack key={h} component="li" direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  {HAS[h].icon}<Typography sx={{ fontSize: '0.9rem', color: BA.soft }}>{t(HAS[h].label)}</Typography>
                </Stack>
              ))}
            </Stack>
            <Box sx={{ overflowX: 'auto', border: `1px solid ${BA.line}`, borderRadius: '22px' }}>
              <Table size="small" sx={{ minWidth: 720, '& td, & th': { color: BA.ink, py: 1.25 } }} aria-label={t('Feature comparison')}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ borderColor: BA.line, width: '31%' }} />
                    {PRODUCTS.map(p => (
                      <TableCell key={p.id} align="center" sx={{ borderColor: BA.line, width: '23%', bgcolor: p.id === OURS ? 'rgba(247,155,164,0.07)' : undefined }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '1.02rem' }}>{p.name}</Typography>
                        <Typography variant="body2" sx={{ color: BA.soft }}>{t('{amount} a month', { amount: money(cost(p.id)) })}</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {FEATURE_GROUPS.flatMap(g => [
                    <TableRow key={g.group}>
                      <TableCell colSpan={PRODUCTS.length + 1} sx={{ bgcolor: BA.bg, borderColor: BA.line, fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${BA.soft} !important`, py: 1.25 }}>
                        {t(g.group)}
                      </TableCell>
                    </TableRow>,
                    ...g.rows.map(r => (
                      <TableRow key={r.label}>
                        <TableCell component="th" scope="row" sx={{ borderColor: BA.lineSoft, fontWeight: 400 }}>{t(r.label)}</TableCell>
                        {PRODUCTS.map(p => {
                          const v = r.values[p.id]
                          return (
                            <TableCell key={p.id} align="center" sx={{ borderColor: BA.lineSoft, bgcolor: p.id === OURS ? 'rgba(247,155,164,0.07)' : undefined }}>
                              <Box role="img" aria-label={t(HAS[v.has].label)} sx={{ display: 'inline-flex', verticalAlign: 'middle' }}>{HAS[v.has].icon}</Box>
                              {v.note && <Typography sx={{ color: BA.soft, fontSize: '0.8rem', lineHeight: 1.35, mt: 0.25 }}>{t(v.note)}</Typography>}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )),
                  ])}
                </TableBody>
              </Table>
            </Box>
          </Container>
        </Box>

        {/* Where the others fall short */}
        <Box component="section" aria-label={t('The detail')} sx={{ scrollMarginTop: 64 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow={t('The detail')} title={tr('Where the others {em}', { em: <em>{t('fall short for a café')}</em> })}
              text={t('Both are good at what they were built for. Neither was built to run a café.')} />
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {[
                { p: square, good: msg('Taking card payments. It’s a good till, and Business Agent works with it rather than replacing it.'),
                  short: [
                    t('{n} of the {total} jobs aren’t available from Square at any price, including the social planner, supplier invoices, tax deadlines and food safety logs.', { n: missing('square').length, total }),
                    t('Stock and menu costing is MarketMan, another company’s app with its own login: {price} a month on top.', { price: money(SQUARE.marketman) }),
                    t('Campaigns are another subscription (Square Marketing), and the team’s tools cost more as the team grows.'),
                    t('The monthly registro de jornada is yours to lay out from timecard exports.'),
                  ] },
                { p: ghl, good: msg('Sales funnels and follow-ups, for agencies that run marketing for many clients.'),
                  short: [
                    t('No rota, clock-ins, timecards or registro de jornada: the team needs a separate app.'),
                    t('Nothing for the café itself: no till, takings, stock, menu costing, supplier invoices or tax.'),
                    t('Billed in US dollars, with texts, emails, calls and AI charged on top as you use them.'),
                    t('Made for agencies: pipelines, funnels and workflows to build before it does anything for you.'),
                  ] },
              ].map(({ p, good, short }) => {
                const more = cost(p.id) - cost(OURS)
                return (
                  <Box key={p.id} component="article" aria-label={t('Business Agent vs {name}', { name: p.name })}
                    sx={{ p: { xs: 2.75, md: 3.5 }, borderRadius: '24px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
                    <Typography component="h3" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.6rem', md: '1.9rem' }, lineHeight: 1.1 }}>
                      {tr('Business Agent {vs} {name}', { vs: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('vs')}</Box>, name: p.name })}
                    </Typography>
                    <Typography sx={{ fontWeight: 600, mt: 2.25, fontSize: '0.92rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: BA.faint }}>{t('What it’s good at')}</Typography>
                    <Typography sx={{ color: BA.soft, mt: 0.5, lineHeight: 1.6 }}>{t(good)}</Typography>
                    <Typography sx={{ fontWeight: 600, mt: 2.25, fontSize: '0.92rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: BA.faint }}>{t('Where it falls short for a café')}</Typography>
                    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }}>
                      {short.map(s => (
                        <Stack key={s} component="li" direction="row" spacing={1.25}>
                          <CloseIcon sx={{ fontSize: 18, color: BA.roseDeep, mt: '3px', flexShrink: 0 }} />
                          <Typography sx={{ lineHeight: 1.55 }}>{s}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    <Box sx={{ mt: 2.75, p: 2, borderRadius: '16px', bgcolor: BA.roseSoft }}>
                      <Typography sx={{ lineHeight: 1.55 }}>
                        {tr('{more} a month more than Business Agent for a team of {n}: {total} more over {years} years.', {
                          more: <Box component="strong" sx={{ fontWeight: 700 }}>{money(more)}</Box>, n: people, years: YEARS,
                          total: <Box component="strong" sx={{ fontWeight: 700 }}>{money(Math.round(more * MONTHS))}</Box> })}
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
            <Box sx={{ mt: 2.5, p: { xs: 2.75, md: 3.5 }, borderRadius: '24px', bgcolor: BA.tint, border: `1px solid ${BA.line}` }}>
              <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>{t('Where Business Agent fits')}</Typography>
              <Typography sx={{ color: BA.soft, mt: 0.75, lineHeight: 1.65 }}>
                {t('Business Agent isn’t a till. Keep Square’s free one (or SumUp or Stripe) for card payments: Business Agent reads the takings and puts them next to the rota, the stock and the month’s profit, with the {plan} plan at {price} a month for the whole team.', { plan: plan.name, price: money(plan.monthly) })}
              </Typography>
            </Box>
          </Container>
        </Box>

        {/* How we worked it out */}
        <Box component="section" aria-label={t('How we worked it out')} id="method" sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}`, scrollMarginTop: 64 }}>
          <Container maxWidth="md" sx={{ py: { xs: 8, md: 10 } }}>
            <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.9rem', md: '2.3rem' } }}>{t('How we worked it out')}</Typography>
            <Box component="ul" sx={{ m: 0, mt: 2, pl: 2.5, color: BA.soft, '& li': { mb: 1, lineHeight: 1.65 } }}>
              <li>{t('Prices are each company’s list prices for Spain, read from their own websites on {date}, VAT not included. Prices change: check theirs before you decide.', { date })}</li>
              <li>{t('GoHighLevel bills in US dollars: converted at the European Central Bank’s rate that day, ${rate} to the euro.', { rate: USD_PER_EUR })}</li>
              <li>{t('Each route covers what Business Agent’s {plan} plan does, for one venue, with that company’s own products. For Square’s team tools we take its cheapest way for the team size you pick; GoHighLevel has none, so that route borrows Square’s.', { plan: plan.name })}</li>
              <li>{t('Card fees aren’t counted: every route keeps Square’s free till, at {fee} a card payment in person.', { fee: `${SQUARE.cardPercent}% + ${money(SQUARE.cardFixed)}` })}</li>
              <li>{t('Usage charges (GoHighLevel’s texts, emails, calls and AI) aren’t counted either, so its true cost is higher than shown.')}</li>
              <li>{t('The learning curve is our estimate, not a measured study: from the number of apps each route needs, who each is made for, and what has to be set up first.')}</li>
            </Box>
            <Typography sx={{ fontWeight: 600, mt: 3 }}>{t('Sources')}</Typography>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, '& li': { mb: 0.5 } }}>
              {[
                [msg('HighLevel pricing (Starter ${starter}, WhatsApp ${whatsapp}, online listings ${listings})'), SOURCES.highlevel],
                [msg('Square for Restaurants pricing, Spain (Plus, Marketing, MarketMan, card fees)'), SOURCES.squareRestaurants],
                [msg('Square Shifts pricing, Spain'), SOURCES.squareShifts],
                [msg('Square: opening hours on your Google Business Profile'), SOURCES.squareGoogle],
                [msg('HighLevel MCP server'), SOURCES.highlevelMcp],
                [msg('European Central Bank: euro reference rates'), SOURCES.ecb],
              ].map(([text, href]) => (
                <li key={href}>
                  <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ color: BA.accent }}>
                    {t(text, { starter: HIGHLEVEL_USD.starter, whatsapp: HIGHLEVEL_USD.whatsapp, listings: HIGHLEVEL_USD.listings })}
                  </Link>
                </li>
              ))}
            </Box>
            <Typography sx={{ color: BA.faint, fontSize: '0.85rem', mt: 3, lineHeight: 1.6 }}>
              {t('GoHighLevel and HighLevel are trademarks of HighLevel LLC, and Square of Block, Inc. Business Agent isn’t affiliated with either.')}
            </Typography>
          </Container>
        </Box>

        <Container maxWidth="md" sx={{ py: { xs: 9, md: 12 } }}>
          <SectionIntro eyebrow={t('FAQ')} title={tr('Comparing, {em}', { em: <em>{t('answered')}</em> })} />
          <Faq items={FAQ.map(f => ({ q: t(f.q), a: t(f.a, { ghl: HIGHLEVEL_USD.starterYearly.toLocaleString(locale()), date, plan: plan.name, yearly: money(plan.yearly), monthly: money(Math.round(plan.yearly / 12 * 100) / 100) }) }))} />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}
