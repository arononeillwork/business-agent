import {
  Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import DoneIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle, Tag } from '../components/common'
import { ExpandAllButton, ExpandableCard, useExpanded } from '../components/Expandable'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import type { Position, Profile } from '../../shared/types'
import { businessConfig } from '../../shared/business.config'
import {
  DUTY_WHEN, ROLE_AREAS, ROLE_LEVELS, dutiesByWhen, dutiesFromLines, levelIn, linesOf, permissionsOf, presetPosition, roleProblem,
  sortRoles, tidyPermissions, type DutyWhen, type JobRole, type JobRoleInput, type RoleArea, type RoleLevel, type RolePermissions, type RolePreset,
} from '../../shared/roles'
import { ROLE_CATEGORIES, categoryOf, type RoleCategory } from '../../shared/roleTemplates'
import { tokens } from '../theme'
import { t, tc, tn } from '../i18n'
import { AgentsTab } from './RolesAgentsTab'

/** A preset in the admin's language, linked to the rota position it's worked as. */
function fromPreset(p: RolePreset, positions: Position[], roles: JobRole[], sort: number): JobRoleInput {
  const lead = p.reportsTo ? roles.find(r => r.name.toLowerCase() === t(p.reportsTo!).toLowerCase()) : undefined
  return {
    name: t(p.name), summary: t(p.summary), position_id: presetPosition(p, positions), reports_to: lead?.id ?? null,
    duties: p.duties.map(d => ({ when: d.when, text: t(d.text) })), sort, permissions: tidyPermissions(p.permissions), template: p.id ?? null,
  }
}

type RolesTab = 'active' | 'category' | 'permissions' | 'agents'

/**
 * Roles & responsibilities: who does what. Each role opens to what it's for, who it answers to, who's
 * in it and its duties, by when they're done (all the time, opening, during service, closing, each
 * week). Everyone reads it, with their own roles open and marked; admins add roles (or a café's usual
 * ones in one press), change them, put them in order and take them away (the database enforces the same).
 * Three tabs: Active (the business's roles), Category (ready-made roles by kind of business, for admins
 * to add) and Permissions (what each role, and so each person, can do in each area of the app).
 */
