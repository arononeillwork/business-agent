import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import ShareIcon from '@mui/icons-material/LinkRounded'
import GoIcon from '@mui/icons-material/RocketLaunchOutlined'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import { siWhatsapp } from 'simple-icons'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { MAX_FREE_MONTHS, freeMonths, progression, referralLink, stageOf, type Referral, type ReferralWeek } from '../../shared/referrals'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

/**
 * Referrals (account menu, admins): share the link; when a business you referred finishes set-up,
 * you both get a month of Business Agent free, up to 12. Shows how far the link has got.
 */
export function ReferralsPage() {
  const { api, business } = useApp()
  const data = useAsync('referrals', () => api.referrals(), [])
  const list = data.data?.referrals ?? []
  const months = freeMonths(list)
  const setUp = list.filter(r => r.set_up_at).length
  const link = data.data ? referralLink(location.origin, data.data.code) : ''

  return (
    <>
      <PageHeader eyebrow="You" title="Referrals" />
      <ErrorBox error={data.error} />
      <Card component="section" aria-label="Your referral link" sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' } }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: tokens.roseDeep, mb: 1 }}>
              <GiftIcon fontSize="small" />
              <Typography variant="overline" sx={{ lineHeight: 1.4 }}>Give a month, get a month</Typography>
            </Stack>
            <Typography variant="h5" component="h2" sx={{ mb: 1 }}>Invite a business. You both get a month free.</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
              Share your link with another café, shop or small team. When they finish setting up Business Agent,
              you each get a month free. It stacks: up to {MAX_FREE_MONTHS} months for you.
            </Typography>
            {data.data && <ShareLink link={link} from={business?.name ?? 'us'} />}
          </CardContent>
          <MonthsEarned months={months} />
        </Box>
      </Card>

      {data.data && (
        <Box component="section" aria-label="How your link is doing" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 2 }, mb: 3 }}>
          <Stat label="Link opened" value={data.data.opens} note="times" />
          <Stat label="Joined" value={list.length} note={list.length === 1 ? 'business' : 'businesses'} />
          <Stat label="Set up" value={setUp} note={`= ${months} free month${months === 1 ? '' : 's'}`} strong />
        </Box>
      )}

      {data.data && <Progression referrals={list} />}

      <Card component="section" aria-label="How it works" sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>How it works</SectionTitle>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              { icon: <ShareIcon />, title: 'Share your link', text: 'By WhatsApp, email or anywhere. It opens Business Agent with your invite.' },
              { icon: <GoIcon />, title: 'They set up', text: 'They join, then finish setting up their business. Opening the link or joining doesn’t count yet.' },
              { icon: <GiftIcon />, title: 'You both get a month', text: `A free month each, every time. Up to ${MAX_FREE_MONTHS} months for you.` },
            ].map((s, i) => (
              <Stack component="li" key={s.title} direction="row" spacing={1.5}>
                <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: tokens.roseSoft, color: tokens.roseDeep }}>{s.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{i + 1}. {s.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.text}</Typography>
                </Box>
              </Stack>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card component="section" aria-label="Businesses you referred">
        <CardContent>
          <SectionTitle>Businesses you referred</SectionTitle>
          {data.data && list.length === 0 && <Empty>No referrals yet. Share your link and they’ll show up here.</Empty>}
          <Stack component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }} divider={<Box sx={{ borderTop: `1px solid ${tokens.line}` }} />}>
            {list.map(r => <ReferralRow key={r.id} r={r} />)}
          </Stack>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2 }}>
            Each free month goes on your bill as credit (one month of your plan) and is taken off your next payments
            automatically; see Billing. Sign-up for new businesses opens soon; until then your link takes them to the
            waitlist, and they count once they finish setting up.
          </Typography>
        </CardContent>
      </Card>
    </>
  )
}

/** The link, with copy and the two ways cafés actually share things. */
function ShareLink({ link, from }: { link: string; from: string }) {
  const notify = useNotify()
  const text = `I use Business Agent for our rota, hours and team messages. Join with my link and we both get a month free: ${link}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify('Link copied', 'success') } catch { notify('Couldn’t copy: select the link and copy it', 'error') }
  }
  return (
    <>
      <TextField label="Your link" value={link} fullWidth size="small" slotProps={{ htmlInput: { readOnly: true, onFocus: (e: { target: HTMLInputElement }) => e.target.select() } }} />
      <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<CopyIcon />} onClick={() => void copy()}>Copy link</Button>
        <Button variant="outlined" startIcon={<Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 18, height: 18 }}><path d={siWhatsapp.path} fill={`#${siWhatsapp.hex}`} /></Box>}
          href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</Button>
        <Button variant="outlined" startIcon={<MailIcon />}
          href={`mailto:?subject=${encodeURIComponent(`A month of Business Agent free, from ${from}`)}&body=${encodeURIComponent(text)}`}>Email</Button>
      </Stack>
    </>
  )
}

