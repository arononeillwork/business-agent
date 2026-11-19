// A role on A4, to print or save as a PDF for the staff in it (no menu around it): its name, what it's
// for, who it answers to, who's in it and its duties by when they're done. From the print button on
// each role on Roles & responsibilities: admins print any role, the team their own.
import { Box, Button, GlobalStyles, Stack, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { Link as RouterLink, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { ErrorBox, Loading } from '../components/common'
import { dutiesByWhen } from '../../shared/roles'
import { formatLocal } from '../../shared/time'
import { fonts } from '../theme'
import { t } from '../i18n'

export function RolePrintPage() {
  const { id } = useParams()
  const { api, business, me, isAdmin, profiles, positions } = useApp()
  const data = useAsync('roles', () => api.jobRoles(), [])
  if (data.error) return <Box sx={{ p: 4 }}><ErrorBox error={data.error} /></Box>
  if (!data.data) return <Loading />
  const roles = data.data
  const r = roles.find(x => x.id === id && (isAdmin || (!!me && x.people.includes(me.id))))
  if (!r) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography sx={{ mb: 2 }}>{t('That role has gone.')}</Typography>
        <Button component={RouterLink} to="/roles" startIcon={<BackIcon />}>{t('Back')}</Button>
      </Box>
    )
  }
  const lead = roles.find(x => x.id === r.reports_to)?.name
  const leads = roles.filter(x => x.reports_to === r.id).map(x => x.name)
  const position = positions.find(p => p.id === r.position_id)?.name
  const people = r.people.map(p => profiles.find(x => x.id === p)?.full_name).filter(Boolean).join(', ')
  return (
    <Box sx={{ bgcolor: '#E9E4DE', minHeight: '100vh', '@media print': { bgcolor: '#fff', minHeight: 0 } }}>
      {/* The page's margin on paper, so a long role carries on to a second page with room at its top too. */}
      <GlobalStyles styles={{ '@page': { size: 'A4', margin: '14mm 0' } }} />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#fff', borderBottom: '1px solid #DDD5CE', flexWrap: 'wrap', '@media print': { display: 'none' } }}>
        <Button component={RouterLink} to="/roles" startIcon={<BackIcon />}>{t('Back')}</Button>
        <Typography sx={{ flex: 1, fontWeight: 500, minWidth: 120 }}>{r.name}</Typography>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>{t('Print or save as PDF')}</Button>
      </Stack>
      <Box component="article" aria-label={r.name} sx={{ width: '210mm', minHeight: '297mm', maxWidth: '100%', mx: 'auto', my: 3, bgcolor: '#fff', color: '#2B2522',
        boxShadow: '0 12px 34px rgba(60,40,30,0.22)', px: '18mm', py: '16mm', boxSizing: 'border-box',
        '@media print': { my: 0, minHeight: 0, maxWidth: 'none', boxShadow: 'none', py: 0 } }}>
        {business?.name && (
          <Typography sx={{ fontSize: '9pt', color: '#8E877F', letterSpacing: '0.08em', textTransform: 'uppercase', mb: '2mm' }}>{business.name}</Typography>
        )}
        <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '26pt', lineHeight: 1.15, mb: '4mm' }}>{r.name}</Typography>
        {(position || lead || leads.length > 0) && (
          <Stack direction="row" sx={{ gap: '10mm', flexWrap: 'wrap', mb: '5mm' }}>
            {position && <Fact label={t('On the rota as')}>{position}</Fact>}
            {lead && <Fact label={t('Answers to')}>{lead}</Fact>}
            {leads.length > 0 && <Fact label={t('Answering to it')}>{leads.join(', ')}</Fact>}
          </Stack>
        )}
        {r.summary && <Typography sx={{ fontSize: '11pt', whiteSpace: 'pre-line', color: '#5F5852', mb: '5mm' }}>{r.summary}</Typography>}
        <Fact label={t('Who’s in it')}>{people || t('Nobody yet')}</Fact>
        <Box sx={{ mt: '6mm' }}>
          {dutiesByWhen(r.duties).map(g => (
            <Box key={g.id} sx={{ mb: '5mm', breakInside: 'avoid-page' }}>
              <Typography component="h2" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '14pt', pb: '1.5mm', mb: '2.5mm', borderBottom: '0.3mm solid #DDD5CE' }}>
                {t(g.label)}
              </Typography>
              <Box component="ul" aria-label={t('{role}: {when}', { role: r.name, when: t(g.label) })} sx={{ m: 0, pl: '5mm' }}>
                {g.duties.map(text => (
                  <Typography key={text} component="li" sx={{ fontSize: '11pt', lineHeight: 1.45, mb: '1.2mm', breakInside: 'avoid' }}>{text}</Typography>
                ))}
              </Box>
            </Box>
          ))}
          {!r.duties.length && <Typography sx={{ fontSize: '11pt', color: '#5F5852' }}>{t('No duties written yet.')}</Typography>}
        </Box>
        <Typography sx={{ fontSize: '9pt', color: '#8E877F', mt: '8mm' }}>
          {t('Updated {date}', { date: formatLocal(r.updated_at, 'd MMM yyyy') })}
        </Typography>
      </Box>
    </Box>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '8.5pt', color: '#8E877F', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
      <Typography sx={{ fontSize: '11pt', fontWeight: 500 }}>{children}</Typography>
    </Box>
  )
}
