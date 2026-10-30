import { Box, Button, IconButton, ListItemIcon, Menu, MenuItem, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import MoveIcon from '@mui/icons-material/ArrowForward'
import OpenIcon from '@mui/icons-material/OpenInNew'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import { Tag } from './common'
import { formatLocal } from '../../shared/time'
import {
  APPLICANT_STAGES, applicantStageLabel, boardLabel, contractLabel, openingStatusLabel, overdue,
  type Applicant, type ApplicantStage, type HiringLane, type JobOpening, type OpeningStatus,
} from '../../shared/hiring'
import { tokens } from '../theme'
import { t } from '../i18n'

export const OPENING_TONE: Record<OpeningStatus, { fg: string; bg: string }> = {
  open: { fg: tokens.goodFg, bg: tokens.goodBg }, paused: { fg: tokens.warnFg, bg: tokens.warnBg },
  filled: { fg: tokens.infoFg, bg: tokens.infoBg }, closed: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
export const STAGE_TONE: Record<ApplicantStage, { fg: string; bg: string }> = {
  applied: { fg: tokens.neutralFg, bg: tokens.neutralBg }, screening: { fg: tokens.infoFg, bg: tokens.infoBg }, interview: { fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  trial: { fg: tokens.warnFg, bg: tokens.warnBg }, offer: { fg: tokens.warnFg, bg: tokens.warnBg }, hired: { fg: tokens.goodFg, bg: tokens.goodBg },
  rejected: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
const COLUMN = 136
const grid = { display: 'grid', gridTemplateColumns: `repeat(${APPLICANT_STAGES.length}, minmax(0, 1fr))`, gap: 1 }

/**
 * Hiring as a board with swimlanes: a lane per job, a column per stage (Applied to Hired, and Not this
 * time), a card per applicant. Cards are dragged to another stage, or to another job's lane, or moved
 * from their menu.
 */
export function HiringBoard({ lanes, today, positionName, onMove, onEdit, onAdd, onHire }: {
  lanes: HiringLane[]; today: string; positionName: (id: number | null) => string | undefined
  onMove: (a: Applicant, to: { opening_id: string; stage: ApplicantStage }) => void
  onEdit: (a: Applicant) => void
  onAdd: (opening: JobOpening) => void
  onHire: (a: Applicant) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [dragging, setDragging] = useState<Applicant | null>(null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const a = active.data.current?.applicant as Applicant | undefined
    const to = over?.data.current as { opening_id: string; stage: ApplicantStage } | undefined
    if (a && to) onMove(a, to)
  }
  const totals = Object.fromEntries(APPLICANT_STAGES.map(s => [s.id, lanes.reduce((n, l) => n + l.byStage[s.id].length, 0)])) as Record<ApplicantStage, number>
  const card = (a: Applicant) => ({ a, today, onMove: (stage: ApplicantStage) => onMove(a, { opening_id: a.opening_id, stage }), onEdit: () => onEdit(a), onHire: () => onHire(a) })

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={e => setDragging(e.active.data.current?.applicant ?? null)}
      onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <Box sx={{ overflowX: 'auto', pb: 1, mb: 3 }}>
        <Box sx={{ minWidth: APPLICANT_STAGES.length * COLUMN }}>
          <Box sx={{ ...grid, mb: 1, px: 1.25, border: 1, borderColor: 'transparent' }}>
            {APPLICANT_STAGES.map(s => (
              <Stack key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.75, borderRadius: '10px', bgcolor: STAGE_TONE[s.id].bg }}>
                <Typography variant="body2" component="h2" sx={{ fontWeight: 600, color: STAGE_TONE[s.id].fg }}>{t(s.label)}</Typography>
                <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: STAGE_TONE[s.id].fg, opacity: 0.8 }}>{totals[s.id]}</Box>
              </Stack>
            ))}
          </Box>
          {lanes.map(({ opening: o, byStage, total }) => (
            <Box key={o.id} component="section" aria-label={o.title} sx={{ mb: 2, p: 1.25, borderRadius: '14px', border: 1, borderColor: 'divider', bgcolor: tokens.surfaceAlt }}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1, px: 0.5, position: 'sticky', left: 0, maxWidth: 'calc(100vw - 48px)' }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{o.title}</Typography>
                <Tag {...OPENING_TONE[o.status]}>{t(openingStatusLabel(o.status))}</Tag>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {[positionName(o.position_id), t(contractLabel(o.contract)), t('{n} applied', { n: total })].filter(Boolean).join(' · ')}
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd(o)} aria-label={t('Add an applicant for {name}', { name: o.title })}>{t('Applicant')}</Button>
              </Stack>
              <Box sx={grid}>
                {APPLICANT_STAGES.map(s => (
                  <Cell key={s.id} opening={o} stage={s.id}>
                    {byStage[s.id].map(a => <DraggableCard key={a.id} {...card(a)} />)}
                  </Cell>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <DragOverlay>{dragging ? <CardFace a={dragging} today={today} lifted /> : null}</DragOverlay>
    </DndContext>
  )
}

/** A stage in a job's lane: where cards are dropped. */
function Cell({ opening, stage, children }: { opening: JobOpening; stage: ApplicantStage; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${opening.id}:${stage}`, data: { opening_id: opening.id, stage } })
  return (
    <Stack ref={setNodeRef} role="group" aria-label={t(applicantStageLabel(stage))} spacing={1}
      sx={{ minHeight: 72, p: 0.75, borderRadius: '10px', transition: 'background-color 120ms',
        bgcolor: isOver ? STAGE_TONE[stage].bg : 'background.default', border: 1, borderColor: isOver ? STAGE_TONE[stage].fg : 'transparent' }}>
      {children}
    </Stack>
  )
}

interface CardProps { a: Applicant; today: string; onMove?: (stage: ApplicantStage) => void; onEdit?: () => void; onHire?: () => void; lifted?: boolean }

function DraggableCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.a.id, data: { applicant: props.a } })
  return (
    <Box ref={setNodeRef} sx={{ opacity: isDragging ? 0.35 : 1 }}>
      <CardFace {...props} handle={{ ...attributes, ...listeners }} />
    </Box>
  )
}

/** An applicant's card: who, where they came from, the interview, how they were rated; moved, edited or hired from its menu. */
function CardFace({ a, today, onMove, onEdit, onHire, handle, lifted }: CardProps & { handle?: Record<string, unknown> }) {
  const [more, setMore] = useState<HTMLElement | null>(null)
  const stillIn = a.stage !== 'hired' && a.stage !== 'rejected'
  return (
    <Box component="article" aria-label={a.full_name}
      sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: '10px', border: 1, borderColor: 'divider', p: 1, pr: 3.5,
        boxShadow: lifted ? `0 14px 30px -14px ${tokens.shadow}` : 'none', opacity: a.stage === 'rejected' ? 0.75 : 1 }}>
      <Box {...handle} role={handle ? 'button' : undefined} aria-label={handle ? t('Drag {title}', { title: a.full_name }) : undefined}
        sx={{ cursor: handle ? 'grab' : 'grabbing', touchAction: 'none', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.ink}`, borderRadius: '6px' } }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.35, wordBreak: 'break-word' }}>{a.full_name}</Typography>
        {a.rating && <Typography variant="caption" sx={{ color: tokens.warnFg }} aria-label={t('{n} out of 5', { n: a.rating })}>{'★'.repeat(a.rating) + '☆'.repeat(5 - a.rating)}</Typography>}
      </Box>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.4 }}>
        {[t(boardLabel(a.source)), t('applied {date}', { date: day(a.applied_on) })].join(' · ')}
      </Typography>
      {stillIn && a.interview_at && (
        <Typography variant="caption" sx={{ display: 'block', color: tokens.ubeDeep, fontWeight: 500 }}>
          {t('Interview {when}', { when: formatLocal(a.interview_at, 'EEE d MMM, HH:mm') })}
        </Typography>
      )}
      {a.profile_id && <Typography variant="caption" sx={{ display: 'block', color: tokens.goodFg, fontWeight: 500 }}>{t('On the team')}</Typography>}
      {overdue(a, today) && <Box sx={{ mt: 0.5 }}><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Kept until {date}', { date: day(a.keep_until) })}</Tag></Box>}
      {onMove && (
        <>
          <IconButton size="small" onClick={e => setMore(e.currentTarget)} aria-label={t('More for {title}', { title: a.full_name })}
            sx={{ position: 'absolute', top: 4, right: 4, p: 0.5, color: tokens.inkFaint }}>
            <MoreIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Menu anchorEl={more} open={!!more} onClose={() => setMore(null)}>
            <MenuItem onClick={() => { setMore(null); onEdit?.() }}>
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Edit {name}', { name: a.full_name })}
            </MenuItem>
            {a.cv_link && (
              <MenuItem component="a" href={a.cv_link} target="_blank" rel="noopener" onClick={() => setMore(null)}>
                <ListItemIcon><OpenIcon fontSize="small" /></ListItemIcon>{t('Open the CV of {name}', { name: a.full_name })}
              </MenuItem>
            )}
            {(a.stage === 'offer' || a.stage === 'hired') && !a.profile_id && (
              <MenuItem onClick={() => { setMore(null); onHire?.() }}>
                <ListItemIcon><PersonAddIcon fontSize="small" /></ListItemIcon>{t('Add {name} to the team', { name: a.full_name })}
              </MenuItem>
            )}
            {APPLICANT_STAGES.filter(s => s.id !== a.stage).map(s => (
              <MenuItem key={s.id} onClick={() => { setMore(null); onMove(s.id) }}>
                <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>{t('Move to {column}', { column: t(s.label) })}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Box>
  )
}
