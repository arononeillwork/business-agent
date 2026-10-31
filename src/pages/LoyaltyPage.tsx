import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, InputAdornment, MenuItem,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import AddIcon from '@mui/icons-material/Add'
import OpenIcon from '@mui/icons-material/OpenInNew'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import SearchIcon from '@mui/icons-material/Search'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { useConnected } from '../app/connected'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { BarChart } from '../components/charts'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatMoney, today } from '../../shared/time'
import {
  SQUARE_GIFT_CARDS, SQUARE_LOYALTY_SETUP, adjustProblem, giftCardAmountProblem, giftCardMatches, giftCardStatus, giftCardTotals, loyaltyByDay, loyaltyTotals,
  sortGiftCards, stampCard, stampsOf,
  type GiftCard, type GiftCards, type GiftCardSort, type GiftCardStatus, type LoyaltyMember, type LoyaltyProgram, type LoyaltyState,
} from '../../shared/loyalty'
import { tokens } from '../theme'
import { msg, t, tc, tn } from '../i18n'

type Days = 30 | 60 | 90
type LoyaltyTab = 'loyalty' | 'gift-cards'
const when = (iso: string | null) => (iso ? formatLocal(iso, 'd MMM yyyy') : '–')
const memberName = (m: LoyaltyMember) => m.name ?? t('Member {id}', { id: m.id.slice(-4) })
const STATUS_LABEL: Record<GiftCardStatus, string> = { available: msg('Available'), used_up: msg('Used up'), not_activated: msg('Not activated'), deactivated: msg('Deactivated') }
const STATUS_COLOURS: Partial<Record<GiftCardStatus, { fg: string; bg: string }>> = {
  available: { fg: tokens.goodFg, bg: tokens.goodBg }, not_activated: { fg: tokens.infoFg, bg: tokens.infoBg }, deactivated: { fg: tokens.badFg, bg: tokens.badBg },
}
const statusLabel = (c: GiftCard) => (c.state === 'BLOCKED' ? t('Blocked') : t(STATUS_LABEL[giftCardStatus(c)]))
const owner = (c: GiftCard) => c.customer ?? (c.customer_id ? t('A Square customer') : '')
// Gift card columns a phone leaves out, so the balance and Copy number fit without scrolling sideways.
const WIDE = { display: { xs: 'none', md: 'table-cell' } }
const NOT_PHONE = { display: { xs: 'none', sm: 'table-cell' } }

/**
 * Loyalty & gift cards, read live from Square (the till), on two tabs. Loyalty: the stamp card (a
 * programme with points per visit) or points, its members and what they did lately. Gift cards
 * (`?tab=gift-cards`): every card with what's left on it, filtered to the ones that can be spent,
 * what's still owed on them, Copy number to use one, and selling a new one. Admins only, and only
 * while Square is connected: otherwise this page sends you to Connections.
 */
export function LoyaltyPage() {
  const { api } = useApp()
  const square = useConnected('square')
  const [params, setParams] = useSearchParams()
  const tab: LoyaltyTab = params.get('tab') === 'gift-cards' ? 'gift-cards' : 'loyalty'
  const [days, setDays] = useState<Days>(60)
  const to = today(), from = addDays(to, -(days - 1))
  const program = useAsync('loyalty', () => (square ? api.loyalty(from, to) : Promise.resolve(null)), [square, from, to])
  const cards = useAsync('gift-cards', () => (square ? api.giftCards(from, to) : Promise.resolve(null)), [square, from, to])

  if (square === null) return <Loading />
  if (!square) return <Navigate to="/connections" replace />

  const l = program.data, g = cards.data
  const reconnect = l?.status === 'reconnect' || g?.status === 'reconnect'
  const shown = tab === 'loyalty' ? program : cards

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Loyalty & gift cards')} actions={
        <TextField select size="small" value={days} onChange={e => setDays(Number(e.target.value) as Days)} sx={{ minWidth: 150 }}
          slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
          {([30, 60, 90] as Days[]).map(d => <MenuItem key={d} value={d}>{t('Last {n} days', { n: d })}</MenuItem>)}
        </TextField>
      } />
      <Tabs value={tab} onChange={(_, v: LoyaltyTab) => setParams(v === 'loyalty' ? {} : { tab: v }, { replace: true })} variant="scrollable" allowScrollButtonsMobile
        aria-label={t('Loyalty & gift cards')} sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        <Tab value="loyalty" label={t('Loyalty')} />
        <Tab value="gift-cards" label={t('Gift cards')} />
      </Tabs>
      {shown.data?.fetched_at && <Box sx={{ mb: 2 }}><Freshness id="loyalty" at={shown.data.fetched_at} /></Box>}
      <ErrorBox error={shown.error} />
      {reconnect && <Reconnect />}
      {tab === 'loyalty'
        ? <LoyaltyTab state={l} loading={program.loading} from={from} to={to} />
        : <GiftCardsTab data={g} loading={cards.loading} members={l?.members ?? []} />}
    </>
  )
}

