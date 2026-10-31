import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, ListItemIcon, ListItemText, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EarlierIcon from '@mui/icons-material/ChevronLeftRounded'
import LaterIcon from '@mui/icons-material/ChevronRightRounded'
import SavingsIcon from '@mui/icons-material/SavingsOutlined'
import BuyIcon from '@mui/icons-material/ShoppingBagOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { useBreakevenMonths } from '../app/kittyShare'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { GOAL_ICON, KittyJar, jarStyles } from '../components/KittyJar'
import {
  GOAL_ICONS, KITTY_IDEAS, addMonths, fillJars, forecast, kittyBalance, monthlyPace, monthsNotPaidIn, profitShare,
  type Forecast, type GoalIcon, type Jar, type KittyEntry, type KittyGoal, type KittyGoalInput,
} from '../../shared/kitty'
import { formatLocal, formatMoney, localDate, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t, tn, tr } from '../i18n'

const monthName = (m: string, pattern = 'MMMM yyyy') => formatLocal(`${m.slice(0, 7)}-15T12:00:00Z`, pattern)
const dayName = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
/** Goals added from the ideas or seeded in English show in the person's language; ones typed in show as typed. */
const goalName = (g: Pick<KittyGoal, 'name'>) => t(g.name)
const entryLabel = (e: KittyEntry) => e.kind === 'profit'
  ? t('{percent}% of what was taken above breakeven in {month}', { percent: e.percent ?? 0, month: monthName(e.month!) })
  : e.note ?? (e.kind === 'top_up' ? t('Put in') : t('Adjustment'))

/**
 * Staff kitty: a share (10% to start) of everything the café takes above its breakeven, day by day, put
 * aside for the team and saved up for goals chosen together (the Christmas party, a pair of Ray-Bans for
 * the café…). A day's breakeven is what it costs to run the café that day: the running costs on Finances
 * spread over the open days, plus the team on the rota (shared/dailyCost.ts). The goals fill in order,
 * like jars on a shelf, and buying one takes what it cost out. The whole team sees it; admins set the
 * share, add goals, put each month's share in and mark goals bought. The database enforces the same.
 */
