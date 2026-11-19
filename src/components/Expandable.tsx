import { Accordion, AccordionDetails, AccordionSummary, Box, Button } from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import ExpandAllIcon from '@mui/icons-material/UnfoldMore'
import CollapseAllIcon from '@mui/icons-material/UnfoldLess'
import { useId, useState, type ReactNode } from 'react'
import { t } from '../i18n'

// Expandable lists (Roles & responsibilities, Staff rules): each item a card that opens, as on
// Grants, and one button to open or close them all.

export type Expanded = ReturnType<typeof useExpanded>

/** Which items are open: what the person chose, else `openAtFirst` (their own role, say). */
export function useExpanded(ids: string[], openAtFirst: (id: string) => boolean = () => false) {
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => chosen[id] ?? openAtFirst(id)
  return {
    isOpen,
    allOpen: ids.length > 0 && ids.every(isOpen),
    toggle: (id: string, open: boolean) => setChosen(c => ({ ...c, [id]: open })),
    setAll: (open: boolean) => setChosen(Object.fromEntries(ids.map(id => [id, open]))),
  }
}

export function ExpandAllButton({ expanded, disabled }: { expanded: Expanded; disabled?: boolean }) {
  return (
    <Button variant="outlined" disabled={disabled} startIcon={expanded.allOpen ? <CollapseAllIcon /> : <ExpandAllIcon />}
      onClick={() => expanded.setAll(!expanded.allOpen)}>
      {expanded.allOpen ? t('Collapse all') : t('Expand all')}
    </Button>
  )
}

/**
 * One item: `summary` always shows, `children` when it's open. `label` names it (its title). `action`: a
 * small icon button at its top right, open or closed (Print, on Roles & responsibilities), kept outside the
 * summary so it isn't a button inside the button that opens it.
 */
export function ExpandableCard({ id, label, expanded, summary, children, action }: {
  id: string; label: string; expanded: Expanded; summary: ReactNode; children: ReactNode; action?: ReactNode
}) {
  // The open part is a region named after the item (MUI labels it by the summary's id).
  const uid = useId()
  const card = (
    <Accordion disableGutters variant="outlined" expanded={expanded.isOpen(id)} onChange={(_, open) => expanded.toggle(id, open)}
      sx={{ mb: action ? 0 : 1, borderRadius: '12px !important', '&::before': { display: 'none' } }}
      slotProps={{ heading: { component: 'h2' }, transition: { unmountOnExit: true } }}>
      <AccordionSummary expandIcon={<ExpandIcon />} aria-label={label} id={`${uid}-summary`} aria-controls={`${uid}-details`}
        sx={action ? { '& .MuiAccordionSummary-content': { mr: 5 } } : undefined}>{summary}</AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  )
  if (!action) return card
  return (
    <Box sx={{ position: 'relative', mb: 1 }}>
      {card}
      <Box sx={{ position: 'absolute', top: 8, right: 44 }}>{action}</Box>
    </Box>
  )
}
