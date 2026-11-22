import { Alert, Box, Card, CardContent, Checkbox, Link, Stack, Typography } from '@mui/material'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { ErrorBox, Loading, Tag } from '../../components/common'
import { formatLocal, today } from '../../../shared/time'
import { introStage, stageInfo } from '../../../shared/hqReps'
import { helpLabel, helpNeeded, nothingToday, todayList, type AdminTodo } from '../../../shared/adminArea'
import type { Prospect, SalesMember } from '../../../shared/salesTeam'
import { ContactDialog } from './ContactDialog'
import { ProspectDialog } from './SalesTab'
import { useAdmin, useAdminQuery } from './shared'
import { tokens } from '../../theme'
import { t } from '../../i18n'

const day = (d: string) => formatLocal(`${d.slice(0, 10)}T12:00:00Z`, 'EEE d MMM')

/**
 * Today: what's waiting, in one list. Contacts to follow up, jobs for today and gone by (ticked off here),
 * businesses that signed up with a code this week, and those that need a hand (set-up not finished, a
 * payment that failed).
 */
export function TodayTab() {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const board = useAdminQuery('sales', tk => api.salesBoard(tk))
  const todos = useAdminQuery('todos', tk => api.adminTodos(tk))
  const hq = useAdminQuery('hq', tk => api.adminHq(tk))
  const [opened, setOpened] = useState<Prospect | null>(null)
  const [editing, setEditing] = useState<Prospect | null>(null)
  const now = today('Europe/Madrid')
  const error = board.error ?? todos.error ?? hq.error
  if (!board.data || !todos.data || !hq.data) return error ? <ErrorBox error={error} /> : <Loading />
  const list = todayList(board.data.prospects, todos.data.todos, hq.data.introductions, now)
  const team = board.data.team
  const lane = (p: Prospect) => team.find(m => m.id === p.member_id)?.name ?? t('Nobody’s yet')
  const contactOf = (todo: AdminTodo) => board.data!.prospects.find(p => p.id === todo.sales_prospect_id)
  const tick = (todo: AdminTodo) => run(() => api.saveAdminTodo(token, { id: todo.id, done: true }), t('Done: {title}', { title: todo.title }))

  return (
    <Stack spacing={3}>
      <Typography variant="body1" sx={{ color: 'text.secondary' }}>{formatLocal(`${now}T12:00:00Z`, 'EEEE d MMMM')}</Typography>
      {nothingToday(list) && <Alert severity="success">{t('Nothing waiting today.')}</Alert>}

      {list.followUps.length > 0 && (
        <Section title={t('Follow up')} count={list.followUps.length}>
          {list.followUps.map(p => (
            <Row key={p.id} label={p.name}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Link component="button" variant="body2" onClick={() => setOpened(p)} sx={{ fontWeight: 500, textAlign: 'left' }}
                  aria-label={t('Open {name}: history and messages', { name: p.name })}>{p.name}</Link>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{lane(p)}</Typography>
              </Box>
              <Tag {...(p.follow_up_on! < now ? { fg: tokens.warnFg, bg: tokens.warnBg } : {})}>
                {p.follow_up_on === now ? t('Today') : day(p.follow_up_on!)}
              </Tag>
            </Row>
          ))}
        </Section>
      )}

      {list.todos.length > 0 && (
        <Section title={t('To do')} count={list.todos.length} more={<Link component={RouterLink} to="/admin/todo" variant="body2">{t('All jobs')}</Link>}>
          {list.todos.map(todo => {
            const contact = contactOf(todo)
            return (
              <Row key={todo.id} label={todo.title}>
                <Checkbox edge="start" onChange={() => void tick(todo)} slotProps={{ input: { 'aria-label': t('Done: {title}', { title: todo.title }) } }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">{todo.title}</Typography>
                  {contact && <Link component="button" variant="caption" onClick={() => setOpened(contact)}>{contact.name}</Link>}
                </Box>
                {todo.planned_on && todo.planned_on < now && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{day(todo.planned_on)}</Tag>}
              </Row>
            )
          })}
        </Section>
      )}

      {list.needHelp.length > 0 && (
        <Section title={t('Need a hand')} count={list.needHelp.length} more={<Link component={RouterLink} to="/admin/onboarding" variant="body2">{t('Onboarding')}</Link>}>
          {list.needHelp.map(i => (
            <Row key={i.id} label={i.name}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{i.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Signed up {date} with {code}', { date: day(i.created_at), code: i.code })}</Typography>
              </Box>
              <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t(helpLabel(helpNeeded(i, now)!))}</Tag>
            </Row>
          ))}
        </Section>
      )}

      {list.newSignUps.length > 0 && (
        <Section title={t('New sign-ups this week')} count={list.newSignUps.length}>
          {list.newSignUps.map(i => (
            <Row key={i.id} label={i.name}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{i.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Signed up {date} with {code}', { date: day(i.created_at), code: i.code })}</Typography>
              </Box>
              <Tag>{t(stageInfo(introStage(i)).label)}</Tag>
            </Row>
          ))}
        </Section>
      )}

      {opened && <ContactDialog prospect={board.data.prospects.find(p => p.id === opened.id) ?? opened} team={team as SalesMember[]}
        onClose={() => setOpened(null)} onEdit={p => { setOpened(null); setEditing(p) }} />}
      {editing && <ProspectDialog start={editing} team={team} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

function Section({ title, count, more, children }: { title: string; count: number; more?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 1 }}>
        <Typography variant="h6" component="h2">{title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{count}</Typography>
        <Box sx={{ flex: 1 }} />
        {more}
      </Stack>
      <Card variant="outlined"><CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}><Stack role="list" divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{children}</Stack></CardContent></Card>
    </Box>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <Stack role="listitem" aria-label={label} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.25 }}>{children}</Stack>
}
