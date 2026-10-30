import { Tab, Tabs } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { LicencesPage } from './LicencesPage'
import { LegalDocumentsPage } from './LegalDocumentsPage'
import { tokens } from '../theme'
import { t } from '../i18n'

type LegalTab = 'licences' | 'documents'

/**
 * Legal & licences (Business): the licences the business keeps open and its legal documents, one tab
 * each, on one page. Opens on Licences; `?tab=documents` opens the documents (the old /licences link
 * comes here too). Admins manage both; a gestoría with finances access reads them.
 */
export function LegalPage() {
  const [params, setParams] = useSearchParams()
  const tab: LegalTab = params.get('tab') === 'documents' ? 'documents' : 'licences'
  const tabs = (
    <Tabs value={tab} onChange={(_, v: LegalTab) => setParams(v === 'licences' ? {} : { tab: v }, { replace: true })}
      variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2.5, borderBottom: `1px solid ${tokens.line}` }}>
      <Tab value="licences" label={t('Licences')} />
      <Tab value="documents" label={t('Legal documents')} />
    </Tabs>
  )
  return tab === 'licences' ? <LicencesPage tabs={tabs} /> : <LegalDocumentsPage tabs={tabs} />
}
