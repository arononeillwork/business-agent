import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/SendOutlined'
import ScheduleIcon from '@mui/icons-material/ScheduleSendOutlined'
import AddIcon from '@mui/icons-material/Add'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useDailyCosts, usePayRates } from '../app/dailyCost'
import { useAsync } from '../app/hooks'
import { useNotify } from '../app/Notify'
import { PersonAvatar, SectionTitle } from '../components/common'
import { useSales, useTakings } from '../components/dashboardWidgets'
import { type DashRange, type WidgetNeeds } from '../../shared/dashboards'
import {
  REPORTS, REPORT_PERIODS, parseEmails, readReports, reportRange, reportSendProblem, type ReportInfo, type ReportKind, type ReportPeriod, type SavedReports,
} from '../../shared/reports'
import { datesText, reportMail, reportSections, type Formats } from '../../shared/reportSections'
import { unitLabel } from '../../shared/stock'
import { addDays, formatLocal, formatMoney, formatNumber, localDate, today, zonedIso } from '../../shared/time'
import { ReportSchedules } from './ReportSchedules'
import { tokens } from '../theme'
import { currentLanguage, t, tn } from '../i18n'

/** Money, numbers, dates and units as the page shows them (and in its language). */
export const pageFormats: Formats = {
  money: formatMoney, number: formatNumber, when: iso => formatLocal(iso, 'EEE d MMM HH:mm'), unit: u => t(unitLabel(u)), date: iso => localDate(iso),
}
export const periodLabel = (p: ReportPeriod) => t(REPORT_PERIODS.find(x => x.id === p)!.label)

/** Who gets a report: people on the team, the business's contacts (owners) and any address. */
export interface Recipients { team: string[]; contacts: string[]; emails: string[] }

/**
 * Dashboards → Reports (admins): pick the reports and the period, pick who gets them (the team, the business's
 * contacts, any address), see the email, and send it from the business's Gmail or Outlook, one email each;
 * or set it to go on a schedule (ReportSchedules). The choice is remembered for next time.
 */
export function ReportsTab({ can }: { can: (needs: WidgetNeeds[]) => boolean }) {
  const { api, me, refresh, business, isAdmin } = useApp()
  const notify = useNotify()
  const [s, setS] = useState<SavedReports>(() => readReports(me?.preferences?.reports))
  const [sending, setSending] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const mailbox = integ.data?.integrations.find(i => (i.provider === 'gmail' || i.provider === 'outlook') && i.status === 'connected') ?? null
  const range = reportRange(s.period, today())
  const offered = REPORTS.filter(r => can(r.needs))
  const kinds = s.kinds.filter(k => offered.some(r => r.kind === k))
  const sections = useReportSections(kinds, range)
  const to = useRecipientEmails(s)

  const name = business?.name ?? 'Business Agent'
  const mail = reportMail({ business: name, period: periodLabel(s.period), dates: datesText(range, formatLocal), sender: me?.full_name ?? '', sections: sections.list }, { t, tn })
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
    <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
        <Stack spacing={2.5}>
          <Card component="section" aria-label={t('Reports to send')}>
            <CardContent>
              <SectionTitle action={<PeriodPicker value={s.period} onChange={period => set({ period })} />}>{t('Reports to send')}</SectionTitle>
              <ReportPicker offered={offered} value={s.kinds} onChange={k => set({ kinds: k })} />
            </CardContent>
          </Card>
          <Card component="section" aria-label={t('Who gets it')}>
            <CardContent>
              <SectionTitle>{t('Who gets it')}</SectionTitle>
              <RecipientPicker value={s} onChange={r => set(r)} />
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
            <Button variant="outlined" startIcon={<ScheduleIcon />} fullWidth sx={{ mt: 1 }} disabled={!kinds.length || !to.length}
              onClick={() => setScheduling(true)}>{t('Send on a schedule…')}</Button>
            {problem && to.length > 0 && kinds.length > 0 && <Typography variant="caption" sx={{ display: 'block', color: tokens.badFg, mt: 1 }}>{t(problem)}</Typography>}
          </CardContent>
        </Card>
      </Box>

      <ReportSchedules offered={offered} mailbox={!!mailbox} startFrom={scheduling ? { kinds, period: s.period, team: s.team, contacts: s.contacts, emails: s.emails,
        language: currentLanguage() } : null} onStarted={() => setScheduling(false)} />
    </Stack>
  )
}

/** The period a report covers. */
export function PeriodPicker({ value, onChange, label = t('Period') }: { value: ReportPeriod; onChange: (p: ReportPeriod) => void; label?: string }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={e => onChange(e.target.value as ReportPeriod)} sx={{ minWidth: 170 }}>
      {REPORT_PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
    </TextField>
  )
}

