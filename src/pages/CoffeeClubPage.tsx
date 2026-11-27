import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, InputAdornment,
  Link, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { useConnected } from '../app/connected'
import { DecimalField, Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { QrPicture, useQrLook } from '../components/QrCode'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  CLUB_DEFAULTS, CLUB_HOURS_DEFAULT, cardCodeText, clubInputProblem, clubTotals, hoursText, standing,
  type ClubCoffee, type ClubHours, type ClubMember, type ClubProblem, type CoffeeClubInput, type CoffeeClubState, type Standing,
} from '../../shared/coffeeClub'
import { WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../shared/themeDays'
import { SQUARE_LOYALTY_SETUP } from '../../shared/loyalty'
import { tokens } from '../theme'
import { currentLanguage, msg, t } from '../i18n'

const STANDING: Record<Standing, { label: string; fg: string; bg: string }> = {
  active: { label: msg('Active'), fg: tokens.goodFg, bg: tokens.goodBg },
  ending: { label: msg('Ending'), fg: tokens.infoFg, bg: tokens.infoBg },
  pending: { label: msg('Starting'), fg: tokens.infoFg, bg: tokens.infoBg },
  paused: { label: msg('Paused'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  payment_failed: { label: msg('Payment failed'), fg: tokens.badFg, bg: tokens.badBg },
  ended: { label: msg('Ended'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const PROBLEM: Record<ClubProblem, string> = {
  no_customer: msg('Nobody was added to the sale, so it couldn’t be counted against a member'),
  not_member: msg('The customer added to the sale isn’t a member'),
  not_paid: msg('The member’s payment had failed, or the membership wasn’t active'),
  over_limit: msg('The member had already had this week’s coffees'),
  outside_hours: msg('It was given outside the free coffee’s hours'),
}
const day = (date: string | null) => (date ? formatLocal(`${date}T12:00:00Z`, 'd MMM yyyy') : '–')
const when = (iso: string | null) => (iso ? formatLocal(iso, 'd MMM, HH:mm') : '–')
const memberName = (m: Pick<ClubMember, 'name'>) => m.name ?? t('A Square customer')
const NOT_PHONE = { display: { xs: 'none', sm: 'table-cell' } }
const WIDE = { display: { xs: 'none', md: 'table-cell' } }

/**
 * The coffee club: a monthly membership customers join on Square's checkout page, worth so many free coffees a
 * week. Square charges them each month; the app counts each coffee the team gives on the till and keeps a line
 * on the member's Square customer note saying whether this week's is there to have. Not set up: how it works and
 * the form that makes it in Square. Set up: the sign-up page and its QR code, what to do at the till, coffees that
 * didn't count, the members and the settings. Admins only, while Square is connected.
 */
export function CoffeeClubPage() {
  const { api } = useApp()
  const square = useConnected('square')
  const run = useAction()
  const state = useAsync('coffee-club', () => (square ? api.coffeeClub() : Promise.resolve(null)), [square])
  if (square === null) return <Loading />
  if (!square) return <Navigate to="/connections" replace />
  const s = state.data
  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Coffee club')} actions={s?.club ? (
        <Button startIcon={<RefreshIcon />} onClick={() => void run(() => api.syncCoffeeClub(), t('Checked Square'))}>{t('Check Square now')}</Button>
      ) : undefined} />
      <ErrorBox error={state.error} />
      {s?.status === 'reconnect' && <Reconnect />}
      {!s ? (state.loading ? <Loading /> : null) : s.club ? <Club state={s} /> : <SetUp />}
    </>
  )
}

function Reconnect() {
  const { api } = useApp()
  const run = useAction()
  return (
    <Alert severity="warning" sx={{ mb: 3 }}
      action={<Button color="inherit" onClick={() => void run(() => api.connectApp('square', 'connections'))}>{t('Connect Square again')}</Button>}>
      {t('Reconnect Square to allow the coffee club. Square was connected before the app asked for subscriptions; nothing else changes.')}
    </Alert>
  )
}

/** How it works, for someone deciding: Square takes the money, the app counts the coffees. */
function HowItWorks() {
  return (
    <Card component="section" aria-label={t('How the coffee club works')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('How it works')}</SectionTitle>
        <Box component="ol" sx={{ pl: 2.5, m: 0, '& li': { mb: 1 } }}>
          <li>{t('Customers join on Square’s own checkout page, from your website or a QR code at the counter. Square keeps their card and charges it every month.')}</li>
          <li>{t('At the till, add the member to the sale and apply the club’s discount to their drink. Their Square note says whether this week’s coffee is still there to have.')}</li>
          <li>{t('The app counts each coffee, resets the count every Monday and lists any coffee that didn’t count, for you to look at.')}</li>
        </Box>
        <Typography variant="body2" sx={{ mt: 1, color: tokens.inkSoft }}>
          {t('No Square Loyalty or Square Online plan is needed: Square charges only its usual card fee on each month’s payment.')}
        </Typography>
      </CardContent>
    </Card>
  )
}

function SetUp() {
  return (
    <>
      <HowItWorks />
      <ClubForm initial={{ ...CLUB_DEFAULTS, till_language: currentLanguage() === 'es' ? 'es' : 'en' }} first />
    </>
  )
}

/** The club's settings: making it in Square the first time, changing it after. */
function ClubForm({ initial, first }: { initial: CoffeeClubInput; first?: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [v, setV] = useState<CoffeeClubInput>(initial)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<CoffeeClubInput>) => setV(x => ({ ...x, ...patch }))
  const problem = clubInputProblem(v)
  const changed = JSON.stringify(v) !== JSON.stringify(initial)
  const save = async () => {
    setBusy(true)
    await run(() => api.saveCoffeeClub(v, crypto.randomUUID()), first ? t('The coffee club is set up in Square') : t('Club settings saved'), { fresh: true })
    setBusy(false)
  }
  return (
    <Card component="section" aria-label={first ? t('Set up the coffee club') : t('Club settings')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{first ? t('Set up the coffee club') : t('Club settings')}</SectionTitle>
        <Stack spacing={2} sx={{ maxWidth: 520 }}>
          <TextField label={t('Name')} value={v.name} onChange={e => set({ name: e.target.value })} helperText={t('On the checkout page, the discount on the till and the note')} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DecimalField label={t('Price a month')} value={v.price} onNumber={n => set({ price: n ?? 0 })} fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
            <TextField select label={t('Coffees a week')} value={v.coffees_per_week} onChange={e => set({ coffees_per_week: Number(e.target.value) })} fullWidth>
              {Array.from({ length: 14 }, (_, i) => i + 1).map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
            </TextField>
          </Stack>
          <DecimalField label={t('Most off one drink')} value={v.max_value} onNumber={n => set({ max_value: n ?? 0 })}
            helperText={t('The discount makes the drink free, up to this much, so it can’t be used on a lunch')}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          <TextField select label={t('Note on the till in')} value={v.till_language} onChange={e => set({ till_language: e.target.value as CoffeeClubInput['till_language'] })}>
            <MenuItem value="en">{'English'}</MenuItem>
            <MenuItem value="es">{'Español'}</MenuItem>
          </TextField>
          {!first && (
            <FormControlLabel control={<Switch checked={v.selling} onChange={e => set({ selling: e.target.checked })} />}
              label={t('Taking new members (the sign-up page is up)')} />
          )}
          <FormControlLabel control={<Switch checked={v.auto_discount} onChange={e => set({ auto_discount: e.target.checked })} />}
            label={t('Square takes the free coffee off by itself')} />
          {v.auto_discount && <AutoDrinks chosen={v.auto_category_ids} onChange={ids => set({ auto_category_ids: ids })} />}
          <FormControlLabel control={<Switch checked={!!v.hours} onChange={e => set({ hours: e.target.checked ? initial.hours ?? CLUB_HOURS_DEFAULT : null })} />}
            label={t('Free coffee only at set times')} />
          {v.hours && <HoursFields hours={v.hours} onChange={hours => set({ hours })} />}
          {!first && v.price !== initial.price && (
            <Alert severity="info">{t('A new price makes a new sign-up page. Members who joined already keep paying what they joined at.')}</Alert>
          )}
          {problem && (changed || first) && <Typography variant="body2" sx={{ color: tokens.badFg }}>{t(problem)}</Typography>}
          <Box>
            <Button variant="contained" disabled={!!problem || busy || (!first && !changed)} onClick={() => void save()}>
              {first ? t('Set up in Square') : t('Save')}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

/** When the free coffee can be had: from and to (the café's own time), on the days chosen. */
function HoursFields({ hours: h, onChange }: { hours: ClubHours; onChange: (h: ClubHours) => void }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5}>
        <TextField type="time" label={t('From')} value={h.from} onChange={e => onChange({ ...h, from: e.target.value })} sx={{ flex: 1 }}
          slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="time" label={t('Until')} value={h.to} onChange={e => onChange({ ...h, to: e.target.value })} sx={{ flex: 1 }}
          slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      <Box>
        <ToggleButtonGroup size="small" value={h.days} aria-label={t('Days')} sx={{ flexWrap: 'wrap' }}
          onChange={(_, days: number[]) => { if (days.length) onChange({ ...h, days: [...days].sort() }) }}>
          {WEEKDAYS.map(w => <ToggleButton key={w} value={w} aria-label={t(WEEKDAY_NAMES[w - 1])} sx={{ px: 1.5 }}>{t(WEEKDAY_SHORT[w - 1])}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>
      <Typography variant="body2" sx={{ color: tokens.inkSoft }}>
        {t('Outside these times the member pays as usual: Square doesn’t take the coffee off, and their note on the till says the times. A coffee given with the club’s discount outside them is listed for you to look at.')}
      </Typography>
    </Stack>
  )
}

/**
 * The drinks Square takes off by itself: categories of the Square item library, read from Square. One drink a sale,
 * for a member who's due their coffee, up to the most off a drink.
 */
function AutoDrinks({ chosen, onChange }: { chosen: string[]; onChange: (ids: string[]) => void }) {
  const { api } = useApp()
  const categories = useAsync('club-categories', () => api.coffeeClubCategories(), [])
  const names = new Map((categories.data ?? []).map(c => [c.id, c.name]))
  return (
    <Box>
      <TextField select fullWidth label={t('Drinks it covers')} value={chosen}
        onChange={e => onChange(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as string[])}
        helperText={categories.error ?? t('Square makes one of these free by itself when a member who’s due their coffee is added to the sale, up to the most off a drink. The team’s own discount stays, for when it’s needed.')}
        error={!!categories.error}
        slotProps={{ select: { multiple: true, renderValue: v => (v as string[]).map(id => names.get(id) ?? id).join(', ') } }}>
        {(categories.data ?? []).map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </TextField>
    </Box>
  )
}

function Club({ state: s }: { state: CoffeeClubState }) {
  const club = s.club!
  const totals = clubTotals(s, today().slice(0, 7))
  const problems = s.coffees.filter(c => c.problem && !c.sorted_at)
  return (
    <>
      <StatGrid>
        <StatTile label={t('Members')} value={totals.members} note={t('{money} a month', { money: formatMoney(totals.monthly) })} />
        <StatTile label={t('Coffees this week')} value={totals.week} note={t('{n} a week each', { n: club.coffees_per_week })} />
        <StatTile label={t('Coffees this month')} value={totals.month_coffees} note={t('{money} at till prices', { money: formatMoney(totals.month_value) })} />
      </StatGrid>
      {problems.length > 0 && <Problems coffees={problems} />}
      <SignUp url={club.signup_url} />
      <AtTheTill name={club.name} auto={club.auto_discount} hours={club.hours} />
      <TapToCheckIn program={s.loyalty_program} members={s.members} />
      <Members members={s.members} perWeek={club.coffees_per_week} />
      <Latest coffees={s.coffees.filter(c => !c.problem || c.sorted_at).slice(0, 15)} />
      <ClubForm key={JSON.stringify(club)} initial={{
        name: club.name, price: club.price, coffees_per_week: club.coffees_per_week, max_value: club.max_value, till_language: club.till_language, selling: club.selling,
        auto_discount: club.auto_discount, auto_category_ids: club.auto_category_ids, hours: club.hours,
      }} />
    </>
  )
}

/** Coffees given with the club's discount that didn't count, for an admin to look at and mark sorted. */
function Problems({ coffees }: { coffees: ClubCoffee[] }) {
  const { api } = useApp()
  const run = useAction()
  return (
    <Card component="section" aria-label={t('Coffees to look at')} sx={{ mb: 3, borderColor: tokens.badFg }}>
      <CardContent>
        <SectionTitle>{t('Coffees to look at')}</SectionTitle>
        <Typography variant="body2" sx={{ mb: 2, color: tokens.inkSoft }}>
          {t('The club’s discount was used on these, but they couldn’t be counted as a member’s coffee. Check with the team, then mark each one sorted.')}
        </Typography>
        <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {coffees.map(c => (
            <Box component="li" key={c.id} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>{[when(c.at), c.item, c.name].filter(Boolean).join(' · ')}</Typography>
                <Typography variant="body2" sx={{ color: tokens.inkSoft }}>{t(PROBLEM[c.problem!])}</Typography>
              </Box>
              <Button size="small" onClick={() => void run(() => api.sortClubCoffee(c.id), t('Marked sorted'))}>{t('Sorted')}</Button>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** The sign-up page: its link to copy or open, and its QR code for the counter. */
function SignUp({ url }: { url: string | null }) {
  const notify = useNotify()
  const look = useQrLook()
  return (
    <Card component="section" aria-label={t('Sign-up page')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Sign-up page')}</SectionTitle>
        {url ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: { sm: 'center' } }}>
            <Box sx={{ flexShrink: 0 }}>
              <QrPicture payload={url} look={look({ dark_colour: null, light_colour: null, logo: true })} size={140} label={t('QR code for the sign-up page')} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ mb: 1 }}>{t('Customers join here and pay the first month; Square charges them every month after. Link to it from your website and print the QR code for the counter.')}</Typography>
              <Link href={url} target="_blank" rel="noopener" sx={{ wordBreak: 'break-all' }}>{url}</Link>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <Button size="small" startIcon={<CopyIcon />} onClick={() => void navigator.clipboard?.writeText(url).then(() => notify(t('Link copied'), 'success'))}>{t('Copy link')}</Button>
                <Button size="small" startIcon={<OpenIcon />} href={url} target="_blank" rel="noopener">{t('Open')}</Button>
              </Stack>
            </Box>
          </Stack>
        ) : (
          <Typography>{t('Not taking new members: the sign-up page is down. Members stay members. Switch it back on in the club settings below.')}</Typography>
        )}
      </CardContent>
    </Card>
  )
}

/** What the team does on the Square till, to show them: with Square taking the coffee off by itself, one step fewer. */
function AtTheTill({ name, auto, hours }: { name: string; auto: boolean; hours: ClubHours | null }) {
  return (
    <Card component="section" aria-label={t('At the till')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('At the till')}</SectionTitle>
        <Box component="ol" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75 } }}>
          <li>{t('Ring up the order as usual.')}</li>
          <li>{t('Add the member to the sale: they tap their iPhone on the customer display (their Square Loyalty pass), or tap Add customer and find them by name (their pass on your website shows it).')}</li>
          {auto ? (
            <li>{t('If this week’s coffee is due, Square takes one drink off by itself. If it doesn’t, they’ve had it: charge as usual.')}</li>
          ) : (
            <>
              <li>{t('Read the first line of their note: it says whether this week’s coffee is still there to have.')}</li>
              <li>{t('Apply the “{name}” discount to the drink, and charge anything else as usual.', { name })}</li>
            </>
          )}
        </Box>
        {hours && (
          <Typography sx={{ mt: 1 }}>
            {t('The free coffee is only from {hours}. Outside then, charge the drink as usual.', { hours: hoursText(hours, currentLanguage() === 'es' ? 'es' : 'en') })}
          </Typography>
        )}
        <Typography variant="body2" sx={{ mt: 1, color: tokens.inkSoft }}>
          {t('The note changes within a minute of the sale, and every Monday for the new week.')}
        </Typography>
      </CardContent>
    </Card>
  )
}

/**
 * Square Loyalty's Apple Wallet pass: a member who has joined the programme taps their iPhone on the till's customer
 * display and Square adds them to the sale, so their club line shows without a name said. Without a programme, how to
 * set one up in Square (a paid add-on); with one, how many members have joined it. Nothing when Square can't say.
 */
function TapToCheckIn({ program, members }: { program: boolean | null; members: ClubMember[] }) {
  if (program === null) return null
  const live = members.filter(m => standing(m) !== 'ended')
  const joined = live.filter(m => m.loyalty).length
  return (
    <Card component="section" aria-label={t('Tap to check in')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Tap to check in')}</SectionTitle>
        {program ? (
          <>
            <Typography sx={{ mb: 1.5 }}>
              {t('{joined} of {members} members can tap their iPhone on the customer display to be added to the sale.', { joined, members: live.length })}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.inkSoft }}>
              {t('A member joins your loyalty programme once, by typing their phone number on the customer display when they pay. Square texts them a link, and on an iPhone they’re offered the pass for Apple Wallet.')}
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ mb: 1.5 }}>
              {t('With Square Loyalty (a paid Square add-on), members can keep a pass in Apple Wallet and tap their iPhone on the customer display: Square adds them to the sale, so their club line shows without anyone saying a name.')}
            </Typography>
            <Box component="ol" sx={{ pl: 2.5, m: 0, mb: 2, '& li': { mb: 0.75 } }}>
              <li>{t('In the Square Dashboard, open Loyalty, subscribe and create a programme (a stamp a visit works well for a café).')}</li>
              <li>{t('In Loyalty’s Settings, turn on the digital pass (Apple Wallet).')}</li>
              <li>{t('On the Square Register: Settings → Loyalty, turn on Enable Loyalty and Show check-in screen at start of transaction; turn off Skip receipt screen and Automatically print receipts.')}</li>
            </Box>
            <Button variant="outlined" endIcon={<OpenIcon />} href={SQUARE_LOYALTY_SETUP} target="_blank" rel="noopener">{t('Open Square Loyalty')}</Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Members({ members, perWeek }: { members: ClubMember[]; perWeek: number }) {
  const { api } = useApp()
  const run = useAction()
  const [ending, setEnding] = useState<ClubMember | null>(null)
  const order: Standing[] = ['payment_failed', 'active', 'ending', 'pending', 'paused', 'ended']
  const sorted = [...members].sort((a, b) => order.indexOf(standing(a)) - order.indexOf(standing(b)) || memberName(a).localeCompare(memberName(b)))
  return (
    <Card component="section" aria-label={t('Members')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Members')}</SectionTitle>
        {!members.length ? <Empty>{t('No members yet. Share the sign-up page: whoever joins shows here within a few minutes.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Members')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Member')}</TableCell>
                  <TableCell>{t('This week')}</TableCell>
                  <TableCell sx={NOT_PHONE}>{t('Last coffee')}</TableCell>
                  <TableCell sx={WIDE}>{t('Since')}</TableCell>
                  <TableCell sx={WIDE}>{t('Coffees')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map(m => {
                  const st = standing(m), look = STANDING[st]
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>{memberName(m)}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Tag fg={look.fg} bg={look.bg}>{t(look.label)}</Tag>
                          {m.loyalty && st !== 'ended' && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Can tap to check in')}</Tag>}
                          {st === 'ending' && <Typography variant="caption">{t('until {date}', { date: day(m.ends_on) })}</Typography>}
                          {st === 'pending' && <Typography variant="caption">{t('from {date}', { date: day(m.started_on) })}</Typography>}
                          {m.card_code && st !== 'ended' && <Typography variant="caption" sx={{ color: tokens.inkSoft }}>{t('Code {code}', { code: cardCodeText(m.card_code) })}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell>{st === 'ended' ? '–' : t('{used} of {n}', { used: m.used_this_week, n: perWeek })}</TableCell>
                      <TableCell sx={NOT_PHONE}>{when(m.last_coffee)}</TableCell>
                      <TableCell sx={WIDE}>{day(m.started_on)}</TableCell>
                      <TableCell sx={WIDE}>{m.coffees}</TableCell>
                      <TableCell align="right">
                        {(st !== 'ended' && st !== 'ending') && (
                          <Button size="small" color="error" onClick={() => setEnding(m)} aria-label={t('End {name}’s membership', { name: memberName(m) })}>{t('End')}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      <Dialog open={!!ending} onClose={() => setEnding(null)}>
        <DialogTitle>{t('End {name}’s membership?', { name: ending ? memberName(ending) : '' })}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('Square stops charging them at the end of the month they’ve paid for, and their coffees count until then.')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnding(null)}>{t('Keep it')}</Button>
          <Button color="error" variant="contained" onClick={() => {
            const m = ending!
            setEnding(null)
            void run(() => api.cancelClubMember(m.id), t('Membership ending'))
          }}>{t('End membership')}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

/** The latest coffees counted, newest first. */
function Latest({ coffees }: { coffees: ClubCoffee[] }) {
  if (!coffees.length) return null
  return (
    <Card component="section" aria-label={t('Latest coffees')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Latest coffees')}</SectionTitle>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Latest coffees')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('When')}</TableCell>
                <TableCell>{t('Member')}</TableCell>
                <TableCell sx={NOT_PHONE}>{t('Drink')}</TableCell>
                <TableCell align="right" sx={NOT_PHONE}>{t('Value')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coffees.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{when(c.at)}</TableCell>
                  <TableCell>{c.name ?? '–'}</TableCell>
                  <TableCell sx={NOT_PHONE}>{c.item ?? '–'}{c.quantity > 1 ? ` × ${c.quantity}` : ''}</TableCell>
                  <TableCell align="right" sx={NOT_PHONE}>{formatMoney(c.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}
