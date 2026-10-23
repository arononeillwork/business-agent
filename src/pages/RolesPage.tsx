import {
  Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import DoneIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import { useState, type ReactNode } from 'react'
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
  DUTY_WHEN, ROLE_PRESETS, dutiesByWhen, dutiesFromLines, linesOf, presetPosition, roleProblem, sortRoles,
  type DutyWhen, type JobRole, type JobRoleInput, type RolePreset,
} from '../../shared/roles'
import { tokens } from '../theme'
import { t, tc, tn } from '../i18n'

/** A preset in the admin's language, linked to the rota position it's worked as. */
function fromPreset(p: RolePreset, positions: Position[], roles: JobRole[], sort: number): JobRoleInput {
  const lead = p.reportsTo ? roles.find(r => r.name.toLowerCase() === t(p.reportsTo!).toLowerCase()) : undefined
  return {
    name: t(p.name), summary: t(p.summary), position_id: presetPosition(p, positions), reports_to: lead?.id ?? null,
    duties: p.duties.map(d => ({ when: d.when, text: t(d.text) })), sort,
  }
}

/**
 * Roles & responsibilities: who does what. Each role opens to what it's for, who it answers to, who's
 * in it and its duties, by when they're done (all the time, opening, during service, closing, each
 * week). Everyone reads it, with their own roles open and marked; admins add roles (or a café's usual
 * ones in one press), change them, put them in order and take them away (the database enforces the same).
 */
export function RolesPage() {
  const { api, me, isAdmin, profiles, positions, business } = useApp()
  const run = useAction()
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

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Roles & responsibilities')} actions={<>
        <ExpandAllButton expanded={expanded} disabled={!roles.length} />
        {isAdmin && <ExportButton table={table} disabled={!roles.length} folder="Team" />}
        {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', sort: nextSort })}>{t('Add a role')}</Button>}
      </>} />
      <ErrorBox error={data.error} />
      <Typography sx={{ mb: 3, maxWidth: 760 }}>
        {t('Who does what at {business}: each role’s core responsibilities and what’s also part of it, and who’s in it. Open a role to see it all.',
          { business: businessName })}
      </Typography>

      {data.data && roles.length === 0 && (
        <Card component="section" aria-label={t('No roles yet')} sx={{ mb: 3 }}>
          <CardContent>
            <Empty>
              <Typography sx={{ mb: isAdmin ? 1.5 : 0 }}>
                {isAdmin ? t('No roles yet. Start with a café’s usual roles, then change them to how you work.') : t('No roles have been written yet.')}
              </Typography>
              {isAdmin && <Button variant="contained" onClick={() => void addPresets(ROLE_PRESETS)}>{t('Add the usual café roles')}</Button>}
            </Empty>
          </CardContent>
        </Card>
      )}

      <Box component="section" aria-label={t('Roles')} sx={{ mb: 3 }}>
        {roles.map((r, i) => {
          const position = positionOf(r.position_id)
          const people = r.people.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p)
          const leads = roles.filter(x => x.reports_to === r.id)
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

      {editing && <RoleDialog role={editing} roles={roles} team={team} onClose={() => setEditing(null)} />}
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
  const [deleting, setDeleting] = useState(false)
  // Not itself, nor one that (through others) answers to it.
  const leads = roles.filter(r => r.id !== role.id && !(role.id && isUnder(roles, r.id, role.id)))
  const save = async () => {
    const duties = dutiesFromLines(lines)
    const ok = await run(async () => {
      const problem = roleProblem({ name, summary, duties })
      if (problem) throw new Error(t(problem))
      await api.saveJobRole({ id: role.id, name: name.trim(), summary: summary.trim() || null, position_id: positionId, reports_to: reportsTo,
        people: people.map(p => p.id), duties, ...(role.id ? {} : { sort: role.sort ?? 0 }) })
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
