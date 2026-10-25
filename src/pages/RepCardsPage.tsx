import { Box, Button, GlobalStyles, MenuItem, Stack, TextField, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBack'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Loading } from '../components/common'
import { BrandLogo } from '../components/Logo'
import type { SalesRep } from '../../shared/reps'
import { fonts } from '../theme'
import { t } from '../i18n'

const COPIES = [1, 5, 10, 20]

/**
 * Business cards for the reps, ready to print or save as PDF: ten to an A4 sheet at the usual
 * 85 × 55 mm, each with the rep's name and code and what the card offers a new customer (saved,
 * so every card says the same). Admins.
 */
export function RepCardsPage() {
  const { api, business } = useApp()
  const run = useAction()
  const [params, setParams] = useSearchParams()
  const reps = useAsync('sales-reps', () => api.salesReps(), [])
  const settings = useAsync('rep-settings', () => api.repSettings(), [])
  const [offer, setOffer] = useState<string | null>(null)
  useEffect(() => { if (settings.data && offer === null) setOffer(settings.data.welcome_offer ?? '') }, [settings.data, offer])
  const who = params.get('rep') ?? 'all'
  const copies = COPIES.includes(Number(params.get('copies'))) ? Number(params.get('copies')) : 10
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }
  const active = (reps.data ?? []).filter(r => r.active).sort((a, b) => a.name.localeCompare(b.name))
  const chosen = who === 'all' ? active : active.filter(r => r.id === who)
  const cards = chosen.flatMap(r => Array.from({ length: copies }, (_, i) => ({ rep: r, key: `${r.id}-${i}` })))
  const saveOffer = () => {
    if (offer === null || offer.trim() === (settings.data?.welcome_offer ?? '')) return
    void run(() => api.updateRepSettings({ welcome_offer: offer.trim() || null }), t('Saved for every card'))
  }

  return (
    <Box sx={{ bgcolor: '#F3F1EE', minHeight: '100vh', '@media print': { bgcolor: '#fff' } }}>
      <GlobalStyles styles={{ '@page': { size: 'A4', margin: '11mm 20mm' } }} />
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', px: 2, py: 1.25,
        '@media print': { display: 'none' } }}>
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap', maxWidth: 900, mx: 'auto' }}>
          <Button component={RouterLink} to="/sales-reps" startIcon={<BackIcon />}>{t('Back')}</Button>
          <Typography sx={{ fontWeight: 500, flex: 1, minWidth: 140 }}>{t('Business cards')}</Typography>
          <TextField select size="small" label={t('Rep')} value={chosen.length || who === 'all' ? who : 'all'} onChange={e => set('rep', e.target.value)} sx={{ width: 220 }}>
            <MenuItem value="all">{t('Every rep')}</MenuItem>
            {active.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('Cards each')} value={copies} onChange={e => set('copies', e.target.value)} sx={{ width: 120 }}>
            {COPIES.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!cards.length}>{t('Print / save PDF')}</Button>
        </Stack>
        <Box sx={{ maxWidth: 900, mx: 'auto', mt: 1.25 }}>
          <TextField size="small" fullWidth label={t('What the card offers a new customer')} value={offer ?? ''} onChange={e => setOffer(e.target.value)}
            onBlur={saveOffer} onKeyDown={e => { if (e.key === 'Enter') saveOffer() }} placeholder={t('10% off your first drink')}
            helperText={t('On every card, under the code. Keep it short.')} slotProps={{ htmlInput: { maxLength: 120 } }} />
        </Box>
      </Box>
      <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 1, sm: 3 }, '@media print': { p: 0, maxWidth: 'none' } }}>
        <ErrorBox error={reps.error ?? settings.error} />
        {!reps.data && !reps.error && <Loading />}
        {reps.data && cards.length === 0 && <Typography sx={{ p: 3 }}>{t('No reps to make cards for yet.')}</Typography>}
        <Box role="list" aria-label={t('Business cards')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 85mm)', justifyContent: 'center', gap: '4mm',
          '@media print': { gridTemplateColumns: 'repeat(2, 85mm)', gap: 0 } }}>
          {cards.map(c => <RepCard key={c.key} rep={c.rep} offer={offer?.trim() || null} business={business?.name ?? ''}
            address={business?.address ?? ''} instagram={business?.instagram ?? ''} />)}
        </Box>
      </Box>
    </Box>
  )
}

/** One card, 85 × 55 mm: the café, who recommends it, their code and the offer. Brand colours, both themes. */
function RepCard({ rep, offer, business, address, instagram }: { rep: SalesRep; offer: string | null; business: string; address: string; instagram: string }) {
  return (
    <Box role="listitem" aria-label={t('Card for {name}', { name: rep.name })} sx={{ width: '85mm', height: '55mm', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      bgcolor: '#FBF8F4', color: '#2B2522', borderRadius: '3mm', boxShadow: 1, display: 'flex', breakInside: 'avoid',
      '@media print': { boxShadow: 'none', borderRadius: 0, outline: '0.2mm dashed #DDD5CE', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } }}>
      <Box sx={{ width: '30mm', flexShrink: 0, bgcolor: '#F3DED3', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ width: '22mm', position: 'relative', zIndex: 1, '& img': { width: '22mm !important', height: 'auto !important', borderRadius: '50% !important' } }}><BrandLogo height={84} /></Box>
        <Box aria-hidden sx={{ position: 'absolute', left: '-8mm', bottom: '-8mm', width: '20mm', height: '20mm', borderRadius: '50%', bgcolor: '#F79BA4', opacity: 0.5 }} />
      </Box>
      <Box sx={{ flex: 1, p: '4mm', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '11pt', lineHeight: 1.15 }}>{business}</Typography>
        <Typography sx={{ fontSize: '7.5pt', color: '#5F5852', mt: '0.6mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Recommended by {name}', { name: rep.name })}</Typography>
        <Box sx={{ mt: 'auto', mb: '1.5mm' }}>
          <Typography sx={{ fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#A85A68', fontWeight: 600 }}>{t('Your code')}</Typography>
          <Box sx={{ display: 'inline-block', mt: '0.5mm', px: '2.5mm', py: '0.8mm', borderRadius: '2mm', bgcolor: '#2B2522', color: '#FBF8F4',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700, fontSize: '13pt', letterSpacing: '0.12em' }}>{rep.code}</Box>
          {offer && <Typography sx={{ fontSize: '7.5pt', mt: '1mm', fontWeight: 500 }}>{t('Show this card: {offer}', { offer })}</Typography>}
        </Box>
        <Typography sx={{ fontSize: '6pt', color: '#8E877F', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[address.split(',').slice(0, 2).join(','), instagram].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
    </Box>
  )
}