export function RolesPage() {
  const { api, me, isAdmin, profiles, positions, business, canSeePay } = useApp()
  const run = useAction()
  const [params, setParams] = useSearchParams()
  const tabs: RolesTab[] = ['active', 'category', 'permissions']
  // Agents (owners only): the ways they see the app, from the Agents button at the top.
  const owner = isAdmin && canSeePay
  if (owner) tabs.push('agents')
  const tab = tabs.find(x => x === params.get('tab')) ?? 'active'
  const show = (next: RolesTab) => setParams(next === 'active' ? {} : { tab: next }, { replace: true })
  const category = categoryOf(business?.business_type)
  const [editing, setEditing] = useState<JobRoleInput | null>(null)
  const data = useAsync('roles', () => api.jobRoles(), [])
  const roles = sortRoles(data.data ?? [])
  const mine = new Set(roles.filter(r => me && r.people.includes(me.id)).map(r => r.id))
  const expanded = useExpanded(roles.map(r => r.id), id => mine.has(id))
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name
  const roleName = (id: string | null) => roles.find(r => r.id === id)?.name
  const positionOf = (id: number | null) => positions.find(p => p.id === id)
  const businessName = business?.name ?? businessConfig.name
  const roleless = team.filter(p => !roles.some(r => r.people.includes(p.id)))
  const nextSort = roles.reduce((n, r) => Math.max(n, r.sort + 1), 0)

  const addPresets = (presets: RolePreset[]) => run(async () => {
    // One at a time, so a role can answer to one added just before it (the shift lead to the owner).
    let list = roles
    for (const p of presets) {
      await api.saveJobRole(fromPreset(p, positions, list, list.reduce((n, r) => Math.max(n, r.sort + 1), 0)))
      list = await api.jobRoles()
    }
  }, presets.length === 1 ? t('Role added') : t('Roles added'))
  /** Swap a role with the one above or below it; every role keeps its place in the list as its number. */
  const move = (i: number, by: -1 | 1) => {
    const order = [...roles]
    ;[order[i], order[i + by]] = [order[i + by], order[i]]
    void run(() => Promise.all(order.map((r, j) => (r.sort === j ? null : api.saveJobRole({ id: r.id, sort: j })))))
  }

  const table = (): ExportTable => ({
    title: t('Roles & responsibilities'), filename: 'roles-and-responsibilities',
    columns: [tc('job', 'Role'), t('What it’s for'), t('Answers to'), t('People'), t('When'), t('Duty')],
    rows: roles.flatMap(r => {
      const head = [r.name, r.summary ?? '', roleName(r.reports_to) ?? '', r.people.map(nameOf).filter(Boolean).join(', ')]
      const duties = dutiesByWhen(r.duties).flatMap(g => g.duties.map(d => [t(g.label), d]))
      return duties.length ? duties.map((d, i) => [...(i ? ['', '', '', ''] : head), ...d]) : [[...head, '', '']]
    }),
  })

  // The team sees just their own role, open, with what it lets them do in the app.
  if (!isAdmin) {
    const own = roles.filter(r => mine.has(r.id))
    return (
      <>
        <PageHeader eyebrow={t('Team')} title={t('Roles & responsibilities')} />
        <ErrorBox error={data.error} />
        {data.data && !own.length && (
          <Card component="section" aria-label={t('Your role')} sx={{ mb: 3 }}>
            <CardContent><Empty>{t('You haven’t been given a role yet: an admin gives you one.')}</Empty></CardContent>
          </Card>
        )}
        {own.map(r => {
          const position = positionOf(r.position_id)
          return (
            <Card key={r.id} component="section" aria-label={r.name} sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Your role')}</Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                  <Typography variant="h5" component="h2">{r.name}</Typography>
                  {position && <PositionTag position={position} />}
                </Stack>
                {r.summary && <Typography sx={{ color: 'text.secondary', whiteSpace: 'pre-line', mb: 2 }}>{r.summary}</Typography>}
                <RoleDetails role={r} roles={roles} position={position} you
                  people={r.people.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p)} />
              </CardContent>
            </Card>
          )
        })}
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Roles & responsibilities')} actions={tab === 'active' && <>
        <ExpandAllButton expanded={expanded} disabled={!roles.length} />
        {isAdmin && <ExportButton table={table} disabled={!roles.length} folder="Team" />}
        {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', sort: nextSort })}>{t('Add a role')}</Button>}
      </>} />
      <ErrorBox error={data.error} />
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('Who does what at {business}: each role’s core responsibilities and what’s also part of it, and who’s in it. Open a role to see it all.',
          { business: businessName })}
      </Typography>
      <Tabs value={tab} onChange={(_, v: RolesTab) => show(v)} variant="scrollable" allowScrollButtonsMobile aria-label={t('Roles & responsibilities')}
        sx={{ mb: 3, borderBottom: `1px solid ${tokens.line}` }}>
        <Tab value="active" label={t('Active ({n})', { n: roles.length })} />
        <Tab value="category" label={t('Category')} />
        <Tab value="permissions" label={t('Permissions')} />
        {owner && <Tab value="agents" label={t('Agents')} />}
      </Tabs>

      {tab === 'category' && <CategoryTab roles={roles} category={category} addPresets={addPresets} />}
      {tab === 'permissions' && <PermissionsTab roles={roles} team={team} />}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'active' && <>
        {data.data && roles.length === 0 && (
          <Card component="section" aria-label={t('No roles yet')} sx={{ mb: 3 }}>
            <CardContent>
              <Empty>
                <Typography sx={{ mb: isAdmin ? 1.5 : 0 }}>
                  {isAdmin ? t('No roles yet. Start with a café’s usual roles, then change them to how you work.') : t('No roles have been written yet.')}
                </Typography>
                {isAdmin && (
                  <Stack direction="row" sx={{ gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button variant="contained" onClick={() => void addPresets(ROLE_CATEGORIES.find(c => c.id === category)!.templates)}>
                      {category === 'cafe' ? t('Add the usual café roles')
                        : t('Add the usual roles: {category}', { category: t(ROLE_CATEGORIES.find(c => c.id === category)!.label) })}
                    </Button>
                    <Button onClick={() => show('category')}>{t('See every template')}</Button>
                  </Stack>
                )}
              </Empty>
            </CardContent>
          </Card>
        )}

        <Box component="section" aria-label={t('Roles')} sx={{ mb: 3 }}>
          {roles.map((r, i) => {
            const position = positionOf(r.position_id)
            const people = r.people.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p)
            const open = expanded.isOpen(r.id)
            return (
              <ExpandableCard key={r.id} id={r.id} label={r.name} expanded={expanded} summary={
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                    {mine.has(r.id) && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('You')}</Tag>}
                    {position && <PositionTag position={position} />}
                  </Stack>
                  {r.summary && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-line',
                      ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
                      {r.summary}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                    {people.length ? people.map(p => p.full_name).join(', ') : t('Nobody yet')} · {tn(r.duties.length, '{n} duty', '{n} duties')}
                  </Typography>
                </Box>
              }>
                <RoleDetails role={r} roles={roles} people={people} position={position} />
                {isAdmin && (
                  <Stack direction="row" sx={{ gap: 1, alignItems: 'center', mt: 1.5 }}>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(r)} aria-label={t('Edit {name}', { name: r.name })}>{t('Edit')}</Button>
                    <Tooltip title={t('Move up')}><span>
                      <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move {name} up', { name: r.name })}><UpIcon fontSize="small" /></IconButton>
                    </span></Tooltip>
                    <Tooltip title={t('Move down')}><span>
                      <IconButton size="small" disabled={i === roles.length - 1} onClick={() => move(i, 1)} aria-label={t('Move {name} down', { name: r.name })}><DownIcon fontSize="small" /></IconButton>
                    </span></Tooltip>
                  </Stack>
                )}
              </ExpandableCard>
            )
          })}
        </Box>

        {isAdmin && roles.length > 0 && roleless.length > 0 && (
          <Card component="section" aria-label={t('To finish')} sx={{ mb: 3 }}>
            <CardContent>
              <SectionTitle>{t('To finish')}</SectionTitle>
              <Typography variant="body2">{t('Not in a role yet: {names}.', { names: roleless.map(p => p.full_name).join(', ') })}</Typography>
            </CardContent>
          </Card>
        )}
      </>}

      {editing && <RoleDialog role={editing} roles={roles} team={team} onClose={() => setEditing(null)} />}
    </>
  )
}

