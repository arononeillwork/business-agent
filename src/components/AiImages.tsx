import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, TextField, Typography } from '@mui/material'
import AiIcon from '@mui/icons-material/AutoAwesomeOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { t, tr } from '../i18n'

// Higgsfield, the AI images connection (the Menu page's designs and photos): its mark, and where an
// admin pastes its API key (the Connections page, and the Menu page's Design tab).

export const HiggsfieldLogo = () => <AiIcon sx={{ color: '#6E56CF' }} />

/** Whether Higgsfield is connected (admins), and where finished images are kept (Drive, OneDrive, or nowhere yet). */
export function useAiImages() {
  const { api, isAdmin, isPartner } = useApp()
  const q = useAsync('integrations', () => (isAdmin && !isPartner ? api.integrations() : Promise.resolve(null)), [isAdmin])
  const row = q.data?.integrations.find(i => i.provider === 'higgsfield')
  return { connected: row?.status === 'connected', broken: row?.status === 'error', label: row?.account_label ?? null, error: row?.last_error ?? null,
    storage: q.data?.media_storage ?? null, loaded: !!q.data, reload: q.reload }
}

/** Paste Higgsfield's key ID and secret; Higgsfield must accept them before they're kept. */
export function HiggsfieldKeyDialog({ onClose, onDone }: { onClose: () => void; onDone?: () => Promise<void> | void }) {
  const { api } = useApp()
  const run = useAction()
  const [keyId, setKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  // Pasted as one "id:secret" in the first box works too.
  const ready = !!keyId.trim() && (!!secret.trim() || keyId.includes(':'))
  const connect = async () => {
    setBusy(true)
    const ok = await run(async () => { await api.connectHiggsfield(keyId, secret); await onDone?.() }, t('Higgsfield is connected'))
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Connect Higgsfield')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {tr('Make an API key in the {console} (API keys, then Create), and paste its key ID and secret here. Images use your Higgsfield credits; ones that fail aren’t charged.',
              { console: <Link href="https://console.higgsfield.ai" target="_blank" rel="noopener">{'Higgsfield Console'}</Link> })}
          </Typography>
          <TextField label={t('Key ID')} value={keyId} onChange={e => setKeyId(e.target.value)} autoFocus slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }} />
          <TextField label={t('Secret')} type="password" value={secret} onChange={e => setSecret(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ready) void connect() }} slotProps={{ htmlInput: { autoComplete: 'new-password' } }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The secret is kept encrypted and only ever sent to Higgsfield. Disconnect any time on the Connections page.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={connect} disabled={busy || !ready}>{t('Connect')}</Button>
      </DialogActions>
    </Dialog>
  )
}
