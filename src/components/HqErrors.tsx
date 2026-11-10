// The back-office's errors (the Businesses page, HQ's admins only): what went wrong in the app, the Worker
// and the scheduled jobs over the last 90 days, one row per kind of error (public.app_errors, the
// app_errors migration), the latest first, each opening to its last stack and where it happened.
import { Box, Collapse, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import { Fragment, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import type { HqError } from '../data/api'
import { locale, t } from '../i18n'
import { tokens } from '../theme'
import { Empty, ErrorBox, SectionTitle } from './common'

const when = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Details({ e, business }: { e: HqError; business: string | null }) {
  const d = e.last_detail ?? {}
  const facts: [string, string | null | undefined][] = [
    [t('First seen'), when(e.first_seen)],
    [t('Path'), e.last_path],
    [t('Business'), business],
    [t('Version'), [d.version, d.build].filter(Boolean).join(' · ')],
    [t('Browser'), d.user_agent],
  ]
  return (
    <Box sx={{ py: 1.5 }}>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5, m: 0, mb: 1.5, fontSize: '0.85rem' }}>
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <Fragment key={k}>
            <Box component="dt" sx={{ color: 'text.secondary' }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{v}</Box>
          </Fragment>
        ))}
      </Box>
      {e.last_stack
        ? <Box component="pre" aria-label={t('Stack')} sx={{ m: 0, p: 1.5, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`,
            fontSize: '0.75rem', lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre' }}>{e.last_stack}</Box>
        : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No stack was kept for this one.')}</Typography>}
    </Box>
  )
}

export function HqErrors({ businesses }: { businesses: Map<number, string> }) {
  const { api } = useApp()
  const { data, error } = useAsync('hq-errors', () => api.hqErrors(), [])
  const [open, setOpen] = useState<string | null>(null)
  const list = data ?? []
  return (
    <Box component="section" aria-label={t('Errors')} id="errors" sx={{ mt: 4 }}>
      <SectionTitle>{t('Errors')}</SectionTitle>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 760 }}>
        {t('What went wrong in the app, the Worker and the scheduled jobs over the last 90 days, the latest first. HQ’s admins get a notification for a new one, and for one that comes back after a quiet day.')}
      </Typography>
      <ErrorBox error={error} />
      {data && !list.length && <Empty>{t('No errors in the last 90 days.')}</Empty>}
      {!!list.length && (
        <TableContainer>
          <Table size="small" aria-label={t('Errors')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Message')}</TableCell>
                <TableCell>{t('Where')}</TableCell>
                <TableCell align="right">{t('Times')}</TableCell>
                <TableCell>{t('Last seen')}</TableCell>
                <TableCell align="right"><Box component="span" sx={visuallyHidden}>{t('Details')}</Box></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map(e => {
                const shown = open === e.fingerprint
                const id = `error-${e.fingerprint}`
                return (
                  <Fragment key={e.fingerprint}>
                    <TableRow sx={{ '& > td': { borderBottom: shown ? 0 : undefined } }}>
                      <TableCell sx={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{e.message}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{e.source}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{e.times}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(e.last_seen)}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setOpen(shown ? null : e.fingerprint)} aria-expanded={shown} aria-controls={id}
                          aria-label={shown ? t('Hide details') : t('Show details')}>
                          <ExpandIcon fontSize="small" sx={{ transition: 'transform .2s', transform: shown ? 'rotate(180deg)' : 'none' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 0, ...(shown ? {} : { borderBottom: 0 }) }}>
                        <Collapse in={shown} id={id} unmountOnExit>
                          <Details e={e} business={e.business_id ? businesses.get(e.business_id) ?? `#${e.business_id}` : null} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
