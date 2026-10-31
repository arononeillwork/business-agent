import {
  Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import ViewIcon from '@mui/icons-material/VisibilityOutlined'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { SECTIONS, navLabel } from '../app/AppShell'
import { agentIcon, useAgentView, useAgents, useChooseAgent } from '../app/AgentsMenu'
import { Tag } from '../components/common'
import { AGENTS, AGENT_DESCRIPTION_MAX, AGENT_NAME_MAX, ALWAYS_IN_AGENTS, agentProblem, newAgentKey, viewsFrom, type Agent } from '../../shared/agents'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** The menu's sections an agent picks its pages from (Settings is always in the menu). */
const PICKABLE = SECTIONS.filter(s => s.key !== ALWAYS_IN_AGENTS)
const PAGES = new Map(SECTIONS.flatMap(s => s.items.flatMap(n => [n, ...(n.children ?? [])])).map(n => [n.key, n] as const))

/**
 * Roles & responsibilities → Agents (owners only): the ways an owner can see the app, from the Agents
 * button at the top. Each is turned on or off, renamed, described and given its pages; owners add their
 * own, go back to the usual ones, and switch to one right here. Kept for the business (settings.agent_views).
 */
export function AgentsTab() {
  const { api, settings, refresh } = useApp()
  const run = useAction()
  const agents = useAgents()
  const current = useAgentView()
  const choose = useChooseAgent()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Agent | null>(null)
  const save = (next: Agent[], done = t('Saved')) => run(async () => {
    await api.updateSettings({ agent_views: viewsFrom(next) })
    await refresh()
  }, done)
  const viewAs = (a: Agent) => { choose(a.key); navigate('/') }
  const pageNames = (a: Agent) => a.pages.flatMap(k => { const n = PAGES.get(k); return n ? [navLabel(n)] : [] }).join(' · ')
  const add = () => setEditing({ key: newAgentKey(), name: '', description: '', icon: 'custom', pages: [], focus: [], on: true, custom: true })

  return (
    <Box component="section" aria-label={t('Agents')}>
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('Agents are ways of seeing the app: each shows only the pages one part of the business needs, with what it looks at first on Today. Owners switch between them with the Agents button at the top. Turn them on or off, rename them, choose their pages or add your own.')}
      </Typography>
      <Stack direction="row" sx={{ gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={add}>{t('Add an agent')}</Button>
        {settings?.agent_views != null && (
          <Button onClick={() => void run(async () => { await api.updateSettings({ agent_views: null }); await refresh() }, t('The agents are the usual ones again'))}>
            {t('Back to the usual agents')}
          </Button>
        )}
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {agents.map(a => {
          const viewing = current?.key === a.key
          return (
            <Card key={a.key} component="section" aria-label={t(a.name)} sx={{ opacity: a.on ? 1 : 0.75, ...(viewing ? { borderColor: tokens.rose } : {}) }}>
              <CardContent>
                <Stack direction="row" sx={{ gap: 1.25, alignItems: 'center', mb: 0.5 }}>
                  <Box aria-hidden sx={{ display: 'flex', color: tokens.roseDeep }}>{agentIcon(a.icon)}</Box>
                  <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: 0 }}>{t(a.name)}</Typography>
                  {viewing && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Viewing now')}</Tag>}
                  {a.custom && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Your own')}</Tag>}
                </Stack>
                {a.description && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t(a.description)}</Typography>}
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1.5 }}>
                  {tn(a.pages.length, '{n} page', '{n} pages')}{a.pages.length ? `: ${pageNames(a)}` : ''}
                </Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControlLabel label={a.on ? t('On') : t('Turned off')} sx={{ mr: 'auto' }}
                    control={<Switch checked={a.on} onChange={e => void save(agents.map(x => (x.key === a.key ? { ...x, on: e.target.checked } : x)))}
                      slotProps={{ input: { 'aria-label': t('{agent} in the Agents menu', { agent: t(a.name) }) } }} />} />
                  <Button size="small" startIcon={<ViewIcon />} disabled={!a.on || viewing} onClick={() => viewAs(a)}
                    aria-label={t('View as {agent}', { agent: t(a.name) })}>{t('View as')}</Button>
                  <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(a)} aria-label={t('Edit {name}', { name: t(a.name) })}>{t('Edit')}</Button>
                </Stack>
              </CardContent>
            </Card>
          )
        })}
      </Box>
      {editing && <AgentDialog agent={editing} isNew={!agents.some(a => a.key === editing.key)} onClose={() => setEditing(null)}
        onSave={a => save(agents.some(x => x.key === a.key) ? agents.map(x => (x.key === a.key ? a : x)) : [...agents, a])}
        onRemove={() => save(agents.filter(x => x.key !== editing.key), t('Agent removed'))} />}
    </Box>
  )
}

