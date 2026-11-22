import { Box, Button, ButtonBase, Divider, IconButton, ListItemIcon, ListItemText, MenuItem, MenuList, Popover, Tab, Tabs, Tooltip, Typography } from '@mui/material'
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
import RoleIcon from '@mui/icons-material/BadgeOutlined'
import CheckIcon from '@mui/icons-material/Check'
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from './AppContext'
import { useAction } from './Notify'
import { roundButton } from './QuickActions'
import { agentOf, agentsFrom, type Agent, type AgentIcon } from '../../shared/agents'
import { roleViewId, roleViewKey, roleViewer, type RoleViewer } from '../../shared/roleView'
import { sortRoles, type JobRole } from '../../shared/roles'
import { TEAM_ROLES } from '../../shared/teamRoles'
import { shownRole } from './roleText'
import { tokens } from '../theme'
import { t, tr } from '../i18n'

// The owner's agents (shared/agents.ts) and the business's roles (shared/roleView.ts): the Agents button
// at the top right switches the app to an agent (their menu shows only its pages, and Settings) or to a
// role (the app as someone in it sees it), and the line under the top says whose view it is.

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

/** What the owner is viewing the app as (an agent's key, or a role's: shared/roleView.ts); null for everyone else. */
function useViewKey(): string | null {
  const { me } = useApp()
  const owner = useIsOwner()
  const now = useSyncExternalStore(subscribe, () => chosen)
  return owner ? (now ? now.key : me?.preferences?.agentView ?? null) : null
}

/** The agent the owner is viewing the app as; null: everything, or a role (and always for everyone else). */
export function useAgentView(): Agent | null {
  const agents = useAgents()
  return agentOf(useViewKey(), agents)
}

/** The business's roles in use, in their order and the app's language. */
function useActiveRoles(): JobRole[] {
  const { jobRoles } = useApp()
  return useMemo(() => sortRoles(jobRoles.filter(r => r.active !== false)).map(shownRole), [jobRoles])
}

/** The role the owner is viewing the app as, with how someone in it is to the app; null: none. */
export function useRoleView(): { role: JobRole; viewer: RoleViewer } | null {
  const { profiles } = useApp()
  const id = roleViewId(useViewKey())
  const roles = useActiveRoles()
  return useMemo(() => {
    const role = id ? roles.find(r => r.id === id) : undefined
    return role ? { role, viewer: roleViewer(role, profiles) } : null
  }, [id, roles, profiles])
}

const accessLabel = (v: RoleViewer) => t(TEAM_ROLES.find(r => r.id === v.access)!.label)

