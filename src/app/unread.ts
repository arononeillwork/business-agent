import { useQuery } from '@tanstack/react-query'
import { needsReply } from '../../shared/messages'
import { useApp } from './AppContext'

/**
 * How many chats are waiting on a reply, for the badge on the menu's Messages item.
 * Shares its cache with the Messages page ('integrations', 'instagram-inbox', 'messenger-inbox' and
 * 'whatsapp-inbox'), so opening the page costs no extra reads. Only admins see Messages, and each inbox
 * is only asked for once its connection (Instagram, Facebook for Messenger, WhatsApp) is on; a failed read just means no badge.
 */
export function useUnreadMessages(): number {
  const { api, isAdmin, isPartner } = useApp()
  const admin = isAdmin && !isPartner
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api.integrations(), enabled: admin })
  const on = (p: 'instagram' | 'facebook' | 'whatsapp') => integ.data?.integrations.some(i => i.provider === p && i.status === 'connected') ?? false
  const inbox = useQuery({
    queryKey: ['instagram-inbox'],
    queryFn: () => api.instagramInbox(),
    enabled: admin && on('instagram'),
    refetchInterval: 120_000,
    retry: false,
  })
  const messenger = useQuery({
    queryKey: ['messenger-inbox'],
    queryFn: () => api.messengerInbox(),
    enabled: admin && on('facebook'),
    refetchInterval: 120_000,
    retry: false,
  })
  const whatsapp = useQuery({
    queryKey: ['whatsapp-inbox'],
    queryFn: () => api.whatsappInbox(),
    enabled: admin && on('whatsapp'),
    refetchInterval: 120_000,
    retry: false,
  })
  return [...inbox.data?.conversations ?? [], ...messenger.data?.conversations ?? [], ...whatsapp.data?.conversations ?? []].filter(needsReply).length
}
