// The assistant: a button at the bottom right of every page that opens a chat with Claude, which answers
// with the person's own tools (worker/assistant.ts). Not there for a role that hides AI assistants, nor
// for partners and the café tablet; admins see it before it's set up, saying what it needs.
import { Box, Card, CircularProgress, Fab, IconButton, InputBase, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import AssistantIcon from '@mui/icons-material/AutoAwesomeOutlined'
import CloseIcon from '@mui/icons-material/CloseRounded'
import SendIcon from '@mui/icons-material/ArrowUpwardRounded'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { tokens } from '../theme'
import { t } from '../i18n'

type Turn = { role: 'user' | 'assistant'; text: string }
/** The conversation kept for the next question (the Worker takes up to 40 turns). */
const KEEP = 20

export function AssistantButton() {
  const { api, me, isAdmin, isPartner, permissions } = useApp()
  const status = useAsync('assistant-status', () => api.assistantStatus(), [])
  const [open, setOpen] = useState(false)
  const phone = useMediaQuery(useTheme().breakpoints.down('md'))
  const ready = status.data?.ready ?? false
  if (!me || isPartner || me.role === 'kiosk' || permissions.ai === 'none' || (!ready && !isAdmin)) return null
  return (
    <>
      {!open && (
        <Tooltip title={t('Ask the assistant')} placement="left">
          <Fab color="primary" aria-label={t('Ask the assistant')} onClick={() => setOpen(true)}
            sx={{ position: 'fixed', right: { xs: 16, md: 24 }, bottom: { xs: 88, md: 24 }, zIndex: 1200 }}>
            <AssistantIcon />
          </Fab>
        </Tooltip>
      )}
      {open && <ChatPanel ready={ready} phone={phone} onClose={() => setOpen(false)} />}
    </>
  )
}

function ChatPanel({ ready, phone, onClose }: { ready: boolean; phone: boolean; onClose: () => void }) {
  const { api, me } = useApp()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [turns, busy])
  const ask = async () => {
    const text = draft.trim()
    if (!text || busy) return
    const next = [...turns, { role: 'user' as const, text }]
    setTurns(next)
    setDraft('')
    setBusy(true)
    setError(null)
    try {
      // The latest turns, starting with one of theirs.
      const recent = next.slice(-KEEP)
      const reply = await api.askAssistant(recent[0].role === 'user' ? recent : recent.slice(1))
      setTurns(list => [...list, { role: 'assistant', text: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card role="dialog" aria-label={t('Assistant')} elevation={8}
      sx={{ position: 'fixed', zIndex: 1300, display: 'flex', flexDirection: 'column', borderRadius: phone ? 0 : '18px',
        ...(phone ? { inset: 0 } : { right: 24, bottom: 24, width: 400, height: 560, maxHeight: 'calc(100vh - 48px)' }) }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.line}` }}>
        <AssistantIcon sx={{ color: tokens.roseDeep }} aria-hidden />
        <Typography component="h2" sx={{ fontWeight: 600, flex: 1 }}>{t('Assistant')}</Typography>
        <IconButton aria-label={t('Close')} onClick={onClose}><CloseIcon /></IconButton>
      </Stack>
      <Box ref={list} role="log" aria-label={t('Conversation')} aria-live="polite" sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {!ready ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('The assistant needs an Anthropic API key before it can answer: add ANTHROPIC_API_KEY to the Worker’s secrets. Only admins see this.')}
          </Typography>
        ) : !turns.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Hi {name}. Ask me anything about the business or the app: who’s on today, your next shift, what’s left on the to-do list. I can only see and do what you can.',
              { name: me?.full_name.split(' ')[0] ?? '' })}
          </Typography>
        )}
        {turns.map((turn, i) => (
          <Box key={i} sx={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', px: 1.5, py: 1, borderRadius: '14px',
            bgcolor: turn.role === 'user' ? tokens.roseSoft : tokens.surfaceAlt, whiteSpace: 'pre-wrap' }}>
            <Typography variant="body2">{turn.text}</Typography>
          </Box>
        ))}
        {busy && <Stack direction="row" sx={{ gap: 1, alignItems: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">{t('Thinking…')}</Typography></Stack>}
        {error && <Typography variant="body2" role="alert" sx={{ color: tokens.badFg }}>{error}</Typography>}
      </Box>
      <Stack component="form" direction="row" onSubmit={e => { e.preventDefault(); void ask() }}
        sx={{ alignItems: 'flex-end', gap: 1, p: 1.5, borderTop: `1px solid ${tokens.line}` }}>
        <InputBase multiline maxRows={5} value={draft} onChange={e => setDraft(e.target.value)} disabled={!ready} autoFocus
          placeholder={t('Ask a question')} inputProps={{ 'aria-label': t('Ask a question'), maxLength: 8000 }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
          sx={{ flex: 1, px: 1.5, py: 1, borderRadius: '14px', border: `1px solid ${tokens.line}`, bgcolor: tokens.surface }} />
        <IconButton type="submit" aria-label={t('Send')} disabled={!ready || busy || !draft.trim()}
          sx={{ bgcolor: tokens.rose, color: '#2B2522', '&:hover': { bgcolor: tokens.roseHover } }}>
          <SendIcon />
        </IconButton>
      </Stack>
    </Card>
  )
}
