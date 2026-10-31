import { Box, Button, ButtonBase, Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import AgentsIcon from '@mui/icons-material/PsychologyOutlined'
import FinanceIcon from '@mui/icons-material/PaymentsOutlined'
import MarketingIcon from '@mui/icons-material/CampaignOutlined'
import SalesIcon from '@mui/icons-material/InsightsOutlined'
import InvestorIcon from '@mui/icons-material/TrendingUpOutlined'
import OperationsIcon from '@mui/icons-material/EngineeringOutlined'
import PeopleIcon from '@mui/icons-material/GroupsOutlined'
import StockIcon from '@mui/icons-material/Inventory2Outlined'
import CustomIcon from '@mui/icons-material/AutoAwesomeOutlined'
import OwnerIcon from '@mui/icons-material/AllInclusiveOutlined'
import SetUpIcon from '@mui/icons-material/TuneOutlined'
import CheckIcon from '@mui/icons-material/Check'
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from './AppContext'
import { useAction } from './Notify'
import { roundButton } from './QuickActions'
import { agentOf, agentsFrom, type Agent, type AgentIcon } from '../../shared/agents'
import { tokens } from '../theme'
import { t, tr } from '../i18n'

// The owner's agents (shared/agents.ts): the Agents button at the top right switches the app to one
// (their menu shows only its pages, and Settings), and the line under the top says whose view it is.

const ICONS: Record<AgentIcon, ReactNode> = {
  finance: <FinanceIcon />, marketing: <MarketingIcon />, sales: <SalesIcon />, investor: <InvestorIcon />, operations: <OperationsIcon />,
  people: <PeopleIcon />, stock: <StockIcon />, custom: <CustomIcon />,
}
/** An agent's icon. */
export const agentIcon = (icon: AgentIcon) => ICONS[icon] ?? ICONS.custom

/** Owners only: an admin with pay access. */
export function useIsOwner() {
  const { isAdmin, isPartner, canSeePay } = useApp()
  return isAdmin && canSeePay && !isPartner
}

/** The business's agents: the usual ones with the owners' changes, then their own. */
export function useAgents(): Agent[] {
  const { settings } = useApp()
  return useMemo(() => agentsFrom(settings?.agent_views), [settings?.agent_views])
}

// The agent just chosen, shown straight away while it saves to their account.
let chosen: { key: string | null } | undefined
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const setChosen = (next: typeof chosen) => { chosen = next; listeners.forEach(l => l()) }

/** The agent the owner is viewing the app as; null: everything (and always for everyone else). */
export function useAgentView(): Agent | null {
  const { me } = useApp()
  const owner = useIsOwner()
  const agents = useAgents()
  const now = useSyncExternalStore(subscribe, () => chosen)
  return owner ? agentOf(now ? now.key : me?.preferences?.agentView, agents) : null
}

/** Switch to an agent (null: back to everything), kept on the owner's account. */
export function useChooseAgent() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  return (key: string | null) => {
    setChosen({ key })
    if (!me) return
    void run(async () => {
      await api.updateProfile(me.id, { preferences: { ...me.preferences, agentView: key } })
      await refresh()
    }).finally(() => setChosen(undefined))
  }
}

/**
 * The Agents button (owners only), at the top right: a menu of ways to see the app, everything first.
 * Choosing an agent opens Today, which leads with what that agent looks at. `wide`: with its name (computer).
 */
export function AgentsButton({ wide }: { wide?: boolean }) {
  const owner = useIsOwner()
  const agents = useAgents().filter(a => a.on)
  const current = useAgentView()
  const choose = useChooseAgent()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!owner) return null
  const close = () => setAnchor(null)
  const pick = (key: string | null) => {
    close()
    choose(key)
    if (key) navigate('/')
  }
  const on = !!current
  const label = current ? t('Agents: viewing as {agent}', { agent: t(current.name) }) : t('Agents')
  const option = (key: string | null, icon: ReactNode, name: string, description: string) => {
    const selected = (current?.key ?? null) === key
    return (
      <MenuItem key={key ?? 'owner'} role="menuitemradio" aria-checked={selected} selected={selected} onClick={() => pick(key)}
        sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1 }}>
        <ListItemIcon sx={{ mt: 0.25, color: selected ? tokens.roseDeep : undefined }}>{icon}</ListItemIcon>
        <ListItemText primary={name} secondary={description} slotProps={{ primary: { sx: { fontWeight: selected ? 600 : 500 } } }} sx={{ my: 0 }} />
        {selected && <CheckIcon fontSize="small" sx={{ ml: 1, mt: 0.25, color: tokens.roseDeep }} />}
      </MenuItem>
    )
  }
  const active = on ? { bgcolor: tokens.roseSoft, borderColor: tokens.rose, color: tokens.roseDeep } : {}
  return (
    <>
      {wide ? (
        <Tooltip title={current ? t('Viewing as {agent}', { agent: t(current.name) }) : t('See the app as one part of the business')}>
          <ButtonBase onClick={e => setAnchor(e.currentTarget)} aria-label={t('Agents')} aria-haspopup="menu" aria-expanded={!!anchor}
            sx={{ ...roundButton, width: 'auto', borderRadius: '999px', px: 1.5, gap: 0.75, ...active, '&:hover': { ...roundButton['&:hover'], ...active } }}>
            <AgentsIcon fontSize="small" />
            <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>{t('Agents')}</Typography>
          </ButtonBase>
        </Tooltip>
      ) : (
        <Tooltip title={label}>
          <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label={t('Agents')} aria-haspopup="menu" aria-expanded={!!anchor}
            sx={{ ...roundButton, ...active, '&:hover': { ...roundButton['&:hover'], ...active } }}>
            <AgentsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-label': t('Agents') }, paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)', maxHeight: '75vh', borderRadius: '18px', border: `1px solid ${tokens.line}`, mt: 1 } } }}>
        <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {t('See the app as')}
        </ListSubheader>
        {option(null, <OwnerIcon />, t('Owner — everything'), t('Every page, as your menu is set up'))}
        {agents.map(a => option(a.key, agentIcon(a.icon), t(a.name), t(a.description)))}
        <Divider />
        <MenuItem component={Link} to="/roles?tab=agents" onClick={close}>
          <ListItemIcon><SetUpIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('Set up the agents')} />
        </MenuItem>
      </Menu>
    </>
  )
}

/** The line under the top while an owner views the app as an agent: whose view it is, and the way back. */
export function AgentBanner() {
  const agent = useAgentView()
  const choose = useChooseAgent()
  if (!agent) return null
  return (
    <Box component="section" aria-label={t('Agent view')}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: { xs: 2, md: 4 }, py: 0.75,
        bgcolor: tokens.roseSoft, borderBottom: 1, borderColor: 'divider' }}>
      <Box aria-hidden sx={{ display: 'flex', color: tokens.roseDeep, '& svg': { fontSize: 20 } }}>{agentIcon(agent.icon)}</Box>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
        {tr('Viewing as {agent}', { agent: <b>{t(agent.name)}</b> })}
        {agent.description && <Box component="span" sx={{ color: 'text.secondary' }}>{' — '}{t(agent.description)}</Box>}
      </Typography>
      <Button size="small" onClick={() => choose(null)} sx={{ color: tokens.roseDeep }}>{t('Back to everything')}</Button>
    </Box>
  )
}