/** The headline: free months banked, as a hero figure over a 12-step meter that fills in. */
function MonthsEarned({ months }: { months: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = setTimeout(() => setShown(months), 120); return () => clearTimeout(t) }, [months])
  return (
    <Box component="figure" aria-label={`${months} of ${MAX_FREE_MONTHS} free months earned`}
      sx={{ m: 0, p: { xs: 2.5, md: 3.5 }, bgcolor: tokens.roseWash, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Free months earned</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 2 }}>
        <Typography component="span" sx={{ fontSize: { xs: 48, md: 64 }, fontWeight: 600, lineHeight: 1, color: 'text.primary' }}>{months}</Typography>
        <Typography component="span" sx={{ color: 'text.secondary' }}>of {MAX_FREE_MONTHS}</Typography>
      </Stack>
      <Box role="presentation" sx={{ display: 'grid', gridTemplateColumns: `repeat(${MAX_FREE_MONTHS}, 1fr)`, gap: '2px' }}>
        {Array.from({ length: MAX_FREE_MONTHS }, (_, i) => (
          <Box key={i} sx={{ height: 14, borderRadius: i === 0 ? '4px 0 0 4px' : i === MAX_FREE_MONTHS - 1 ? '0 4px 4px 0' : 0,
            bgcolor: i < shown ? tokens.chart : tokens.roseSoft,
            transition: 'background-color .35s ease', transitionDelay: `${i * 70}ms`,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
        ))}
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
        {months >= MAX_FREE_MONTHS ? 'You’ve earned the full year. Thank you!'
          : months === 0 ? 'Your first month comes when a business you referred finishes set-up.'
          : `${MAX_FREE_MONTHS - months} more to a full free year.`}
      </Typography>
    </Box>
  )
}

function Stat({ label, value, note, strong }: { label: string; value: number; note: string; strong?: boolean }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 600, lineHeight: 1.2, color: strong ? tokens.roseDeep : 'text.primary' }}>{value.toLocaleString('en-GB')}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{note}</Typography>
      </CardContent>
    </Card>
  )
}

function ReferralRow({ r }: { r: Referral }) {
  const done = stageOf(r) === 'set_up'
  return (
    <Stack component="li" direction="row" spacing={1.5} sx={{ py: 1.25, alignItems: 'center' }} aria-label={r.business_name}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 500 }} noWrap>{r.business_name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Joined {formatLocal(r.joined_at, 'd MMM yyyy')}{r.set_up_at ? ` · set up ${formatLocal(r.set_up_at, 'd MMM yyyy')}` : ''}
        </Typography>
      </Box>
      {done ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>Set up · +1 month</Tag> : <Tag>Joined · setting up</Tag>}
    </Stack>
  )
}

/** Free months over time: one line (step-up as businesses finish set-up), towards the cap. */
function Progression({ referrals }: { referrals: Referral[] }) {
  const weeks = useMemo(() => progression(referrals), [referrals])
  const [table, setTable] = useState(false)
  return (
    <Card component="section" aria-label="Free months over time" sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Button size="small" onClick={() => setTable(t => !t)} aria-pressed={table}>{table ? 'Show chart' : 'Show as table'}</Button>}>
          Free months over time
        </SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Each step up is a business you referred finishing set-up. Hover or use the arrow keys for each week.
        </Typography>
        {table ? <WeeksTable weeks={weeks} /> : <StepChart weeks={weeks} />}
      </CardContent>
    </Card>
  )
}

const weekLabel = (w: ReferralWeek) => `Week of ${formatLocal(`${w.week}T12:00:00Z`, 'd MMM')}`

