import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import QuoteIcon from '@mui/icons-material/RequestQuoteOutlined'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { FEATURES } from '../app/features'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatMoney, localDate, today } from '../../shared/time'
import { cleanPhone, customerName } from '../../shared/customers'
import {
  CHANNELS, STAGES, channelLabel, followUpDue, isOpen, pipeline, stageLabel,
  type Enquiry, type EnquiryInput, type EnquiryStage, type NewLead,
} from '../../shared/leads'
import type { Customer } from '../../shared/types'
import { tokens } from '../theme'
import { t } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const TONE: Record<EnquiryStage, { fg: string; bg: string }> = {
  new: { fg: tokens.infoFg, bg: tokens.infoBg }, contacted: { fg: tokens.warnFg, bg: tokens.warnBg }, quoted: { fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  won: { fg: tokens.goodFg, bg: tokens.goodBg }, lost: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
type Show = 'open' | EnquiryStage | 'all'
const who = (e: Enquiry) => (e.customer ? customerName(e.customer) : '')

/**
 * Leads & enquiries (Sales): what people asked for (a party, the terrace, office coffee), where it
 * came in, how far it's got and when to follow it up. Each belongs to someone on Customers, added
 * here as a lead when they're new; a quote made for one moves it to Quoted (Quotes & estimates, while
 * it's switched on) and a won one makes them a customer. Admins only (the database enforces it too).
 */
export function LeadsPage() {
  const { api, isAdmin } = useApp()
  const list = useAsync('enquiries', () => api.enquiries(), [])
  const run = useAction()
  const navigate = useNavigate()
  const [show, setShow] = useState<Show>('open')
  const [editing, setEditing] = useState<EnquiryInput | null>(null)

  if (!isAdmin) {
    return <>
      <PageHeader eyebrow={t('Sales')} title={t('Leads & enquiries')} />
      <Alert severity="info">{t('Leads and enquiries are only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const all = list.data ?? []
  const figures = pipeline(all, `${now.slice(0, 7)}-01`)
  const rate = pipeline(all, addDays(now, -90)).winRate
  const due = all.filter(e => followUpDue(e, now))
  const shown = all.filter(e => (show === 'all' ? true : show === 'open' ? isOpen(e) : e.stage === show))
  const count = (s: Show) => all.filter(e => (s === 'all' ? true : s === 'open' ? isOpen(e) : e.stage === s)).length

  const move = (e: Enquiry, stage: EnquiryStage) => run(() => api.saveEnquiry({ id: e.id, title: e.title, stage }), t('Moved to {stage}', { stage: t(stageLabel(stage)) }))

  const table = (): ExportTable => ({
    title: t('Leads & enquiries'), filename: `enquiries-${now}`,
    columns: [t('Enquiry'), t('Person'), t('Company'), t('Email'), t('Phone'), t('Came in by'), t('Received'), t('For'), t('Value'), t('Stage'), t('Follow up'), t('Notes')],
    rows: shown.map(e => [e.title, who(e), e.customer?.company ?? '', e.customer?.email ?? '', e.customer?.phone ?? '', t(channelLabel(e.channel)),
      localDate(e.received_at), e.wanted_on ?? '', e.value, t(stageLabel(e.stage)), e.follow_up_on ?? '', e.notes ?? '']),
    money: [8],
  })

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Leads & enquiries')} actions={<>
        <ExportButton table={table} disabled={!shown.length} folder="Sales" />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ title: '', channel: 'whatsapp', stage: 'new' })}>{t('Add an enquiry')}</Button>
      </>} />
      <ErrorBox error={list.error} />

      <StatGrid>
        <StatTile label={t('Open')} value={list.data ? figures.open : '–'} note={t('Worth {amount}', { amount: formatMoney(figures.openValue) })} />
        <StatTile label={t('Follow up today')} value={due.length} note={due.length ? due.map(e => who(e)).join(', ') : t('Nothing due')} />
        <StatTile label={t('Won this month')} value={figures.won} note={t('Worth {amount}', { amount: formatMoney(figures.wonValue) })} />
        <StatTile label={t('Win rate')} value={rate === null ? '–' : `${rate}%`} note={t('Of those closed in the last 90 days')} />
      </StatGrid>

      {due.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('To follow up: {list}', { list: due.map(e => `${who(e)} (${e.title})`).join(', ') })}
        </Alert>
      )}

      <Card component="section" aria-label={t('Enquiries')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={
            <TextField select size="small" label={t('Show')} value={show} onChange={e => setShow(e.target.value as Show)} sx={{ width: 190, flexShrink: 0 }}>
              <MenuItem value="open">{t('Open ({n})', { n: count('open') })}</MenuItem>
              {STAGES.map(s => <MenuItem key={s.id} value={s.id}>{`${t(s.label)} (${count(s.id)})`}</MenuItem>)}
              <MenuItem value="all">{t('All ({n})', { n: count('all') })}</MenuItem>
            </TextField>
          }>{t('Enquiries')}</SectionTitle>
          {shown.length === 0
            ? <Empty>{list.data ? t('No enquiries here. Add one when someone asks about something.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Enquiry')}</TableCell><TableCell>{t('For')}</TableCell>
                    <TableCell align="right">{t('Value')}</TableCell><TableCell>{t('Stage')}</TableCell><TableCell>{t('Follow up')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {shown.map(e => (
                      <TableRow key={e.id} hover>
                        <TableCell sx={{ minWidth: 240 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{e.title}</Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{[who(e), e.customer?.company, e.customer?.phone ?? e.customer?.email].filter(Boolean).join(' · ')}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('{channel}, {date}', { channel: t(channelLabel(e.channel)), date: day(localDate(e.received_at)) })}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(e.wanted_on)}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{e.value === null ? '' : formatMoney(e.value)}</TableCell>
                        <TableCell>
                          <TextField select size="small" variant="standard" value={e.stage} onChange={x => void move(e, x.target.value as EnquiryStage)}
                            slotProps={{ input: { disableUnderline: true }, select: { SelectDisplayProps: { 'aria-label': t('Stage of {name}', { name: e.title }) },
                              renderValue: v => <Tag {...TONE[v as EnquiryStage]}>{t(stageLabel(v as EnquiryStage))}</Tag> } }}>
                            {STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
                          </TextField>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {isOpen(e) && day(e.follow_up_on)}
                          {followUpDue(e, now) && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{e.follow_up_on! < now ? t('Overdue') : t('Today')}</Tag></Box>}
                          {e.stage === 'lost' && e.lost_reason && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{e.lost_reason}</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {isOpen(e) && FEATURES.quotes && (
                            <IconButton size="small" onClick={() => navigate(`/quotes?enquiry=${e.id}`)} aria-label={t('Make a quote for {name}', { name: e.title })}
                              title={t('Make a quote')}><QuoteIcon fontSize="small" /></IconButton>
                          )}
                          <IconButton size="small" aria-label={t('Edit {name}', { name: e.title })} onClick={() => setEditing(e)}><EditIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('Everyone here is on the Customers page too: a lead until something of theirs is won.')}{' '}
            <RouterLink to="/customers">{t('Open Customers')}</RouterLink>
          </Typography>
        </CardContent>
      </Card>

      {editing && <EnquiryDialog enquiry={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One enquiry: who it's from (someone on Customers, or someone new), what they asked for, and where it's got. */
function EnquiryDialog({ enquiry, onClose }: { enquiry: EnquiryInput; onClose: () => void }) {
  const { api, profiles } = useApp()
  const run = useAction()
  const people = useAsync('customers', () => api.customers(), [])
  const [e, setE] = useState<EnquiryInput>(enquiry)
  const [someoneNew, setSomeoneNew] = useState(!enquiry.id && !enquiry.customer_id)
  const [lead, setLead] = useState<NewLead>({ first_name: '', last_name: '', email: '', phone: '', company: '', marketing_consent: false })
  const set = (p: Partial<EnquiryInput>) => setE(x => ({ ...x, ...p }))
  const setNew = (p: Partial<NewLead>) => setLead(x => ({ ...x, ...p }))
  const options = useMemo(() => [...(people.data ?? [])].sort((a, b) => (a.kind === b.kind ? customerName(a).localeCompare(customerName(b)) : a.kind === 'lead' ? -1 : 1)),
    [people.data])
  const picked = options.find(c => c.id === e.customer_id) ?? null
  const admins = profiles.filter(p => p.role === 'admin' && p.active)

  const save = async () => {
    const ok = await run(async () => {
      if (!e.title.trim()) throw new Error(t('Say what they asked for'))
      let newLead: NewLead | undefined
      if (!e.id && someoneNew) {
        const phone = lead.phone?.trim() ? cleanPhone(lead.phone) : null
        if (lead.phone?.trim() && !phone) throw new Error(t('That phone number doesn’t look right'))
        newLead = { ...lead, phone, email: lead.email?.trim() || null }
        if (!newLead.first_name?.trim() && !newLead.last_name?.trim() && !newLead.email && !newLead.phone) throw new Error(t('Add a name, an email or a phone number'))
      } else if (!e.customer_id) throw new Error(t('Pick who it’s from, or add them'))
      const { customer: _c, closed_at: _closed, ...input } = e as Enquiry
      await api.saveEnquiry({ ...input, title: e.title.trim() }, newLead)
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (e.id && await run(() => api.deleteEnquiry(e.id!), t('Enquiry removed'))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="enquiry-title">
      <DialogTitle id="enquiry-title">{e.id ? e.title : t('Add an enquiry')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!e.id && (
            <ToggleButtonGroup exclusive size="small" value={someoneNew ? 'new' : 'known'} onChange={(_, v) => v && setSomeoneNew(v === 'new')} aria-label={t('Who it’s from')}>
              <ToggleButton value="new">{t('Someone new')}</ToggleButton>
              <ToggleButton value="known">{t('On Customers already')}</ToggleButton>
            </ToggleButtonGroup>
          )}
          {!e.id && someoneNew ? (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label={t('First name')} value={lead.first_name ?? ''} onChange={x => setNew({ first_name: x.target.value })} sx={{ flex: 1 }} />
                <TextField label={t('Last name')} value={lead.last_name ?? ''} onChange={x => setNew({ last_name: x.target.value })} sx={{ flex: 1 }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label={t('Email')} type="email" value={lead.email ?? ''} onChange={x => setNew({ email: x.target.value })} sx={{ flex: 1 }} />
                <TextField label={t('Phone')} value={lead.phone ?? ''} onChange={x => setNew({ phone: x.target.value })} sx={{ flex: 1 }} />
              </Stack>
              <TextField label={t('Company')} value={lead.company ?? ''} onChange={x => setNew({ company: x.target.value })} helperText={t('For a business: a hotel, an office, a studio')} />
              <FormControlLabel control={<Checkbox checked={!!lead.marketing_consent} onChange={x => setNew({ marketing_consent: x.target.checked })} />}
                label={t('They said yes to marketing')} />
            </>
          ) : (
            <Autocomplete options={options} value={picked} onChange={(_, c: Customer | null) => set({ customer_id: c?.id })}
              getOptionLabel={c => [customerName(c), c.company].filter(Boolean).join(' · ')} isOptionEqualToValue={(a, b) => a.id === b.id}
              groupBy={c => (c.kind === 'lead' ? t('Leads') : t('Customers'))} noOptionsText={t('Nobody by that name')}
              renderInput={p => <TextField {...p} label={t('Who it’s from')} required />} />
          )}
          <TextField label={t('What they asked for')} value={e.title} onChange={x => set({ title: x.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Came in by')} value={e.channel ?? 'other'} onChange={x => set({ channel: x.target.value as Enquiry['channel'] })} sx={{ flex: 1 }}>
              {CHANNELS.map(c => <MenuItem key={c.id} value={c.id}>{t(c.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Stage')} value={e.stage ?? 'new'} onChange={x => set({ stage: x.target.value as EnquiryStage })} sx={{ flex: 1 }}>
              {STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {e.stage === 'lost' && <TextField label={t('Why it was lost')} value={e.lost_reason ?? ''} onChange={x => set({ lost_reason: x.target.value })} />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Worth about (with IVA)')} type="number" value={e.value ?? ''} onChange={x => set({ value: x.target.value === '' ? null : Number(x.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('For the day')} type="date" value={e.wanted_on ?? ''} onChange={x => set({ wanted_on: x.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Follow up on')} type="date" value={e.follow_up_on ?? ''} onChange={x => set({ follow_up_on: x.target.value || null })} slotProps={{ inputLabel: { shrink: true } }}
              helperText={t('A reminder in the bell that day')} sx={{ flex: 1 }} />
            <TextField select label={t('Looked after by')} value={e.assigned_to ?? ''} onChange={x => set({ assigned_to: x.target.value || null })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ flex: 1 }}>
              <MenuItem value="">{t('Any admin')}</MenuItem>
              {admins.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Notes')} value={e.notes ?? ''} multiline minRows={2} onChange={x => set({ notes: x.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {e.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
