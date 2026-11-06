// How fresh what a page shows from an outside service is, and how often that service is read
// (shared/refresh.ts): "Updated 5 min ago · every 15 minutes", with why in a tooltip. Most services'
// times are the business's to choose on Connections, within what its plan allows: Free the usual times
// or slower, each plan up a step faster, Business the fastest or its own number of minutes.
import { useState } from 'react'
import {
  Box, Button, Card, InputAdornment, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, type SxProps, type Theme,
} from '@mui/material'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import { Link as RouterLink } from 'react-router-dom'
import {
  CHOICES, PLAN_REFRESH, SOURCES, allowedOptions, everyText, isChoosable, refreshMinutes, source, type Choosable, type RefreshChoices, type RefreshSource,
} from '../../shared/refresh'
import { PLANS, type PlanId } from '../../shared/plans'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { planName, usePlan } from '../app/plan'
import { tokens } from '../theme'
import { formatLocal } from '../../shared/time'
import { t } from '../i18n'

/** "just now", "5 min ago", "3 h ago", else the date. */
export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return t('just now')
  if (min < 60) return t('{n} min ago', { n: min })
  if (min < 24 * 60) return t('{n} h ago', { n: Math.round(min / 60) })
  return formatLocal(iso, 'd MMM, HH:mm')
}

/** "every 15 minutes", "every hour", "every 6 hours" in the person's language. */
export function everyWords(minutes: number) {
  const e = everyText(minutes)
  return t(e.text, e.n === undefined ? undefined : { n: e.n })
}

/** How often this business reads each service: its own choice within its plan, or the usual time. */
export function useRefresh() {
  const { settings } = useApp()
  const { plan, status } = usePlan()
  const chosen = settings?.refresh_minutes ?? {}
  // Until the plan is known, what was chosen (the Worker keeps to the plan either way).
  const planId: PlanId = status ? plan.id : 'business'
  const minutes = (id: Choosable) => refreshMinutes(chosen, planId, id)
  /** How often, in words, as it follows "Updated 5 min ago · ". */
  const every = (s: RefreshSource) => (isChoosable(s.id) ? t(CHOICES[s.id].phrase, { every: everyWords(minutes(s.id)) }) : t(s.every))
  return { chosen, plan: planId, minutes, every }
}

/** "Updated 5 min ago · every 15 minutes" for figures read from `id` at `at`; without `at`, just how often. */
export function Freshness({ id, at, sx }: { id: RefreshSource['id']; at?: string | null; sx?: SxProps<Theme> }) {
  const s = source(id)
  const { every } = useRefresh()
  return (
    <Tooltip describeChild title={`${t(s.from)}: ${t(s.why)}`}>
      <Typography variant="body2" tabIndex={0} sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
        {at ? t('Updated {ago} · {every}', { ago: ago(at), every: every(s) }) : t('Checked {every}', { every: every(s) })}
        <InfoIcon sx={{ fontSize: 15 }} />
      </Typography>
    </Tooltip>
  )
}

/** The cheapest plan that may read a service this often (for the locked choices). */
const planFor = (id: Choosable, minutes: number) => PLANS.find(p => allowedOptions(id, p.id).includes(minutes)) ?? PLANS[PLANS.length - 1]