/** The stamp card (or points) and its members. */
function LoyaltyTab({ state: l, loading, from, to }: { state: LoyaltyState | null; loading: boolean; from: string; to: string }) {
  const lt = l?.status === 'ok' ? loyaltyTotals(l, to.slice(0, 7)) : null
  const unit = l?.program ? (stampCard(l.program) ? t('Stamps') : t(l.program.other)) : t('Points')
  return (
    <>
      <StatGrid>
        <StatTile label={t('Members')} value={lt ? lt.members : '–'} note={lt ? t('{n} {unit} earned this month', { n: lt.earned_this_month, unit: unit.toLowerCase() }) : undefined} />
        <StatTile label={t('{unit} on cards', { unit })} value={lt ? lt.outstanding : '–'} note={t('Not yet turned into rewards')} />
        <StatTile label={t('Rewards this month')} value={lt ? lt.redeemed_this_month : '–'} note={l?.program?.tiers[0]?.name} />
      </StatGrid>
      {!l ? (loading ? <Loading /> : null)
        : l.status === 'no_program' ? <NoProgram />
        : l.status === 'ok' && l.program ? <>
            <Programme program={l.program} />
            <Activity state={l} from={from} to={to} />
            <Members state={l} program={l.program} />
          </> : null}
    </>
  )
}

function Reconnect() {
  const { api } = useApp()
  const run = useAction()
  return (
    <Alert severity="warning" sx={{ mb: 3 }}
      action={<Button color="inherit" onClick={() => void run(() => api.connectApp('square', 'connections'))}>{t('Connect Square again')}</Button>}>
      {t('Reconnect Square to allow loyalty and gift cards. Square was connected before the app asked for them; nothing else changes.')}
    </Alert>
  )
}

function NoProgram() {
  return (
    <Card component="section" aria-label={t('Loyalty programme')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('No loyalty programme in Square yet')}</SectionTitle>
        <Typography sx={{ mb: 2 }}>
          {t('Set one up in the Square Dashboard (Loyalty): choose a stamp a visit for a digital stamp card ("buy 9 coffees, the 10th is free"), or points per euro. Customers join at the till with their phone number, and it shows here straight away.')}
        </Typography>
        <Button variant="outlined" endIcon={<OpenIcon />} href={SQUARE_LOYALTY_SETUP} target="_blank" rel="noopener">{t('Open Square Loyalty')}</Button>
      </CardContent>
    </Card>
  )
}