/** A role opened: who it answers to, who's in it, its duties, and what it lets its people do in the app (`you`: as they read it about themselves). */
function RoleDetails({ role: r, roles, people, position, you }: { role: JobRole; roles: JobRole[]; people: Profile[]; position?: Position; you?: boolean }) {
  const leads = roles.filter(x => x.reports_to === r.id)
  const roleName = (id: string | null) => roles.find(x => x.id === id)?.name
  return (
    <>
      {(r.reports_to || leads.length > 0 || position) && (
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: { xs: 1, sm: 4 }, mb: 2, flexWrap: 'wrap' }}>
          {r.reports_to && <Fact label={t('Answers to')}>{roleName(r.reports_to)}</Fact>}
          {leads.length > 0 && <Fact label={t('Answering to it')}>{leads.map(x => x.name).join(', ')}</Fact>}
          {position && <Fact label={t('On the rota as')}>{position.name}</Fact>}
        </Stack>
      )}
      <Typography variant="subtitle2" component="h3" sx={{ mb: 0.75 }}>{t('Who’s in it')}</Typography>
      {people.length
        ? <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 2 }} aria-label={t('Who’s in it')} role="list">
            {people.map(p => (
              <Chip key={p.id} role="listitem" variant="outlined" label={p.full_name} avatar={<PersonAvatar name={p.full_name} colour={p.colour} size={24} />} />
            ))}
          </Stack>
        : <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{t('Nobody yet')}</Typography>}
      {dutiesByWhen(r.duties).map(g => (
        <Box key={g.id} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>{t(g.label)}</Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-label={t('{role}: {when}', { role: r.name, when: t(g.label) })}>
            {g.duties.map(text => (
              <Stack key={text} component="li" direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <DoneIcon sx={{ fontSize: 18, mt: '2px', color: tokens.matchaDeep }} aria-hidden />
                <Typography variant="body2">{text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ))}
      {!r.duties.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No duties written yet.')}</Typography>}
      <Typography variant="subtitle2" component="h3" sx={{ mt: 2, mb: 0.75 }}>{you ? t('What you can do in the app') : t('What they can do in the app')}</Typography>
      <PermissionList permissions={r.permissions} you={you}
        label={you ? t('{role}: what you can do', { role: r.name }) : t('{role}: what they can do', { role: r.name })} />
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{children}</Typography>
    </Box>
  )
}

function PositionTag({ position }: { position: Position }) {
  return (
    <Tag>
      <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: position.colour, mr: 0.75 }} />
      {position.name}
    </Tag>
  )
}

/** Admins: add a role or change one: what it's for, who it answers to, who's in it and its duties. */
function RoleDialog({ role, roles, team, onClose }: { role: JobRoleInput; roles: JobRole[]; team: Profile[]; onClose: () => void }) {
  const { api, positions } = useApp()
  const run = useAction()
  const [name, setName] = useState(role.name ?? '')
  const [summary, setSummary] = useState(role.summary ?? '')
  const [positionId, setPositionId] = useState(role.position_id ?? null)
  const [reportsTo, setReportsTo] = useState(role.reports_to ?? null)
  const [people, setPeople] = useState(team.filter(p => role.people?.includes(p.id)))
  const [lines, setLines] = useState(linesOf(role.duties ?? []))
  const [permissions, setPermissions] = useState(tidyPermissions(role.permissions))
  const [deleting, setDeleting] = useState(false)
  // Not itself, nor one that (through others) answers to it.
  const leads = roles.filter(r => r.id !== role.id && !(role.id && isUnder(roles, r.id, role.id)))
  const save = async () => {
    const duties = dutiesFromLines(lines)
    const ok = await run(async () => {
      const problem = roleProblem({ name, summary, duties })
      if (problem) throw new Error(t(problem))
      await api.saveJobRole({ id: role.id, name: name.trim(), summary: summary.trim() || null, position_id: positionId, reports_to: reportsTo,
        people: people.map(p => p.id), duties, permissions, ...(role.id ? {} : { sort: role.sort ?? 0 }) })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (role.id && await run(() => api.deleteJobRole(role.id!), t('Role removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="role-title">
      <DialogTitle id="role-title">{role.id ? role.name : t('Add a role')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} required slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField label={t('What it’s for')} value={summary} onChange={e => setSummary(e.target.value)} multiline minRows={2}
            helperText={t('A line or two the team reads first')} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Answers to')} value={reportsTo ?? ''} onChange={e => setReportsTo(e.target.value || null)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('Nobody')}</MenuItem>
              {leads.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label={t('On the rota as')} value={positionId ?? ''} onChange={e => setPositionId(e.target.value === '' ? null : Number(e.target.value))}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('Not on the rota')}</MenuItem>
              {positions.filter(p => p.active || p.id === positionId).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Stack>
          <Autocomplete multiple options={team} value={people} onChange={(_, v) => setPeople(v)} getOptionLabel={p => p.full_name}
            isOptionEqualToValue={(a, b) => a.id === b.id} filterSelectedOptions
            renderInput={p => <TextField {...p} label={t('Who’s in it')} helperText={t('Someone can be in more than one role')} />} />
          <Typography variant="subtitle2" sx={{ pt: 1 }}>{t('What they can do in the app')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: '0 !important' }}>
            {t('Read is what everyone on the team has always had; Update lets them do what an admin does there; Hidden leaves the page out of their menu.')}
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {ROLE_AREAS.map(a => (
              <TextField key={a.id} select label={t(a.label)} value={permissions[a.id]} helperText={levelMeaning(a, permissions[a.id])}
                onChange={e => setPermissions(x => ({ ...x, [a.id]: e.target.value as RoleLevel }))}>
                {ROLE_LEVELS.filter(l => a.levels.includes(l.id)).map(l => <MenuItem key={l.id} value={l.id}>{levelLabel(l.id)}</MenuItem>)}
              </TextField>
            ))}
          </Box>
          <Typography variant="subtitle2" sx={{ pt: 1 }}>{t('Duties')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: '0 !important' }}>{t('One per line in each group. Leave a group empty when it has none.')}</Typography>
          {DUTY_WHEN.map(w => (
            <TextField key={w.id} label={t(w.label)} value={lines[w.id]} multiline minRows={2}
              onChange={e => setLines(l => ({ ...l, [w.id as DutyWhen]: e.target.value }))} />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {role.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Remove {name}?', { name: role.name ?? '' })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Remove')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Remove')}</Button>
        ))}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Whether role `id` answers to `top`, directly or through others. */
function isUnder(roles: JobRole[], id: string, top: string): boolean {
  const seen = new Set<string>()
  for (let r = roles.find(x => x.id === id); r?.reports_to && !seen.has(r.id); r = roles.find(x => x.id === r!.reports_to)) {
    if (r.reports_to === top) return true
    seen.add(r.id)
  }
  return false
}

const LEVEL_COLOURS: Record<RoleLevel, { fg: string; bg: string }> = {
  none: { fg: tokens.warnFg, bg: tokens.warnBg }, own: { fg: tokens.infoFg, bg: tokens.infoBg }, read: { fg: tokens.neutralFg, bg: tokens.neutralBg },
  update: { fg: tokens.goodFg, bg: tokens.goodBg },
}
// "Read" and "Update" mean other things elsewhere (a message read, update the app): their Spanish here is under "access|…".
const levelLabel = (level: RoleLevel) => tc('access', ROLE_LEVELS.find(l => l.id === level)!.label)

function LevelTag({ level }: { level: RoleLevel }) {
  return <Tag fg={LEVEL_COLOURS[level].fg} bg={LEVEL_COLOURS[level].bg}>{levelLabel(level)}</Tag>
}

/** What a level lets someone do in an area, in a few words. Hidden takes a page out of the menu, or a part of one off its page. */
const levelMeaning = (area: (typeof ROLE_AREAS)[number], level: RoleLevel, you?: boolean) =>
  level === 'none' ? (area.pages.length ? (you ? t('Not in your menu') : t('Not in their menu')) : (you ? t('Not shown to you') : t('Not shown to them')))
    : t((level === 'update' ? area.update : level === 'own' ? area.own : undefined) ?? area.read)

/** Each area of the app, the level a role gives in it and what that means. */
function PermissionList({ permissions, label, you }: { permissions: RolePermissions | undefined; label: string; you?: boolean }) {
  return (
    <Stack component="ul" spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-label={label}>
      {ROLE_AREAS.map(a => {
        const level = levelIn(permissions, a.id)
        return (
          <Stack key={a.id} component="li" direction="row" sx={{ gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 110 }}>{t(a.label)}</Typography>
            <Box sx={{ minWidth: 64 }}><LevelTag level={level} /></Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{levelMeaning(a, level, you)}</Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}

/**
 * Category: the ready-made roles for each kind of business, the business's own kind first. Each shows
 * what it's for, who it answers to, its duties and what it can do; adding one makes it an active role.
 */
function CategoryTab({ roles, category, addPresets }: { roles: JobRole[]; category: RoleCategory; addPresets: (presets: RolePreset[]) => Promise<boolean> }) {
  const [shown, setShown] = useState<RoleCategory>(category)
  /** The active role made from it (or of the same name), if any. */
  const usedAs = (p: RolePreset) => roles.find(r => r.template === p.id) ?? roles.find(r => r.name.toLowerCase() === t(p.name).toLowerCase())
  const inUse = (p: RolePreset) => !!usedAs(p)
  const templates = ROLE_CATEGORIES.find(c => c.id === shown)!.templates
  const left = templates.filter(p => !inUse(p))
  return (
    <Box component="section" aria-label={t('Templates')}>
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('Ready-made roles for each kind of business. Add one to make it active, with its duties and what it can do, then change it to how you work.')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <ToggleButtonGroup exclusive size="small" value={shown} onChange={(_, v: RoleCategory | null) => v && setShown(v)} aria-label={t('Kind of business')}
          sx={{ flexWrap: 'wrap' }}>
          {ROLE_CATEGORIES.map(c => <ToggleButton key={c.id} value={c.id}>{t(c.label)}</ToggleButton>)}
        </ToggleButtonGroup>
        <Button variant="outlined" disabled={!left.length} onClick={() => void addPresets(left)}>
          {left.length ? tn(left.length, 'Add the one not in use', 'Add the {n} not in use') : t('All in use')}
        </Button>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {templates.map(p => {
          const used = usedAs(p)
          return (
            <Card key={p.id} component="section" aria-label={t(p.name)}>
              <CardContent>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{t(p.name)}</Typography>
                  {used
                    ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{used.name.toLowerCase() === t(p.name).toLowerCase() ? t('In use') : t('In use as {name}', { name: used.name })}</Tag>
                    : <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => void addPresets([p])}
                        aria-label={t('Add {name}', { name: t(p.name) })}>{t('Add')}</Button>}
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t(p.summary)}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1.5 }}>
                  {p.reportsTo ? `${t('Answers to')} ${t(p.reportsTo)} · ` : ''}{tn(p.duties.length, '{n} duty', '{n} duties')}
                </Typography>
                <PermissionList permissions={p.permissions} label={t('{role}: what they can do', { role: t(p.name) })} />
              </CardContent>
            </Card>
          )
        })}
      </Box>
    </Box>
  )
}

/**
 * Permissions: every active role against every area, then what that gives each person. Admins change a
 * role's level right in the grid; the team reads it. Admins can always do everything.
 */
function PermissionsTab({ roles, team }: { roles: JobRole[]; team: Profile[] }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const set = (r: JobRole, area: RoleArea, level: RoleLevel) =>
    run(() => api.saveJobRole({ id: r.id, permissions: tidyPermissions({ ...r.permissions, [area]: level }) }), t('Saved'))
  const people = team.map(p => ({ p, theirs: roles.filter(r => r.people.includes(p.id)), can: permissionsOf(p, roles) }))
  return (
    <>
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('What each role can do in each area of the app. Read is what everyone on the team has always had; Update lets them do what an admin does there; Hidden leaves the page out of their menu. Someone in several roles gets the most any of them gives.')}
      </Typography>
      <Card component="section" aria-label={t('Each role')} sx={{ mb: 3 }}>
        <TableContainer>
          <Table size="small" aria-label={t('Each role')}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{tc('job', 'Role')}</TableCell>
                {ROLE_AREAS.map(a => <TableCell key={a.id} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t(a.label)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map(r => (
                <TableRow key={r.id}>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.name}</TableCell>
                  {ROLE_AREAS.map(a => {
                    const level = levelIn(r.permissions, a.id)
                    return (
                      <TableCell key={a.id}>
                        {isAdmin
                          ? <TextField select variant="standard" size="small" value={level} onChange={e => void set(r, a.id, e.target.value as RoleLevel)}
                              slotProps={{ htmlInput: { 'aria-label': t('{role}: {area}', { role: r.name, area: t(a.label) }) } }}
                              sx={{ minWidth: 84, '& .MuiInputBase-input': { fontSize: '0.85rem', fontWeight: 500, color: LEVEL_COLOURS[level].fg } }}>
                              {ROLE_LEVELS.filter(l => a.levels.includes(l.id)).map(l => <MenuItem key={l.id} value={l.id}>{levelLabel(l.id)}</MenuItem>)}
                            </TextField>
                          : <LevelTag level={level} />}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              <TableRow>
                <TableCell component="th" scope="row" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{t('In no role')}</TableCell>
                {ROLE_AREAS.map(a => <TableCell key={a.id}><LevelTag level="read" /></TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{t('Admins')}</TableCell>
                {ROLE_AREAS.map(a => <TableCell key={a.id}><LevelTag level={a.levels[a.levels.length - 1]} /></TableCell>)}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <SectionTitle>{t('Each person')}</SectionTitle>
      <Card component="section" aria-label={t('Each person')} sx={{ mb: 3 }}>
        <TableContainer>
          <Table size="small" aria-label={t('Each person')}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t('Name')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Roles')}</TableCell>
                {ROLE_AREAS.map(a => <TableCell key={a.id} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t(a.label)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map(({ p, theirs, can }) => (
                <TableRow key={p.id}>
                  <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>
                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                      <PersonAvatar name={p.full_name} colour={p.colour} size={24} />
                      {p.full_name}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {p.role === 'admin' ? t('Admin') : theirs.length ? theirs.map(r => r.name).join(', ') : t('In no role')}
                  </TableCell>
                  {ROLE_AREAS.map(a => <TableCell key={a.id}><LevelTag level={can[a.id]} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  )
}
