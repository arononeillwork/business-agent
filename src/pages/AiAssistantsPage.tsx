// AI assistants: how to connect Claude, ChatGPT or any other AI to the app (its MCP connector at /mcp),
// what to ask it, and personal access keys for AIs and automations that send a key instead of
// signing in (worker/apiKeys.ts). Each person connects their own AI, which then acts as them: the
// same permissions as in the app, and every change is logged as made "via AI".
import { useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { Empty, PageHeader, SectionTitle } from '../components/common'
import { t } from '../i18n'
import type { ApiKey } from '../../shared/types'
import { formatLocal } from '../../shared/time'

type AiId = 'claude' | 'chatgpt' | 'claude_code' | 'other' | 'key'

function CopyField({ label, value }: { label: string; value: string }) {
  const notify = useNotify()
  return (
    <TextField label={label} value={value} fullWidth slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: 14 },
      endAdornment: (
        <Tooltip title={t('Copy')}>
          <IconButton aria-label={t('Copy {what}', { what: label })} edge="end"
            onClick={() => navigator.clipboard?.writeText(value).then(() => notify(t('Copied'), 'success'), () => notify(t('Select it and copy it'), 'info'))}>
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) } }} />
  )
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 1 }}>
      {steps.map(s => <Typography key={s} component="li" variant="body2">{s}</Typography>)}
    </Box>
  )
}