export function KittyPage() {
  const { api, isAdmin } = useApp()
  const settings = useAsync('kitty-settings', () => api.kittySettings(), [])
  const goals = useAsync('kitty-goals', () => api.kittyGoals(), [])
  const entries = useAsync('kitty-entries', () => api.kittyEntries(), [])
  const run = useAction()
  const [editing, setEditing] = useState<KittyGoalInput | null>(null)
  const [buying, setBuying] = useState<Jar | null>(null)
  const [money, setMoney] = useState<{ month?: string; over?: number | null } | null>(null)
  const [sharing, setSharing] = useState(false)

  const now = today()
  const thisMonth = now.slice(0, 7)
  const allGoals = goals.data ?? []
  const ins = entries.data ?? []
  const percent = settings.data?.profit_percent ?? 0
  const balance = kittyBalance(ins, allGoals)
  const jars = fillJars(allGoals, balance)
  const open = jars.filter(j => !j.bought)
  const bought = jars.filter(j => j.bought)
  const pace = monthlyPace(ins, now)
  const plan = forecast(jars, pace, now)
  const target = open.reduce((a, j) => a + j.goal.target, 0)
  const saved = open.reduce((a, j) => a + j.saved, 0)
  const next = open.find(j => !j.full)

  // The months whose share is still to go in: last month, and the two before it once the kitty has started.
  const firstShare = ins.filter(e => e.kind === 'profit' && e.month).map(e => e.month!.slice(0, 7)).sort()[0]
  const candidates = [3, 2, 1].map(n => addMonths(thisMonth, -n)).filter(m => m === addMonths(thisMonth, -1) || (firstShare && m >= firstShare))
  const due = isAdmin && entries.data ? monthsNotPaidIn(candidates, ins) : []
  // What was taken above breakeven: the months still to put in, and this month so far.
  const breakeven = useBreakevenMonths([...new Set([...due, thisMonth])].sort())
  const soFar = breakeven.byMonth.get(thisMonth)

  const move = (j: Jar, by: number) => {
    const order = open.map(x => x.goal.id)
    const i = order.indexOf(j.goal.id)
    const k = i + by
    if (k < 0 || k >= order.length) return
    ;[order[i], order[k]] = [order[k], order[i]]
    void run(() => api.orderKittyGoals(order), t('{name} moved', { name: goalName(j.goal) }))
  }
  const named = new Set(allGoals.map(g => goalName(g).toLowerCase()))
  const ideas = KITTY_IDEAS.filter(i => !named.has(t(i.name).toLowerCase()))
  const lines = [
    ...ins.map(e => ({ id: e.id, on: localDate(e.created_at), label: entryLabel(e), amount: e.amount, entry: e })),
    ...bought.map(j => ({ id: j.goal.id, on: j.goal.bought_on!, label: t('Bought: {name}', { name: goalName(j.goal) }), amount: -(j.goal.spent ?? 0), entry: null })),
  ].sort((a, b) => b.on.localeCompare(a.on))

  return (
    <Box sx={jarStyles}>
      <PageHeader eyebrow={t('Team')} title={t('Staff kitty')} actions={isAdmin && <>
        <Button variant="outlined" startIcon={<SavingsIcon />} onClick={() => setMoney({})}>{t('Put money in')}</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', icon: 'gift', target: 100 })}>{t('Add a goal')}</Button>
      </>} />
      <ErrorBox error={settings.error ?? goals.error ?? entries.error} />

      <Card component="section" aria-label={t('In the kitty')} sx={{ mb: 3, bgcolor: tokens.espresso, color: '#FBF8F4', backgroundImage: 'radial-gradient(600px 260px at 85% 0%, rgba(247,155,164,0.28), transparent 70%), radial-gradient(500px 240px at 0% 100%, rgba(183,163,216,0.18), transparent 70%)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 5 }} sx={{ alignItems: { md: 'center' } }}>
            <Box sx={{ flex: '0 0 auto' }}>
              <Typography variant="overline" sx={{ color: '#F79BA4' }}>{t('In the kitty')}</Typography>
              <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '2.6rem', md: '3.4rem' }, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {entries.data && goals.data ? formatMoney(balance) : '–'}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 1 }}>
                <Typography sx={{ color: '#FBF8F4', fontWeight: 600 }}>
                  {tr('{share} of everything taken above breakeven goes in', { share: <Box component="span" sx={{ color: '#F79BA4', fontSize: '1.15em' }}>{`${percent}%`}</Box> })}
                </Typography>
                {isAdmin && <IconButton size="small" onClick={() => setSharing(true)} aria-label={t('Change the share over breakeven')} sx={{ color: 'rgba(251,248,244,0.82)' }}><EditIcon fontSize="small" /></IconButton>}
              </Stack>
              <Typography variant="body2" sx={{ color: 'rgba(251,248,244,0.75)', maxWidth: 420 }}>
                {breakeven.perDay
                  ? t('Breakeven: about {amount} a day, what it costs to run the café (running costs {fixed} + the team on the rota {team}).', {
                    amount: formatMoney(breakeven.perDay.total), fixed: formatMoney(breakeven.perDay.fixed), team: formatMoney(breakeven.perDay.team) })
                  : t('Breakeven: what it costs to run the café each day, the running costs plus the team on the rota.')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(251,248,244,0.65)' }}>
                {pace > 0 ? t('About {amount} a month lately', { amount: formatMoney(pace) }) : t('Nothing has gone in yet')}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {open.length > 0 && <>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1, gap: 2 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(251,248,244,0.82)' }}>{t('Saved for every goal')}</Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{t('{saved} of {target}', { saved: formatMoney(saved), target: formatMoney(target) })}</Typography>
                </Stack>
                <Box role="img" aria-label={t('{saved} of {target}', { saved: formatMoney(saved), target: formatMoney(target) })}
                  sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: 'rgba(251,248,244,0.12)', gap: '2px' }}>
                  {open.map((j, i) => (
                    <Box key={j.goal.id} sx={{ flex: `${j.goal.target} 1 0`, bgcolor: 'rgba(251,248,244,0.08)', position: 'relative' }}>
                      <Box sx={{ position: 'absolute', inset: 0, width: `${j.share * 100}%`, bgcolor: [tokens.rose, '#B7A3D8', '#95BA78'][i % 3],
                        transition: 'width 1.2s cubic-bezier(.2,.8,.2,1)' }} />
                    </Box>
                  ))}
                </Box>
                <Typography variant="body2" sx={{ mt: 1.25, color: 'rgba(251,248,244,0.82)' }}>
                  {next ? t('Next up: {name}, {left} to go', { name: goalName(next.goal), left: formatMoney(next.goal.target - next.saved) }) : t('Every jar is full: time to buy!')}
                </Typography>
              </>}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {breakeven.on && breakeven.ready && breakeven.till && soFar && soFar.rows.length > 0 && (
        <Card component="section" aria-label={t('Above breakeven this month')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Above breakeven this month')}</SectionTitle>
            <Box role="list" aria-label={t('At a glance')} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
              {[
                { label: t('Days above breakeven'), value: t('{n} of {days}', { n: soFar.daysOver, days: soFar.rows.length }) },
                { label: t('Taken above breakeven'), value: formatMoney(soFar.over) },
                { label: t('{percent}% for the kitty so far', { percent }), value: formatMoney(profitShare(soFar.over, percent)), strong: true },
              ].map(x => (
                <Box key={x.label} role="listitem" sx={{ p: 1.5, borderRadius: '12px', bgcolor: x.strong ? tokens.roseSoft : tokens.surfaceAlt }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{x.label}</Typography>
                  <Typography sx={{ fontFamily: fonts.display, fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums', color: x.strong ? tokens.roseDeep : 'text.primary' }}>{x.value}</Typography>
                </Box>
              ))}
            </Box>
            {/* Each day so far: its takings against its breakeven; the part above goes 10% to the kitty. */}
            <Stack spacing={0.5} aria-label={t('Each day against its breakeven')} role="list">
              {soFar.rows.slice(-14).map(r => {
                const top = Math.max(r.takings, r.breakeven, 1)
                return (
                  <Stack key={r.date} role="listitem" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}
                    aria-label={t('{day}: took {takings}, breakeven {breakeven}', { day: dayName(r.date), takings: formatMoney(r.takings), breakeven: formatMoney(r.breakeven) })}>
                    <Typography variant="caption" sx={{ width: 74, flexShrink: 0, color: 'text.secondary' }}>{formatLocal(`${r.date}T12:00:00Z`, 'EEE d')}</Typography>
                    <Box sx={{ position: 'relative', flex: 1, height: 12, borderRadius: 6, bgcolor: 'divider', overflow: 'hidden' }}>
                      <Box sx={{ position: 'absolute', inset: 0, width: `${Math.min(r.takings, r.breakeven) / top * 100}%`, bgcolor: tokens.inkFaint, opacity: 0.45 }} />
                      {r.over > 0 && <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${r.breakeven / top * 100}%`, width: `${r.over / top * 100}%`, bgcolor: tokens.rose }} />}
                      <Box sx={{ position: 'absolute', top: -2, bottom: -2, left: `${r.breakeven / top * 100}%`, width: 2, bgcolor: tokens.danger }} />
                    </Box>
                    <Typography variant="caption" sx={{ width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.over > 0 ? tokens.roseDeep : 'text.secondary', fontWeight: r.over > 0 ? 600 : 400 }}>
                      {r.over > 0 ? `+${formatMoney(profitShare(r.over, percent))}` : t('below')}
                    </Typography>
                  </Stack>
                )
              })}
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              {t('Grey: up to the day’s breakeven (the red mark). Pink: taken above it, of which {percent}% goes in the kitty.', { percent })}
              {soFar.estimated ? ` ${t('Days without a costed rota use the Staff wages estimate on Finances.')}` : ''}
            </Typography>
          </CardContent>
        </Card>
      )}

      {due.length > 0 && (
        <Card component="section" aria-label={t('This month’s share')} sx={{ mb: 3, borderLeft: `4px solid ${tokens.rose}` }}>
          <CardContent>
            <SectionTitle>{tn(due.length, 'A month’s share to put in', '{n} months’ shares to put in')}</SectionTitle>
            <Stack spacing={1}>
              {due.map(m => {
                const b = breakeven.byMonth.get(m)
                const p = b && breakeven.till ? b.over : undefined
                const share = p === undefined ? null : profitShare(p, percent)
                return (
                  <Stack key={m} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} role="group" aria-label={monthName(m)}
                    sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>{monthName(m)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {p !== undefined && b
                          ? (p > 0 ? t('{over} taken above breakeven on {days} of {open} days, {percent}%: {share}', { over: formatMoney(p), days: b.daysOver, open: b.rows.length, percent, share: formatMoney(share!) })
                            : t('No day took more than its breakeven: nothing goes in this time'))
                          : breakeven.on && breakeven.ready && !breakeven.till ? t('No takings to count yet: connect the till, or type what was taken above breakeven.')
                          : breakeven.on ? t('Working out the takings above breakeven…') : t('Type what was taken above breakeven (admins with pay access see it worked out).')}
                      </Typography>
                    </Box>
                    {breakeven.on && breakeven.ready && !breakeven.till && <Button size="small" component={RouterLink} to="/connections">{t('Connect the till')}</Button>}
                    <Button size="small" variant="contained" disabled={p !== undefined && p <= 0} onClick={() => setMoney({ month: m, over: p ?? null })}>
                      {share ? t('Put {amount} in', { amount: formatMoney(share) }) : t('Put it in')}
                    </Button>
                  </Stack>
                )
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card component="section" aria-label={t('Saving up for')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Saving up for')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('The jars fill in order: the first until it’s full, then the next.')}
          </Typography>
          {open.length === 0
            ? <Empty>{goals.data ? (isAdmin ? t('Nothing to save for yet. Add a goal, or pick one of the ideas below.') : t('Nothing to save for yet.')) : t('Loading…')}</Empty>
            : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fit, minmax(190px, 1fr))' }, rowGap: 3 }}>
                {open.map((j, i) => <JarColumn key={j.goal.id} jar={j} place={i} count={open.length} plan={plan.get(j.goal.id)!} first={j === next}
                  onEdit={() => setEditing(j.goal)} onBuy={() => setBuying(j)} onMove={by => move(j, by)} />)}
              </Box>}
          {isAdmin && ideas.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Ideas')}</Typography>
              <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                {ideas.map(i => (
                  <Button key={i.name} size="small" variant="outlined" startIcon={GOAL_ICON[i.icon]({ fontSize: 'small' })}
                    onClick={() => setEditing({ name: t(i.name), icon: i.icon, target: i.target })}>{t(i.name)}</Button>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {bought.length > 0 && (
        <Card component="section" aria-label={t('Bought with the kitty')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Bought with the kitty')}</SectionTitle>
            <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: 'wrap' }}>
              {bought.map(j => (
                <Stack key={j.goal.id} component="article" aria-label={goalName(j.goal)} direction="row" spacing={1.5} sx={{ alignItems: 'center', pr: 2 }}>
                  <KittyJar share={1} icon={j.goal.icon} bought size={56} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{goalName(j.goal)}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('{amount} on {date}', { amount: formatMoney(j.goal.spent ?? 0), date: dayName(j.goal.bought_on!) })}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card component="section" aria-label={t('What’s gone in')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('What’s gone in')}</SectionTitle>
          {lines.length === 0
            ? <Empty>{entries.data ? t('Nothing yet. Each month’s share goes in once the month is over.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label={t('What’s gone in')}>
                  <TableHead><TableRow>
                    <TableCell>{t('Date')}</TableCell><TableCell>{t('What')}</TableCell><TableCell align="right">{t('Amount')}</TableCell>{isAdmin && <TableCell />}
                  </TableRow></TableHead>
                  <TableBody>
                    {lines.map(l => (
                      <TableRow key={l.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayName(l.on)}</TableCell>
                        <TableCell>{l.label}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: l.amount < 0 ? 'text.secondary' : tokens.matchaDeep }}>
                          {l.amount > 0 ? `+${formatMoney(l.amount)}` : formatMoney(l.amount)}
                        </TableCell>
                        {isAdmin && <TableCell align="right">
                          {l.entry && <IconButton size="small" aria-label={t('Take off {what}', { what: l.label })}
                            onClick={() => void run(() => api.deleteKittyEntry(l.entry!.id), t('Taken off'))}><DeleteIcon fontSize="small" /></IconButton>}
                        </TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {editing && <GoalDialog goal={editing} onClose={() => setEditing(null)} />}
      {buying && <BuyDialog jar={buying} balance={balance} onClose={() => setBuying(null)} />}
      {money && <MoneyDialog month={money.month} profit={money.over ?? null} percent={percent} balance={balance} goals={allGoals}
        paid={ins.filter(e => e.kind === 'profit' && e.month).map(e => e.month!.slice(0, 7))} onClose={() => setMoney(null)} />}
      {sharing && <ShareDialog percent={percent} onClose={() => setSharing(false)} />}
    </Box>
  )
}

/** When a jar is full, in words, at the pace money's been going in. */
function planText(j: Jar, f: Forecast, first: boolean) {
  if (j.full) return { text: t('Ready to buy'), tone: { fg: tokens.goodFg, bg: tokens.goodBg } }
  if (f.months === null) return { text: t('Waiting for money to go in'), tone: { fg: tokens.neutralFg, bg: tokens.neutralBg } }
  const due = j.goal.due_on ? dayName(j.goal.due_on) : null
  if (due && f.inTime === false) {
    return { text: f.perMonth ? t('Needs {amount} a month for {date}', { amount: formatMoney(f.perMonth), date: due }) : t('Won’t be full by {date}', { date: due }),
      tone: { fg: tokens.warnFg, bg: tokens.warnBg } }
  }
  if (due && f.inTime) return { text: t('In time for {date}', { date: due }), tone: { fg: tokens.goodFg, bg: tokens.goodBg } }
  return { text: first ? tn(f.months, 'Full in about a month', 'Full in about {n} months') : t('Full around {month}', { month: monthName(f.by!, 'MMM yyyy') }),
    tone: { fg: tokens.infoFg, bg: tokens.infoBg } }
}

/** One jar on the shelf: the picture, how full it is, when it'll be full; admins move, change or buy it. */
function JarColumn({ jar: j, place, count, plan, first, onEdit, onBuy, onMove }: {
  jar: Jar; place: number; count: number; plan: Forecast; first: boolean; onEdit: () => void; onBuy: () => void; onMove: (by: number) => void
}) {
  const { isAdmin } = useApp()
  const when = planText(j, plan, first)
  const name = goalName(j.goal)
  return (
    <Box component="article" aria-label={name} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 1 }}>
      <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', pb: '10px' }}>
        <KittyJar share={j.share} icon={j.goal.icon} full={j.full} size={128} />
        {/* The shelf: one plank along the row. */}
        <Box aria-hidden sx={{ position: 'absolute', left: -8, right: -8, bottom: 0, height: 12,
          background: 'linear-gradient(180deg, #C89B72 0%, #A87A52 55%, #8A6040 100%)', boxShadow: '0 6px 10px -6px rgba(60,35,20,0.55)' }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 1.5 }}>{name}</Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
        {t('{saved} of {target}', { saved: formatMoney(j.saved), target: formatMoney(j.goal.target) })} · {Math.floor(j.share * 100)}%
      </Typography>
      <Box sx={{ mt: 0.75 }}><Tag {...when.tone}>{when.text}</Tag></Box>
      {j.goal.notes && <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>{j.goal.notes}</Typography>}
      {isAdmin && (
        <Stack direction="row" spacing={0.25} sx={{ mt: 1, alignItems: 'center' }}>
          <IconButton size="small" disabled={place === 0} onClick={() => onMove(-1)} aria-label={t('Fill {name} sooner', { name })}><EarlierIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={onEdit} aria-label={t('Change {name}', { name })}><EditIcon fontSize="small" /></IconButton>
          <IconButton size="small" disabled={place === count - 1} onClick={() => onMove(1)} aria-label={t('Fill {name} later', { name })}><LaterIcon fontSize="small" /></IconButton>
          {j.full && <Button size="small" variant="contained" startIcon={<BuyIcon />} onClick={onBuy} aria-label={t('Buy {name}', { name })}>{t('Buy it')}</Button>}
        </Stack>
      )}
    </Box>
  )
}

/** A goal: what it is, its picture, what it costs and when it's wanted by. */
function GoalDialog({ goal, onClose }: { goal: KittyGoalInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [g, setG] = useState<KittyGoalInput>(goal)
  const [target, setTarget] = useState(String(goal.target ?? ''))
  const set = (p: Partial<KittyGoalInput>) => setG(x => ({ ...x, ...p }))
  const save = async () => {
    const value = Number(target.replace(',', '.'))
    const ok = await run(async () => {
      if (!g.name?.trim()) throw new Error(t('Give it a name'))
      if (!(value > 0)) throw new Error(t('Give what it costs'))
      if (g.link?.trim() && !/^https?:\/\/\S+$/i.test(g.link.trim())) throw new Error(t('The link has to start with https://'))
      await api.saveKittyGoal({ ...g, name: g.name.trim(), target: value, link: g.link?.trim() || null, due_on: g.due_on || null })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (g.id && await run(() => api.deleteKittyGoal(g.id!), t('Goal removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="goal-title">
      <DialogTitle id="goal-title">{g.id ? goalName({ name: goal.name ?? '' }) : t('Add a goal')}</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ pt: 1, alignItems: { sm: 'flex-start' } }}>
          <Box sx={{ alignSelf: 'center' }}><KittyJar share={0.6} icon={g.icon ?? 'gift'} size={110} /></Box>
          <Stack spacing={2} sx={{ flex: 1 }}>
            <TextField label={t('What for')} value={g.name ?? ''} onChange={e => set({ name: e.target.value })} required autoFocus={!g.id} />
            <TextField select label={t('Picture')} value={g.icon ?? 'gift'} onChange={e => set({ icon: e.target.value as GoalIcon })}>
              {GOAL_ICONS.map(i => (
                <MenuItem key={i.id} value={i.id}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <ListItemIcon sx={{ minWidth: 0 }}>{GOAL_ICON[i.id]({ fontSize: 'small' })}</ListItemIcon><ListItemText primary={t(i.label)} />
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={t('What it costs')} value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" sx={{ flex: 1 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
              <TextField label={t('Wanted by')} type="date" value={g.due_on ?? ''} onChange={e => set({ due_on: e.target.value || null })} sx={{ flex: 1 }}
                slotProps={{ inputLabel: { shrink: true } }} helperText={t('Optional')} />
            </Stack>
            <TextField label={t('Link')} value={g.link ?? ''} onChange={e => set({ link: e.target.value })} placeholder={'https://'} helperText={t('Where to buy it, or the restaurant')} />
            <TextField label={t('Notes')} value={g.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {g.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Bought: what it cost comes out of the kitty. */
function BuyDialog({ jar, balance, onClose }: { jar: Jar; balance: number; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [spent, setSpent] = useState(String(jar.goal.target))
  const [on, setOn] = useState(today())
  const name = goalName(jar.goal)
  const save = async () => {
    const value = Number(spent.replace(',', '.'))
    const ok = await run(async () => {
      if (!(value >= 0)) throw new Error(t('Give what it cost'))
      if (value > balance) throw new Error(t('The kitty has {amount}: put more in first', { amount: formatMoney(balance) }))
      await api.saveKittyGoal({ id: jar.goal.id, spent: value, bought_on: on })
    }, t('Enjoy it! {name} is bought', { name }))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="buy-title">
      <DialogTitle id="buy-title">{t('Buy {name}', { name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('What it cost comes out of the kitty ({amount} in it now).', { amount: formatMoney(balance) })}</Typography>
          <TextField label={t('What it cost')} value={spent} onChange={e => setSpent(e.target.value)} inputMode="decimal" autoFocus
            slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          <TextField label={t('Day')} type="date" value={on} onChange={e => e.target.value && setOn(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Bought')}</Button>
      </DialogActions>
    </Dialog>
  )
}

type MoneyKind = 'profit' | 'top_up' | 'adjust'

/** Money in: a month's share of what was taken above breakeven, anything else (the tips jar, a bonus), or a correction that takes some out. */
function MoneyDialog({ month, profit, percent, balance, goals, paid, onClose }: {
  month?: string; profit: number | null; percent: number; balance: number; goals: KittyGoal[]; paid: string[]; onClose: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [kind, setKind] = useState<MoneyKind>(month ? 'profit' : 'top_up')
  const [which, setWhich] = useState(month ?? addMonths(today().slice(0, 7), -1))
  const [profitText, setProfitText] = useState(profit !== null ? String(profit) : '')
  const [amountText, setAmountText] = useState(profit !== null ? String(profitShare(profit, percent)) : '')
  const [note, setNote] = useState('')
  const num = (s: string) => Number(s.replace(',', '.'))
  const amount = num(amountText) || 0
  const save = async () => {
    const value = kind === 'adjust' ? -Math.abs(amount) : amount
    const ok = await run(async () => {
      if (!(amount > 0)) throw new Error(t('Give an amount above 0'))
      if (kind === 'adjust' && amount > balance) throw new Error(t('The kitty has {amount}', { amount: formatMoney(balance) }))
      if (kind === 'profit' && paid.includes(which)) throw new Error(t('The share for {month} is in already', { month: monthName(which) }))
      await api.addKittyEntry({ kind, month: kind === 'profit' ? `${which}-01` : null, percent: kind === 'profit' ? percent : null, amount: value, note: note.trim() || null })
    })
    if (!ok) return
    onClose()
    // A jar that's full now and wasn't before: say so.
    const before = new Set(fillJars(goals, balance).filter(j => j.full && !j.bought).map(j => j.goal.id))
    const filled = fillJars(goals, balance + value).filter(j => j.full && !j.bought && !before.has(j.goal.id))
    notify(filled.length ? t('In it goes! {name} is full: time to buy it', { name: goalName(filled[0].goal) }) : t('In it goes: {amount}', { amount: formatMoney(value) }), 'success')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="money-title">
      <DialogTitle id="money-title">{t('Put money in')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v: MoneyKind | null) => v && setKind(v)} aria-label={t('What it is')} fullWidth>
            <ToggleButton value="profit">{t('Share over breakeven')}</ToggleButton>
            <ToggleButton value="top_up">{t('Something else')}</ToggleButton>
            <ToggleButton value="adjust">{t('Take some out')}</ToggleButton>
          </ToggleButtonGroup>
          {kind === 'profit' && <>
            <TextField label={t('Month')} type="month" value={which} onChange={e => e.target.value && setWhich(e.target.value)} disabled={!!month}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: addMonths(today().slice(0, 7), -1) } }} />
            <TextField label={t('Taken above breakeven')} value={profitText} inputMode="decimal"
              onChange={e => { setProfitText(e.target.value); setAmountText(String(profitShare(num(e.target.value) || 0, percent))) }}
              helperText={profit !== null ? t('From the till and each day’s cost to run the café: an estimate. Change it if you have a better figure.') : t('Each day’s takings above what it cost to run the café, added up for the month')}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          </>}
          <TextField label={kind === 'profit' ? t('{percent}% of it', { percent }) : t('Amount')} value={amountText} onChange={e => setAmountText(e.target.value)} inputMode="decimal"
            slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          {kind !== 'profit' && <TextField label={t('What it is')} value={note} onChange={e => setNote(e.target.value)}
            placeholder={kind === 'top_up' ? t('Tips jar, a bonus…') : t('Counted wrong…')} />}
          {kind === 'adjust' && <Alert severity="info">{t('The kitty has {amount}. Buying a goal takes its cost out by itself.', { amount: formatMoney(balance) })}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{kind === 'adjust' ? t('Take it out') : t('Put it in')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The share of what's taken above breakeven that goes in. */
function ShareDialog({ percent, onClose }: { percent: number; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [value, setValue] = useState(String(percent))
  const save = async () => {
    const n = Number(value.replace(',', '.'))
    const ok = await run(async () => {
      if (!(n >= 0 && n <= 100)) throw new Error(t('Give a percentage from 0 to 100'))
      await api.updateKittySettings({ profit_percent: n })
    }, t('Saved'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="share-title">
      <DialogTitle id="share-title">{t('Share over breakeven')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('How much of what the café takes above its breakeven goes in the kitty: each day’s takings over what it cost to run that day (the running costs and the team on the rota). A day below breakeven puts nothing in.')}</Typography>
          <TextField label={t('Percentage')} value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" autoFocus
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
