import { Alert, Box, Button, IconButton, Link, Stack, TextField, Tooltip, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { tokens } from '../theme'
import { t } from '../i18n'

/** A Spotify Client ID, as Spotify's developer dashboard shows it. */
const CLIENT_ID = /^[0-9a-f]{32}$/

/**
 * Which Spotify app the business connects through (Connections → Spotify). The Business Agent's app takes
 * at most 5 Spotify accounts across every business (Spotify's limit), so a business can use its own:
 * made once in Spotify's developer dashboard, its Client ID pasted here. The café's account and the
 * team's own accounts then sign in through it (worker/spotifyApp.ts).
 */
export function SpotifyAppSetup({ onChange }: { onChange: () => Promise<void> }) {
  const { api } = useApp()
  const run = useAction()
  const app = useAsync('spotify-app', () => api.spotifyApp(), [])
  const [editing, setEditing] = useState(false)
  const a = app.data
  if (!a) return app.error ? <Alert severity="error" sx={{ mt: 2.5 }}>{app.error}</Alert> : null
  const saved = async () => { setEditing(false); await app.reload(); await onChange() }
  const form = editing || (!a.own && !a.platform)
  return (
    <Box component="section" aria-label={t('Spotify app')} sx={{ mt: 2.5, p: 2, borderRadius: '12px', border: `1px solid ${tokens.line}` }}>
      <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.6 }}>{t('Spotify app')}</Typography>
      {a.own && !editing && <>
        <Typography variant="body2">
          {t('Through your own Spotify app (Client ID {id}). Up to 5 Spotify accounts can connect through it: add each one’s email under User Management in Spotify’s developer dashboard.', { id: `${a.own.slice(0, 4)}…${a.own.slice(-4)}` })}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
          <Button size="small" variant="outlined" onClick={() => setEditing(true)}>{t('Change the Client ID')}</Button>
          {a.platform && <Button size="small" onClick={() => run(async () => { await api.saveSpotifyApp(null); await saved() }, t('Spotify now connects through The Business Agent’s app'))}>
            {t('Use The Business Agent’s app instead')}</Button>}
        </Stack>
      </>}
      {!a.own && a.platform && !editing && <>
        <Typography variant="body2">
          {t('Through The Business Agent’s Spotify app. Spotify lets it in at most 5 Spotify accounts, across every business that uses it. If Spotify won’t let your account in, use your own Spotify app: it takes about 10 minutes, once.')}
        </Typography>
        <Button size="small" variant="outlined" sx={{ mt: 1.25 }} onClick={() => setEditing(true)}>{t('Use your own Spotify app')}</Button>
      </>}
      {form && <OwnAppSteps redirectUris={a.redirect_uris} current={a.own} onSaved={saved} onCancel={a.own || a.platform ? () => setEditing(false) : undefined} />}
      {(a.own || a.platform) && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.25 }}>
        {t('Accounts already connected keep working through the app they connected with. Connect again to move one to another app.')}
      </Typography>}
    </Box>
  )
}

/** Making the business's own Spotify app, step by step, and pasting its Client ID. */
function OwnAppSteps({ redirectUris, current, onSaved, onCancel }: { redirectUris: string[]; current: string | null; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [id, setId] = useState(current ?? '')
  const clean = id.trim().toLowerCase()
  const wrong = clean.length > 0 && !CLIENT_ID.test(clean)
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => notify(t('Copied'), 'success'), () => notify(t('Copy it from above'), 'info'))
  const step = (n: number, body: ReactNode) => (
    <Stack component="li" direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 600, mt: '1px' }}>{n}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>{body}</Box>
    </Stack>
  )
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('Use your own Spotify app')}</Typography>
      <Stack component="ol" spacing={1.5} sx={{ m: 0, mt: 1.25, p: 0, listStyle: 'none' }}>
        {step(1, <Typography variant="body2">
          <Link href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">{t('Open Spotify’s developer dashboard')}<OpenIcon sx={{ fontSize: 14, ml: 0.25, verticalAlign: '-2px' }} /></Link>{' '}
          {t('and sign in with the business’s Spotify account. Spotify needs that account to have Premium.')}
        </Typography>)}
        {step(2, <>
          <Typography variant="body2">{t('Create an app: any name and description (the business’s name is fine), tick Web API, and add these as Redirect URIs:')}</Typography>
          <Stack spacing={0.75} sx={{ mt: 0.75 }}>
            {redirectUris.map(u => (
              <Stack key={u} direction="row" sx={{ alignItems: 'center', gap: 0.5, pl: 1.25, pr: 0.5, py: 0.25, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider' }}>
                <Typography aria-label={t('Redirect URI')} sx={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, wordBreak: 'break-all' }}>{u}</Typography>
                <Tooltip title={t('Copy')}><IconButton size="small" aria-label={t('Copy {text}', { text: u })} onClick={() => void copy(u)}><CopyIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
            ))}
          </Stack>
        </>)}
        {step(3, <Typography variant="body2">{t('In the app’s User Management, add the email of every Spotify account that will connect: the café’s, and each team member’s who wants their own music here (up to 5).')}</Typography>)}
        {step(4, <>
          <Typography variant="body2">{t('Copy the Client ID from the app’s Settings and paste it here.')}</Typography>
          <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField size="small" label={t('Client ID')} value={id} onChange={e => setId(e.target.value)} error={wrong}
              helperText={wrong ? t('A Client ID is 32 letters and numbers.') : undefined} sx={{ flex: '1 1 260px' }}
              slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off', style: { fontFamily: 'ui-monospace, monospace' } } }} />
            <Button variant="contained" disabled={!CLIENT_ID.test(clean) || clean === current}
              onClick={() => run(async () => { await api.saveSpotifyApp(clean); await onSaved() }, t('Your Spotify app is saved. Connect Spotify now.'))}>{t('Save')}</Button>
            {onCancel && <Button onClick={onCancel}>{t('Cancel')}</Button>}
          </Stack>
        </>)}
      </Stack>
    </Box>
  )
}
