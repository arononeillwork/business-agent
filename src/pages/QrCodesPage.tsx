// QR codes (Business section; the owner calls them barcodes): the business's codes, each a link (the
// menu on the tables, the competition on the café screen), a Wi-Fi network (scan to join) or some
// text, ready to download as a PNG or an SVG, or to print. Everyone on the team sees and downloads
// them; admins add, change, order and remove them, starting from suggestions when there are none.
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem,
  Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import LinkIcon from '@mui/icons-material/LinkRounded'
import WifiIcon from '@mui/icons-material/WifiRounded'
import TextIcon from '@mui/icons-material/NotesRounded'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { QrPicture, useQrLogo, useQrLook } from '../components/QrCode'
import { downloadBlob } from '../lib/export'
import { qrPngBlob, qrSvgBlob } from '../lib/qrImage'
import {
  QR_KINDS, QR_LIMITS, QR_PLACES, WIFI_SECURITY, brandDark, colourProblem, qrCaption, qrColours, qrFileName, qrMissing, qrPayload, qrProblem, qrSuggestions,
  sortQrCodes, QR_LIGHT, type QrCode, type QrCodeInput, type QrKind, type QrSuggestion, type WifiSecurity,
} from '../../shared/qrCodes'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

const KIND_ICON: Record<QrKind, typeof LinkIcon> = { link: LinkIcon, wifi: WifiIcon, text: TextIcon }
const kindLabel = (k: QrKind) => t(QR_KINDS.find(x => x.id === k)?.label ?? 'Link')
/** How the network is locked, short: WPA, WEP or open. */
const securityLabel = (s: WifiSecurity) => (s === 'nopass' ? t('open network') : s)
/** A suggested code's name in the person's language ("Competition" is a giveaway here, not a league: its Spanish is under "qr|"). */
const suggested = (name: string) => tc('qr', name)
/** A link without its https:// and trailing slash, to read at a glance. */
const shortLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

