import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import RenewIcon from '@mui/icons-material/AutorenewOutlined'
import AttachIcon from '@mui/icons-material/AttachFileOutlined'
import { useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  CAFE_PRESETS, LICENCE_CATEGORIES, STATUS_LABEL, daysUntil, renewalLabel, renewedUntil, statusOf, yearlyCost,
  type Licence, type LicenceInput, type LicencePreset, type LicenceStatus,
} from '../../shared/licences'
import { taxFileProblem } from '../../shared/tax'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const renewal = (months: number | null) => t(renewalLabel(months), { n: months ?? 0 })
const categoryLabel = (c: Licence['category']) => t(LICENCE_CATEGORIES.find(x => x.id === c)!.label)
const TONE: Record<LicenceStatus, { fg: string; bg: string }> = {
  expired: { fg: tokens.badFg, bg: tokens.badBg }, due: { fg: tokens.warnFg, bg: tokens.warnBg },
  valid: { fg: tokens.goodFg, bg: tokens.goodBg }, permanent: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const RENEWALS = [null, 1, 3, 6, 12, 24, 48, 60]

/**
 * Licences: everything the business keeps open (licencia de apertura, SGAE, the terrace,
 * insurance, safety checks, staff certificates), each with its number, when it runs out, how often
 * it renews and its document. Admins get a reminder in the bell before one runs out.
 * Admins manage it; a gestoría with finances access reads (the database enforces it too).
 * It's the Licences tab of Legal & licences (LegalPage), whose tabs go under the title.
 */
export function LicencesPage({ tabs }: { tabs?: ReactNode }) {
  const { isAdmin, isPartner, partnerCan, api } = useApp()
  const canEdit = isAdmin && !isPartner
  const list = useAsync('licences', () => api.licences(), [])
  const run = useAction()
  const [editing, setEditing] = useState<LicenceInput | null>(null)

  if (!canEdit && !partnerCan('finances')) {
    return <>
      <PageHeader eyebrow={t('Business')} title={t('Legal & licences')} />
      <Alert severity="info">{t('Licences are only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const all = list.data ?? []
  const active = all.filter(l => l.active)
  const late = active.filter(l => statusOf(l, now) === 'expired')
  const soon = active.filter(l => statusOf(l, now) === 'due')
  const next = active.filter(l => l.expires_on && l.expires_on >= now).sort((a, b) => a.expires_on!.localeCompare(b.expires_on!))[0]
  const added = new Set(all.map(l => l.name.toLowerCase()))
  const missing = CAFE_PRESETS.filter(p => !added.has(p.name.toLowerCase()))

  const renew = (l: Licence) => run(() => api.saveLicence({ id: l.id, name: l.name, expires_on: renewedUntil(l, now) }),
    t('Renewed until {date}', { date: day(renewedUntil(l, now)) }))
  const fromPreset = (p: LicencePreset): LicenceInput => ({ name: p.name, category: p.category, issuer: p.issuer || null, renew_every_months: p.renew_every_months,
    link: p.link ?? null, notes: null, reminder_days: 30, auto_renews: false, active: true })

  const table = (): ExportTable => ({
    title: t('Licences'), filename: `licences-${now}`,
    columns: [t('Licence'), t('Kind'), t('Issued by'), t('Number'), t('Holder'), t('From'), t('Runs out'), t('Renews'), t('Cost'), t('Status'), t('Notes'), t('File')],
    rows: active.map(l => [l.name, categoryLabel(l.category), l.issuer ?? '', l.reference ?? '', l.holder ?? '', l.starts_on ?? '', l.expires_on ?? '',
      renewal(l.renew_every_months), l.cost, t(STATUS_LABEL[statusOf(l, now)]), l.notes ?? '', l.document?.link ?? '']),
    footer: [t('A year'), '', '', '', '', '', '', '', yearlyCost(active), '', '', ''],
    money: [8],
  })

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Legal & licences')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        <ExportButton table={table} disabled={!active.length} folder="Licences" />
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', category: 'permit', reminder_days: 30, renew_every_months: 12, active: true })}>{t('Add a licence')}</Button>}
      </>} />
      {tabs}
      <ErrorBox error={list.error} />

      <StatGrid>
        <StatTile label={t('Licences')} value={list.data ? active.length : '–'} note={tn(active.filter(l => !l.expires_on).length, '{n} doesn’t run out', '{n} don’t run out')} />
        <StatTile label={t('Renew soon')} value={soon.length} note={next ? t('Next: {name}, {date}', { name: next.name, date: day(next.expires_on) }) : t('Nothing coming up')} />
        <StatTile label={t('Ran out')} value={late.length} note={late.length ? late.map(l => l.name).join(', ') : t('None')} />
        <StatTile label={t('A year')} value={list.data ? formatMoney(yearlyCost(active)) : '–'} note={t('Renewals and fees')} />
      </StatGrid>

      {late.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('Ran out: {list}. Renew them and press Renewed, or add the new last day.', { list: late.map(l => `${l.name} (${day(l.expires_on)})`).join(', ') })}
        </Alert>
      )}

      <Card component="section" aria-label={t('Licences')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Licences')}</SectionTitle>
          {active.length === 0
            ? <Empty>{list.data ? t('No licences yet. Add the café’s below.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Licence')}</TableCell><TableCell>{t('Number')}</TableCell><TableCell>{t('Runs out')}</TableCell>
                    <TableCell>{t('Renews')}</TableCell><TableCell align="right">{t('Cost')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {active.map(l => {
                      const s = statusOf(l, now)
                      const left = l.expires_on ? daysUntil(now, l.expires_on) : null
                      return (
                        <TableRow key={l.id} hover>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{l.name}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {[categoryLabel(l.category), l.issuer, l.holder].filter(Boolean).join(' · ')}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{l.reference ?? ''}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {l.expires_on ? day(l.expires_on) : ''}
                            <Box><Tag {...TONE[s]}>{s === 'due' && left !== null ? tn(left, 'in {n} day', 'in {n} days') : t(STATUS_LABEL[s])}</Tag></Box>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {renewal(l.renew_every_months)}
                            {l.auto_renews && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Renews by itself')}</Typography>}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{l.cost === null ? '' : formatMoney(l.cost)}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {l.document?.link && <IconButton size="small" component="a" href={l.document.link} target="_blank" rel="noopener" aria-label={t('Open the document of {name}', { name: l.name })}><AttachIcon fontSize="small" /></IconButton>}
                            {l.link && <IconButton size="small" component="a" href={l.link} target="_blank" rel="noopener" aria-label={t('Open the website of {name}', { name: l.name })}><OpenIcon fontSize="small" /></IconButton>}
                            {canEdit && l.renew_every_months && (s === 'due' || s === 'expired') && (
                              <Button size="small" startIcon={<RenewIcon />} onClick={() => void renew(l)} aria-label={t('Renewed {name}', { name: l.name })}>{t('Renewed')}</Button>
                            )}
                            {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: l.name })} onClick={() => setEditing(l)}><EditIcon fontSize="small" /></IconButton>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {canEdit && missing.length > 0 && (
        <Card component="section" aria-label={t('Usual for a café')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Usual for a café')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('What a café or bar in Spain usually needs. What applies, and how often, depends on the town hall and the business: check with your gestoría.')}
            </Typography>
            <Stack spacing={1}>
              {missing.map(p => (
                <Stack key={p.key} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(p.what)} · {renewal(p.renew_every_months)}</Typography>
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing(fromPreset(p))} aria-label={t('Add {name}', { name: p.name })}>{t('Add')}</Button>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {editing && <LicenceDialog licence={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** A licence's details, and its document (kept in the café's Drive or OneDrive, under Tax/Licences). */
function LicenceDialog({ licence, onClose }: { licence: LicenceInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [l, setL] = useState<LicenceInput>(licence)
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const set = (p: Partial<LicenceInput>) => setL(x => ({ ...x, ...p }))
  const save = async () => {
    const ok = await run(async () => {
      if (!l.name.trim()) throw new Error(t('Give it a name'))
      let documentId = l.document_id ?? null
      if (file) {
        const problem = taxFileProblem(file.name, file.size)
        if (problem) throw new Error(t(problem))
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('')
        const year = Number((l.starts_on ?? l.expires_on ?? today()).slice(0, 4))
        documentId = (await api.uploadTaxDocument(file, { name: file.name, kind: 'contract', year, quarter: null, folder: ['Tax', 'Licences'], sha256: hash })).id
      }
      await api.saveLicence({ ...l, name: l.name.trim(), document_id: documentId })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (l.id && await run(() => api.deleteLicence(l.id!), t('Licence removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="licence-title">
      <DialogTitle id="licence-title">{l.id ? l.name : t('Add a licence')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={l.name} onChange={e => set({ name: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={l.category ?? 'permit'} onChange={e => set({ category: e.target.value as Licence['category'] })} sx={{ flex: 1 }}>
              {LICENCE_CATEGORIES.map(c => <MenuItem key={c.id} value={c.id}>{t(c.label)}</MenuItem>)}
            </TextField>
            <TextField label={t('Issued by')} value={l.issuer ?? ''} onChange={e => set({ issuer: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Number')} value={l.reference ?? ''} onChange={e => set({ reference: e.target.value })} sx={{ flex: 1 }}
              helperText={t('Expediente, policy or contract number')} />
            <TextField label={t('Holder')} value={l.holder ?? ''} onChange={e => set({ holder: e.target.value })} sx={{ flex: 1 }}
              helperText={t('A person’s, for a certificate')} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('From')} type="date" value={l.starts_on ?? ''} onChange={e => set({ starts_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Runs out')} type="date" value={l.expires_on ?? ''} onChange={e => set({ expires_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }}
              helperText={t('Leave empty if it doesn’t run out')} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Renews')} value={l.renew_every_months ?? ''} onChange={e => set({ renew_every_months: e.target.value === '' ? null : Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ flex: 1 }}>
              {RENEWALS.map(m => <MenuItem key={m ?? 'none'} value={m ?? ''}>{renewal(m)}</MenuItem>)}
            </TextField>
            <TextField label={t('Cost each time')} type="number" value={l.cost ?? ''} onChange={e => set({ cost: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('Remind me (days before)')} type="number" value={l.reminder_days ?? 30} onChange={e => set({ reminder_days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} sx={{ flex: 1 }} />
          </Stack>
          <FormControlLabel control={<Switch checked={!!l.auto_renews} onChange={e => set({ auto_renews: e.target.checked })} />} label={t('It renews by itself (a direct debit)')} />
          <TextField label={t('Website')} value={l.link ?? ''} onChange={e => set({ link: e.target.value || null })} placeholder={'https://'} helperText={t('Where it’s renewed or looked up')} />
          <TextField label={t('Notes')} value={l.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button startIcon={<AttachIcon />} onClick={() => input.current?.click()}>{l.document_id || file ? t('Replace the document') : t('Add the document')}</Button>
            <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {file?.name ?? (licence.document_id && (licence as Licence).document ? <Link href={(licence as Licence).document!.link ?? undefined} target="_blank" rel="noopener">{(licence as Licence).document!.name}</Link> : t('Kept in your Drive or OneDrive, under Tax › Licences'))}
            </Typography>
            <input ref={input} type="file" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {l.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
