import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, FormLabel,
  IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, localDate, today, zonedIso } from '../../shared/time'
import { SOURCES, sourceLabel } from '../../shared/customers'
import {
  CAMPAIGN_CHANNELS, EVERYONE, FIRST_NAME_TAG, audienceOf, campaignStatusLabel, channelName, personalise, smsParts,
  type Audience, type CampaignChannel, type CampaignInput, type CampaignStatus,
} from '../../shared/campaigns'
import type { Customer, CustomerKind, CustomerSource } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const when = (iso: string | null) => (iso ? formatLocal(iso, 'd MMM yyyy, HH:mm') : '')
const TONE: Record<CampaignStatus, { fg: string; bg: string }> = {
  draft: { fg: tokens.neutralFg, bg: tokens.neutralBg }, scheduled: { fg: tokens.infoFg, bg: tokens.infoBg }, sent: { fg: tokens.goodFg, bg: tokens.goodBg },
}
const KINDS: { id: CustomerKind; label: string }[] = [{ id: 'customer', label: msg('Customers') }, { id: 'lead', label: msg('Leads') }]

/** "Customers tagged regular", in a line. */
function audienceText(a: Audience) {
  const parts = [
    a.kinds.length === 1 ? t(a.kinds[0] === 'customer' ? 'Customers' : 'Leads') : t('Customers and leads'),
    a.tags.length ? t('tagged {tags}', { tags: a.tags.join(', ') }) : '',
    a.sources.length ? t('from {places}', { places: a.sources.map(s => t(sourceLabel(s))).join(', ') }) : '',
  ]
  return parts.filter(Boolean).join(' ')
}

/**
 * Campaigns (Marketing): one message (an email, a text or a WhatsApp) to the customers and leads who
 * said yes to marketing, picked by type, tag and where they came from. Sending from the app comes
 * with an email marketing service on Connections; until then the audience is exported to send from
 * the business's own email or marketing app, and the campaign marked sent. Admins only.
 */
