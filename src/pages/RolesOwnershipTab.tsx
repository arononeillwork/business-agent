import {
  Autocomplete, AvatarGroup, Box, Collapse, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import OwnerIcon from '@mui/icons-material/SwapHorizOutlined'
import NotOwnedIcon from '@mui/icons-material/HelpOutlineOutlined'
import CheckIcon from '@mui/icons-material/Check'
import DoneIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PersonAvatar, Tag } from '../components/common'
import { KeyboardSensorNow } from '../components/dnd'
import { NOT_OWNED, buildLanes, dropTarget, laneOfRole, laneOwners, moveRole, ownerChanges, type Lane } from '../../shared/roleOwners'
import { dutiesByWhen, type JobRole } from '../../shared/roles'
import type { Profile } from '../../shared/types'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/**
 * Roles & responsibilities → Ownership (owners only): who owns each role. A lane per owner, and one for
 * the roles nobody owns yet; a role is dragged into an owner's lane or along it (or moved from its
 * Owner menu, on a phone or with the keyboard), and opens to what it means and who's in it.
 */
export function OwnershipTab({ roles, team }: { roles: JobRole[]; team: Profile[] }) {
  const { api, profiles, me } = useApp()
  const run = useAction()
  const owners = laneOwners(profiles)
  const ownerIds = owners.map(o => o.id).join(',')
  const data = useAsync('role-owners', () => api.roleOwners(), [])
  const saved = useMemo(() => data.data ?? [], [data.data])
  const built = useMemo(() => buildLanes(roles, saved, ownerIds ? ownerIds.split(',') : []), [roles, saved, ownerIds])
  // A move shows straight away while it saves.
  const [moved, setMoved] = useState<Lane[] | null>(null)
  const lanes = moved ?? built
  const [dragging, setDragging] = useState<string | null>(null)
  const laneName = (id: string) => (id === NOT_OWNED ? t('Not owned yet') : owners.find(o => o.id === id)?.full_name ?? '')
  const roleById = (id: string) => roles.find(r => r.id === id)

  const move = (roleId: string, toLane: string, at?: number) => {
    const from = laneOfRole(lanes, roleId)
    const next = moveRole(lanes, roleId, toLane, at)
    const changes = ownerChanges(next, saved, [...new Set([from, toLane])])
    if (!changes.length) return
    const name = roleById(roleId)?.name ?? ''
    setMoved(next)
    void run(async () => { await api.saveRoleOwners(changes); await data.reload() },
      from === toLane ? undefined : toLane === NOT_OWNED ? t('{role} has no owner now', { role: name }) : t('{role} is {name}’s now', { role: name, name: laneName(toLane) }))
      .finally(() => setMoved(null))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensorNow, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  // Over a lane, the role it's nearest to there (so it lands in its place, with the keyboard too); below a lane's last role, the lane's end.
  const collision: CollisionDetection = args => {
    const hits = closestCorners(args)
    const lane = hits[0] && args.droppableContainers.find(c => c.id === hits[0].id)?.data.current?.lane as string | undefined
    const ids = lane ? lanes.find(l => l.id === lane)?.roles.filter(r => r !== String(args.active.id)) ?? [] : []
    const items = args.droppableContainers.filter(c => ids.includes(String(c.id)))
    const bottom = Math.max(...items.map(c => args.droppableRects.get(c.id)?.bottom ?? -Infinity))
    if (!items.length || args.collisionRect.top + args.collisionRect.height / 2 > bottom) return hits
    return closestCorners({ ...args, droppableContainers: items })
  }
  const onDragStart = ({ active }: DragStartEvent) => setDragging(String(active.id))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (!over) return
    const lane = over.data.current?.lane as string | undefined
    const target = dropTarget(lanes, String(active.id), lane ? { lane } : { role: String(over.id) })
    if (target) move(String(active.id), target.lane, target.at)
  }
  const lifted = dragging ? roleById(dragging) : undefined

  return (
    <Box component="section" aria-label={t('Ownership')}>
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('Who owns each role: the owners share the business’s roles between them. Drag a role into an owner’s lane, or along it to put it in order, or use its Owner menu; open it to see what it means and who’s in it.')}
      </Typography>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}
        accessibility={{ screenReaderInstructions: { draggable: t('Press space to pick up this role, use the arrow keys to move it to another lane or along this one, and space again to drop it.') } }}>
        <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'start', pb: 1,
          gridTemplateColumns: { xs: '1fr', md: `repeat(${lanes.length}, minmax(240px, 1fr))` }, overflowX: { md: 'auto' } }}>
          {lanes.map(l => {
            const owner = owners.find(o => o.id === l.id)
            return (
              <LaneBox key={l.id} id={l.id} label={laneName(l.id)} count={l.roles.length} you={!!owner && owner.id === me?.id}
                lead={owner ? <PersonAvatar name={owner.full_name} colour={owner.colour} size={28} /> : <NotOwnedIcon sx={{ color: tokens.inkFaint }} />}>
                <SortableContext items={l.roles} strategy={verticalListSortingStrategy}>
                  {l.roles.map(id => roleById(id)).filter((r): r is JobRole => !!r).map(r => (
                    <RoleCard key={r.id} role={r} roles={roles} team={team} lane={l.id} lanes={lanes.map(x => ({ id: x.id, name: laneName(x.id) }))}
                      onOwner={lane => move(r.id, lane)} />
                  ))}
                </SortableContext>
                {l.roles.length === 0 && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3, px: 1 }}>
                    {owner ? t('Drag a role here to give it to {name}', { name: owner.full_name }) : t('Every role has an owner')}
                  </Typography>
                )}
              </LaneBox>
            )
          })}
        </Box>
        <DragOverlay>{lifted ? <CardTitle role={lifted} lifted /> : null}</DragOverlay>
      </DndContext>
    </Box>
  )
}