export function AiAssistantsPage() {
  const { api, me, isPartner, business } = useApp()
  const run = useAction()
  const qc = useQueryClient()
  const [ai, setAi] = useState<AiId>('claude')
  const [naming, setNaming] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [made, setMade] = useState<string | null>(null)
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.apiKeys() })
  const url = `${window.location.origin}/mcp`
  const claudeCode = `claude mcp add --transport http easy-beans ${url}`
  if (!me) return null

  const AIS: { id: AiId; label: string }[] = [
    { id: 'claude', label: 'Claude' },
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'claude_code', label: 'Claude Code' },
    { id: 'other', label: t('Other AIs') },
    { id: 'key', label: t('With an access key') },
  ]
  const examples = isPartner
    ? [t('What can I see for this business?'), t('Which licences run out in the next two months?')]
    : [
        t('Who’s working on Saturday, and are any shifts still open?'),
        t('Which licences run out in the next two months?'),
        t('Add our SGAE licence and link its document from my Google Drive.'),
        t('Find the insurance policy in our documents.'),
        t('How many hours did the team work last week?'),
      ]

  return (
    <>
      <PageHeader eyebrow={t('You')} title={t('AI assistants')} />
      <Stack spacing={2.5}>
        <Card component="section" aria-label={t('Connect your AI')}>
          <CardContent>
            <SectionTitle>{t('Connect your AI')}</SectionTitle>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('Talk to the app from Claude, ChatGPT or any AI that takes connectors (MCP): ask about the rota, add a licence, check what’s due. Your AI signs in as you, so it can do what you can do here and nothing more, and every change it makes is logged as made via AI.')}
            </Typography>
            <CopyField label={t('Connector address')} value={url} />
            <Tabs value={ai} onChange={(_, v: AiId) => setAi(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2, mb: 2 }} aria-label={t('Which AI')}>
              {AIS.map(a => <Tab key={a.id} value={a.id} label={a.label} />)}
            </Tabs>
            {ai === 'claude' && <Steps steps={[
              t('In Claude (web, desktop or phone), open Settings, then Connectors.'),
              t('Choose Add custom connector, give it a name ({business}) and paste the connector address above.', { business: business?.name ?? 'Business Agent' }),
              t('Choose Connect and sign in with your team account. That’s it.'),
              t('In a chat, turn the connector on from the tools menu and ask away. On the phone, tap the mic to ask by voice.'),
            ]} />}
            {ai === 'chatgpt' && <Steps steps={[
              t('In ChatGPT, open Settings, then Apps & Connectors.'),
              t('Under Advanced, turn on Developer mode, then choose Create.'),
              t('Paste the connector address above, choose OAuth for sign-in and save.'),
              t('Sign in with your team account when asked, then pick the connector in a new chat.'),
            ]} />}
            {ai === 'claude_code' && <>
              <Steps steps={[
                t('In a terminal, run this command:'),
                t('Then type /mcp in Claude Code, choose easy-beans and Authenticate. Sign in with your team account.'),
              ]} />
              <Box sx={{ mt: 1.5 }}><CopyField label={t('Command')} value={claudeCode} /></Box>
            </>}
            {ai === 'other' && <Steps steps={[
              t('Cursor, VS Code (Copilot), Gemini CLI and other AIs that take MCP servers: add a server with the connector address above.'),
              t('They open a sign-in page by themselves: sign in with your team account.'),
              t('If your AI asks for a header instead of signing in, use an access key (next tab).'),
            ]} />}
            {ai === 'key' && <Steps steps={[
              t('For AIs and automations that send a key instead of signing in: the OpenAI and Anthropic APIs, n8n, Zapier, Make and agent frameworks.'),
              t('Make a key below. It acts as you, so keep it like a password.'),
              t('Send it as the header Authorization: Bearer followed by the key, to the connector address or the REST API.'),
              t('The REST API lists every tool at /api/v1/tools and describes them for GPT actions, n8n or Zapier at /api/v1/openapi.json.'),
            ]} />}
          </CardContent>
        </Card>

        <Card component="section" aria-label={t('Things to ask')}>
          <CardContent>
            <SectionTitle>{t('Things to ask')}</SectionTitle>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {examples.map(e => <Chip key={e} label={e} variant="outlined" sx={{ height: 'auto', py: 0.75, '& .MuiChip-label': { whiteSpace: 'normal' } }} />)}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('Before deleting anything or changing a lot at once, your AI tells you what it will do and waits for your yes.')}
            </Typography>
          </CardContent>
        </Card>

        <Card component="section" aria-label={t('Access keys')}>
          <CardContent>
            <SectionTitle action={<Button variant="outlined" onClick={() => { setKeyName(''); setNaming(true) }}>{t('Make a key')}</Button>}>{t('Access keys')}</SectionTitle>
            {made && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMade(null)}>
                <Typography variant="body2" sx={{ mb: 1 }}>{t('Here’s your key. Copy it now: it won’t be shown again.')}</Typography>
                <CopyField label={t('Access key')} value={made} />
              </Alert>
            )}
            {keys.data && !keys.data.length && <Empty>{t('No keys yet. You only need one for AIs that can’t sign in.')}</Empty>}
            <Stack spacing={1}>
              {(keys.data ?? []).map((k: ApiKey) => (
                <Stack key={k.id} direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{k.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {k.prefix}… · {t('Made {date}', { date: formatLocal(k.created_at, 'd MMM yyyy') })} · {k.last_used_at ? t('Last used {date}', { date: formatLocal(k.last_used_at, 'd MMM yyyy') }) : t('Not used yet')}
                    </Typography>
                  </Box>
                  <Button color="error" onClick={() => run(async () => { await api.revokeApiKey(k.id); await qc.invalidateQueries({ queryKey: ['api-keys'] }) }, t('Key revoked'))}>
                    {t('Revoke')}
                  </Button>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={naming} onClose={() => setNaming(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('Make a key')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label={t('What it’s for')} placeholder={t('e.g. n8n, my GPT')} value={keyName} onChange={e => setKeyName(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNaming(false)}>{t('Cancel')}</Button>
          <Button variant="contained" disabled={!keyName.trim()} onClick={() => run(async () => {
            const k = await api.createApiKey(keyName.trim())
            setMade(k.key); setNaming(false)
            await qc.invalidateQueries({ queryKey: ['api-keys'] })
          })}>{t('Make it')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
