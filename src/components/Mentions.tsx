import { Box, Button, Stack, Typography } from '@mui/material'
import RepostIcon from '@mui/icons-material/RepeatRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Tag } from './common'
import { t } from '../i18n'
import type { InstagramMention } from '../../shared/mentions'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

/** Every mention, shared by the bell and the Notifications page (admins only). */
export function useMentions(on = true) {
  const { api, isAdmin } = useApp()
  return useAsync('instagram-mentions', () => (on && isAdmin ? api.instagramMentions() : Promise.resolve([] as InstagramMention[])), [on, isAdmin])
}

/** Repost (to the business's own story) or Ignore; once decided, what was done. */
export function MentionActions({ mention: m }: { mention: InstagramMention }) {
  const { api } = useApp()
  const run = useAction()
  if (m.status === 'reposted') return <Tag fg={tokens.matchaDeep} bg={tokens.matchaSoft}>{t('Reposted to your story')}</Tag>
  if (m.status === 'ignored') return <Tag>{t('Ignored')}</Tag>
  const who = m.username ? `@${m.username}` : t('Someone')
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button size="small" variant="contained" startIcon={<RepostIcon />} aria-label={t('Repost {who}’s {what} to your story', { who, what: m.kind === 'story' ? t('story') : t('post') })}
        onClick={e => { e.stopPropagation(); run(() => api.repostMention(m.id), t('Reposted to your Instagram story')) }}>
        {t('Repost')}
      </Button>
      <Button size="small" onClick={e => { e.stopPropagation(); run(() => api.ignoreMention(m.id), t('Ignored')) }}
        aria-label={t('Ignore {who}’s {what}', { who, what: m.kind === 'story' ? t('story') : t('post') })}>
        {t('Ignore')}
      </Button>
      {m.permalink && (
        <Button size="small" href={m.permalink} target="_blank" rel="noreferrer" endIcon={<OpenIcon fontSize="small" />} onClick={e => e.stopPropagation()}>
          {t('View')}
        </Button>
      )}
    </Stack>
  )
}

/** One mention as a row: their photo or video's picture, who and when, and the buttons. */
export function MentionRow({ mention: m }: { mention: InstagramMention }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 }, alignItems: 'flex-start' }}>
      <Box sx={{ width: 56, height: 72, flexShrink: 0, borderRadius: '10px', overflow: 'hidden', bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }}>
        {m.media_url && <Box component="img" src={m.media_url} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 500 }}>
          {m.kind === 'story'
            ? t('{who} mentioned you in their story', { who: m.username ? `@${m.username}` : t('Someone') })
            : t('{who} tagged you in a post', { who: m.username ? `@${m.username}` : t('Someone') })}
        </Typography>
        {m.caption && <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{m.caption}</Typography>}
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.75 }}>{formatLocal(m.mentioned_at, 'EEE d MMM, HH:mm')}</Typography>
        <MentionActions mention={m} />
      </Box>
    </Stack>
  )
}