/** Switch to an agent (null: back to everything), kept on the owner's account. */
export function useChooseAgent() {
  const { api, me } = useApp()
  const run = useAction()
  return (key: string | null) => {
    setChosen({ key })
    if (!me) return
    // The choice stays on screen until the account is back with it, or saving failed.
    void run(async () => {
      await api.updateProfile(me.id, { preferences: { ...me.preferences, agentView: key } })
    }, undefined, { fresh: true }).finally(() => setChosen(undefined))
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
  const roles = useActiveRoles()
  const roleView = useRoleView()
  const { profiles } = useApp()
  const choose = useChooseAgent()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // Agents or Roles: opens on the one being viewed as.
  const [tab, setTab] = useState<'agents' | 'roles'>('agents')
  if (!owner) return null
  const open = (el: HTMLElement) => { setTab(roleView ? 'roles' : 'agents'); setAnchor(el) }
  const close = () => setAnchor(null)
  const pick = (key: string | null) => {
    close()
    choose(key)
    if (key) navigate('/')
  }
  const viewing = current ? t(current.name) : roleView?.role.name
  const on = !!viewing
  const label = viewing ? t('Agents: viewing as {agent}', { agent: viewing }) : t('Agents')
  const selectedKey = current?.key ?? (roleView ? roleViewKey(roleView.role.id) : null)
  const option = (key: string | null, icon: ReactNode, name: string, description: string) => {
    const selected = selectedKey === key
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
        <Tooltip title={viewing ? t('Viewing as {agent}', { agent: viewing }) : t('See the app as one part of the business')}>
          <ButtonBase onClick={e => open(e.currentTarget)} aria-label={t('Agents')} aria-haspopup="menu" aria-expanded={!!anchor}
            sx={{ ...roundButton, width: 'auto', borderRadius: '999px', px: 1.5, gap: 0.75, ...active, '&:hover': { ...roundButton['&:hover'], ...active } }}>
            <AgentsIcon fontSize="small" />
            <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>{t('Agents')}</Typography>
          </ButtonBase>
        </Tooltip>
      ) : (
        <Tooltip title={label}>
          <IconButton onClick={e => open(e.currentTarget)} aria-label={t('Agents')} aria-haspopup="menu" aria-expanded={!!anchor}
            sx={{ ...roundButton, ...active, '&:hover': { ...roundButton['&:hover'], ...active } }}>
            <AgentsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {/* Two tabs over a menu each: the agents (one part of the business) and the roles (the app as someone in one sees it). */}
      <Popover anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { 'aria-label': t('See the app as'), sx: { width: 380, maxWidth: 'calc(100vw - 24px)', maxHeight: '75vh', display: 'flex', flexDirection: 'column',
          borderRadius: '18px', border: `1px solid ${tokens.line}`, mt: 1 } } }}>
        <Typography sx={{ px: 2, pt: 1.5, fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>
          {t('See the app as')}
        </Typography>
        <Tabs value={tab} onChange={(_, v: 'agents' | 'roles') => setTab(v)} variant="fullWidth" aria-label={t('See the app as')}
          sx={{ px: 1, minHeight: 40, borderBottom: `1px solid ${tokens.line}`, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 500 } }}>
          <Tab value="agents" label={t('Agents')} id="view-as-agents" aria-controls="view-as-agents-list" />
          <Tab value="roles" label={t('Roles')} id="view-as-roles" aria-controls="view-as-roles-list" />
        </Tabs>
        <Box sx={{ overflowY: 'auto' }}>
          {tab === 'agents' ? (
            <MenuList autoFocusItem id="view-as-agents-list" aria-label={t('Agents')}>
              {option(null, <OwnerIcon />, t('Owner — everything'), t('Every page, as your menu is set up'))}
              {agents.map(a => option(a.key, agentIcon(a.icon), t(a.name), t(a.description)))}
              <Divider />
              <MenuItem component={Link} to="/roles?tab=agents" onClick={close}>
                <ListItemIcon><SetUpIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('Set up the agents')} />
              </MenuItem>
            </MenuList>
          ) : (
            <MenuList autoFocusItem id="view-as-roles-list" aria-label={t('Roles')}>
              {option(null, <OwnerIcon />, t('Owner — everything'), t('Every page, as your menu is set up'))}
              {roles.map(r => {
                const viewer = roleViewer(r, profiles)
                const people = profiles.filter(p => r.people.includes(p.id)).map(p => p.full_name)
                return option(roleViewKey(r.id), <RoleIcon />, r.name,
                  `${accessLabel(viewer)} · ${people.length ? people.join(', ') : t('Nobody yet')}`)
              })}
              {!roles.length && (
                <MenuItem disabled sx={{ whiteSpace: 'normal' }}>
                  <ListItemText secondary={t('No roles yet: write them on Roles & responsibilities.')} />
                </MenuItem>
              )}
              <Divider />
              <MenuItem component={Link} to="/roles" onClick={close}>
                <ListItemIcon><SetUpIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('Set up the roles')} />
              </MenuItem>
            </MenuList>
          )}
        </Box>
      </Popover>
    </>
  )
}

/** The line under the top while an owner views the app as an agent or a role: whose view it is, and the way back. */
export function AgentBanner() {
  const agent = useAgentView()
  const roleView = useRoleView()
  const choose = useChooseAgent()
  if (roleView) {
    const { role, viewer } = roleView
    return (
      <Box component="section" aria-label={t('Role view')}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: { xs: 2, md: 4 }, py: 0.75,
          bgcolor: tokens.roseSoft, borderBottom: 1, borderColor: 'divider' }}>
        <Box aria-hidden sx={{ display: 'flex', color: tokens.roseDeep, '& svg': { fontSize: 20 } }}><RoleIcon /></Box>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
          {tr('Viewing as {agent}', { agent: <b>{role.name}</b> })}
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {' — '}{viewer.canSeePay
              ? t('the app as someone in this role sees it ({access})', { access: accessLabel(viewer) })
              : t('the app as someone in this role sees it ({access}): no pay, takings or finances', { access: accessLabel(viewer) })}
          </Box>
        </Typography>
        <Button size="small" onClick={() => choose(null)} sx={{ color: tokens.roseDeep }}>{t('Back to everything')}</Button>
      </Box>
    )
  }
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