export function CampaignsPage() {
  const { api, isAdmin } = useApp()
  const list = useAsync('campaigns', () => api.campaigns(), [])
  const people = useAsync('customers', () => api.customers(), [])
  const [editing, setEditing] = useState<CampaignInput | null>(null)

  if (!isAdmin) {
    return <>
      <PageHeader eyebrow={t('Marketing')} title={t('Campaigns')} />
      <Alert severity="info">{t('Campaigns are only visible to admins.')}</Alert>
    </>
  }

  const all = list.data ?? []
  const customers = people.data ?? []
  const agreed = customers.filter(c => c.marketing_consent)
  const year = today().slice(0, 4)

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Campaigns')} actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', channel: 'email', body: '', audience: { ...EVERYONE }, status: 'draft' })}>
          {t('New campaign')}
        </Button>
      } />
      <ErrorBox error={list.error ?? people.error} />

      <StatGrid>
        <StatTile label={t('Said yes to marketing')} value={people.data ? agreed.length : '–'} note={t('Of {n} on Customers', { n: customers.length })} />
        <StatTile label={t('By email')} value={audienceOf(customers, EVERYONE, 'email').length} note={t('With an email address')} />
        <StatTile label={t('By text or WhatsApp')} value={audienceOf(customers, EVERYONE, 'sms').length} note={t('With a phone number')} />
        <StatTile label={t('Sent this year')} value={all.filter(c => c.status === 'sent' && (c.sent_at ?? '').startsWith(year)).length} />
      </StatGrid>

      <Alert severity="info" sx={{ mb: 3 }}>
        {t('Sending straight from the app comes with Brevo or Mailchimp on Connections. Until then, export who a campaign goes to, send it from your email or marketing app, and mark it sent here.')}{' '}
        <RouterLink to="/connections">{t('Open Connections')}</RouterLink>
      </Alert>

      <Card component="section" aria-label={t('Campaigns')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Campaigns')}</SectionTitle>
          {all.length === 0
            ? <Empty>{list.data ? t('No campaigns yet.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Campaign')}</TableCell><TableCell>{t('Goes to')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {all.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[t(channelName(c.channel)), c.subject].filter(Boolean).join(' · ')}</Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 180 }}>
                          {audienceText(c.audience)}
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            {c.status === 'sent' && c.recipients !== null ? tn(c.recipients, 'Sent to {n} person', 'Sent to {n} people')
                              : tn(audienceOf(customers, c.audience, c.channel).length, '{n} person now', '{n} people now')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Tag {...TONE[c.status]}>{t(campaignStatusLabel(c.status))}</Tag>
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{when(c.status === 'sent' ? c.sent_at : c.scheduled_at)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" aria-label={t('Edit {name}', { name: c.name })} onClick={() => setEditing(c)}><EditIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {editing && <CampaignDialog campaign={editing} customers={customers} onClose={() => setEditing(null)} />}
    </>
  )
}

/** A campaign: the message, who it goes to (with the count and an example), and when; export the audience and mark it sent. */
function CampaignDialog({ campaign, customers, onClose }: { campaign: CampaignInput; customers: Customer[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [c, setC] = useState<CampaignInput>(campaign)
  const set = (p: Partial<CampaignInput>) => setC(x => ({ ...x, ...p }))
  const audience = c.audience ?? EVERYONE
  const setAudience = (p: Partial<Audience>) => set({ audience: { ...audience, ...p } })
  const channel = c.channel ?? 'email'
  const goesTo = audienceOf(customers, audience, channel)
  const tags = useMemo(() => [...new Set(customers.flatMap(x => x.tags))].sort((a, b) => a.localeCompare(b)), [customers])
  const example = goesTo[0]
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...new Set([...list, v])] : list.filter(x => x !== v))

  const audienceTable = (): ExportTable => ({
    title: c.name || t('Campaign'), filename: `campaign-${(c.name || 'audience').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}`,
    columns: [t('First name'), t('Last name'), channel === 'email' ? t('Email') : t('Phone'), t('Company'), t('Tags')],
    rows: goesTo.map(x => [x.first_name ?? '', x.last_name ?? '', (channel === 'email' ? x.email : x.phone) ?? '', x.company ?? '', x.tags.join(', ')]),
  })
  const save = async (patch: Partial<CampaignInput> = {}, done = t('Saved')) => {
    const next = { ...c, ...patch }
    const ok = await run(async () => {
      if (!next.name.trim()) throw new Error(t('Give the campaign a name'))
      if (next.status === 'scheduled' && !next.scheduled_at) throw new Error(t('Pick when it’s planned for'))
      await api.saveCampaign({ ...next, name: next.name.trim() })
    }, done)
    if (ok) onClose()
  }
  const remove = async () => { if (c.id && await run(() => api.deleteCampaign(c.id!), t('Campaign removed'))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="campaign-title">
      <DialogTitle id="campaign-title">{c.id ? c.name : t('New campaign')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Name')} value={c.name} onChange={e => set({ name: e.target.value })} required sx={{ flex: 2 }} helperText={t('Only for you: “October regulars”')} />
            <TextField select label={t('Sent by')} value={channel} onChange={e => set({ channel: e.target.value as CampaignChannel })} sx={{ flex: 1 }}>
              {CAMPAIGN_CHANNELS.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {channel === 'email' && <TextField label={t('Subject')} value={c.subject ?? ''} onChange={e => set({ subject: e.target.value })} />}
          <TextField label={t('Message')} value={c.body ?? ''} multiline minRows={5} onChange={e => set({ body: e.target.value })}
            helperText={channel === 'sms'
              ? tn(smsParts(c.body ?? ''), '{n} text message each. Write {tag} where each person’s first name goes.', '{n} text messages each. Write {tag} where each person’s first name goes.', { tag: FIRST_NAME_TAG })
              : t('Write {tag} where each person’s first name goes.', { tag: FIRST_NAME_TAG })} />
          {channel === 'whatsapp' && <Alert severity="info">{t('WhatsApp only delivers marketing messages written as a template Meta has approved.')}</Alert>}

          <Box component="section" aria-label={t('Who it goes to')}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Who it goes to')}</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <FormLabel component="legend" sx={{ fontSize: '0.8rem' }}>{t('Type')}</FormLabel>
                <FormGroup row>
                  {KINDS.map(k => (
                    <FormControlLabel key={k.id} label={t(k.label)} control={
                      <Checkbox checked={audience.kinds.includes(k.id)} onChange={e => setAudience({ kinds: toggle(audience.kinds, k.id, e.target.checked) })} />} />
                  ))}
                </FormGroup>
              </Box>
              <Autocomplete multiple sx={{ flex: 1 }} options={tags} value={audience.tags} onChange={(_, v) => setAudience({ tags: v })}
                renderValue={(value, getItemProps) => value.map((x, i) => { const { key, ...p } = getItemProps({ index: i }); return <Chip key={key} size="small" label={x} {...p} /> })}
                renderInput={p => <TextField {...p} label={t('Tagged')} />} />
              <Autocomplete multiple sx={{ flex: 1 }} options={SOURCES.map(s => s.key)} value={audience.sources} getOptionLabel={s => t(sourceLabel(s))}
                onChange={(_, v: CustomerSource[]) => setAudience({ sources: v })}
                renderValue={(value, getItemProps) => value.map((x, i) => { const { key, ...p } = getItemProps({ index: i }); return <Chip key={key} size="small" label={t(sourceLabel(x))} {...p} /> })}
                renderInput={p => <TextField {...p} label={t('Came from')} />} />
            </Stack>
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {tn(goesTo.length, 'Goes to {n} person who said yes to marketing', 'Goes to {n} people who said yes to marketing')}
              {' · '}<Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{t('Nobody who said no is ever included.')}</Typography>
            </Typography>
            {example && (c.body ?? '').trim() && (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: tokens.surfaceAlt, whiteSpace: 'pre-wrap' }} aria-label={t('How it reads')}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('How {name} gets it', { name: example.first_name ?? example.email ?? example.phone ?? '' })}</Typography>
                <Typography variant="body2">{personalise(c.body ?? '', example.first_name)}</Typography>
              </Box>
            )}
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Status')} value={c.status ?? 'draft'} onChange={e => set({ status: e.target.value as CampaignStatus })} sx={{ flex: 1 }}>
              <MenuItem value="draft">{t('Draft')}</MenuItem>
              <MenuItem value="scheduled">{t('Planned')}</MenuItem>
              <MenuItem value="sent">{t('Sent')}</MenuItem>
            </TextField>
            <TextField label={t('Planned for')} type="datetime-local" sx={{ flex: 1 }} slotProps={{ inputLabel: { shrink: true } }}
              value={c.scheduled_at ? `${localDate(c.scheduled_at)}T${formatLocal(c.scheduled_at, 'HH:mm')}` : ''}
              onChange={e => set({ scheduled_at: e.target.value ? zonedIso(e.target.value.slice(0, 10), e.target.value.slice(11, 16)) : null })}
              helperText={t('A reminder in the bell that day')} />
          </Stack>
          <TextField label={t('Notes')} value={c.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {c.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <ExportButton table={audienceTable} disabled={!goesTo.length} folder="Campaigns" />
        {c.status !== 'sent' && (
          <Button variant="outlined" onClick={() => void save({ status: 'sent', recipients: goesTo.length }, tn(goesTo.length, 'Marked sent to {n} person', 'Marked sent to {n} people'))}
            disabled={!goesTo.length}>{t('Mark as sent')}</Button>
        )}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