/** The reports offered to this person, to tick. */
export function ReportPicker({ offered, value, onChange }: { offered: ReportInfo[]; value: ReportKind[]; onChange: (k: ReportKind[]) => void }) {
  return (
    <Box role="group" aria-label={t('Reports')} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
      {offered.map(r => (
        <FormControlLabel key={r.kind} sx={{ m: 0, alignItems: 'flex-start', p: 1, borderRadius: 2, border: `1px solid ${value.includes(r.kind) ? tokens.rose : tokens.line}` }}
          control={<Checkbox size="small" checked={value.includes(r.kind)} sx={{ mt: -0.5 }}
            onChange={() => onChange(value.includes(r.kind) ? value.filter(k => k !== r.kind) : [...value, r.kind])} />}
          label={<Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{t(r.label)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(r.hint)}</Typography></Box>} />
      ))}
    </Box>
  )
}

/** The people on the team with an email, and (owners) the contacts with one. */
function usePeople() {
  const { api, profiles, canSeePay } = useApp()
  const contacts = useAsync('contacts', () => (canSeePay ? api.contacts() : Promise.resolve([])), [canSeePay])
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee') && p.email)
  return { team, contacts: (contacts.data ?? []).filter(c => c.email), canSeePay }
}

/** Each picked person's address, once. */
export function useRecipientEmails(r: Recipients) {
  const { team, contacts } = usePeople()
  return useMemo(() => [...new Set([
    ...team.filter(p => r.team.includes(p.id)).map(p => p.email!.toLowerCase()),
    ...contacts.filter(c => r.contacts.includes(c.id)).map(c => c.email!.toLowerCase()),
    ...r.emails,
  ])], [team, contacts, r.team, r.contacts, r.emails])
}

/** Pick who gets it: the team, the contacts (owners), and addresses typed in. */
export function RecipientPicker({ value, onChange }: { value: Recipients; onChange: (r: Recipients) => void }) {
  const notify = useNotify()
  const { team, contacts, canSeePay } = usePeople()
  const [typed, setTyped] = useState('')
  const toggle = (key: 'team' | 'contacts', id: string) =>
    onChange({ ...value, [key]: value[key].includes(id) ? value[key].filter(x => x !== id) : [...value[key], id] })
  const addTyped = () => {
    const { emails, bad } = parseEmails(typed)
    if (bad.length) { notify(t('“{text}” isn’t an email address', { text: bad[0] }), 'error'); return }
    onChange({ ...value, emails: [...new Set([...value.emails, ...emails])] })
    setTyped('')
  }
  return (
    <Box>
      <Group label={t('The team')} empty={t('Nobody on the team has an email address.')}>
        {team.map(p => (
          <Chip key={p.id} label={p.full_name} avatar={<PersonAvatar name={p.full_name} colour={p.colour} size={24} />} onClick={() => toggle('team', p.id)}
            aria-pressed={value.team.includes(p.id)} variant={value.team.includes(p.id) ? 'filled' : 'outlined'} color={value.team.includes(p.id) ? 'primary' : 'default'} />
        ))}
      </Group>
      {canSeePay && (
        <Group label={t('Contacts')} empty={t('No contacts with an email address yet.')}
          action={<Button size="small" component={RouterLink} to="/contacts">{t('Contacts')}</Button>}>
          {contacts.map(c => (
            <Chip key={c.id} label={c.name} onClick={() => toggle('contacts', c.id)} aria-pressed={value.contacts.includes(c.id)}
              variant={value.contacts.includes(c.id) ? 'filled' : 'outlined'} color={value.contacts.includes(c.id) ? 'primary' : 'default'} />
          ))}
        </Group>
      )}
      <Group label={t('Other addresses')}>
        {value.emails.map(e => <Chip key={e} label={e} color="primary" onDelete={() => onChange({ ...value, emails: value.emails.filter(x => x !== e) })} />)}
      </Group>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField size="small" fullWidth value={typed} onChange={e => setTyped(e.target.value)} placeholder={t('name@example.com')}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
          slotProps={{ htmlInput: { 'aria-label': t('Another email address') } }} />
        <Button variant="outlined" startIcon={<AddIcon />} disabled={!typed.trim()} onClick={addTyped}>{t('Add')}</Button>
      </Stack>
    </Box>
  )
}

/** One kind of recipient: its label and its chips (or a word when there are none). */
function Group({ label, empty, action, children }: { label: string; empty?: string; action?: ReactNode; children: ReactNode[] }) {
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

/** Each report picked, written out (shared/reportSections.ts) from what this person can see, for the period. */
function useReportSections(kinds: ReportKind[], r: DashRange) {
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
  const loading = (has('takings') && on && !sales.data && !sales.error) || (has('team') && !team.data && !team.error) || (has('waste') && !moves.data && !moves.error)
  const list = reportSections(kinds, {
    range: r, until,
    sales: !on ? null : sales.data ? { days: sales.data.days } : sales.error ? { error: sales.error } : null,
    costs, items: !on ? null : items.data ?? (items.error ? { error: items.error } : null),
    entries: team.data, rates, multiplier: settings?.employer_cost_multiplier ?? 1,
    stock: stock.data, suppliers: suppliers.data, moves: moves.data, fresh: fresh.data, todos: todos.data?.todos,
    name: id => profiles.find(p => p.id === id)?.full_name ?? '—', canSeeFinances,
  }, { t, tn }, pageFormats)
  return { list, loading }
}
