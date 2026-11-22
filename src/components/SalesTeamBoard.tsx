import { Box, Button, Divider, IconButton, Link, ListItemIcon, ListSubheader, Menu, MenuItem, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import InstagramIcon from '@mui/icons-material/Instagram'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/MailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import MoveIcon from '@mui/icons-material/ArrowForward'
import PersonIcon from '@mui/icons-material/PersonOutlined'
import OpenIcon from '@mui/icons-material/ChatOutlined'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import { Tag } from './common'
import { formatLocal } from '../../shared/time'
import {
  PROSPECT_STAGES, followUpDue, instagramLink, lanes, phoneLink, prospectStageLabel, whatsAppLink,
  type Prospect, type ProspectStage, type SalesBoard, type SalesMember,
} from '../../shared/salesTeam'
import { tokens } from '../theme'
import { t } from '../i18n'

export const PROSPECT_TONE: Record<ProspectStage, { fg: string; bg: string }> = {
  to_contact: { fg: tokens.neutralFg, bg: tokens.neutralBg }, contacted: { fg: tokens.infoFg, bg: tokens.infoBg },
  demo: { fg: tokens.ubeDeep, bg: tokens.ubeSoft }, trial: { fg: tokens.warnFg, bg: tokens.warnBg },
  won: { fg: tokens.goodFg, bg: tokens.goodBg }, lost: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const COLUMN = 176
const grid = { display: 'grid', gridTemplateColumns: `repeat(${PROSPECT_STAGES.length}, minmax(0, 1fr))`, gap: 1 }
const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')

/** Where a card is dropped: someone's lane (or nobody's: null) and a stage. */
export type Spot = { member_id: string | null; stage: ProspectStage }

/**
 * The sales team's board: a swimlane per salesperson (and last, nobody's, when a business has no one),
 * a column per stage from To contact to Signed up (and Not now), a card per business with the ways to
 * reach it. Cards are dragged to another stage or someone else's lane, or moved from their menu.
 */
export function SalesTeamBoard({ board, today, onMove, onEdit, onOpen, onAdd, onRemove }: {
  board: SalesBoard; today: string
  onMove: (p: Prospect, to: Spot) => void
  onEdit: (p: Prospect) => void
  /** Its history, and a message to send. */
  onOpen: (p: Prospect) => void
  /** A business for someone's lane (null: nobody's). */
  onAdd: (member: SalesMember | null) => void
  onRemove: (p: Prospect) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }))
  const [dragging, setDragging] = useState<Prospect | null>(null)
  const rows = lanes(board)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const p = active.data.current?.prospect as Prospect | undefined
    const to = over?.data.current as Spot | undefined
    if (p && to && (to.stage !== p.stage || to.member_id !== p.member_id)) onMove(p, to)
  }
  const totals = Object.fromEntries(PROSPECT_STAGES.map(s => [s.id, rows.reduce((n, l) => n + l.byStage[s.id].length, 0)])) as Record<ProspectStage, number>
  const card = (p: Prospect) => ({
    p, today, team: board.team, onMove: (to: Spot) => onMove(p, to), onEdit: () => onEdit(p), onOpen: () => onOpen(p), onRemove: () => onRemove(p),
  })

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={e => setDragging(e.active.data.current?.prospect ?? null)}
      onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <Box sx={{ overflowX: 'auto', pb: 1, mb: 3 }}>
        <Box sx={{ minWidth: PROSPECT_STAGES.length * COLUMN }}>
          <Box sx={{ ...grid, mb: 1, px: 1.25, border: 1, borderColor: 'transparent' }}>
            {PROSPECT_STAGES.map(s => (
              <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.75, borderRadius: '10px', bgcolor: PROSPECT_TONE[s.id].bg }}>
                <Typography variant="body2" component="h3" sx={{ fontWeight: 600, color: PROSPECT_TONE[s.id].fg }}>{t(s.label)}</Typography>
                <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: PROSPECT_TONE[s.id].fg, opacity: 0.8 }}>{totals[s.id]}</Box>
              </Stack>
            ))}
          </Box>
          {rows.map(({ member: m, byStage, total }) => (
            <Box key={m?.id ?? 'nobody'} component="section" aria-label={m ? m.name : t('Nobody’s yet')}
              sx={{ mb: 2, p: 1.25, borderRadius: '14px', border: 1, borderColor: 'divider', bgcolor: tokens.surfaceAlt, borderStyle: m ? 'solid' : 'dashed' }}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1, px: 0.5, position: 'sticky', left: 0, maxWidth: 'calc(100vw - 48px)' }}>
                <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600,
                  bgcolor: m ? tokens.ubeSoft : tokens.neutralBg, color: m ? tokens.ubeDeep : tokens.neutralFg }}>
                  {m ? initials(m.name) : <PersonIcon sx={{ fontSize: 16 }} />}
                </Box>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{m ? m.name : t('Nobody’s yet')}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {total === 1 ? t('1 business') : t('{n} businesses', { n: total })}
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd(m)}
                  aria-label={m ? t('Add a contact for {name}', { name: m.name }) : t('Add a contact for nobody yet')}>{t('Contact')}</Button>
              </Stack>
              <Box sx={grid}>
                {PROSPECT_STAGES.map(s => (
                  <Cell key={s.id} member={m} stage={s.id}>
                    {byStage[s.id].map(p => <DraggableCard key={p.id} {...card(p)} />)}
                  </Cell>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <DragOverlay>{dragging ? <CardFace p={dragging} today={today} team={board.team} lifted /> : null}</DragOverlay>
    </DndContext>
  )
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

/** A stage in someone's lane: where cards are dropped. */
function Cell({ member, stage, children }: { member: SalesMember | null; stage: ProspectStage; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${member?.id ?? 'nobody'}:${stage}`, data: { member_id: member?.id ?? null, stage } satisfies Spot })
  return (
    <Stack ref={setNodeRef} role="group" aria-label={t(prospectStageLabel(stage))} spacing={1}
      sx={{ minHeight: 72, p: 0.75, borderRadius: '10px', transition: 'background-color 120ms',
        bgcolor: isOver ? PROSPECT_TONE[stage].bg : 'background.default', border: 1, borderColor: isOver ? PROSPECT_TONE[stage].fg : 'transparent' }}>
      {children}
    </Stack>
  )
}

interface CardProps {
  p: Prospect; today: string; team: SalesMember[]; lifted?: boolean
  onMove?: (to: Spot) => void; onEdit?: () => void; onOpen?: () => void; onRemove?: () => void
}

function DraggableCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.p.id, data: { prospect: props.p } })
  return (
    <Box ref={setNodeRef} sx={{ opacity: isDragging ? 0.35 : 1 }}>
      <CardFace {...props} handle={{ ...attributes, ...listeners }} />
    </Box>
  )
}

/** One way to reach them, as a small link. */
function Reach({ href, icon, label, children, external = true }: { href: string; icon: ReactNode; label: string; children: ReactNode; external?: boolean }) {
  return (
    <Link href={href} {...(external ? { target: '_blank', rel: 'noopener' } : {})} variant="caption" aria-label={label} title={label}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.25, maxWidth: '100%', width: 'fit-content', fontWeight: 500 }}>
      {icon}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</Box>
    </Link>
  )
}

/** A business's card: its name and town, each way to reach it, when to follow up, the start of the notes; moved, edited or removed from its menu. */
function CardFace({ p, today, team, onMove, onEdit, onOpen, onRemove, handle, lifted }: CardProps & { handle?: Record<string, unknown> }) {
  const [more, setMore] = useState<HTMLElement | null>(null)
  const icon = { fontSize: 14, flexShrink: 0 }
  const site = p.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  return (
    <Box component="article" aria-label={p.name}
      sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: '10px', border: 1, borderColor: 'divider', p: 1, pr: 3.5,
        boxShadow: lifted ? `0 14px 30px -14px ${tokens.shadow}` : 'none', opacity: p.stage === 'lost' ? 0.75 : 1 }}>
      <Box {...handle} role={handle ? 'button' : undefined} aria-label={handle ? t('Drag {title}', { title: p.name }) : undefined}
        sx={{ cursor: handle ? 'grab' : 'grabbing', touchAction: 'none', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.ink}`, borderRadius: '6px' } }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.35, wordBreak: 'break-word' }}>{p.name}</Typography>
        {p.town && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{p.town}</Typography>}
      </Box>
      {(p.kind === 'partner' || p.introduction_id) && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
          {p.kind === 'partner' && <Tag fg={tokens.ubeDeep} bg={tokens.ubeSoft}>{t('Partner')}</Tag>}
          {p.introduction_id && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Code used')}</Tag>}
        </Stack>
      )}
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {p.instagram && <Reach href={instagramLink(p.instagram)} icon={<InstagramIcon sx={icon} />} label={t('Open @{handle} on Instagram', { handle: p.instagram })}>@{p.instagram}</Reach>}
        {p.phone && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Reach href={phoneLink(p.phone)} icon={<PhoneIcon sx={icon} />} label={t('Call {name}', { name: p.name })} external={false}>{p.phone}</Reach>
            <IconButton size="small" href={whatsAppLink(p.phone)} target="_blank" rel="noopener" aria-label={t('WhatsApp {name}', { name: p.name })}
              sx={{ p: 0.25, color: tokens.goodFg }}>
              <WhatsAppIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
        )}
        {p.email && <Reach href={`mailto:${p.email}`} icon={<EmailIcon sx={icon} />} label={t('Email {name}', { name: p.name })} external={false}>{p.email}</Reach>}
        {p.website && <Reach href={p.website} icon={<WebIcon sx={icon} />} label={t('Open the website of {name}', { name: p.name })}>{site}</Reach>}
      </Stack>
      {p.follow_up_on && p.stage !== 'won' && p.stage !== 'lost' && (
        <Box sx={{ mt: 0.5 }}>
          {followUpDue(p, today)
            ? <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{p.follow_up_on === today ? t('Follow up today') : t('Follow up: {date}', { date: day(p.follow_up_on) })}</Tag>
            : <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Follow up {date}', { date: day(p.follow_up_on) })}</Typography>}
        </Box>
      )}
      {p.notes && (
        <Typography variant="caption" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'text.secondary', mt: 0.5 }}>
          {p.notes}
        </Typography>
      )}
      {onMove && (
        <>
          <IconButton size="small" onClick={e => setMore(e.currentTarget)} aria-label={t('More for {title}', { title: p.name })}
            sx={{ position: 'absolute', top: 4, right: 4, p: 0.5, color: tokens.inkFaint }}>
            <MoreIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Menu anchorEl={more} open={!!more} onClose={() => setMore(null)}>
            <MenuItem onClick={() => { setMore(null); onOpen?.() }}>
              <ListItemIcon><OpenIcon fontSize="small" /></ListItemIcon>{t('Open {name}: history and messages', { name: p.name })}
            </MenuItem>
            <MenuItem onClick={() => { setMore(null); onEdit?.() }}>
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Edit {name}', { name: p.name })}
            </MenuItem>
            <Divider />
            <ListSubheader sx={{ lineHeight: 2.5 }}>{t('Stage')}</ListSubheader>
            {PROSPECT_STAGES.filter(s => s.id !== p.stage).map(s => (
              <MenuItem key={s.id} onClick={() => { setMore(null); onMove({ member_id: p.member_id, stage: s.id }) }}>
                <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>{t('Move to {column}', { column: t(s.label) })}
              </MenuItem>
            ))}
            {team.some(m => m.id !== p.member_id) && <ListSubheader sx={{ lineHeight: 2.5 }}>{t('Salesperson')}</ListSubheader>}
            {team.filter(m => m.id !== p.member_id).map(m => (
              <MenuItem key={m.id} onClick={() => { setMore(null); onMove({ member_id: m.id, stage: p.stage }) }}>
                <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>{t('Give to {name}', { name: m.name })}
              </MenuItem>
            ))}
            <Divider />
            <MenuItem onClick={() => { setMore(null); onRemove?.() }} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>{t('Take {name} off the board', { name: p.name })}
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  )
}
