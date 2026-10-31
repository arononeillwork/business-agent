import { Box, ButtonBase, Card, CardContent, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { SECTIONS, navLabel, type NavItem } from '../app/AppShell'
import { agentIcon, useAgentView } from '../app/AgentsMenu'
import { focusOf } from '../../shared/agents'
import { SectionTitle } from './common'
import { tokens } from '../theme'
import { t } from '../i18n'

/**
 * Today, while an owner views the app as an agent: what that agent looks at first, as questions that
 * open the page that answers them (its other pages when it has fewer questions).
 */
export function AgentFocus() {
  const agent = useAgentView()
  if (!agent) return null
  const pages = new Map(SECTIONS.flatMap(s => s.items.flatMap(n => [n, ...(n.children ?? [])])).map(n => [n.key, n] as const))
  const items = focusOf(agent).flatMap(f => { const n = pages.get(f.page); return n ? [{ ...f, n }] : [] as { question?: string; n: NavItem }[] })
  const title = t('Focus: {agent}', { agent: t(agent.name) })
  return (
    <Card component="section" aria-label={title} sx={{ mb: 2.5, borderLeft: `4px solid ${tokens.rose}` }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        {agent.description && <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>{t(agent.description)}</Typography>}
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` } }}>
          {items.map(({ question, n }) => (
            <Box component="li" key={n.key}>
              <ButtonBase component={Link} to={n.to}
                sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.25, p: 1.5, textAlign: 'left',
                  borderRadius: '12px', border: `1px solid ${tokens.line}`, bgcolor: tokens.surfaceAlt, transition: 'border-color .15s, background .15s',
                  '&:hover': { borderColor: tokens.rose, bgcolor: tokens.roseSoft }, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}` } }}>
                <Box aria-hidden sx={{ display: 'flex', color: tokens.roseDeep, '& svg': { fontSize: 20 } }}>{n.icon ?? agentIcon(agent.icon)}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500 }}>{question ? t(question) : navLabel(n)}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Open {page}', { page: navLabel(n) })}</Typography>
                </Box>
              </ButtonBase>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}
