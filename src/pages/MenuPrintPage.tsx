import { Box, Button, Stack, Typography } from '@mui/material'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { Loading } from '../components/common'
import { MenuBoard, boardBrand } from '../components/MenuBoard'
import { imageOf, sizeOf } from '../../shared/menu'
import { t } from '../i18n'

/** A printed menu on its own page, at its paper size (no menu around it): print it, or save it as a PDF. */
export function MenuPrintPage() {
  const { id } = useParams()
  const { api, business, settings } = useApp()
  const designs = useAsync('menu-designs', () => api.menuDesigns(), [])
  const items = useAsync('menu-items', () => api.menuItems(), [])
  // Each item's allergens, from what goes into it on Menu costing (the Allergens page).
  const allergens = useAsync('menu-allergens', () => api.menuAllergens(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const d = designs.data?.find(x => x.id === id)
  if (designs.data && !d) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography sx={{ mb: 2 }}>{t('That menu design has gone.')}</Typography>
        <Button component={RouterLink} to="/menu/design" startIcon={<BackIcon />}>{t('Back to Menu design')}</Button>
      </Box>
    )
  }
  if (!d || !items.data || (!allergens.data && !allergens.error)) return <Loading />
  const z = sizeOf(d.size)
  return (
    <Box sx={{ bgcolor: '#E9E4DE', minHeight: '100vh', '@media print': { bgcolor: '#fff', minHeight: 0 } }}>
      <style>{`@page { size: ${z.width}mm ${z.height}mm; margin: 0 }`}</style>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, p: 1.5, bgcolor: '#fff', borderBottom: '1px solid #DDD5CE', '@media print': { display: 'none' } }}>
        <Button component={RouterLink} to="/menu/design" startIcon={<BackIcon />}>{t('Back')}</Button>
        <Typography sx={{ flex: 1, fontWeight: 500 }}>{`${d.name} · ${t(z.label)}`}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'block' } }}>{t('Tip: turn on “Background graphics” in the print settings so the image prints.')}</Typography>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>{t('Print or save as PDF')}</Button>
      </Stack>
      <Box sx={{ width: `${z.width}mm`, maxWidth: '100%', mx: 'auto', my: 3, boxShadow: '0 12px 34px rgba(60,40,30,0.22)', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact',
        '@media print': { my: 0, maxWidth: 'none', boxShadow: 'none' } }}>
        <MenuBoard design={d} items={items.data} allergens={allergens.data} image={imageOf(d)?.url ?? null} brand={boardBrand(business?.name ?? '', brand.data)} order={settings?.menu_sections} />
      </Box>
    </Box>
  )
}