/** Change an agent (or add one): its name, what it's for and its pages, by the menu's sections. */
function AgentDialog({ agent, isNew, onClose, onSave, onRemove }: {
  agent: Agent; isNew: boolean; onClose: () => void; onSave: (a: Agent) => Promise<boolean>; onRemove: () => Promise<boolean>
}) {
  const run = useAction()
  const usual = AGENTS.find(a => a.key === agent.key)
  const [name, setName] = useState(agent.name ? t(agent.name) : '')
  const [description, setDescription] = useState(agent.description ? t(agent.description) : '')
  const [pages, setPages] = useState<string[]>(agent.pages)
  const [removing, setRemoving] = useState(false)
  const toggle = (keys: string[], on: boolean) => setPages(p => (on ? [...new Set([...p, ...keys])] : p.filter(k => !keys.includes(k))))
  // A usual agent's own words stay as they are (and so in each person's language) unless they were changed.
  const own = (typed: string, english: string | undefined) => (english !== undefined && typed.trim() === t(english) ? english : typed.trim())
  const save = async () => {
    const problem = agentProblem({ name, pages })
    if (problem) { await run(() => Promise.reject(new Error(t(problem)))); return }
    if (await onSave({ ...agent, name: own(name, usual?.name), description: own(description, usual?.description), pages })) onClose()
  }
  const remove = async () => { if (await onRemove()) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="agent-title">
      <DialogTitle id="agent-title">{isNew ? t('Add an agent') : t(agent.name)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} required slotProps={{ htmlInput: { maxLength: AGENT_NAME_MAX } }} />
          <TextField label={t('What it’s for')} value={description} onChange={e => setDescription(e.target.value)} multiline minRows={2}
            helperText={t('Shown under its name in the Agents menu, and at the top while someone views the app as it')}
            slotProps={{ htmlInput: { maxLength: AGENT_DESCRIPTION_MAX } }} />
          <Box>
            <Typography variant="subtitle2">{t('Its pages')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('The pages in the menu while viewing the app as it. Settings is always there.')}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
            {PICKABLE.map(s => {
              const keys = s.items.flatMap(n => [n, ...(n.children ?? [])]).map(n => n.key)
              const picked = keys.filter(k => pages.includes(k)).length
              const label = s.label ? t(s.label) : t('Pages')
              return (
                <Box key={s.key} component="fieldset" sx={{ m: 0, p: 1.5, border: `1px solid ${tokens.line}`, borderRadius: '12px', minWidth: 0 }}>
                  <Box component="legend" sx={{ px: 0.5 }}>
                    <FormControlLabel label={<Typography variant="subtitle2">{label}</Typography>} sx={{ m: 0 }}
                      control={<Checkbox size="small" checked={picked === keys.length} indeterminate={picked > 0 && picked < keys.length}
                        onChange={e => toggle(keys, e.target.checked)} slotProps={{ input: { 'aria-label': t('Every page in {section}', { section: label }) } }} />} />
                  </Box>
                  <Stack>
                    {s.items.flatMap(n => [n, ...(n.children ?? [])]).map(n => (
                      <FormControlLabel key={n.key} label={navLabel(n)} sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.9rem' } }}
                        control={<Checkbox size="small" checked={pages.includes(n.key)} onChange={e => toggle([n.key], e.target.checked)} />} />
                    ))}
                  </Stack>
                </Box>
              )
            })}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {agent.custom && !isNew && (removing ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Remove {name}?', { name: agent.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Remove')}</Button>
            <Button size="small" onClick={() => setRemoving(false)}>{t('Keep')}</Button>
          </Stack>
        ) : (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setRemoving(true)} sx={{ mr: 'auto' }}>{t('Remove')}</Button>
        ))}
        {usual && !isNew && (
          <Button onClick={() => { setName(t(usual.name)); setDescription(t(usual.description)); setPages(usual.pages) }} sx={{ mr: 'auto' }}>
            {t('As usual')}
          </Button>
        )}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
