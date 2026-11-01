import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, DialogTitle, Drawer, IconButton, Link, Skeleton, Stack, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/CloseRounded'
import ReplyIcon from '@mui/icons-material/ReplyRounded'
import ReplyAllIcon from '@mui/icons-material/ReplyAllRounded'
import SendIcon from '@mui/icons-material/SendRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import DownloadIcon from '@mui/icons-material/DownloadRounded'
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined'
import ImageIcon from '@mui/icons-material/ImageOutlined'
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined'
import SupplierIcon from '@mui/icons-material/LocalShippingOutlined'
import CustomerIcon from '@mui/icons-material/PersonOutlineRounded'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useNotify } from '../app/Notify'
import { Tag } from '../components/common'
import { downloadBlob } from '../lib/export'
import {
  MAX_REPLY_LENGTH, attachmentView, emailDocument, parseAddresses, replyRecipients, showAddress, type EmailFile, type EmailFull, type EmailMessage,
} from '../../shared/email'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { t } from '../i18n'

const size = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`)
const addresses = (list: string) => parseAddresses(list).map(showAddress).join(', ') || list

/**
 * An email opened in the app (Email page): a panel at the side (the whole screen on a phone) with who
 * it's from and to, its body and its files, and a reply sent from the connected mailbox in the same
 * conversation. An HTML email is shown in a sandboxed frame: its pictures load, nothing in it runs.
 */
export function EmailReader({ m, boxName, account, supplierName, onClose }: {
  m: EmailMessage; boxName: string; account: string | null; supplierName?: string; onClose: () => void
}) {
  const { api } = useApp()
  const notify = useNotify()
  const titleId = useId()
  const full = useQuery({ queryKey: ['email-message', m.id], queryFn: () => api.emailMessage(m.id), staleTime: 5 * 60_000 })
  const [viewing, setViewing] = useState<EmailFile | null>(null)
  const [replying, setReplying] = useState<'one' | 'all' | null>(null)
  const who = m.from_name || m.from
  const f = full.data
  const canReplyAll = !!f && replyRecipients(f, account, true).cc.length > 0

  const download = async (a: EmailFile) => {
    try { downloadBlob(a.name, await api.emailAttachment(m.id, a)) } catch (e) { notify(e instanceof Error ? e.message : String(e), 'error') }
  }

  return (
    <Drawer anchor="right" open onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { width: { xs: '100%', md: 760 }, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${tokens.line}` } } as never }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1, px: { xs: 2, sm: 3 }, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography id={titleId} variant="h6" component="h2" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', pt: 0.5 }}>{m.subject || t('(no subject)')}</Typography>
        <IconButton aria-label={t('Close')} onClick={onClose}><CloseIcon /></IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', px: { xs: 2, sm: 3 }, py: 2, gap: 2 }}>
        {/* Who it's from and to, and when. */}
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start', flexShrink: 0 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 600 }}>{who}</Typography>
              {m.from_name && <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{`<${m.from}>`}</Typography>}
              {m.supplier_id && <Tag fg={tokens.goodFg} bg={tokens.goodBg}><SupplierIcon sx={{ fontSize: 14, mr: 0.5 }} />{supplierName && supplierName !== who ? supplierName : t('Supplier')}</Tag>}
              {m.customer_id && <Tag fg={tokens.infoFg} bg={tokens.infoBg}><CustomerIcon sx={{ fontSize: 14, mr: 0.5 }} />{m.customer_name && m.customer_name !== who ? m.customer_name : t('Customer')}</Tag>}
            </Stack>
            {f?.to && <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{t('To')}: {addresses(f.to)}</Typography>}
            {f?.cc && <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{t('Cc')}: {addresses(f.cc)}</Typography>}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', pt: 0.25 }}>{formatLocal(m.at, 'EEE d MMM yyyy, HH:mm')}</Typography>
        </Stack>

        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          <Button variant="outlined" size="small" startIcon={<ReplyIcon />} disabled={!f} onClick={() => setReplying('one')}>{t('Reply')}</Button>
          {canReplyAll && <Button variant="outlined" size="small" startIcon={<ReplyAllIcon />} onClick={() => setReplying('all')}>{t('Reply all')}</Button>}
          <Link href={f?.link ?? m.link} target="_blank" rel="noopener noreferrer" variant="body2"
            sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            {t('Open in {mailbox}', { mailbox: boxName })}<OpenIcon sx={{ fontSize: 16 }} />
          </Link>
        </Stack>

        {full.error && <Alert severity="error" sx={{ flexShrink: 0 }}>{full.error instanceof Error ? full.error.message : String(full.error)}</Alert>}
        {full.isPending && (
          <Box aria-label={t('Loading…')} role="progressbar" sx={{ flexShrink: 0 }}>
            <Skeleton width="90%" /><Skeleton width="75%" /><Skeleton width="82%" /><Skeleton width="40%" />
          </Box>
        )}

        {f && f.attachments.length > 0 && (
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Attachments')}</Typography>
            <Stack component="ul" aria-label={t('Attachments')} direction="row" useFlexGap sx={{ listStyle: 'none', m: 0, p: 0, gap: 1, flexWrap: 'wrap' }}>
              {f.attachments.map(a => <FileItem key={a.id} a={a} onView={() => setViewing(a)} onDownload={() => void download(a)} />)}
            </Stack>
          </Box>
        )}

        {f && <Body f={f} />}

        {f && replying && (
          <ReplyBox key={replying} f={f} all={replying === 'all'} account={account} onCancel={() => setReplying(null)}
            onSent={() => { setReplying(null); notify(t('Sent'), 'success') }} />
        )}
      </Box>

      {viewing && <AttachmentViewer messageId={m.id} file={viewing} onClose={() => setViewing(null)} />}
    </Drawer>
  )
}