/** Connections: every outside service the app reads, how often, and why that often; admins choose the times their plan allows. */
export function RefreshSchedule() {
  const { isAdmin } = useApp()
  const { plan } = useRefresh()
  const cell = { py: 1, borderColor: tokens.line, verticalAlign: 'top' } as const
  return (
    <Box component="section" aria-label={t('How often things update')} sx={{ mt: 4 }}>
      <Typography variant="h6" component="h2">{t('How often things update')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('Each page says when its figures were last updated. These are set to stay well inside what each service allows, so nothing runs into a limit or a charge.')}
        {isAdmin && ` ${t('Choose how often each is read.')} ${t(PLAN_REFRESH[plan].blurb)}`}
        {isAdmin && plan !== 'business' && <>{' '}<RouterLink to="/account/billing">{t('Faster with a bigger plan')}</RouterLink></>}
      </Typography>
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('How often things update')}>
            <TableHead><TableRow>
              <TableCell>{t('What')}</TableCell>
              <TableCell>{t('How often')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Why')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {SOURCES.map(s => (
                <TableRow key={s.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell sx={cell}>
                    <Typography sx={{ fontWeight: 500 }}>{t(s.what)}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t(s.from)}</Typography>
                  </TableCell>
                  <TableCell sx={{ ...cell, minWidth: { xs: 180, md: 220 } }}>
                    {isAdmin && isChoosable(s.id) ? <RateChoice id={s.id} what={t(s.what)} /> : <EveryText s={s} />}
                  </TableCell>
                  <TableCell sx={{ ...cell, display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{t(s.why)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Card>
    </Box>
  )
}

function EveryText({ s }: { s: RefreshSource }) {
  const { every } = useRefresh()
  return <>{every(s)}</>
}

/**
 * One service's time (admins): the plan's choices, the faster ones locked with the plan that has them,
 * and on Business "Your own" in minutes. Choosing the usual time again forgets the choice.
 */
function RateChoice({ id, what }: { id: Choosable; what: string }) {
  const { api } = useApp()
  const run = useAction()
  const { chosen, plan, minutes, every } = useRefresh()
  const c = CHOICES[id]
  const own = PLAN_REFRESH[plan].own
  const now = minutes(id)
  const allowed = allowedOptions(id, plan)
  // Business's own number of minutes (not one of the choices).
  const custom = !c.options.includes(now)
  const [typing, setTyping] = useState<string | null>(null)
  const save = (n: number | null) => {
    const next: RefreshChoices = { ...chosen }
    if (n === null || n === c.usual) delete next[id]
    else next[id] = n
    return run(() => api.updateSettings({ refresh_minutes: next }), t('{what}: {every}', { what, every: everyWords(n ?? c.usual) }))
  }
  const label = (o: number) => (o === c.usual ? t('{every} (usual)', { every: everyWords(o) }) : everyWords(o))
  return (
    <Stack spacing={0.75}>
      <TextField select size="small" fullWidth value={typing !== null || custom ? 'own' : String(now)} sx={{ maxWidth: 260 }}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('How often: {what}', { what }) } } }}
        onChange={e => {
          if (e.target.value === 'own') { setTyping(String(now)); return }
          setTyping(null)
          void save(Number(e.target.value))
        }}>
        {c.options.map(o => {
          const ok = allowed.includes(o)
          return (
            <MenuItem key={o} value={String(o)} disabled={!ok}>
              {ok ? label(o) : t('{every} · {plan}', { every: everyWords(o), plan: planName(planFor(id, o)) })}
            </MenuItem>
          )
        })}
        <MenuItem value="own" disabled={!own}>
          {!own ? t('Your own… · {plan}', { plan: planName(PLANS[PLANS.length - 1]) }) : custom ? t('Your own: {every}', { every: everyWords(now) }) : t('Your own…')}
        </MenuItem>
      </TextField>
      {custom && typing === null && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setTyping(String(now))}>{t('Change')}</Button>}
      {typing !== null && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField size="small" type="number" value={typing} onChange={e => setTyping(e.target.value)} sx={{ width: 150 }}
            label={t('Every')} slotProps={{ htmlInput: { min: c.min, max: c.max, step: 1 }, input: { endAdornment: <InputAdornment position="end">{t('min')}</InputAdornment> } }}
            helperText={t('{min} to {max} minutes', { min: c.min, max: c.max })} />
          <Button size="small" variant="outlined" sx={{ mt: 0.5 }} disabled={!Number.isFinite(Number(typing)) || typing.trim() === ''}
            onClick={() => void save(Math.min(c.max, Math.max(c.min, Math.round(Number(typing))))).then(ok => { if (ok) setTyping(null) })}>{t('Set')}</Button>
        </Stack>
      )}
      {/* What else it says ("as soon as Square sends a change, and …"), when it says more than the time. */}
      {c.phrase !== '{every}' && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{every(source(id))}</Typography>}
    </Stack>
  )
}
