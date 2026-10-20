import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, InputAdornment, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import AddIcon from '@mui/icons-material/Add'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { useConnected } from '../app/connected'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { BarChart } from '../components/charts'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatMoney, today } from '../../shared/time'
import {
  SQUARE_GIFT_CARDS, SQUARE_LOYALTY_SETUP, adjustProblem, giftCardAmountProblem, giftCardTotals, loyaltyByDay, loyaltyTotals, stampCard, stampsOf,
  type GiftCard, type GiftCards, type LoyaltyMember, type LoyaltyProgram, type LoyaltyState,
} from '../../shared/loyalty'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type Days = 30 | 60 | 90
const when = (iso: string | null) => (iso ? formatLocal(iso, 'd MMM yyyy') : '–')
const memberName = (m: LoyaltyMember) => m.name ?? t('Member {id}', { id: m.id.slice(-4) })
const STATE_LABEL: Record<GiftCard['state'], string> = { ACTIVE: msg('Can be spent'), PENDING: msg('Not activated'), DEACTIVATED: msg('Used up or switched off'), BLOCKED: msg('Blocked') }

/**
 * Loyalty & gift cards, read live from Square (the till): the stamp card (a programme with points per
 * visit) or points, its members and what they did lately, and the gift cards with what's still owed
 * on them. Admins only, and only while Square is connected: otherwise this page sends you to Connections.
 */
export function LoyaltyPage() {
  const { api } = useApp()
  const square = useConnected('square')
  const [days, setDays] = useState<Days>(60)
  const to = today(), from = addDays(to, -(days - 1))
  const program = useAsync('loyalty', () => (square ? api.loyalty(from, to) : Promise.resolve(null)), [square, from, to])
  const cards = useAsync('gift-cards', () => (square ? api.giftCards(from, to) : Promise.resolve(null)), [square, from, to])

  if (square === null) return <Loading />
  if (!square) return <Navigate to="/connections" replace />

  const l = program.data, g = cards.data
  const reconnect = l?.status === 'reconnect' || g?.status === 'reconnect'
  const month = to.slice(0, 7)
  const lt = l?.status === 'ok' ? loyaltyTotals(l, month) : null
  const gt = g?.status === 'ok' ? giftCardTotals(g, month) : null
  const unit = l?.program ? (stampCard(l.program) ? t('Stamps') : t(l.program.other)) : t('Points')

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Loyalty & gift cards')} actions={
        <TextField select size="small" value={days} onChange={e => setDays(Number(e.target.value) as Days)} sx={{ minWidth: 150 }}
          slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
          {([30, 60, 90] as Days[]).map(d => <MenuItem key={d} value={d}>{t('Last {n} days', { n: d })}</MenuItem>)}
        </TextField>
      } />
      <ErrorBox error={program.error ?? cards.error} />
      {reconnect && <Reconnect />}

      <StatGrid>
        <StatTile label={t('Members')} value={lt ? lt.members : '–'} note={lt ? t('{n} {unit} earned this month', { n: lt.earned_this_month, unit: unit.toLowerCase() }) : undefined} />
        <StatTile label={t('{unit} on cards', { unit })} value={lt ? lt.outstanding : '–'} note={t('Not yet turned into rewards')} />
        <StatTile label={t('Rewards this month')} value={lt ? lt.redeemed_this_month : '–'} note={l?.program?.tiers[0]?.name} />
        <StatTile label={t('Gift card balance owed')} value={gt ? formatMoney(gt.outstanding) : '–'}
          note={gt ? tn(gt.active, '{n} active card', '{n} active cards') : undefined} />
      </StatGrid>

      {!l ? (program.loading ? <Loading /> : null)
        : l.status === 'no_program' ? <NoProgram />
        : l.status === 'ok' && l.program ? <>
            <Programme program={l.program} />
            <Activity state={l} from={from} to={to} />
            <Members state={l} program={l.program} />
          </> : null}

      {g?.status === 'ok' && <GiftCardsSection data={g} members={l?.members ?? []} />}
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

function GiftCardsSection({ data, members }: { data: GiftCards; members: LoyaltyMember[] }) {
  const [selling, setSelling] = useState(false)
  const table = (): ExportTable => ({
    title: t('Gift cards'), filename: `gift-cards-${today()}`,
    columns: [t('Card'), t('Balance'), t('State'), t('Sold'), t('Customer')],
    rows: data.cards.map(c => [`•••• ${c.last4}`, c.balance, t(STATE_LABEL[c.state]), c.created_at.slice(0, 10), c.customer ?? '']),
    footer: [t('Owed on active cards'), giftCardTotals(data, today().slice(0, 7)).outstanding, '', '', ''],
    money: [1],
  })
  return (
    <Card component="section" aria-label={t('Gift cards')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Stack direction="row" spacing={1}>
          <ExportButton table={table} disabled={!data.cards.length} folder="Sales" />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSelling(true)}>{t('Sell a gift card')}</Button>
        </Stack>}>{t('Gift cards')}</SectionTitle>
        {!data.cards.length ? <Empty>{t('No gift cards yet. Sell one here, or at the till.')}</Empty> : (
          <Box sx={{ overflowX: 'auto', mb: 3 }}>
            <Table size="small" aria-label={t('Gift cards')}>
              <TableHead><TableRow>
                <TableCell>{t('Card')}</TableCell><TableCell align="right">{t('Balance')}</TableCell><TableCell>{t('State')}</TableCell>
                <TableCell>{t('Sold')}</TableCell><TableCell>{t('Customer')}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {data.cards.map(c => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>•••• {c.last4}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.balance)}</TableCell>
                    <TableCell><Tag {...(c.state === 'ACTIVE' ? { fg: tokens.goodFg, bg: tokens.goodBg } : {})}>{t(STATE_LABEL[c.state])}</Tag></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(c.created_at)}</TableCell>
                    <TableCell>{c.customer ?? '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Recent gift card activity')}</Typography>
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
        <Button size="small" endIcon={<OpenIcon />} href={SQUARE_GIFT_CARDS} target="_blank" rel="noopener" sx={{ mt: 2 }}>{t('Gift cards in Square')}</Button>
      </CardContent>
      {selling && <SellDialog members={members} onClose={() => setSelling(false)} />}
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
