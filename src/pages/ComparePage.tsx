import { Box, Button, Container, Link, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect } from 'react'
import { ClosingCta } from './LoginPage'
import { BA, MarketingFrame, display, primaryBtn } from './marketing/site'
import { COMPETITORS, PRICES_CHECKED, USD_TO_EUR, euro, savings, stackTotal, type Competitor } from '../../shared/competitors'
import { TRIAL_MONTHS, TRIAL_PLAN, planHighlights } from '../../shared/plans'

/** Public: Business Agent's top plan against buying the same things from Square or GoHighLevel. */
export function ComparePage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = new URLSearchParams(search).get('vs') === 'gohighlevel' ? 'gohighlevel' : 'square'
  const c = COMPETITORS.find(x => x.id === id)!
  const s = savings(c, TRIAL_PLAN.monthly)
  useEffect(() => {
    const before = document.title
    document.title = `Business Agent vs ${c.name}`
    return () => { document.title = before }
  }, [c.name])
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: 'radial-gradient(1000px 420px at 50% -180px, rgba(63,60,187,0.10), transparent 70%)' }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 9 }, pb: { xs: 6, md: 8 }, textAlign: 'center' }}>
            <Typography sx={{ color: BA.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Compare</Typography>
            <Typography component="h1" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '2.2rem', md: '3.2rem' }, lineHeight: 1.06, letterSpacing: '-0.04em', mt: 1.5, maxWidth: 820, mx: 'auto' }}>
              One app instead of a stack of add-ons.
            </Typography>
            <Typography sx={{ color: BA.soft, fontSize: { xs: '1.05rem', md: '1.15rem' }, mt: 2.5, maxWidth: 640, mx: 'auto', lineHeight: 1.6 }}>
              What a café with 10 staff would pay each month to get Business Agent {TRIAL_PLAN.name}'s rota, timecards, messaging and social posting elsewhere.
            </Typography>
            <ToggleButtonGroup exclusive value={id} onChange={(_, v) => v && navigate(`/compare${v === 'gohighlevel' ? '?vs=gohighlevel' : ''}`, { replace: true })}
              aria-label="Compare with" sx={{ mt: 4, bgcolor: BA.tint, p: 0.5, borderRadius: '12px', '& .MuiToggleButton-root': {
                border: 0, borderRadius: '9px !important', px: 3, py: 0.9, textTransform: 'none', fontWeight: 500, color: BA.soft,
                '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(17,19,24,0.12)', '&:hover': { bgcolor: '#fff' } } } }}>
              {COMPETITORS.map(x => <ToggleButton key={x.id} value={x.id}>vs {x.name}</ToggleButton>)}
            </ToggleButtonGroup>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 11 } }}>
          {/* The answer first */}
          <Box aria-label="Savings" sx={{ borderRadius: '24px', bgcolor: BA.ink, color: '#fff', p: { xs: 3, md: 5 }, display: 'grid', gap: 3,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, textAlign: { xs: 'left', md: 'center' } }}>
            {[
              [`${c.name} stack`, `${euro(s.theirs)}/mo`],
              [`Business Agent ${TRIAL_PLAN.name}`, `${euro(s.ours)}/mo`],
              ['You save', `${euro(s.month)}/mo`],
            ].map(([label, value], i) => (
              <Box key={label}>
                <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem' }}>{label}</Typography>
                <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '2rem', md: '2.6rem' }, letterSpacing: '-0.03em', color: i === 2 ? '#A5F3C4' : '#fff' }}>{value}</Typography>
                {i === 2 && <Typography sx={{ color: 'rgba(255,255,255,0.75)' }}>{euro(s.year)} a year · {s.percent}% less</Typography>}
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 4, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' }, alignItems: 'start' }}>
            <StackTable c={c} />
            <Box sx={{ p: 3.5, borderRadius: '20px', bgcolor: '#fff', border: `2px solid ${BA.ink}` }}>
              <Typography component="h2" sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.3rem' }}>Business Agent {TRIAL_PLAN.name}</Typography>
              <Typography sx={{ mt: 1 }}><b style={{ fontSize: '2rem' }}>{euro(TRIAL_PLAN.monthly)}</b> / month, plus VAT</Typography>
              <Typography variant="body2" sx={{ color: BA.soft }}>Everything in one app. {TRIAL_MONTHS} months free to start.</Typography>
              <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5 }}>
                {planHighlights(TRIAL_PLAN).map(h => (
                  <Stack component="li" key={h} direction="row" spacing={1.25}><CheckIcon sx={{ fontSize: 18, mt: '3px', color: BA.accent }} /><span>{h}</span></Stack>
                ))}
              </Stack>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant="contained" sx={{ ...primaryBtn, mt: 3 }}>
                Try {TRIAL_PLAN.name} free for {TRIAL_MONTHS} months
              </Button>
            </Box>
          </Box>

          <Box sx={{ mt: 4, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Box sx={{ p: 3, borderRadius: '20px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
              <Typography component="h2" sx={{ fontWeight: 600 }}>Also included in Business Agent, not in this stack</Typography>
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