/** The stamp card as customers see it (or, for points, how points are earned), with the rewards. */
function Programme({ program }: { program: LoyaltyProgram }) {
  const card = stampCard(program)
  return (
    <Card component="section" aria-label={t('Loyalty programme')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{card ? t('Stamp card') : t('Points programme')}</SectionTitle>
        {card ? <>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mb: 1.5 }} role="img"
            aria-label={t('{n} stamps, then {reward}', { n: card.size, reward: card.reward })}>
            {Array.from({ length: card.size }, (_, i) => (
              <Box key={i} sx={{ width: 34, height: 34, borderRadius: '50%', border: `2px dashed ${tokens.roseDeep}`, display: 'grid', placeItems: 'center',
                fontSize: '0.8rem', color: tokens.roseDeep }}>{i + 1}</Box>
            ))}
            <Box sx={{ height: 34, px: 1.5, borderRadius: 17, bgcolor: tokens.rose, color: '#2B2522', display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 600, fontSize: '0.85rem' }}>
              <GiftIcon fontSize="small" />{card.reward}
            </Box>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {program.minimum_spend
              ? t('A stamp each visit of {amount} or more; {n} stamps get {reward}.', { amount: formatMoney(program.minimum_spend), n: card.size, reward: card.reward })
              : t('A stamp each visit; {n} stamps get {reward}.', { n: card.size, reward: card.reward })}
          </Typography>
        </> : <>
          <Typography sx={{ mb: 1 }}>
            {program.per_spend
              ? t('{points} {unit} for every {amount} spent.', { points: program.per_spend.points, unit: t(program.other).toLowerCase(), amount: formatMoney(program.per_spend.amount) })
              : t('{unit} are earned at the till.', { unit: t(program.other) })}
          </Typography>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            {program.tiers.map(tier => <Tag key={tier.id}>{t('{reward}: {n} {unit}', { reward: tier.name, n: tier.points, unit: t(program.other).toLowerCase() })}</Tag>)}
          </Stack>
        </>}
      </CardContent>
    </Card>
  )
}

