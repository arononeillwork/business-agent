// The sales board as a tree (Sales in the admin area, its Tree view): each salesperson, the kinds of
// business they're talking to, and the businesses of each kind with their stage. A business opens to its
// history and the messages to send, as its card on the board does.
import { Box, ButtonBase, Stack, Typography } from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import { useState } from 'react'
import { Tag } from '../../components/common'
import { PROSPECT_TONE } from '../../components/SalesTeamBoard'
import { COUNTRIES } from '../../../shared/country'
import { formatLocal } from '../../../shared/time'
import { BUSINESS_TYPES, followUpDue, prospectStageLabel, salesTree, type Prospect, type SalesBoard } from '../../../shared/salesTeam'
import { tokens } from '../../theme'
import { t } from '../../i18n'

const count = (n: number) => (n === 1 ? t('1 business') : t('{n} businesses', { n }))

/** A level of the tree: indented, with a line down its side to the last of its items and a tick to each. */
const branch = {
  listStyle: 'none', m: 0, mt: 0.5, ml: 1.5, pl: 2.5,
  '& > li': { position: 'relative', py: 0.4 },
  '& > li::before': { content: '""', position: 'absolute', left: -20, top: '1.1em', width: 14, borderTop: 1, borderColor: 'divider' },
  '& > li::after': { content: '""', position: 'absolute', left: -20, top: 0, bottom: 0, borderLeft: 1, borderColor: 'divider' },
  '& > li:last-of-type::after': { bottom: 'auto', height: '1.1em' },
} as const

export function SalesTree({ board, today, onOpen }: { board: SalesBoard; today: string; onOpen: (p: Prospect) => void }) {
  // Everyone starts open; a salesperson folds away with a press on their name.
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setClosed(x => {
    const next = new Set(x)
    if (!next.delete(key)) next.add(key)
    return next
  })
  return (
    <Box component="ul" aria-label={t('Sales team, by kind of business')} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5 }}>
      {salesTree(board).map(({ member, total, kinds }) => {
        const key = member?.id ?? 'nobody'
        const name = member ? member.name : t('Nobody’s yet')
        const open = !closed.has(key)
        return (
          <Box component="li" key={key} aria-label={name} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', p: { xs: 1.5, sm: 2 } }}>
            <Typography component="h3" sx={{ m: 0 }}>
              <ButtonBase onClick={() => toggle(key)} aria-expanded={open} sx={{ gap: 1, borderRadius: 1, px: 0.5, py: 0.25, textAlign: 'left' }}>
                <ExpandIcon fontSize="small" sx={{ transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)', color: 'text.secondary' }} />
                <Typography component="span" sx={{ fontWeight: 600, fontSize: '1rem' }}>{name}</Typography>
                <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>{count(total)}</Typography>
              </ButtonBase>
            </Typography>
            {open && (kinds.length === 0
              ? <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4.5, mt: 0.5 }}>{t('Nobody here yet.')}</Typography>
              : (
                <Box component="ul" sx={branch}>
                  {kinds.map(k => {
                    const kind = t(BUSINESS_TYPES.find(b => b.id === k.type)!.many)
                    return (
                      <li key={k.type} aria-label={kind}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{kind}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{k.prospects.length}</Typography>
                        </Stack>
                        <Box component="ul" sx={branch}>
                          {k.prospects.map(p => <li key={p.id}><Leaf p={p} today={today} onOpen={() => onOpen(p)} /></li>)}
                        </Box>
                      </li>
                    )
                  })}
                </Box>
              ))}
          </Box>
        )
      })}
    </Box>
  )
}

/** A business: its name, stage, where it is, and a follow-up that's due; pressed, it opens. */
function Leaf({ p, today, onOpen }: { p: Prospect; today: string; onOpen: () => void }) {
  const tone = PROSPECT_TONE[p.stage]
  const where = [p.town, p.country ? t(COUNTRIES[p.country].name) : null].filter(Boolean).join(', ')
  return (
    <ButtonBase onClick={onOpen} aria-label={t('Open {name}', { name: p.name })}
      sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center', columnGap: 1, rowGap: 0.5, textAlign: 'left', borderRadius: 1,
        px: 0.75, py: 0.25, mx: -0.75, '&:hover, &:focus-visible': { bgcolor: 'action.hover' } }}>
      <Typography component="span" sx={{ fontSize: '0.92rem' }}>{p.name}</Typography>
      <Tag fg={tone.fg} bg={tone.bg}>{t(prospectStageLabel(p.stage))}</Tag>
      {p.kind === 'partner' && <Tag fg={tokens.ubeDeep} bg={tokens.ubeSoft}>{t('Partner')}</Tag>}
      {followUpDue(p, today) && (
        <Tag fg={tokens.warnFg} bg={tokens.warnBg}>
          {p.follow_up_on === today ? t('Follow up today') : t('Follow up: {date}', { date: formatLocal(`${p.follow_up_on}T12:00:00Z`, 'd MMM') })}
        </Tag>
      )}
      {where && <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>{where}</Typography>}
    </ButtonBase>
  )
}