export function QrCodesPage() {
  const { api, isAdmin, business } = useApp()
  const codes = useAsync('qr-codes', () => api.qrCodes(), [])
  // The business on Competitors, for its Google place (a Google review code); admins only, as that page.
  const competitors = useAsync('competitors', () => (isAdmin ? api.competitors() : Promise.resolve(null)), [isAdmin])
  const [editing, setEditing] = useState<QrCode | QrCodeInput | null>(null)
  const list = sortQrCodes(codes.data ?? [])
  const placeId = competitors.data?.competitors.find(c => c.is_self)?.place_id ?? null
  const suggestions = isAdmin && codes.data ? qrSuggestions(list, { website: business?.website, placeId, translate: suggested }) : []
  const run = useAction()
  const move = (i: number, by: -1 | 1) => {
    const ids = list.map(c => c.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    void run(() => api.orderQrCodes(ids))
  }
  const suggest = (s: QrSuggestion) => setEditing({ ...s.code, name: suggested(s.code.name), used_where: s.code.used_where && t(s.code.used_where),
    caption: s.code.caption && t(s.code.caption) })

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('QR codes')}
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', kind: 'link' })}>{t('Add a QR code')}</Button>} />
      <ErrorBox error={codes.error} />
      <Typography sx={{ mb: 2.5, maxWidth: 760 }}>
        {t('The business’s QR codes (barcodes), ready to download or print: the menu on the tables, the competition on the screen, the Wi-Fi on the counter. Try one with your phone’s camera before it goes out.')}
      </Typography>
      {codes.data && list.length === 0 && (
        <Empty>{isAdmin ? t('No QR codes yet. Start with a suggestion below, or add your own.') : t('No QR codes yet.')}</Empty>
      )}
      <Box role="list" aria-label={t('QR codes')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
        {list.map((c, i) => (
          <QrCard key={c.id} code={c} onEdit={() => setEditing(c)}
            onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < list.length - 1 ? () => move(i, 1) : undefined} />
        ))}
      </Box>
      {suggestions.length > 0 && (
        <Box component="section" aria-label={t('Suggestions')} sx={{ mt: 4 }}>
          <SectionTitle>{t('Suggestions')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('The codes most businesses start with. Add one, check it and it’s ready.')}</Typography>
          <Box role="list" aria-label={t('Suggestions')} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' } }}>
            {suggestions.map(s => {
              const Icon = KIND_ICON[s.code.kind ?? 'link']
              return (
                <Card key={s.key} role="listitem" aria-label={suggested(s.label)} variant="outlined">
                  <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Icon sx={{ color: tokens.roseDeep, mt: 0.25 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{suggested(s.label)}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t(s.description)}</Typography>
                      <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => suggest(s)}
                        aria-label={t('Add the {name} code', { name: suggested(s.label) })}>{t('Add')}</Button>
                    </Box>
                  </CardContent>
                </Card>
              )
            })}
          </Box>
        </Box>
      )}
      {editing && <QrCodeDialog code={editing} codes={list} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One code: the picture, what it does and where it's used, and its downloads. */
function QrCard({ code: c, onEdit, onUp, onDown }: { code: QrCode; onEdit: () => void; onUp?: () => void; onDown?: () => void }) {
  const { isAdmin } = useApp()
  const look = useQrLook()(c)
  const run = useAction()
  const payload = qrPayload(c)
  const missing = qrMissing(c)
  const Icon = KIND_ICON[c.kind]
  const download = (type: 'png' | 'svg') => run(async () => {
    if (!payload) return
    const blob = type === 'png' ? await qrPngBlob(payload, look) : await qrSvgBlob(payload, look, c.name)
    downloadBlob(`${qrFileName(c.name)}.${type}`, blob)
  })
  return (
    <Card role="listitem" aria-label={c.name}>
      <CardContent sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
        <Box sx={{ p: 1, borderRadius: 2, border: `1px solid ${tokens.line}`, bgcolor: '#FFFFFF', flexShrink: 0 }}>
          <QrPicture payload={payload} look={look} size={148} label={t('QR code for {name}', { name: c.name })} missing={missing} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, width: '100%' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h3" sx={{ lineHeight: 1.3 }}>{c.name}</Typography>
            <Tag><Icon sx={{ fontSize: 14, mr: 0.5 }} />{kindLabel(c.kind)}</Tag>
          </Stack>
          {c.used_where && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Used: {where}', { where: t(c.used_where) })}</Typography>}
          <Box sx={{ my: 1 }}>
            {c.kind === 'link' && c.url && (
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {t('Opens')}{' '}<Link href={c.url} target="_blank" rel="noopener noreferrer">{shortLink(c.url)}</Link>
              </Typography>
            )}
            {c.kind === 'wifi' && c.wifi_ssid && (
              <Typography variant="body2">{t('Network: {name}', { name: c.wifi_ssid })}{' · '}{securityLabel(c.wifi_security)}{c.wifi_hidden ? ` · ${t('hidden')}` : ''}</Typography>
            )}
            {c.kind === 'text' && c.content && <Typography variant="body2" sx={{ fontStyle: 'italic', overflowWrap: 'anywhere' }}>{c.content}</Typography>}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Printed with: “{line}”', { line: t(qrCaption(c)) })}</Typography>
          </Box>
          {missing && (
            <Alert severity="warning" sx={{ mb: 1 }}
              action={isAdmin ? <Button color="inherit" size="small" onClick={onEdit}>{t('Fill in')}</Button> : undefined}>
              {t(missing)}{isAdmin ? '' : ` ${t('An admin adds it here.')}`}
            </Alert>
          )}
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            {payload && <>
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => download('png')} aria-label={t('Download {name} as PNG', { name: c.name })}>{'PNG'}</Button>
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => download('svg')} aria-label={t('Download {name} as SVG', { name: c.name })}>{'SVG'}</Button>
              <Button size="small" startIcon={<PrintIcon />} component={RouterLink} to={`/qr-codes/print/${c.id}`} aria-label={t('Print {name}', { name: c.name })}>{t('Print')}</Button>
            </>}
            {isAdmin && <>
              <Button size="small" onClick={onEdit} aria-label={t('Edit {name}', { name: c.name })}>{t('Edit')}</Button>
              <Box sx={{ ml: 'auto' }}>
                <Tooltip title={t('Move up')}><span>
                  <IconButton size="small" disabled={!onUp} onClick={onUp} aria-label={t('Move {name} up', { name: c.name })}><UpIcon fontSize="small" /></IconButton>
                </span></Tooltip>
                <Tooltip title={t('Move down')}><span>
                  <IconButton size="small" disabled={!onDown} onClick={onDown} aria-label={t('Move {name} down', { name: c.name })}><DownIcon fontSize="small" /></IconButton>
                </span></Tooltip>
              </Box>
            </>}
          </Stack>
        </Box>
      </CardContent>
    </Card>
  )
}

/** A colour picker that can go back to the usual colour (null). */
function ColourField({ label, value, usual, onChange }: { label: string; value: string | null; usual: string; onChange: (v: string | null) => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flex: 1 }}>
      <TextField type="color" label={label} value={value ?? usual} onChange={e => onChange(e.target.value.toUpperCase())} sx={{ width: 120 }}
        slotProps={{ inputLabel: { shrink: true } }} />
      {value && <Button size="small" onClick={() => onChange(null)}>{t('Usual colour')}</Button>}
    </Stack>
  )
}

