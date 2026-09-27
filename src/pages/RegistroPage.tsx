import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBack'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { useMemo } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { ErrorBox, Loading } from '../components/common'
import { monthRange, registroMonth } from '../../shared/registro'
import { formatDuration, formatLocal, today, zonedIso } from '../../shared/time'
import type { Business, Profile, TimeEntry } from '../../shared/types'
import { fonts } from '../theme'

const lastMonth = () => {
  const [y, m] = today().split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * The monthly registro de jornada, ready to print or save as PDF (browser print → Save as PDF).
 * Everyone can print their own; admins and payroll partners can print anyone's, or everyone's.
 */
export function RegistroPage() {
  const { api, me, isAdmin, partnerCan } = useApp()
  const seeAll = isAdmin || partnerCan('payroll')
  const [params, setParams] = useSearchParams()
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : lastMonth()
  const who = seeAll ? params.get('person') ?? 'all' : me!.id
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }
  const range = monthRange(month)

  const data = useAsync(`registro-${month}`, async () => {
    const [business, people, entries] = await Promise.all([api.business(), api.profiles(), api.timeEntries(range.fromIso, range.toIso)])
    return { business, people, entries }
  }, [month])

  const staff = useMemo(() => (data.data?.people ?? [])
    .filter(p => ['admin', 'employee'].includes(p.role) && (seeAll || p.id === me!.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [data.data, seeAll, me])
  const sheets = who === 'all'
    ? staff.filter(p => p.active || data.data?.entries.some(e => e.profile_id === p.id))
    : staff.filter(p => p.id === who)

  return (
    <Box sx={{ bgcolor: '#F3F1EE', minHeight: '100vh', '@media print': { bgcolor: '#fff' } }}>
      <Box className="no-print" sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', px: 2, py: 1.25,
        '@media print': { display: 'none' } }}>
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap', maxWidth: 900, mx: 'auto' }}>
          <Button component={RouterLink} to={seeAll ? '/timecards' : '/account'} startIcon={<BackIcon />}>Back</Button>
          <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 160 }}>Monthly hours record</Typography>
          <TextField type="month" size="small" label="Month" value={month} onChange={e => e.target.value && set('month', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
          {seeAll && (
            <TextField select size="small" label="Person" value={who} onChange={e => set('person', e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="all">Everyone (one page each)</MenuItem>
              {staff.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          )}
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!sheets.length}>Print / save PDF</Button>
        </Stack>
      </Box>
      <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 1, sm: 3 }, '@media print': { p: 0, maxWidth: 'none' } }}>
        <ErrorBox error={data.error} />
        {!data.data && !data.error && <Loading />}
        {data.data && sheets.map(p => <Sheet key={p.id} person={p} business={data.data!.business} entries={data.data!.entries} month={month} />)}
        {data.data && sheets.length === 0 && <Typography sx={{ p: 3 }}>No one to show for this month.</Typography>}
      </Box>
    </Box>
  )
}

function Sheet({ person, business, entries, month }: { person: Profile; business: Business; entries: TimeEntry[]; month: string }) {
  const r = registroMonth(entries, person.id, month)
  const monthName = formatLocal(zonedIso(`${month}-15`, '12:00'), 'MMMM yyyy')
  const cell = { border: '1px solid #CFC9C2', px: 1, py: 0.4, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' } as const
  return (
    <Box component="article" aria-label={`Hours record: ${person.full_name}`} sx={{ bgcolor: '#fff', p: { xs: 2, sm: 4 }, mb: 3, borderRadius: 2, boxShadow: 1, color: '#1d1a18',
      '@media print': { boxShadow: 'none', borderRadius: 0, p: 0, mb: 0, breakAfter: 'page' } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.3rem' }}>Registro diario de jornada</Typography>
          <Typography sx={{ fontSize: 13, color: '#6B645E' }}>Daily working hours record · art. 34.9 Estatuto de los Trabajadores</Typography>
        </Box>
        <Typography sx={{ fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{monthName}</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, fontSize: 13, mb: 2 }}>
        <Box><b>Empresa / Company:</b> {business.name}{business.address ? `, ${business.address}` : ''}</Box>
        <Box><b>Trabajador/a / Worker:</b> {person.full_name}{person.email ? ` (${person.email})` : ''}</Box>
      </Box>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Día / Day', 'Entrada / In', 'Salida / Out', 'Pausas / Breaks', 'Horas / Hours'].map(h => (
              <Box component="th" key={h} sx={{ ...cell, bgcolor: '#F3F1EE', textAlign: 'left', fontWeight: 600 }}>{h}</Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.days.map(d => {
            const label = formatLocal(zonedIso(d.date, '12:00'), 'EEE d')
            if (!d.lines.length) return (
              <tr key={d.date}><Box component="td" sx={{ ...cell, color: '#8A837C' }}>{label}</Box><Box component="td" colSpan={4} sx={{ ...cell, color: '#B5AEA7' }}>—</Box></tr>
            )
            return d.lines.map((l, i) => (
              <tr key={l.entry_id}>
                <Box component="td" sx={cell}>{i === 0 ? label : ''}</Box>
                <Box component="td" sx={cell}>{l.start}{l.edited ? ' *' : ''}</Box>
                <Box component="td" sx={cell}>{l.end ?? 'still open'}{l.edited ? ' *' : ''}</Box>
                <Box component="td" sx={cell}>{l.break_minutes ? `${l.break_minutes} min` : ''}</Box>
                <Box component="td" sx={cell}>{l.end ? formatDuration(l.worked_minutes) : ''}</Box>
              </tr>
            ))
          })}
          <tr>
            <Box component="td" colSpan={4} sx={{ ...cell, fontWeight: 600, textAlign: 'right' }}>Total ({r.days_worked} days worked)</Box>
            <Box component="td" sx={{ ...cell, fontWeight: 600 }}>{formatDuration(r.worked_minutes)}</Box>
          </tr>
        </tbody>
      </Box>
      <Typography sx={{ fontSize: 11.5, color: '#6B645E', mt: 1 }}>
        Times are Madrid time, recorded by the app's server. * corrected, with the reason kept in the change log. Hours exclude unpaid breaks.
        {r.open_entries ? ` ${r.open_entries} clock-in(s) still open.` : ''} Records are kept for 4 years.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, mt: 5 }}>
        {['Firma de la empresa / Company signature', 'Firma del trabajador/a / Worker signature'].map(t => (
          <Box key={t} sx={{ borderTop: '1px solid #1d1a18', pt: 0.75, fontSize: 12 }}>{t}</Box>
        ))}
      </Box>
    </Box>
  )
}
