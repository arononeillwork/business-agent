// How fresh what a page shows from an outside service is, and how often that service is read
// (shared/refresh.ts): "Updated 5 min ago · every 15 minutes", with why in a tooltip.
import { Box, Card, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import { SOURCES, source, type RefreshSource } from '../../shared/refresh'
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

/** "Updated 5 min ago · every 15 minutes" for figures read from `id` at `at`; without `at`, just how often. */
export function Freshness({ id, at, sx }: { id: RefreshSource['id']; at?: string | null; sx?: SxProps<Theme> }) {
  const s = source(id)
  return (
    <Tooltip describeChild title={`${t(s.from)}: ${t(s.why)}`}>
      <Typography variant="body2" tabIndex={0} sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
        {at ? t('Updated {ago} · {every}', { ago: ago(at), every: t(s.every) }) : t('Checked {every}', { every: t(s.every) })}
        <InfoIcon sx={{ fontSize: 15 }} />
      </Typography>
    </Tooltip>
  )
}

/** Connections: every outside service the app reads, how often, and why that often. */
export function RefreshSchedule() {
  const cell = { py: 1, borderColor: tokens.line, verticalAlign: 'top' } as const
  return (
    <Box component="section" aria-label={t('How often things update')} sx={{ mt: 4 }}>
      <Typography variant="h6" component="h2">{t('How often things update')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('Each page says when its figures were last updated. These are set to stay well inside what each service allows, so nothing runs into a limit or a charge.')}
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
                  <TableCell sx={cell}>{t(s.every)}</TableCell>
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