function LaneBox({ id, label, count, you, lead, children }: { id: string; label: string; count: number; you: boolean; lead: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${id}`, data: { lane: id } })
  const tone = id === NOT_OWNED ? tokens.inkFaint : tokens.rose
  return (
    <Box component="section" ref={setNodeRef} aria-label={label}
      sx={{ bgcolor: isOver ? tokens.roseSoft : tokens.surfaceAlt, borderRadius: '14px', p: 1.25, minHeight: 160, minWidth: 0,
        border: 1, borderColor: isOver ? tokens.rose : 'divider', borderTop: `3px solid ${tone}`, transition: 'background-color 120ms' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5, mb: 1 }}>
        {lead}
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, minWidth: 0, flex: 1 }} noWrap>{label}</Typography>
        {you && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('You')}</Tag>}
        <Box component="span" sx={{ fontSize: 13, fontWeight: 600, px: 1, borderRadius: 999, bgcolor: tokens.surface, border: 1, borderColor: 'divider' }}>{count}</Box>
      </Stack>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  )
}

/** A role's card in a lane: dragged by its title, moved from its Owner menu, opened to what it means. */
function RoleCard({ role, roles, team, lane, lanes, onOwner }: {
  role: JobRole; roles: JobRole[]; team: Profile[]; lane: string; lanes: { id: string; name: string }[]; onOwner: (lane: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id })
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const people = role.people.map(id => team.find(p => p.id === id)).filter((p): p is Profile => !!p)
  const quiet = { p: 0.5, color: tokens.inkFaint }
  return (
    <Box ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} sx={{ opacity: isDragging ? 0.35 : 1 }}>
      <Box component="article" aria-label={role.name}
        sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: '12px', border: 1, borderColor: open ? tokens.rose : 'divider', p: 1.25 }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 0.5 }}>
          <Box {...attributes} {...listeners} role="button" aria-label={t('Drag {title}', { title: role.name })}
            sx={{ flex: 1, minWidth: 0, cursor: 'grab', touchAction: 'none', outline: 'none', borderRadius: '6px',
              '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.ink}` } }}>
            <CardTitle role={role} />
          </Box>
          <Tooltip title={t('Owner of {role}', { role: role.name })}>
            <IconButton size="small" onClick={e => setMenu(e.currentTarget)} aria-label={t('Owner of {role}', { role: role.name })} aria-haspopup="menu" sx={quiet}>
              <OwnerIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`role-${role.id}`}
            aria-label={t('What {role} means', { role: role.name })} sx={quiet}>
            <ExpandIcon sx={{ fontSize: 20, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
          </IconButton>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
          {people.length > 0 && (
            <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderWidth: 1 } }}>
              {people.map(p => <PersonAvatar key={p.id} name={p.full_name} colour={p.colour} size={22} />)}
            </AvatarGroup>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{people.length ? tn(people.length, '{n} person', '{n} people') : t('Nobody yet')}</Typography>
        </Stack>
        <Collapse in={open} id={`role-${role.id}`} unmountOnExit>
          <RoleMeaning role={role} roles={roles} team={team} people={people} />
        </Collapse>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ list: { 'aria-label': t('Owner of {role}', { role: role.name }) } }}>
          {lanes.map(l => (
            <MenuItem key={l.id} role="menuitemradio" aria-checked={l.id === lane} selected={l.id === lane} onClick={() => { setMenu(null); onOwner(l.id) }}>
              <ListItemText primary={l.name} />
              {l.id === lane && <ListItemIcon sx={{ minWidth: 0, ml: 1 }}><CheckIcon fontSize="small" /></ListItemIcon>}
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </Box>
  )
}

function CardTitle({ role, lifted }: { role: JobRole; lifted?: boolean }) {
  return (
    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word',
      ...(lifted ? { bgcolor: 'background.paper', borderRadius: '12px', border: 1, borderColor: tokens.rose, p: 1.25, boxShadow: `0 14px 30px -14px ${tokens.shadow}` } : {}) }}>
      {role.name}
    </Typography>
  )
}

