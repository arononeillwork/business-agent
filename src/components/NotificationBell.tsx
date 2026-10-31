import { Badge, Box, Button, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import BellIcon from '@mui/icons-material/NotificationsNoneOutlined'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { formatLocal } from '../../shared/time'
import type { AppNotification } from '../../shared/types'
import { tokens } from '../theme'
import { currentLanguage, t } from '../i18n'
import { roundButton } from '../app/QuickActions'
import { Link as RouterLink } from 'react-router-dom'
import { MentionActions, useMentions } from './Mentions'
import { pushText } from '../../shared/pushText'

/**
 * A notification's title and text in the language shown. The database and the Worker write them in
 * English; shared/pushText.ts says each kind again in the person's language (as their phone gets it).
 */
export const notificationTitle = (n: AppNotification) => pushText(n, currentLanguage()).title
export const notificationBody = (n: AppNotification) => pushText(n, currentLanguage()).body


/** The bell: reminders for events you asked to be alerted about, and other news for you. */
export function NotificationBell() {
  const { api } = useApp()
  const run = useAction()
  const navigate = useNavigate()
  const list = useAsync('notifications', () => api.notifications(), [], { refetchInterval: 60_000 })
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const unread = (list.data ?? []).filter(n => !n.read_at).length
  // Mentions carry Repost / Ignore right in the list.
  const mentions = useMentions(!!anchor && !!list.data?.some(n => n.kind === 'instagram_mention'))
  const close = () => {
    setAnchor(null)
    if (unread) run(() => api.markNotificationsRead())
  }
  return (
    <>
      <Tooltip title={t('Notifications')}>
        <IconButton aria-label={unread ? t('Notifications, {n} new', { n: unread }) : t('Notifications')} onClick={e => setAnchor(e.currentTarget)}
          sx={roundButton}>
          <Badge badgeContent={unread} color="primary" max={9} sx={{ '& .MuiBadge-badge': { fontWeight: 500, color: '#2B2522' } }}>
            <BellIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)', borderRadius: '18px', border: `1px solid ${tokens.line}`, mt: 1 } } }}>
        <Box role="region" aria-label={t('Notifications')} sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('Notifications')}</Typography>
          {list.data?.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
              {t('Nothing yet. Tap the bell on a calendar event or match to get reminded before it.')}
            </Typography>
          )}
          <Stack spacing={0.5} sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {list.data?.map(n => {
              const mention = n.kind === 'instagram_mention' ? mentions.data?.find(m => m.id === n.data?.mention) : undefined
              // A mention has its own buttons, so the row itself isn't one.
              const opens = !!n.link && n.kind !== 'instagram_mention'
              return (
                <Box key={n.id} component={opens ? 'button' : 'div'} onClick={opens ? () => { close(); navigate(n.link!) } : undefined}
                  sx={{ all: 'unset', display: 'flex', gap: 1.25, p: 1.25, borderRadius: '12px', cursor: opens ? 'pointer' : 'default',
                    bgcolor: n.read_at ? 'transparent' : tokens.roseSoft, '&:hover': { bgcolor: tokens.hover },
                    '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}` } }}>
                  <Box aria-hidden sx={{ width: 8, height: 8, mt: 0.9, borderRadius: '50%', flexShrink: 0, bgcolor: n.read_at ? 'transparent' : tokens.rose }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.92rem' }}>{notificationTitle(n)}</Typography>
                    {n.body && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{notificationBody(n)}</Typography>}
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>{formatLocal(n.created_at, 'EEE d MMM, HH:mm')}</Typography>
                    {mention && <Box sx={{ mt: 0.75 }}><MentionActions mention={mention} /></Box>}
                  </Box>
                </Box>
              )
            })}
          </Stack>
          <Stack direction="row" sx={{ mt: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <Button size="small" component={RouterLink} to="/notifications" onClick={close}>{t('See all notifications')}</Button>
            {unread > 0 && <Button size="small" onClick={close}>{t('Mark all as read')}</Button>}
          </Stack>
        </Box>
      </Popover>
    </>
  )
}

/** The bell on one event: switch an alert on or off (admins); everyone else sees whether it's on. */
export function EventAlertButton({ kind, refId, title }: { kind: 'calendar' | 'sports'; refId: string; title: string }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const alerts = useAsync('event-alerts', () => api.eventAlerts(), [])
  const on = !!alerts.data?.some(a => a.kind === kind && a.ref_id === refId)
  if (!isAdmin && !on) return null
  const label = on ? t('Alert on for {title}', { title }) : t('Alert me about {title}', { title })
  return (
    <Tooltip title={isAdmin ? (on ? t('Admins will be reminded. Tap to turn off.') : t('Remind the admins before this')) : t('Admins will be reminded')}>
      <span>
        <IconButton size="small" aria-label={label} aria-pressed={on} disabled={!isAdmin}
          onClick={e => { e.stopPropagation(); run(() => api.setEventAlert(kind, refId, !on), on ? t('Alert turned off') : t('Alert on: admins will be reminded')) }}
          sx={{ color: on ? tokens.roseDeep : tokens.inkFaint, bgcolor: on ? tokens.roseSoft : 'transparent', '&:hover': { color: tokens.roseDeep, bgcolor: tokens.roseSoft } }}>
          {on ? <ActiveBell /> : <BellIcon fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  )
}

function ActiveBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
    </svg>
  )
}
