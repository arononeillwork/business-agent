// A QR code on A4, to print or save as a PDF (no menu around it): the code large, its name and the
// line under it ("Scan for the menu"; for the Wi-Fi, the network's name too), or four to a page to
// cut out for the tables.
import { Box, Button, FormControlLabel, GlobalStyles, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { ErrorBox, Loading } from '../components/common'
import { QrPicture, useQrLook } from '../components/QrCode'
import { qrCaption, qrMissing, qrPayload, type QrCode } from '../../shared/qrCodes'
import { fonts } from '../theme'
import { t } from '../i18n'

type Layout = 'one' | 'four'

export function QrCodesPrintPage() {
  const { id } = useParams()
  const { api, business } = useApp()
  const [params, setParams] = useSearchParams()
  const codes = useAsync('qr-codes', () => api.qrCodes(), [])
  const lookOf = useQrLook()
  const layout: Layout = params.get('layout') === 'four' ? 'four' : 'one'
  const password = params.get('password') === '1'
  const set = (k: string, v: string | null) => { const p = new URLSearchParams(params); if (v === null) p.delete(k); else p.set(k, v); setParams(p, { replace: true }) }
  const c = codes.data?.find(x => x.id === id)
  if (codes.error) return <Box sx={{ p: 4 }}><ErrorBox error={codes.error} /></Box>
  if (!codes.data) return <Loading />
  const payload = c ? qrPayload(c) : null
  if (!c || !payload) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography sx={{ mb: 2 }}>{c ? t(qrMissing(c) ?? '') : t('That QR code has gone.')}</Typography>
        <Button component={RouterLink} to="/qr-codes" startIcon={<BackIcon />}>{t('Back to QR codes')}</Button>
      </Box>
    )
  }
  const look = lookOf(c)
  const cards = layout === 'four' ? [0, 1, 2, 3] : [0]
  return (
    <Box sx={{ bgcolor: '#E9E4DE', minHeight: '100vh', '@media print': { bgcolor: '#fff', minHeight: 0 } }}>
      <GlobalStyles styles={{ '@page': { size: 'A4', margin: 0 } }} />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#fff', borderBottom: '1px solid #DDD5CE', flexWrap: 'wrap', '@media print': { display: 'none' } }}>
        <Button component={RouterLink} to="/qr-codes" startIcon={<BackIcon />}>{t('Back')}</Button>
        <Typography sx={{ flex: 1, fontWeight: 500, minWidth: 120 }}>{c.name}</Typography>
        <TextField select size="small" label={t('On each A4 page')} value={layout} onChange={e => set('layout', e.target.value === 'four' ? 'four' : null)} sx={{ width: 220 }}>
          <MenuItem value="one">{t('One, large')}</MenuItem>
          <MenuItem value="four">{t('Four, to cut out')}</MenuItem>
        </TextField>
        {c.kind === 'wifi' && c.wifi_security !== 'nopass' && (
          <FormControlLabel control={<Switch checked={password} onChange={e => set('password', e.target.checked ? '1' : null)} />} label={t('Show the password')} />
        )}
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>{t('Print or save as PDF')}</Button>
      </Stack>
      <Box sx={{ width: '210mm', height: '297mm', maxWidth: '100%', mx: 'auto', my: 3, bgcolor: '#fff', boxShadow: '0 12px 34px rgba(60,40,30,0.22)',
        display: 'grid', gridTemplateColumns: layout === 'four' ? '1fr 1fr' : '1fr', gridTemplateRows: layout === 'four' ? '1fr 1fr' : '1fr', overflow: 'hidden',
        printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', '@media print': { my: 0, maxWidth: 'none', boxShadow: 'none' } }}>
        {cards.map(i => <Sheet key={i} code={c} payload={payload} look={look} small={layout === 'four'} password={password} business={business?.name ?? ''} />)}
      </Box>
    </Box>
  )
}

/** One code on its paper: the name, the code, the line under it, the network for a Wi-Fi code, the business. */
function Sheet({ code: c, payload, look, small, password, business }: {
  code: QrCode; payload: string; look: { dark: string; light: string; logo: string | null }; small: boolean; password: boolean; business: string
}) {
  const k = small ? 0.5 : 1
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#2B2522', px: `${14 * k}mm`,
      ...(small ? { outline: '0.2mm dashed #DDD5CE', outlineOffset: '-0.1mm' } : {}) }}>
      <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: `${34 * k}pt`, lineHeight: 1.15, mb: `${8 * k}mm` }}>{c.name}</Typography>
      <QrPicture payload={payload} look={look} size={`${150 * k}mm`} label={t('QR code for {name}', { name: c.name })} />
      <Typography sx={{ fontFamily: fonts.display, fontSize: `${22 * k}pt`, fontWeight: 500, mt: `${8 * k}mm`, lineHeight: 1.25 }}>{t(qrCaption(c))}</Typography>
      {c.kind === 'wifi' && c.wifi_ssid && (
        <Typography sx={{ fontSize: `${15 * k}pt`, mt: `${3 * k}mm`, color: '#5F5852' }}>
          {t('Network: {name}', { name: c.wifi_ssid })}
          {password && c.wifi_password && <><br />{t('Password: {password}', { password: c.wifi_password })}</>}
        </Typography>
      )}
      {business && <Typography sx={{ fontSize: `${11 * k}pt`, mt: `${12 * k}mm`, color: '#8E877F', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{business}</Typography>}
    </Box>
  )
}
