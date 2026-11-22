// The staff rules on A4, to print or save as a PDF for the team (no menu around it): every section, its
// introduction and its rules, numbered as on the page, and when they last changed. From the Print
// button on Staff rules; the whole team can.
import { Box } from '@mui/material'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { ErrorBox, Loading } from '../components/common'
import { PrintFootnote, PrintList, PrintSection, PrintSheet, PrintText, PrintTitle } from '../components/PrintSheet'
import { rulesChangedAt, sortSections } from '../../shared/staffRules'
import { formatLocal } from '../../shared/time'
import { t } from '../i18n'
import { shownSection } from '../app/roleText'

export function StaffRulesPrintPage() {
  const { api, business } = useApp()
  // Its own key: the Staff rules page keeps who has read them under 'staff-rules'.
  const data = useAsync('staff-rule-sections', () => api.ruleSections(), [])
  if (data.error) return <Box sx={{ p: 4 }}><ErrorBox error={data.error} /></Box>
  if (!data.data) return <Loading />
  const sections = sortSections(data.data).map(shownSection)
  const changedAt = rulesChangedAt(sections)
  return (
    <PrintSheet title={t('Staff rules')} back="/rules">
      <PrintTitle business={business?.name}>{t('Staff rules')}</PrintTitle>
      {!sections.length && <PrintText soft>{t('No rules have been written yet.')}</PrintText>}
      <Box sx={{ mt: '6mm' }}>
        {sections.map(s => (
          <PrintSection key={s.id} heading={s.title} intro={s.intro}>
            <PrintList label={s.title} items={s.rules} numbered />
          </PrintSection>
        ))}
      </Box>
      {changedAt && <PrintFootnote>{t('Updated {date}', { date: formatLocal(changedAt, 'd MMM yyyy') })}</PrintFootnote>}
    </PrintSheet>
  )
}
