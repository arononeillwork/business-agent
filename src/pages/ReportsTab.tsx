import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, FormControlLabel, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/SendOutlined'
import AddIcon from '@mui/icons-material/Add'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useDailyCosts, usePayRates } from '../app/dailyCost'
import { useAsync } from '../app/hooks'
import { useNotify } from '../app/Notify'
import { PersonAvatar, SectionTitle } from '../components/common'
import { useSales, useTakings } from '../components/dashboardWidgets'
import { DASH_PERIODS, dashRange, type DashPeriod, type DashRange, type WidgetNeeds } from '../../shared/dashboards'
import { REPORTS, parseEmails, readReports, reportEmail, reportInfo, reportSendProblem, type ReportKind, type ReportSection, type SavedReports } from '../../shared/reports'
import { between, change, hoursByPerson, salesTotals } from '../../shared/insights'
import { isLow, unitLabel } from '../../shared/stock'
import { topJobs } from '../../shared/todayGlance'
import { addDays, formatLocal, formatMoney, formatNumber, localDate, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const noon = (d: string) => `${d}T12:00:00Z`
/** "Wed 30 Sep 2026", or "28 Sep – 30 Sep 2026". */
const datesText = (r: DashRange) => (r.from === r.to ? formatLocal(noon(r.from), 'EEE d MMM yyyy')
  : `${formatLocal(noon(r.from), 'd MMM')} – ${formatLocal(noon(r.to), 'd MMM yyyy')}`)
const qty = (n: number, unit: Parameters<typeof unitLabel>[0]) => `${formatNumber(n)} ${t(unitLabel(unit))}`

/**
 * Dashboards → Reports (admins): pick the reports and the period, pick who gets them (the team, the business's
 * contacts, any address), see the email, and send it from the business's Gmail or Outlook, one email each.
 * The choice is remembered for next time.
 */
export function ReportsTab({ can }: { can: (needs: WidgetNeeds[]) => boolean }) {
  const { api, me, refresh, profiles, business, canSeePay, isAdmin } = useApp()
  const notify = useNotify()
  const [s, setS] = useState<SavedReports>(() => readReports(me?.preferences?.reports))
  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const contacts = useAsync('contacts', () => (canSeePay ? api.contacts() : Promise.resolve([])), [canSeePay])
  const mailbox = integ.data?.integrations.find(i => (i.provider === 'gmail' || i.provider === 'outlook') && i.status === 'connected') ?? null
  const range = dashRange(s.period, today())
  const offered = REPORTS.filter(r => can(r.needs))
  const kinds = s.kinds.filter(k => offered.some(r => r.kind === k))
  const sections = useReportSections(kinds, range)

  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee') && p.email)
  const withEmail = (contacts.data ?? []).filter(c => c.email)
  const to = useMemo(() => [...new Set([
    ...team.filter(p => s.team.includes(p.id)).map(p => p.email!.toLowerCase()),
    ...withEmail.filter(c => s.contacts.includes(c.id)).map(c => c.email!.toLowerCase()),
    ...s.emails,
  ])], [team, withEmail, s])
  const period = t(DASH_PERIODS.find(p => p.id === s.period)!.label)
  const name = business?.name ?? 'Business Agent'
  const mail = reportEmail({
    business: name, period, dates: datesText(range), from: me?.full_name ?? '', sections: sections.list,
    subject: t('{business} report · {period} ({dates})', { business: name, period, dates: datesText(range) }),
    heading: t('{business} · {period}: {dates}', { business: name, period, dates: datesText(range) }),
    footer: t('Sent by {name} from Business Agent.', { name: me?.full_name ?? '' }),
  })
  const problem = !kinds.length ? t('Pick at least one report') : reportSendProblem({ to, subject: mail.subject, text: mail.text })

  // The choice is kept in the person's preferences as it changes (a moment after the last change), on every
  // device. Leaving the page saves what's waiting straight away rather than dropping it.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; save: () => void } | null>(null)
  useEffect(() => () => { if (pending.current) { clearTimeout(pending.current.timer); pending.current.save() } }, [])
  // Saved from another device (or by the save above landing): shown, unless a change here is still waiting.
  const saved = me?.preferences?.reports
  useEffect(() => { if (!pending.current && saved) setS(readReports(saved)) }, [saved])
  const set = (patch: Partial<SavedReports>) => setS(x => {
    const next = { ...x, ...patch }
    if (pending.current) clearTimeout(pending.current.timer)
    const save = () => {
      pending.current = null
      if (me) api.updateProfile(me.id, { preferences: { ...me.preferences, reports: next } }).then(refresh).catch(() => { /* kept on screen; saved with the next change */ })
    }
    pending.current = { timer: setTimeout(save, 600), save }
    return next
  })
  const toggle = <K extends 'kinds' | 'team' | 'contacts'>(key: K, id: SavedReports[K][number]) =>
    set({ [key]: (s[key] as string[]).includes(id) ? (s[key] as string[]).filter(x => x !== id) : [...(s[key] as string[]), id] } as Partial<SavedReports>)
  const addTyped = () => {
    const { emails, bad } = parseEmails(typed)
    if (bad.length) { notify(t('“{text}” isn’t an email address', { text: bad[0] }), 'error'); return }
    set({ emails: [...new Set([...s.emails, ...emails])] })
    setTyped('')
  }
  const send = async () => {
    if (problem) return
    setSending(true)
    try {
      const out = await api.sendReport({ to, subject: mail.subject, text: mail.text })
      if (out.failed.length) notify(t('Sent to {n}; not to {who}: {error}', { n: out.sent.length, who: out.failed.map(f => f.to).join(', '), error: out.failed[0].error }), 'warning')
      else notify(tn(out.sent.length, 'Report sent to {n} person', 'Report sent to {n} people'), 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally { setSending(false) }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
      <Stack spacing={2.5}>
        <Card component="section" aria-label={t('Reports to send')}>
          <CardContent>
            <SectionTitle action={
              <ToggleButtonGroup size="small" exclusive value={s.period} onChange={(_, p: DashPeriod | null) => p && set({ period: p })} aria-label={t('Period')}>
                {DASH_PERIODS.map(p => <ToggleButton key={p.id} value={p.id} sx={{ px: 1.25 }}>{t(p.label)}</ToggleButton>)}
              </ToggleButtonGroup>}>{t('Reports to send')}</SectionTitle>
            <Box role="group" aria-label={t('Reports')} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
              {offered.map(r => (
                <FormControlLabel key={r.kind} sx={{ m: 0, alignItems: 'flex-start', p: 1, borderRadius: 2, border: `1px solid ${s.kinds.includes(r.kind) ? tokens.rose : tokens.line}` }}
                  control={<Checkbox size="small" checked={s.kinds.includes(r.kind)} onChange={() => toggle('kinds', r.kind)} sx={{ mt: -0.5 }} />}
                  label={<Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{t(r.label)}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(r.hint)}</Typography></Box>} />
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card component="section" aria-label={t('Who gets it')}>
          <CardContent>
            <SectionTitle>{t('Who gets it')}</SectionTitle>
            <Recipients label={t('The team')} empty={t('Nobody on the team has an email address.')}>
              {team.map(p => (
                <Chip key={p.id} label={p.full_name} avatar={<PersonAvatar name={p.full_name} colour={p.colour} size={24} />} onClick={() => toggle('team', p.id)}
                  aria-pressed={s.team.includes(p.id)} variant={s.team.includes(p.id) ? 'filled' : 'outlined'} color={s.team.includes(p.id) ? 'primary' : 'default'} />
              ))}
            </Recipients>
            {canSeePay && (
              <Recipients label={t('Contacts')} empty={t('No contacts with an email address yet.')}
                action={<Button size="small" component={RouterLink} to="/contacts">{t('Contacts')}</Button>}>
                {withEmail.map(c => (
                  <Chip key={c.id} label={c.name} onClick={() => toggle('contacts', c.id)} aria-pressed={s.contacts.includes(c.id)}
                    variant={s.contacts.includes(c.id) ? 'filled' : 'outlined'} color={s.contacts.includes(c.id) ? 'primary' : 'default'} />
                ))}
              </Recipients>
            )}
            <Recipients label={t('Other addresses')}>
              {s.emails.map(e => <Chip key={e} label={e} color="primary" onDelete={() => set({ emails: s.emails.filter(x => x !== e) })} />)}
            </Recipients>
            <Stack component="form" direction="row" spacing={1} sx={{ mt: 1 }} onSubmit={e => { e.preventDefault(); addTyped() }}>
              <TextField size="small" fullWidth value={typed} onChange={e => setTyped(e.target.value)} placeholder={t('name@example.com')}
                slotProps={{ htmlInput: { 'aria-label': t('Another email address') } }} />
              <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={!typed.trim()}>{t('Add')}</Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Card component="section" aria-label={t('The email')} sx={{ position: { md: 'sticky' }, top: { md: 16 } }}>
        <CardContent>
          <SectionTitle>{t('The email')}</SectionTitle>
          {integ.data && !mailbox && (
            <Alert severity="info" sx={{ mb: 1.5 }} action={isAdmin && <Button color="inherit" size="small" component={RouterLink} to="/connections">{t('Connections')}</Button>}>
              {t('Reports go from the business’s Gmail or Outlook. Connect one on Connections to send them.')}
            </Alert>
          )}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {to.length ? tn(to.length, 'To {n} person, one email each', 'To {n} people, one email each') : t('Pick who gets it')}
            {mailbox?.account_label ? ` · ${t('from {mailbox}', { mailbox: mailbox.account_label })}` : ''}
          </Typography>
          <Typography sx={{ fontWeight: 600, mt: 1 }}>{mail.subject}</Typography>
          <Box aria-label={t('What the email says')} role="document"
            sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: tokens.surfaceAlt, maxHeight: 460, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {sections.loading ? t('Loading…') : mail.text}
          </Box>
          <Button variant="contained" startIcon={<SendIcon />} fullWidth sx={{ mt: 2 }} disabled={!!problem || !mailbox || sending || sections.loading}
            onClick={() => void send()}>{t('Send the report')}</Button>
          {problem && to.length > 0 && kinds.length > 0 && <Typography variant="caption" sx={{ display: 'block', color: tokens.badFg, mt: 1 }}>{t(problem)}</Typography>}
        </CardContent>
      </Card>
    </Box>
  )
}

/** One kind of recipient: its label and its chips (or a word when there are none). */
function Recipients({ label, empty, action, children }: { label: string; empty?: string; action?: ReactNode; children: ReactNode[] }) {
  return (
    <Box role="group" aria-label={label} sx={{ mb: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{label}</Typography>
        {action}
      </Stack>
      {children.length ? <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>{children}</Stack>
        : empty ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{empty}</Typography> : null}
    </Box>
  )
}

/** Each report picked, written out from what this person can see, for the period. */
function useReportSections(kinds: ReportKind[], r: DashRange): { list: ReportSection[]; loading: boolean } {
  const { api, profiles, settings, canSeeFinances } = useApp()
  const { on } = useTakings()
  const has = (k: ReportKind) => kinds.includes(k)
  const until = r.to > today() ? today() : r.to
  const sales = useSales(r)
  const { costs } = useDailyCosts(r.from, until, on && has('takings'))
  const items = useAsync('dash-items', () => (on && has('best_sellers') ? api.salesItems(r.from, r.to) : Promise.resolve(null)), [on && has('best_sellers'), r.from, r.to])
  const rates = usePayRates()
  const team = useAsync('report-team', () => (has('team') ? api.timeEntries(zonedIso(r.from, '00:00'), zonedIso(addDays(r.to, 1), '00:00')) : Promise.resolve(null)),
    [has('team'), r.from, r.to])
  const stock = useAsync('stock', () => api.stockItems(), [])
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const moves = useAsync('stock-movements', () => (has('waste') ? api.stockMovements() : Promise.resolve(null)), [has('waste')])
  const fresh = useAsync('fresh-batches', () => api.freshBatches(), [])
  const todos = useAsync('todos', () => api.todos(), [])
  const name = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? '—'

  const loading = (has('takings') && on && !sales.data && !sales.error) || (has('team') && !team.data && !team.error) || (has('waste') && !moves.data && !moves.error)
  // Written out on every render: cheap, and always what's on screen.
  const out: ReportSection[] = []
  {
    for (const k of kinds) {
      const title = t(reportInfo(k).label)
      const lines: string[] = []
      if (k === 'takings' && sales.data) {
        const now = salesTotals(between(sales.data.days, r.from, until)), before = salesTotals(between(sales.data.days, r.prevFrom, r.prevTo))
        const c = change(now.gross, before.gross)
        const pct = c === null ? null : Math.round(Math.abs(c) * 100)
        lines.push(t('Takings: {money}', { money: formatMoney(now.gross) }) + (pct === null ? ''
          : `, ${pct === 0 ? t('the same as the period before') : (c ?? 0) > 0 ? t('{pct}% up on the period before ({money})', { pct, money: formatMoney(before.gross) })
            : t('{pct}% down on the period before ({money})', { pct, money: formatMoney(before.gross) })}`))
        if (now.payments) lines.push(t('{n} payments, {money} on average', { n: formatNumber(now.payments), money: formatMoney(now.average) }))
        if (now.refunds) lines.push(t('{money} refunded', { money: formatMoney(now.refunds) }))
        const open = (costs ?? []).filter(x => x.open)
        const cost = open.reduce((a, x) => a + x.total, 0)
        if (cost > 0) {
          const taken = between(sales.data.days, r.from, until)
          const gap = taken.filter(d => open.some(x => x.date === d.date)).reduce((a, d) => a + d.gross, 0) - cost
          lines.push(t('Breakeven: {money} to run the business over {n} open days', { money: formatMoney(cost), n: open.length }))
          lines.push(gap >= 0 ? t('{money} over breakeven', { money: formatMoney(gap) }) : t('{money} short of breakeven', { money: formatMoney(-gap) }))
          const above = open.filter(x => (taken.find(d => d.date === x.date)?.gross ?? 0) > x.total).length
          lines.push(t('{above} of {days} open days took more than they cost', { above, days: open.length }))
        }
      } else if (k === 'takings') lines.push(sales.error ?? t('Connect Square, SumUp or Stripe to see takings here.'))
      if (k === 'best_sellers') {
        if (!items.data?.items) lines.push(items.error ?? t('Best sellers come from Square: Stripe and SumUp send payments only.'))
        else {
          const top = [...items.data.items].sort((a, b) => b.gross - a.gross).slice(0, 5)
          if (!top.length) lines.push(t('Nothing sold yet.'))
          top.forEach((i, n) => lines.push(t('{n}. {name}: {money} ({sold} sold)', { n: n + 1, name: i.name, money: formatMoney(i.gross), sold: formatNumber(i.quantity) })))
        }
      }
      if (k === 'team' && team.data) {
        const by = [...hoursByPerson(team.data)].sort((a, b) => b[1] - a[1])
        if (!by.length) lines.push(t('No timecards in this period yet.'))
        const hours = by.reduce((a, [, h]) => a + h, 0)
        if (by.length) lines.push(t('{hours} hours worked in all', { hours: formatNumber(Math.round(hours * 10) / 10) }))
        if (by.length && canSeeFinances) {
          const cost = team.data.reduce((a, e) => a + e.paid_minutes / 60 * (rates.get(e.profile_id) ?? 0), 0) * (settings?.employer_cost_multiplier ?? 1)
          lines.push(t('Team cost: {money}, with Social Security', { money: formatMoney(cost) }))
        }
        for (const [id, h] of by) lines.push(t('{name}: {hours} h', { name: name(id), hours: formatNumber(Math.round(h * 10) / 10) }))
      }
      if (k === 'stock' && stock.data) {
        const low = stock.data.filter(isLow).sort((a, b) => a.name.localeCompare(b.name))
        if (!low.length) lines.push(t('Nothing is low. Nothing to order.'))
        for (const i of low) {
          const sup = suppliers.data?.find(x => x.id === i.supplier_id)?.name
          lines.push(t('{name}: {left} left (reorder at {at})', { name: i.name, left: qty(i.on_hand, i.unit), at: qty(i.reorder_at ?? 0, i.unit) }) + (sup ? ` · ${sup}` : ''))
        }
      }
      if (k === 'waste' && moves.data && stock.data) {
        const wasted = moves.data.filter(m => m.reason === 'waste' && !m.undone_at && localDate(m.at) >= r.from && localDate(m.at) <= r.to)
        lines.push(tn(wasted.length, '{n} thing thrown away', '{n} things thrown away'))
        const item = (id: string) => stock.data!.find(i => i.id === id)
        if (canSeeFinances && wasted.length) {
          lines.push(t('Cost: {money}', { money: formatMoney(wasted.reduce((a, m) => a + Math.abs(m.change) * (item(m.item_id)?.cost_per_unit ?? 0), 0)) }))
        }
        const per = new Map<string, number>()
        for (const m of wasted) per.set(m.item_id, (per.get(m.item_id) ?? 0) + Math.abs(m.change))
        for (const [id, n] of [...per].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
          const i = item(id)
          if (i) lines.push(`${i.name}: ${qty(n, i.unit)}`)
        }
      }
      if (k === 'fresh' && fresh.data) {
        const made = fresh.data.filter(b => localDate(b.made_at) >= r.from && localDate(b.made_at) <= r.to)
        lines.push(tn(made.length, '{n} batch made', '{n} batches made'))
        const sold = made.filter(b => b.cleared === 'sold').length, binned = made.filter(b => b.cleared === 'binned').length
        if (sold) lines.push(tn(sold, '{n} sold out', '{n} sold out'))
        if (binned) lines.push(tn(binned, '{n} thrown away', '{n} thrown away'))
        for (const b of made.slice(0, 8)) {
          lines.push(t('{name}, made {when}', { name: b.quantity ? `${b.name} × ${formatNumber(b.quantity)}` : b.name, when: formatLocal(b.made_at, 'EEE d MMM HH:mm') }))
        }
      }
      if (k === 'jobs' && todos.data) {
        const list = todos.data.todos
        const open = list.filter(x => !x.done)
        const done = list.filter(x => x.done && x.done_at && localDate(x.done_at) >= r.from && localDate(x.done_at) <= r.to)
        lines.push(tn(open.length, '{n} open', '{n} open'))
        lines.push(tn(done.length, '{n} done in this period', '{n} done in this period'))
        for (const x of topJobs(list, 5)) lines.push(`${x.starred ? '★ ' : ''}${x.title}${x.assignee_id ? ` (${name(x.assignee_id)})` : ''}`)
      }
      if (lines.length) out.push({ title, lines })
    }
  }
  return { list: out, loading }
}