function WeeksTable({ weeks }: { weeks: ReferralWeek[] }) {
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums',
      '& th, & td': { py: 0.75, px: 1, borderBottom: `1px solid ${tokens.line}`, textAlign: 'right' }, '& th:first-of-type, & td:first-of-type': { textAlign: 'left' },
      '& th': { color: 'text.secondary', fontWeight: 500 } }}>
      <thead><tr><th>Week</th><th>Joined</th><th>Set up</th><th>Free months</th></tr></thead>
      <tbody>{[...weeks].reverse().map(w => <tr key={w.week}><td>{weekLabel(w)}</td><td>{w.joined}</td><td>{w.setUp}</td><td>{w.months}</td></tr>)}</tbody>
    </Box>
  )
}

/** Width of an element, kept up to date (charts draw to real pixels so text never stretches). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function StepChart({ weeks }: { weeks: ReferralWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 220, top = 16, bottom = 28, left = 30, right = 64
  const plotW = Math.max(0, width - left - right), plotH = H - top - bottom
  const n = weeks.length
  const x = (i: number) => left + (n <= 1 ? plotW : (i / (n - 1)) * plotW)
  const y = (v: number) => top + plotH - (v / MAX_FREE_MONTHS) * plotH
  // A step line: flat across a week, then up at the next week when months were earned.
  const path = weeks.map((w, i) => (i === 0 ? `M${x(0)},${y(w.months)}` : `H${x(i)}V${y(w.months)}`)).join('')
  const area = `${path}V${y(0)}H${x(0)}Z`
  const last = weeks[n - 1]
  const at = hover ?? null
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / Math.max(1, box.width)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setHover(h => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))))
    }
  }
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 90))))
  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }}>
      {width > 0 && (
        <Box component="svg" width={width} height={H} role="img" tabIndex={0} onKeyDown={keys} onBlur={() => setHover(null)}
          aria-label={`Free months earned, week by week: ${last.months} of ${MAX_FREE_MONTHS} now`}
          sx={{ display: 'block', outline: 'none', '&:focus-visible': { outline: `2px solid ${tokens.rose}`, borderRadius: '8px' } }}>
          {[0, 3, 6, 9, 12].map(v => (
            <g key={v}>
              <line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke={tokens.line} strokeWidth={1} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={tokens.inkFaint}>{v}</text>
            </g>
          ))}
          <text x={left + plotW} y={y(MAX_FREE_MONTHS) - 5} textAnchor="end" fontSize={11} fill={tokens.inkFaint}>A full free year</text>
          <path d={area} fill={tokens.chart} fillOpacity={0.1} />
          <path d={path} fill="none" stroke={tokens.chart} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {weeks.map((w, i) => i % tickEvery === 0 || i === n - 1 ? (
            <text key={w.week} x={x(i)} y={H - 8} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize={11} fill={tokens.inkFaint}>
              {formatLocal(`${w.week}T12:00:00Z`, 'd MMM')}
            </text>
          ) : null)}
          <circle cx={x(n - 1)} cy={y(last.months)} r={5} fill={tokens.chart} stroke={tokens.surface} strokeWidth={2} />
          <text x={x(n - 1) + 10} y={y(last.months) + 4} fontSize={12} fontWeight={600} fill={tokens.ink}>
            {last.months} {last.months === 1 ? 'month' : 'months'}
          </text>
          {at !== null && (
            <g pointerEvents="none">
              <line x1={x(at)} x2={x(at)} y1={top} y2={top + plotH} stroke={tokens.inkFaint} strokeWidth={1} />
              <circle cx={x(at)} cy={y(weeks[at].months)} r={5} fill={tokens.chart} stroke={tokens.surface} strokeWidth={2} />
            </g>
          )}
          <rect x={left} y={top} width={plotW} height={plotH} fill="transparent"
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
        </Box>
      )}
      {at !== null && width > 0 && (
        <Box role="status" sx={{ position: 'absolute', top: 0, left: Math.min(Math.max(0, x(at) - 90), width - 180), width: 180, pointerEvents: 'none',
          bgcolor: tokens.surface, border: `1px solid ${tokens.line}`, borderRadius: '10px', boxShadow: `0 8px 24px -12px ${tokens.shadow}`, p: 1.25 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{weekLabel(weeks[at])}</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 2, bgcolor: tokens.chart, borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 600 }}>{weeks[at].months} free {weeks[at].months === 1 ? 'month' : 'months'}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{weeks[at].joined} joined · {weeks[at].setUp} set up</Typography>
        </Box>
      )}
    </Box>
  )
}