/** What a role means: what it's for, who it answers to, its duties by when, and who's in it (to change). */
function RoleMeaning({ role, roles, team, people }: { role: JobRole; roles: JobRole[]; team: Profile[]; people: Profile[] }) {
  const { api, positions } = useApp()
  const run = useAction()
  const lead = roles.find(r => r.id === role.reports_to)
  const position = positions.find(p => p.id === role.position_id)
  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${tokens.line}` }}>
      <Typography variant="subtitle2" component="h3">{t('What it’s for')}</Typography>
      <Typography variant="body2" sx={{ color: role.summary ? 'text.primary' : 'text.secondary', whiteSpace: 'pre-line', mb: 1 }}>
        {role.summary ?? t('Nothing written yet.')}
      </Typography>
      {(lead || position) && (
        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', mb: 1 }}>
          {lead && <Fact label={t('Answers to')}>{lead.name}</Fact>}
          {position && <Fact label={t('On the rota as')}>{position.name}</Fact>}
        </Stack>
      )}
      {dutiesByWhen(role.duties).map(g => (
        <Box key={g.id} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" component="h3">{t(g.label)}</Typography>
          <Stack component="ul" spacing={0.25} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-label={t('{role}: {when}', { role: role.name, when: t(g.label) })}>
            {g.duties.map(text => (
              <Stack key={text} component="li" direction="row" spacing={0.75} sx={{ alignItems: 'flex-start' }}>
                <DoneIcon sx={{ fontSize: 16, mt: '2px', color: tokens.matchaDeep }} aria-hidden />
                <Typography variant="body2">{text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ))}
      {!role.duties.length && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('No duties written yet.')}</Typography>}
      <Autocomplete multiple size="small" options={team} value={people} getOptionLabel={p => p.full_name} isOptionEqualToValue={(a, b) => a.id === b.id}
        filterSelectedOptions sx={{ mt: 1.5 }}
        onChange={(_, v) => void run(() => api.saveJobRole({ id: role.id, people: v.map(p => p.id) }), t('Saved'))}
        renderInput={p => <TextField {...p} label={t('Who’s in it')} />} />
    </Box>
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
