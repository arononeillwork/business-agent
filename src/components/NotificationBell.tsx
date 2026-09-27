import { Badge, Box, Button, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import BellIcon from '@mui/icons-material/NotificationsNoneOutlined'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

/** The bell: reminders for events you asked to be alerted about, and other news for you. */
export function NotificationBell({ tone }: { tone?: 'nav' }) {
  const { api } = useApp()
  const run = useAction()
  const navigate = useNavigate()
  const list = useAsync('notifications', () => api.notifications(), [], { refetchInterval: 60_000 })
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const unread = (list.data ?? []).filter(n => !n.read_at).length
  const close = () => {
    setAnchor(null)
    if (unread) run(() => api.markNotificationsRead())
  }
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} onClick={e => setAnchor(e.currentTarget)}
          sx={tone === 'nav' ? { color: tokens.navText, '&:hover': { color: tokens.navBright, background: tokens.navHover } } : undefined}>
          <Badge badgeContent={unread} color="primary" max={9} sx={{ '& .MuiBadge-badge': { fontWeight: 600, color: '#2B2522' } }}>
            <BellIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)', borderRadius: '18px', border: `1px solid ${tokens.line}`, mt: 1 } } }}>
        <Box role="region" aria-label="Notifications" sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Notifications</Typography>
          {list.data?.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
              Nothing yet. Tap the bell on a calendar event or match to get reminded before it.
            </Typography>
          )}
          <Stack spacing={0.5} sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {list.data?.map(n => (
              <Box key={n.id} component={n.link ? 'button' : 'div'} onClick={n.link ? () => { close(); navigate(n.link!) } : undefined}
                sx={{ all: 'unset', display: 'flex', gap: 1.25, p: 1.25, borderRadius: '12px', cursor: n.link ? 'pointer' : 'default',
                  bgcolor: n.read_at ? 'transparent' : tokens.roseSoft, '&:hover': { bgcolor: tokens.hover },
                  '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}` } }}>
                <Box aria-hidden sx={{ width: 8, height: 8, mt: 0.9, borderRadius: '50%', flexShrink: 0, bgcolor: n.read_at ? 'transparent' : tokens.rose }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500, fontSize: '0.92rem' }}>{n.title}</Typography>
                  {n.body && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{n.body}</Typography>}
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>{formatLocal(n.created_at, 'EEE d MMM, HH:mm')}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
          {unread > 0 && <Button size="small" sx={{ mt: 1 }} onClick={close}>Mark all as read</Button>}
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
  const label = on ? `Alert on for ${title}` : `Alert me about ${title}`
  return (
    <Tooltip title={isAdmin ? (on ? 'Admins will be reminded. Tap to turn off.' : 'Remind the admins before this') : 'Admins will be reminded'}>
      <span>
        <IconButton size="small" aria-label={label} aria-pressed={on} disabled={!isAdmin}
          onClick={e => { e.stopPropagation(); run(() => api.setEventAlert(kind, refId, !on), on ? 'Alert turned off' : 'Alert on: admins will be reminded') }}
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