function Activity({ state, from, to }: { state: LoyaltyState; from: string; to: string }) {
  const days = loyaltyByDay(state.events, from, to)
  const points = days.map(d => ({ label: formatLocal(`${d.date}T12:00:00Z`, 'd MMM'), title: formatLocal(`${d.date}T12:00:00Z`, 'EEEE d MMMM'), value: d.earned }))
  return (
    <Card component="section" aria-label={t('Visits')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{stampCard(state.program) ? t('Stamps given per day') : t('Points earned per day')}</SectionTitle>
        <BarChart points={points} format={n => String(n)} label={t('Stamps or points earned per day')} />
      </CardContent>
    </Card>
  )
}

function Members({ state, program }: { state: LoyaltyState; program: LoyaltyProgram }) {
  const [adjusting, setAdjusting] = useState<LoyaltyMember | null>(null)
  const card = stampCard(program)
  const unit = card ? t('Stamps') : t(program.other)
  const table = (): ExportTable => ({
    title: t('Loyalty members'), filename: `loyalty-members-${today()}`,
    columns: [t('Member'), unit, t('Rewards waiting'), t('Collected in all'), t('Last visit'), t('Joined')],
    rows: state.members.map(m => {
      const s = stampsOf(m.balance, program)
      return [memberName(m), s ? s.stamps : m.balance, s ? s.rewards : '', m.lifetime, m.last_visit?.slice(0, 10) ?? '', m.enrolled_at?.slice(0, 10) ?? '']
    }),
  })
  return (
    <Card component="section" aria-label={t('Members')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} disabled={!state.members.length} folder="Sales" />}>{t('Members')}</SectionTitle>
        {!state.members.length ? <Empty>{t('Nobody has joined yet. Customers join at the till with their phone number.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('Member')}</TableCell><TableCell>{unit}</TableCell><TableCell align="right">{t('Collected in all')}</TableCell>
                <TableCell>{t('Last visit')}</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {state.members.map(m => {
                  const s = stampsOf(m.balance, program)
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell>{memberName(m)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {s ? <>{t('{n} of {size}', { n: s.stamps, size: s.size })}{s.rewards > 0 && <> <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{tn(s.rewards, '{n} reward waiting', '{n} rewards waiting')}</Tag></>}</>
                          : m.balance}
                      </TableCell>
                      <TableCell align="right">{m.lifetime}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(m.last_visit)}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => setAdjusting(m)} aria-label={t('Adjust {name}', { name: memberName(m) })}>{t('Adjust')}</Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      {adjusting && <AdjustDialog member={adjusting} unit={unit} onClose={() => setAdjusting(null)} />}
    </Card>
  )
}

/** Goodwill points (or taking some back), with a reason Square keeps. */
function AdjustDialog({ member, unit, onClose }: { member: LoyaltyMember; unit: string; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [points, setPoints] = useState('1')
  const [reason, setReason] = useState('')
  // One key for this adjustment: pressing Save again after a failure never gives twice.
  const [key] = useState(() => crypto.randomUUID())
  const n = Number(points)
  const problem = adjustProblem(n)
  const save = async () => {
    if (await run(() => api.adjustLoyalty(member.id, n, reason, key), t('{name}: {change} {unit}', { name: memberName(member), change: n > 0 ? `+${n}` : String(n), unit: unit.toLowerCase() }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="adjust-title">
      <DialogTitle id="adjust-title">{t('Adjust {name}', { name: memberName(member) })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={unit} type="number" value={points} onChange={e => setPoints(e.target.value)}
            helperText={problem && points !== '' ? t(problem) : t('Use a minus to take some back')} error={!!problem && points !== ''} />
          <TextField label={t('Why')} value={reason} onChange={e => setReason(e.target.value)} helperText={t('Square keeps this with the change')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem || !reason.trim()} onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Gift cards: what's available and owed, every card (the ones that can be spent first), and what happened lately. */
function GiftCardsTab({ data, loading, members }: { data: GiftCards | null; loading: boolean; members: LoyaltyMember[] }) {
  const ok = data?.status === 'ok' ? data : null
  const gt = ok ? giftCardTotals(ok, today().slice(0, 7)) : null
  return (
    <>
      <StatGrid>
        <StatTile label={t('Cards available')} value={gt ? gt.available : '–'} note={ok ? tn(ok.cards.length, '{n} card in all', '{n} cards in all') : undefined} />
        <StatTile label={t('Still owed')} value={gt ? formatMoney(gt.outstanding) : '–'} note={t('Left to spend on active cards')} />
        <StatTile label={t('Used up this month')} value={gt ? gt.used_up_this_month : '–'} note={t('Spent down to nothing')} />
        <StatTile label={t('Sold this month')} value={gt ? formatMoney(gt.sold_this_month) : '–'} note={t('New cards and top-ups')} />
      </StatGrid>
      {!ok ? (loading && !data ? <Loading /> : null) : <>
        <GiftCardList data={ok} members={members} />
        <RecentActivity data={ok} />
      </>}
    </>
  )
}

type Show = GiftCardStatus | 'all'

function GiftCardList({ data, members }: { data: GiftCards; members: LoyaltyMember[] }) {
  const { api } = useApp()
  const notify = useNotify()
  const [selling, setSelling] = useState(false)
  const [show, setShow] = useState<Show>('available')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<GiftCardSort>('balance')
  const [copying, setCopying] = useState<string | null>(null)
  const chips: [Show, string][] = [['all', tc('gift cards', 'All')], ['available', tc('gift cards', 'Available')], ['used_up', tc('gift cards', 'Used up')],
    ['not_activated', tc('gift cards', 'Not activated')], ['deactivated', tc('gift cards', 'Deactivated')]]
  const count = (s: Show) => (s === 'all' ? data.cards.length : data.cards.filter(c => giftCardStatus(c) === s).length)
  const list = sortGiftCards(data.cards.filter(c => (show === 'all' || giftCardStatus(c) === show) && giftCardMatches(c, q)), sort)

  // The whole number is asked for only now, one card at a time: lists carry the last 4 digits only.
  const copy = async (c: GiftCard) => {
    setCopying(c.id)
    try {
      const number = await api.giftCardNumber(c.id)
      try {
        await navigator.clipboard.writeText(number)
        notify(t('Number of •••• {last4} copied', { last4: c.last4 }), 'success')
      } catch {
        notify(t('Couldn’t copy here. The number is {number}', { number }), 'info')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setCopying(null)
    }
  }

  const table = (): ExportTable => ({
    title: t('Gift cards'), filename: `gift-cards-${today()}`,
    columns: [t('Card'), t('State'), t('Balance left'), t('Original amount'), t('Issued'), t('Last used'), t('Customer')],
    rows: sortGiftCards(data.cards, sort).map(c => [`•••• ${c.last4}`, statusLabel(c), c.balance, c.original ?? '', c.created_at.slice(0, 10), c.last_used?.slice(0, 10) ?? '', owner(c)]),
    footer: [t('Owed on active cards'), '', giftCardTotals(data, today().slice(0, 7)).outstanding, '', '', '', ''],
    money: [2, 3],
  })
  return (
    <Card component="section" aria-label={t('Gift cards')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ExportButton table={table} disabled={!data.cards.length} folder="Sales" />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSelling(true)} sx={{ whiteSpace: 'nowrap' }}>{t('Sell a gift card')}</Button>
        </Stack>}>{t('Gift cards')}</SectionTitle>
        {!data.cards.length ? <Empty>{t('No gift cards yet. Sell one here, or at the till.')}</Empty> : <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5, justifyContent: 'space-between' }}>
            <TextField size="small" placeholder={t('Search by card number')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 280 } }}
              slotProps={{ htmlInput: { 'aria-label': t('Search by card number'), inputMode: 'numeric' },
                input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <TextField select size="small" label={t('Sort by')} value={sort} onChange={e => setSort(e.target.value as GiftCardSort)} sx={{ width: { xs: '100%', sm: 220 } }}>
              <MenuItem value="balance">{t('Most money left')}</MenuItem>
              <MenuItem value="newest">{t('Newest first')}</MenuItem>
              <MenuItem value="last_used">{t('Last used first')}</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }} role="group" aria-label={t('Show')}>
            {chips.map(([id, label]) => (
              <Chip key={id} label={`${label} ${count(id)}`} onClick={() => setShow(id)} aria-pressed={show === id}
                color={show === id ? 'primary' : 'default'} variant={show === id ? 'filled' : 'outlined'} />
            ))}
          </Stack>
          {!list.length ? <Empty>{q.trim() ? t('No card ending in those digits here.') : t('No cards like that.')}</Empty> : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('Gift cards')} sx={{ '& td, & th': { px: { xs: 1, sm: 2 } } }}>
                <TableHead><TableRow>
                  <TableCell>{t('Card')}</TableCell><TableCell>{t('State')}</TableCell><TableCell align="right">{t('Balance left')}</TableCell>
                  <TableCell align="right" sx={WIDE}>{t('Original amount')}</TableCell><TableCell sx={WIDE}>{t('Issued')}</TableCell><TableCell sx={WIDE}>{t('Last used')}</TableCell>
                  <TableCell sx={NOT_PHONE}>{t('Customer')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {list.map(c => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>•••• {c.last4}</Box>
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{c.type === 'PHYSICAL' ? t('Physical card') : t('Digital card')}</Typography>
                      </TableCell>
                      <TableCell><Tag {...STATUS_COLOURS[giftCardStatus(c)]}>{statusLabel(c)}</Tag></TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: giftCardStatus(c) === 'available' ? 600 : undefined }}>{formatMoney(c.balance)}</TableCell>
                      <TableCell align="right" sx={{ ...WIDE, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{c.original === null ? '–' : formatMoney(c.original)}</TableCell>
                      <TableCell sx={{ ...WIDE, whiteSpace: 'nowrap' }}>{when(c.created_at || null)}</TableCell>
                      <TableCell sx={{ ...WIDE, whiteSpace: 'nowrap' }}>{when(c.last_used)}</TableCell>
                      <TableCell sx={NOT_PHONE}>{owner(c) || '–'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" startIcon={<CopyIcon />} disabled={copying === c.id} onClick={() => void copy(c)}
                          sx={{ whiteSpace: 'nowrap', minWidth: 0, '& .MuiButton-startIcon': { mx: { xs: 0 }, mr: { sm: 1 } } }}
                          aria-label={t('Copy the number of •••• {last4}', { last4: c.last4 })}>
                          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('Copy number')}</Box>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </>}
        <Alert severity="info" icon={<GiftIcon />} sx={{ mt: 2 }}>
          {t('New cards: sell a digital one here with Sell a gift card, or at the till in Square Point of Sale (a physical card from the box, or an eGift card by email). Physical cards to order, and eGift cards for your website, are in the Square Dashboard.')}
          <Box sx={{ mt: 1 }}>
            <Button color="inherit" size="small" endIcon={<OpenIcon />} href={SQUARE_GIFT_CARDS} target="_blank" rel="noopener" sx={{ ml: -0.5 }}>{t('Gift cards in Square')}</Button>
          </Box>
        </Alert>
      </CardContent>
      {selling && <SellDialog members={members} onClose={() => setSelling(false)} />}
    </Card>
  )
}

function RecentActivity({ data }: { data: GiftCards }) {
  return (
    <Card component="section" aria-label={t('Recent gift card activity')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Recent gift card activity')}</SectionTitle>
        {!data.activities.length ? <Empty>{t('Nothing in this period.')}</Empty> : (
          <Stack component="ul" role="list" aria-label={t('Recent gift card activity')} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {data.activities.slice(0, 15).map(a => (
              <Stack component="li" key={a.id} direction="row" spacing={2} sx={{ py: 0.75, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                <Typography variant="body2" sx={{ minWidth: 96, color: 'text.secondary' }}>{formatLocal(a.at, 'd MMM HH:mm')}</Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {a.kind === 'activate' ? t('Sold •••• {last4}', { last4: a.last4 }) : a.kind === 'load' ? t('Topped up •••• {last4}', { last4: a.last4 })
                    : a.kind === 'redeem' ? t('Spent with •••• {last4}', { last4: a.last4 }) : a.kind === 'clear' ? t('Balance cleared on •••• {last4}', { last4: a.last4 })
                      : t('Change to •••• {last4}', { last4: a.last4 })}
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{a.kind === 'redeem' ? `−${formatMoney(a.amount)}` : formatMoney(a.amount)}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

/** Sell a digital gift card: the amount (and who for), then a confirmation saying exactly what happens in Square. */
function SellDialog({ members, onClose }: { members: LoyaltyMember[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [amount, setAmount] = useState('25')
  const [customer, setCustomer] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  const n = Number(amount.replace(',', '.'))
  const problem = giftCardAmountProblem(n)
  const named = members.filter(m => m.customer_id && m.name)
  const who = named.find(m => m.customer_id === customer)
  const sell = async () => {
    if (await run(() => api.sellGiftCard(n, customer || null, key), t('Gift card for {amount} is active', { amount: formatMoney(n) }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="sell-title">
      <DialogTitle id="sell-title">{confirming ? t('Sell this gift card?') : t('Sell a digital gift card')}</DialogTitle>
      <DialogContent>
        {confirming ? (
          <DialogContentText>
            {who
              ? t('This makes a new digital gift card in Square for {amount}, active straight away and linked to {name}. Take the {amount} at the till first: the card is recorded as paid in person.', { amount: formatMoney(n), name: who.name! })
              : t('This makes a new digital gift card in Square for {amount}, active straight away. Take the {amount} at the till first: the card is recorded as paid in person.', { amount: formatMoney(n) })}
          </DialogContentText>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label={t('Amount')} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }}
              error={!!problem && amount !== ''} helperText={problem && amount !== '' ? t(problem) : t('From €5 to €1,000')} />
            <TextField select label={t('For (optional)')} value={customer} onChange={e => setCustomer(e.target.value)}>
              <MenuItem value="">{t('Nobody in particular')}</MenuItem>
              {named.map(m => <MenuItem key={m.id} value={m.customer_id!}>{m.name}</MenuItem>)}
            </TextField>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? t('Back') : t('Cancel')}</Button>
        {confirming
          ? <Button variant="contained" onClick={() => void sell()}>{t('Sell for {amount}', { amount: formatMoney(n) })}</Button>
          : <Button variant="contained" disabled={!!problem} onClick={() => setConfirming(true)}>{t('Next')}</Button>}
      </DialogActions>
    </Dialog>
  )
}
