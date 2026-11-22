// A role on A4, to print or save as a PDF for the staff in it (no menu around it): its name, what it's
// for, who it answers to, who's in it and its duties by when they're done. From the print button on
// each role on Roles & responsibilities: admins print any role, the team their own.
import { Box, Button, Stack, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { ErrorBox, Loading } from '../components/common'
import { PrintFact, PrintFootnote, PrintList, PrintSection, PrintSheet, PrintText, PrintTitle } from '../components/PrintSheet'
import { dutiesByWhen } from '../../shared/roles'
import { formatLocal } from '../../shared/time'
import { t } from '../i18n'
import { shownRole } from '../app/roleText'

export function RolePrintPage() {
  const { id } = useParams()
  const { api, business, me, isAdmin, profiles, positions } = useApp()
  const data = useAsync('roles', () => api.jobRoles(), [])
  if (data.error) return <Box sx={{ p: 4 }}><ErrorBox error={data.error} /></Box>
  if (!data.data) return <Loading />
  // In the app's language where it's known (src/app/roleText.ts).
  const roles = data.data.map(shownRole)
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
    <PrintSheet title={r.name} back="/roles">
      <PrintTitle business={business?.name}>{r.name}</PrintTitle>
      {(position || lead || leads.length > 0) && (
        <Stack direction="row" sx={{ gap: '10mm', flexWrap: 'wrap', mb: '5mm' }}>
          {position && <PrintFact label={t('On the rota as')}>{position}</PrintFact>}
          {lead && <PrintFact label={t('Answers to')}>{lead}</PrintFact>}
          {leads.length > 0 && <PrintFact label={t('Answering to it')}>{leads.join(', ')}</PrintFact>}
        </Stack>
      )}
      {r.summary && <PrintText soft>{r.summary}</PrintText>}
      <PrintFact label={t('Who’s in it')}>{people || t('Nobody yet')}</PrintFact>
      <Box sx={{ mt: '6mm' }}>
        {dutiesByWhen(r.duties).map(g => (
          <PrintSection key={g.id} heading={t(g.label)}>
            <PrintList label={t('{role}: {when}', { role: r.name, when: t(g.label) })} items={g.duties} />
          </PrintSection>
        ))}
        {!r.duties.length && <PrintText soft>{t('No duties written yet.')}</PrintText>}
      </Box>
      <PrintFootnote>{t('Updated {date}', { date: formatLocal(r.updated_at, 'd MMM yyyy') })}</PrintFootnote>
    </PrintSheet>
  )
}