/** Add a code or change one: what it does, where it's used, the line printed under it, its colours. */
function QrCodeDialog({ code, codes, onClose }: { code: QrCode | QrCodeInput; codes: QrCode[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const brand = useAsync('brand', () => api.brand(), [])
  const logo = useQrLogo()
  const lookOf = useQrLook()
  const editing = 'id' in code && code.id ? (code as QrCode) : null
  const [f, setF] = useState<QrCodeInput>({ kind: 'link', url: null, content: null, wifi_ssid: null, wifi_password: null, wifi_security: 'WPA', wifi_hidden: false,
    used_where: null, caption: null, dark_colour: null, light_colour: null, logo: false, ...code })
  const [confirming, setConfirming] = useState(false)
  const set = (p: Partial<QrCodeInput>) => setF(x => ({ ...x, ...p }))
  const kind = f.kind ?? 'link'
  const shape = { kind, url: f.url ?? null, content: f.content ?? null, wifi_ssid: f.wifi_ssid ?? null, wifi_password: f.wifi_password ?? null,
    wifi_security: f.wifi_security ?? 'WPA', wifi_hidden: f.wifi_hidden ?? false }
  const payload = qrPayload(shape)
  const missing = qrMissing(shape)
  const look = lookOf({ dark_colour: f.dark_colour ?? null, light_colour: f.light_colour ?? null, logo: !!f.logo && !!logo })
  const colours = qrColours({ dark_colour: f.dark_colour ?? null, light_colour: f.light_colour ?? null }, brand.data?.colours)
  const colourWarning = colourProblem(colours.dark, colours.light)
  const name = (f.name ?? '').trim()
  const save = () => run(async () => {
    const next: QrCodeInput = { ...f, name, logo: !!f.logo && !!logo }
    const problem = qrProblem(next) ?? colourWarning
    if (problem) throw new Error(t(problem))
    if (codes.some(x => x.id !== editing?.id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(t('There’s already a code called {name}', { name }))
    await api.saveQrCode({
      id: editing?.id, name, kind, url: kind === 'link' ? next.url ?? null : null, content: kind === 'text' ? next.content ?? null : null,
      wifi_ssid: kind === 'wifi' ? next.wifi_ssid ?? null : null, wifi_password: kind === 'wifi' && next.wifi_security !== 'nopass' ? next.wifi_password ?? null : null,
      wifi_security: next.wifi_security ?? 'WPA', wifi_hidden: kind === 'wifi' && !!next.wifi_hidden, used_where: next.used_where ?? null, caption: next.caption ?? null,
      dark_colour: next.dark_colour ?? null, light_colour: next.light_colour ?? null, logo: next.logo,
      // A new one goes at the end.
      ...(editing ? {} : { sort: Math.max(0, ...codes.map(c => c.sort)) + 1 }),
    })
    onClose()
  }, editing ? t('Saved') : t('{name} added', { name }))
  const remove = () => run(async () => { if (editing) await api.deleteQrCode(editing.id); onClose() }, t('{name} removed', { name: editing?.name ?? '' }))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{editing ? editing.name : name ? t('Add {name}', { name }) : t('Add a QR code')}</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
            <TextField label={t('Name')} value={f.name} onChange={e => set({ name: e.target.value })} autoFocus={!editing}
              placeholder={t('Menu')} slotProps={{ htmlInput: { maxLength: QR_LIMITS.name } }} />
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('What it does')}</Typography>
              <ToggleButtonGroup exclusive size="small" value={kind} aria-label={t('What it does')} onChange={(_, v: QrKind | null) => v && set({ kind: v })}>
                {QR_KINDS.map(k => { const Icon = KIND_ICON[k.id]; return <ToggleButton key={k.id} value={k.id} sx={{ px: 2, gap: 0.75 }}><Icon fontSize="small" />{t(k.label)}</ToggleButton> })}
              </ToggleButtonGroup>
            </Box>
            {kind === 'link' && (
              <TextField label={t('Link it opens')} value={f.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder={'https://example.com/menu'}
                helperText={t('The web page a phone opens when it scans the code.')} slotProps={{ htmlInput: { maxLength: QR_LIMITS.url, inputMode: 'url' } }} />
            )}
            {kind === 'wifi' && <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField label={t('Network name')} value={f.wifi_ssid ?? ''} onChange={e => set({ wifi_ssid: e.target.value })} sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { maxLength: QR_LIMITS.ssid, autoComplete: 'off' } }} />
                {f.wifi_security !== 'nopass' && (
                  <TextField label={t('Password')} value={f.wifi_password ?? ''} onChange={e => set({ wifi_password: e.target.value })} sx={{ flex: 1 }}
                    slotProps={{ htmlInput: { maxLength: QR_LIMITS.password, autoComplete: 'off', spellCheck: false } }} />
                )}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                <TextField select label={t('Security')} value={f.wifi_security ?? 'WPA'} onChange={e => set({ wifi_security: e.target.value as WifiSecurity })} sx={{ flex: 1 }}>
                  {WIFI_SECURITY.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
                </TextField>
                <FormControlLabel control={<Switch checked={!!f.wifi_hidden} onChange={e => set({ wifi_hidden: e.target.checked })} />} label={t('Hidden network')} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('Exactly as on the router’s sticker: capitals and spaces count. A phone that scans the code joins without typing it.')}
              </Typography>
            </>}
            {kind === 'text' && (
              <TextField label={t('What it shows')} value={f.content ?? ''} onChange={e => set({ content: e.target.value })} multiline minRows={2}
                slotProps={{ htmlInput: { maxLength: QR_LIMITS.content } }} />
            )}
            <Autocomplete freeSolo options={QR_PLACES.map(p => t(p))} inputValue={f.used_where ?? ''} onInputChange={(_, v) => set({ used_where: v })}
              renderInput={p => <TextField {...p} label={t('Where it’s used (optional)')} placeholder={t('On the tables')} />} />
            <TextField label={t('Line printed under it (optional)')} value={f.caption ?? ''} onChange={e => set({ caption: e.target.value })}
              placeholder={t(qrCaption({ kind, caption: null }))} slotProps={{ htmlInput: { maxLength: QR_LIMITS.caption } }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <ColourField label={t('Code colour')} value={f.dark_colour ?? null} usual={brandDark(brand.data?.colours)} onChange={v => set({ dark_colour: v })} />
              <ColourField label={t('Background')} value={f.light_colour ?? null} usual={QR_LIGHT} onChange={v => set({ light_colour: v })} />
            </Stack>
            {colourWarning && <Alert severity="warning">{t(colourWarning)}</Alert>}
            <FormControlLabel disabled={!logo} control={<Switch checked={!!f.logo && !!logo} onChange={e => set({ logo: e.target.checked })} />}
              label={logo ? t('Logo in the middle') : t('Logo in the middle (add a logo on the Brand page first)')} />
          </Stack>
          <Stack spacing={1} sx={{ alignItems: 'center', width: { md: 240 }, flexShrink: 0 }}>
            <Box sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${tokens.line}`, bgcolor: '#FFFFFF' }}>
              <QrPicture payload={payload} look={look} size={208} label={t('Preview of the QR code')} missing={missing} />
            </Box>
            <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 500 }}>{f.caption?.trim() || t(qrCaption({ kind, caption: null }))}</Typography>
            {missing && <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
              {t('It can be saved without it; it’s ready to download once it’s added.')}
            </Typography>}
          </Stack>
        </Stack>
        {confirming && editing && (
          <Alert severity="warning" sx={{ mt: 2 }} action={<Button color="error" size="small" onClick={remove}>{t('Remove')}</Button>}>
            {t('Remove {name}? Copies already printed keep working: the code holds what it says itself.', { name: editing.name })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {editing && <Button color="error" sx={{ mr: 'auto' }} onClick={() => setConfirming(true)} disabled={confirming}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name} onClick={save}>{editing ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
