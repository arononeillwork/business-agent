import { useQuery } from '@tanstack/react-query'
import { needsReply } from '../../shared/messages'
import { useApp } from './AppContext'

/**
 * How many chats are waiting on a reply, for the badge on the menu's Messages item.
 * Shares its cache with the Messages page ('integrations' and 'instagram-inbox'), so opening the
 * page costs no extra reads. Only admins see Messages, and the inbox is only asked for once
 * Instagram is connected; a failed read just means no badge.
 */
export function useUnreadMessages(): number {
  const { api, isAdmin, isPartner } = useApp()
  const admin = isAdmin && !isPartner
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api.integrations(), enabled: admin })
  const connected = integ.data?.integrations.some(i => i.provider === 'instagram' && i.status === 'connected') ?? false
  const inbox = useQuery({
    queryKey: ['instagram-inbox'],
    queryFn: () => api.instagramInbox(),
    enabled: admin && connected,
    refetchInterval: 120_000,
    retry: false,
  })
  return inbox.data?.conversations.filter(needsReply).length ?? 0
}
