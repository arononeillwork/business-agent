import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyRounded'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import CodeIcon from '@mui/icons-material/DataObjectRounded'
import TerminalIcon from '@mui/icons-material/TerminalRounded'
import KeyIcon from '@mui/icons-material/KeyRounded'
import { siClaude, siCursor, siGooglegemini, siN8n, type SimpleIcon } from 'simple-icons'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { businessConfig } from '../../shared/business.config'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

function Brand({ icon }: { icon: SimpleIcon }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 18, height: 18, display: 'block' }}>
      <path d={icon.path} fill={icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`} />
    </Box>
  )
}

type ClientKey = 'claude' | 'chatgpt' | 'claude_code' | 'cursor' | 'vscode' | 'gemini' | 'other'

interface Step { text: ReactNode; code?: string }
interface Client { key: ClientKey; name: string; icon: ReactNode; steps: (mcp: string, origin: string) => Step[]; note?: string }

/** How to add the app in each AI. Sign-in based (OAuth): no key needed, each person signs in as themselves. */
const CLIENTS: Client[] = [
  { key: 'claude', name: 'Claude', icon: <Brand icon={siClaude} />, steps: mcp => [
    { text: <>In Claude (web, desktop or mobile) open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</> },
    { text: <>Name it <b>{businessConfig.shortName}</b> and paste this URL:</>, code: mcp },
    { text: <>Press <b>Connect</b> and sign in with your own team account. Then ask Claude things like “who’s working on Saturday?”.</> },
  ], note: 'On Claude Team or Enterprise, an owner may need to add the connector for the organisation first.' },
  { key: 'chatgpt', name: 'ChatGPT', icon: <ChatIcon sx={{ fontSize: 18, color: '#10A37F' }} />, steps: mcp => [
    { text: <>In ChatGPT open <b>Settings → Apps &amp; Connectors → Advanced settings</b> and switch on <b>Developer mode</b>.</> },
    { text: <>Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>, name it <b>{businessConfig.shortName}</b>, set authentication to <b>OAuth</b> and paste:</>, code: mcp },
    { text: <>Sign in with your own team account when asked. In a chat, pick it from the <b>+</b> menu (Developer mode).</> },
  ], note: 'Custom connectors need a ChatGPT plan that allows them (Plus, Pro, Business or Enterprise). For a custom GPT, use the OpenAPI option under “Other AIs”.' },
  { key: 'claude_code', name: 'Claude Code', icon: <TerminalIcon sx={{ fontSize: 18, color: '#D97757' }} />, steps: mcp => [
    { text: 'Add it once (in a terminal):', code: `claude mcp add --transport http ${businessConfig.id} ${mcp}` },
    { text: <>Start Claude Code, type <b>/mcp</b>, pick <b>{businessConfig.id}</b> and choose <b>Authenticate</b>. Sign in with your team account.</> },
  ] },
  { key: 'cursor', name: 'Cursor', icon: <Brand icon={siCursor} />, steps: mcp => [
    { text: <>Open <b>Cursor Settings → Tools &amp; MCP → New MCP server</b> (or edit <code>~/.cursor/mcp.json</code>) and add:</>, code: JSON.stringify({ mcpServers: { [businessConfig.id]: { url: mcp } } }, null, 2) },
    { text: <>Cursor shows <b>Needs login</b>: click it and sign in with your team account.</> },
  ] },
  { key: 'vscode', name: 'VS Code', icon: <CodeIcon sx={{ fontSize: 18, color: '#0078D4' }} />, steps: mcp => [
    { text: <>Run <b>MCP: Add Server…</b> from the Command Palette, choose <b>HTTP</b> and paste the URL, or add to <code>.vscode/mcp.json</code>:</>, code: JSON.stringify({ servers: { [businessConfig.id]: { type: 'http', url: mcp } } }, null, 2) },
    { text: <>Start the server when VS Code asks, sign in with your team account, then use it in Copilot Chat’s <b>Agent</b> mode.</> },
  ] },
  { key: 'gemini', name: 'Gemini CLI', icon: <Brand icon={siGooglegemini} />, steps: mcp => [
    { text: <>Add it to <code>~/.gemini/settings.json</code>:</>, code: JSON.stringify({ mcpServers: { [businessConfig.id]: { httpUrl: mcp } } }, null, 2) },
    { text: 'Then sign in from Gemini CLI:', code: `/mcp auth ${businessConfig.id}` },
  ] },
  { key: 'other', name: 'Other AIs and automations', icon: <Brand icon={siN8n} />, steps: (mcp, origin) => [
    { text: <>Any AI that supports <b>MCP</b> (remote, streamable HTTP) can use the same URL; most sign in by themselves:</>, code: mcp },
    { text: <>If it can’t sign in but can send a header (the OpenAI or Anthropic API, n8n, agent frameworks), make an <b>access key</b> below and send it as:</>, code: 'Authorization: Bearer ba_…' },
    { text: <>No MCP? Use the REST API with an access key. Custom GPTs, n8n, Zapier and Make can import every action from:</>, code: `${origin}/api/v1/openapi.json` },
    { text: 'For example:', code: `curl -X POST ${origin}/api/v1/tools/whoami \\\n  -H "Authorization: Bearer ba_…" -H "content-type: application/json" -d '{}'` },
  ] },
]

function CodeBlock({ code }: { code: string }) {
  const notify = useNotify()
  return (
    <Box sx={{ position: 'relative', mt: 0.75 }}>
      <Box component="pre" sx={{ m: 0, p: 1.25, pr: 5.5, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</Box>
      <Tooltip title="Copy">
        <IconButton size="small" aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(code).then(() => notify('Copied', 'success'), () => notify('Copy it by hand: the browser blocked copying', 'info')) }}
          sx={{ position: 'absolute', top: 6, right: 6 }}><CopyIcon fontSize="small" /></IconButton>
      </Tooltip>
    </Box>
  )
}

/** Use the app from any AI: sign-in steps for each one, and personal access keys for the rest. */
export function AiAssistants() {
  const { api } = useApp()
  const [pick, setPick] = useState<ClientKey>('claude')
  const origin = api.mode === 'demo' ? businessConfig.appUrl : location.origin
  const mcp = `${origin}/mcp`
  const client = CLIENTS.find(c => c.key === pick)!
  return (
    <Card component="section" aria-label="AI assistants">
      <CardContent>
        <Typography variant="h6" component="h2">AI assistants</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Use the team app from Claude, ChatGPT or any AI. It acts as you: it can do what you can do here and nothing more, and every change is logged as made via AI.
        </Typography>
        <Stack direction="row" role="tablist" aria-label="Choose your AI" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
          {CLIENTS.map(c => (
            <Chip key={c.key} role="tab" aria-selected={pick === c.key} icon={<Box sx={{ display: 'grid', placeItems: 'center', ml: '6px !important', color: tokens.ink }}>{c.icon}</Box>}
              label={c.name} clickable onClick={() => setPick(c.key)} variant={pick === c.key ? 'filled' : 'outlined'}
              sx={pick === c.key ? { bgcolor: tokens.roseSoft, color: tokens.ink, fontWeight: 600 } : undefined} />
          ))}
        </Stack>
        <Box role="tabpanel" aria-label={`${client.name} set-up`}>
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1.5 }}>
            {client.steps(mcp, origin).map((s, i) => (
              <Box component="li" key={i}>
                <Typography variant="body2" component="div">{s.text}</Typography>
                {s.code && <CodeBlock code={s.code} />}
              </Box>
            ))}
          </Box>
          {client.note && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>{client.note}</Typography>}
        </Box>
        <AccessKeys />
      </CardContent>
    </Card>
  )
}

/** Personal access keys: for AIs and automations that send a header instead of signing in. */
function AccessKeys() {
  const { api } = useApp()
  const run = useAction()
  const keys = useAsync('api-keys', () => api.apiKeys(), [])
  const [name, setName] = useState('')
  const [made, setMade] = useState<string | null>(null)
  const [revoke, setRevoke] = useState<{ id: string; name: string } | null>(null)
  return (
    <Box component="section" aria-label="Access keys" sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${tokens.line}` }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <KeyIcon sx={{ color: tokens.inkSoft }} />
        <Typography sx={{ fontWeight: 600 }}>Access keys</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1.5 }}>
        Only for AIs and automations that can’t sign in. A key acts as you, so keep it secret; revoke it here any time. Make one per app so you can revoke them separately.
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" label="Key name" placeholder="e.g. n8n, ChatGPT GPT" value={name} onChange={e => setName(e.target.value)} sx={{ width: 240 }} />
        <Button variant="contained" onClick={() => run(async () => {
          const k = await api.createApiKey(name)
          setMade(k.key); setName(''); await keys.reload()
        }, 'Access key made')}>Make a key</Button>
      </Stack>
      {made && (
        <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setMade(null)} role="status" aria-label="New access key">
          Copy this key now. It won’t be shown again.
          <CodeBlock code={made} />
        </Alert>
      )}
      <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5 }}>
        {(keys.data ?? []).map(k => (
          <Stack component="li" key={k.id} aria-label={`Key ${k.name}`} direction="row" spacing={1.5}
            sx={{ alignItems: 'center', py: 1, borderBottom: `1px solid ${tokens.line}`, '&:last-of-type': { borderBottom: 0 } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 500 }} noWrap>{k.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace' }}>{k.prefix}…</Box>
                {' · '}made {formatLocal(k.created_at, 'd MMM yyyy')}{' · '}{k.last_used_at ? `last used ${formatLocal(k.last_used_at, 'd MMM, HH:mm')}` : 'not used yet'}
              </Typography>
            </Box>
            <Button size="small" color="error" onClick={() => setRevoke({ id: k.id, name: k.name })}>Revoke</Button>
          </Stack>
        ))}
        {keys.data?.length === 0 && <Typography component="li" variant="body2" sx={{ color: 'text.secondary' }}>No keys yet.</Typography>}
      </Stack>
      <Dialog open={!!revoke} onClose={() => setRevoke(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke “{revoke?.name}”?</DialogTitle>
        <DialogContent><Typography sx={{ color: 'text.secondary' }}>Anything using this key stops working straight away.</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setRevoke(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => run(async () => { await api.revokeApiKey(revoke!.id); setRevoke(null); await keys.reload() }, 'Key revoked')}>Revoke</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
