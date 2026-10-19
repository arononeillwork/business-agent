import { Box, Button, Container, Link, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect } from 'react'
import { ClosingCta } from './LoginPage'
import { BA, Eyebrow, MarketingFrame, display, figures, glow, primaryBtn } from './marketing/site'
import { COMPETITORS, PRICES_CHECKED, USD_TO_EUR, euro, savings, stackTotal, type Competitor } from '../../shared/competitors'
import { TRIAL_MONTHS, TRIAL_PLAN, plan, planHighlights } from '../../shared/plans'

/** Public: the Business Agent plan that does the same jobs, against buying them from Square or GoHighLevel. */
export function ComparePage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = new URLSearchParams(search).get('vs') === 'gohighlevel' ? 'gohighlevel' : 'square'
  const c = COMPETITORS.find(x => x.id === id)!
  const ours = plan(c.plan)
  const s = savings(c, ours.monthly)
  useEffect(() => {
    const before = document.title
    document.title = `Business Agent vs ${c.name}`
    return () => { document.title = before }
  }, [c.name])
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: glow('50%', '-200px') }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 9 }, pb: { xs: 6, md: 8 }, textAlign: 'center' }}>
            <Eyebrow>Compare</Eyebrow>
            <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.8rem', md: '4.2rem' }, lineHeight: 1, letterSpacing: '-0.02em', mt: 1.75, maxWidth: 860, mx: 'auto' }}>
              One app instead of a <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>stack of add-ons.</Box>
            </Typography>
            <Typography sx={{ color: BA.soft, fontSize: { xs: '1.05rem', md: '1.15rem' }, mt: 2.5, maxWidth: 640, mx: 'auto', lineHeight: 1.6 }}>
              What a café with 10 staff would pay each month to get Business Agent {ours.name}'s rota, timecards, messaging and social posting elsewhere.
            </Typography>
            <ToggleButtonGroup exclusive value={id} onChange={(_, v) => v && navigate(`/compare${v === 'gohighlevel' ? '?vs=gohighlevel' : ''}`, { replace: true })}
              aria-label="Compare with" sx={{ mt: 4, bgcolor: BA.tint, p: 0.5, borderRadius: '999px', '& .MuiToggleButton-root': {
                border: 0, borderRadius: '999px !important', px: 3, py: 0.9, textTransform: 'none', fontWeight: 500, color: BA.soft,
                '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(43,37,34,0.14)', '&:hover': { bgcolor: '#fff' } } } }}>
              {COMPETITORS.map(x => <ToggleButton key={x.id} value={x.id}>vs {x.name}</ToggleButton>)}
            </ToggleButtonGroup>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 11 } }}>
          {/* The answer first */}
          <Box aria-label="Savings" sx={{ borderRadius: '28px', bgcolor: BA.ink, color: '#fff', p: { xs: 3, md: 5 }, display: 'grid', gap: 3,
            backgroundImage: 'radial-gradient(520px 260px at 100% 0%, rgba(247,155,164,0.2), transparent 70%)',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, textAlign: { xs: 'left', md: 'center' } }}>
            {[
              [`${c.name} stack`, `${euro(s.theirs)}/mo`],
              [`Business Agent ${ours.name}`, `${euro(s.ours)}/mo`],
              ['You save', `${euro(s.month)}/mo`],
            ].map(([label, value], i) => (
              <Box key={label}>
                <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem' }}>{label}</Typography>
                <Typography sx={{ ...figures, fontSize: { xs: '2.2rem', md: '2.8rem' }, lineHeight: 1.1, color: i === 2 ? BA.rose : '#fff' }}>{value}</Typography>
                {i === 2 && <Typography sx={{ color: 'rgba(255,255,255,0.75)' }}>{euro(s.year)} a year · {s.percent}% less</Typography>}
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 4, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' }, alignItems: 'start' }}>
            <StackTable c={c} />
            <Box sx={{ p: 3.5, borderRadius: '24px', bgcolor: '#fff', border: `2px solid ${BA.ink}` }}>
              <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: '2rem', lineHeight: 1.1 }}>Business Agent {ours.name}</Typography>
              <Typography sx={{ mt: 1 }}><Box component="b" sx={{ ...figures, fontSize: '2.2rem' }}>{euro(ours.monthly)}</Box> / month, plus VAT</Typography>
              <Typography variant="body2" sx={{ color: BA.soft }}>Everything in one app. Try {TRIAL_PLAN.name}, which includes it all, free for {TRIAL_MONTHS} months.</Typography>
              <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5 }}>
                {planHighlights(ours).map(h => (
                  <Stack component="li" key={h} direction="row" spacing={1.25}><CheckIcon sx={{ fontSize: 18, mt: '3px', color: BA.roseDeep }} /><span>{h}</span></Stack>
                ))}
              </Stack>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant="contained" sx={{ ...primaryBtn, mt: 3, py: 1.2 }}>
                Try free for {TRIAL_MONTHS} months
              </Button>
            </Box>
          </Box>

          <Box sx={{ mt: 4, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Box sx={{ p: 3, borderRadius: '20px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
              <Typography component="h2" sx={{ fontWeight: 600 }}>Also in Business Agent {ours.name}, not in this stack</Typography>
              <Stack component="ul" spacing={1} sx={{ pl: 2.5, mt: 1.5, mb: 0, color: BA.soft }}>
                {c.missing.map(m => <li key={m}>{m}</li>)}
              </Stack>
            </Box>
            <Box sx={{ p: 3, borderRadius: '20px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
              <Typography component="h2" sx={{ fontWeight: 600 }}>How we counted</Typography>
              <Stack component="ul" spacing={1} sx={{ pl: 2.5, mt: 1.5, mb: 0, color: BA.soft }}>
                <li>Public list prices on {PRICES_CHECKED}, monthly billing, excluding VAT, for one café with 10 staff.</li>
                <li>Dollar prices converted at €{USD_TO_EUR} per dollar.</li>
                {c.extras.map(e => <li key={e}>{e}</li>)}
                <li>Prices change: follow the links to check today's.</li>
              </Stack>
            </Box>
          </Box>
        </Container>
        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}

function StackTable({ c }: { c: Competitor }) {
  return (
    <Box sx={{ borderRadius: '20px', border: `1px solid ${BA.line}`, bgcolor: '#fff', overflowX: 'auto' }}>
      <Table aria-label={`${c.name} stack`} sx={{ minWidth: 520, '& td, & th': { borderColor: BA.lineSoft, color: BA.ink } }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>{c.tagline}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Per month</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {c.lines.map(l => (
            <TableRow key={l.item}>
              <TableCell>
                <Typography sx={{ fontWeight: 500 }}>{l.item}</Typography>
                <Typography variant="body2" sx={{ color: BA.soft }}>
                  {l.covers} · <Link href={l.source} target="_blank" rel="noreferrer" sx={{ color: BA.soft }}>source</Link>
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {euro(l.eur)}{l.usd ? <Typography variant="caption" component="div" sx={{ color: BA.faint }}>${l.usd}</Typography> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell sx={{ fontWeight: 600, fontSize: '1rem' }}>Total with {c.name}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>{euro(stackTotal(c))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Box>
  )
}