/** A file on the email: a PDF or a picture opens in the page (with a download beside it); anything else downloads. */
function FileItem({ a, onView, onDownload }: { a: EmailFile; onView: () => void; onDownload: () => void }) {
  const view = attachmentView(a)
  const Icon = view === 'pdf' ? PdfIcon : view === 'image' ? ImageIcon : FileIcon
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, maxWidth: '100%', bgcolor: 'background.paper' }}>
      <ButtonBase onClick={view ? onView : onDownload} aria-label={view ? t('View {name}', { name: a.name }) : t('Download {name}', { name: a.name })}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderRadius: 2, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left',
          '&:hover': { bgcolor: tokens.hover }, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}`, outlineOffset: -2 } }}>
        <Icon sx={{ fontSize: 22, color: view === 'pdf' ? tokens.rose : 'text.secondary', flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 210, sm: 300 } }}>{a.name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{size(a.size)}</Typography>
        </Box>
      </ButtonBase>
      {view && (
        <Tooltip title={t('Download')}>
          <IconButton size="small" aria-label={t('Download {name}', { name: a.name })} onClick={onDownload} sx={{ mr: 0.5 }}><DownloadIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

/** Web addresses in a plain-text email as links (opening in a new tab). */
function linked(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g).map((part, i) =>
    i % 2 ? <Link key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</Link> : part)
}

/** The email's words: HTML in a sandboxed frame (no scripts, links open in a new tab), plain text as it is. */
function Body({ f }: { f: EmailFull }) {
  if (f.html !== null && f.html.trim()) {
    return (
      <Box component="iframe" title={t('The email')} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={emailDocument(f.html)}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 2, width: '100%', flex: '1 0 auto', minHeight: 420, bgcolor: '#fff', display: 'block' }} />
    )
  }
  if (f.text?.trim()) {
    return <Typography component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{linked(f.text.trim())}</Typography>
  }
  return <Typography sx={{ color: 'text.secondary' }}>{t('This email has no text.')}</Typography>
}

/** Writing a reply: who it goes to, the words, Send (Ctrl+Enter) or Cancel. */
function ReplyBox({ f, all, account, onCancel, onSent }: { f: EmailFull; all: boolean; account: string | null; onCancel: () => void; onSent: () => void }) {
  const { api } = useApp()
  const notify = useNotify()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLFormElement>(null)
  const { to, cc } = replyRecipients(f, account, all)
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await api.replyEmail(f.id, text, all)
      onSent()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSending(false)
    }
  }
  return (
    <Box component="form" ref={box} aria-label={all ? t('Reply all') : t('Reply')} onSubmit={e => { e.preventDefault(); void send() }}
      sx={{ flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: tokens.surfaceAlt }}>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('To')}: {to.map(showAddress).join(', ')}</Typography>
      {cc.length > 0 && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('Cc')}: {cc.map(showAddress).join(', ')}</Typography>}
      <TextField multiline minRows={5} fullWidth autoFocus label={t('Your reply')} value={text} sx={{ mt: 1.5, bgcolor: 'background.paper' }}
        onChange={e => setText(e.target.value.slice(0, MAX_REPLY_LENGTH))}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }} />
      {account && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75 }}>{t('Sent from {account}, in the same conversation.', { account })}</Typography>}
      <Stack direction="row" sx={{ gap: 1, mt: 1.5 }}>
        <Button type="submit" variant="contained" startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />} disabled={!text.trim() || sending}>{t('Send')}</Button>
        <Button onClick={onCancel} disabled={sending}>{t('Cancel')}</Button>
      </Stack>
    </Box>
  )
}

/** A PDF or a picture from the email, shown in the page (fetched now, never kept), with Download. */
function AttachmentViewer({ messageId, file, onClose }: { messageId: string; file: EmailFile; onClose: () => void }) {
  const { api } = useApp()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const titleId = useId()
  const as = attachmentView(file)
  const [got, setGot] = useState<{ blob: Blob; url: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let gone = false
    let made: string | null = null
    api.emailAttachment(messageId, file).then(blob => {
      if (gone) return
      // Shown only as what it really is (the Worker says, from its first bytes).
      const type = blob.type.split(';')[0].trim().toLowerCase()
      const fits = as === 'pdf' ? type === 'application/pdf' : /^image\/(png|jpeg|gif|webp)$/.test(type)
      made = fits ? URL.createObjectURL(blob) : null
      setGot({ blob, url: made })
      if (!fits) setError(t('This file can’t be shown here. Download it instead.'))
    }).catch(e => { if (!gone) setError(e instanceof Error ? e.message : String(e)) })
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [api, messageId, file, as])
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={phone} aria-labelledby={titleId}
      slotProps={{ paper: { sx: { height: phone ? '100%' : '90vh' } } }}>
      <DialogTitle id={titleId} sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</Box>
        <Button size="small" startIcon={<DownloadIcon />} disabled={!got} onClick={() => got && downloadBlob(file.name, got.blob)} sx={{ flexShrink: 0 }}>{t('Download')}</Button>
        <IconButton aria-label={t('Close')} onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', bgcolor: tokens.surfaceAlt }}>
        {error && <Alert severity={got ? 'info' : 'error'} sx={{ m: 2 }}>{error}</Alert>}
        {!error && !got && <Box sx={{ m: 'auto', p: 4 }}><CircularProgress aria-label={t('Loading…')} /></Box>}
        {got?.url && as === 'pdf' && <Box component="iframe" src={got.url} title={file.name} sx={{ border: 0, width: '100%', flex: 1, minHeight: 400 }} />}
        {got?.url && as === 'image' && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', p: 2 }}>
            <Box component="img" src={got.url} alt={file.name} sx={{ maxWidth: '100%', maxHeight: '100%', m: 'auto', objectFit: 'contain', display: 'block' }} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
