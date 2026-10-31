import {
  Alert, Box, Button, Card, Chip, InputAdornment, LinearProgress, MenuItem, Skeleton, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/SearchRounded'
import StarIcon from '@mui/icons-material/StarRounded'
import StarOutlineIcon from '@mui/icons-material/StarOutlineRounded'
import ImportantIcon from '@mui/icons-material/LabelImportantRounded'
import AttachIcon from '@mui/icons-material/AttachFileRounded'
import SupplierIcon from '@mui/icons-material/LocalShippingOutlined'
import CustomerIcon from '@mui/icons-material/PersonOutlineRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { Freshness } from '../components/Freshness'
import {
  DEFAULT_EMAIL_DAYS, EMAIL_COUNT_CAP, EMAIL_FILTERS, EMAIL_PERIODS, supplierSenders, type EmailFilter, type EmailMessage,
} from '../../shared/email'
import type { Supplier } from '../../shared/stock'
import { addDays, formatLocal, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

const STAR = '#C98A1E'

/** When it came, as a mailbox says it: "12 min ago", "09:41", "Yesterday", "Mon", "12 Oct". */
function when(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return t('just now')
  if (min < 60) return t('{n} min ago', { n: min })
  const day = formatLocal(iso, 'yyyy-MM-dd')
  const now = today()
  if (day === now) return formatLocal(iso, 'HH:mm')
  if (day === addDays(now, -1)) return t('Yesterday')
  if (day > addDays(now, -6)) return formatLocal(iso, 'EEE')
  return formatLocal(iso, day.slice(0, 4) === now.slice(0, 4) ? 'd MMM' : 'd MMM yyyy')
}

const size = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`)

/**
 * Email (Business section, admins): the business's connected Gmail or Outlook as a list, read only.
 * One chip at a time narrows it (unread, starred, important, with files, invoices & receipts, from a
 * supplier, customers & bookings), with a search (Gmail's own), a period and a supplier; each email
 * opens in Gmail or Outlook. Reading the mailbox is the same permission as Invoices → From email.
 */
export function EmailPage() {
  const { api } = useApp()
  const run = useAction()
  const [filter, setFilter] = useState<EmailFilter>('all')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [days, setDays] = useState(DEFAULT_EMAIL_DAYS)
  const [supplier, setSupplier] = useState('')
  // Search a moment after typing stops (Enter searches straight away).
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 600)
    return () => clearTimeout(id)
  }, [typed])

  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const mail = useInfiniteQuery({
    queryKey: ['email', filter, q, days, supplier],
    queryFn: ({ pageParam }) => api.emailMessages({ filter, q, days, supplier: supplier || null, page: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_page,
    placeholderData: keepPreviousData,
  })
  const first = mail.data?.pages[0]
  const messages = mail.data?.pages.flatMap(p => p.messages) ?? []
  const box = first?.mailbox ?? null
  const boxName = box === 'outlook' ? 'Outlook' : 'Gmail'
  const active = (suppliers.data ?? []).filter(s => s.active !== false)
  const picked = active.find(s => s.id === supplier)
  const nameOf = (id: string | null) => (id ? (suppliers.data ?? []).find(s => s.id === id)?.name : undefined)
  const narrowed = filter !== 'all' || !!q || !!supplier
  const clear = () => { setFilter('all'); setTyped(''); setQ(''); setSupplier('') }
  const openMailbox = box === 'gmail'
    ? `https://mail.google.com/mail/${first?.account ? `?authuser=${encodeURIComponent(first.account)}` : 'u/0/'}`
    : 'https://outlook.office.com/mail/'

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Email')}
        actions={first?.can_read && (
          <Button variant="outlined" startIcon={<OpenIcon />} href={openMailbox} target="_blank" rel="noopener noreferrer">
            {t('Open {mailbox}', { mailbox: boxName })}
          </Button>
        )} />
      {first?.can_read && (
        <Stack direction="row" useFlexGap sx={{ mt: -2, mb: 2, gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {first.account && <Typography variant="body2" sx={{ fontWeight: 500 }}>{first.account}</Typography>}
          <Freshness id="email" at={first.fetched_at} />
        </Stack>
      )}
      <ErrorBox error={mail.error ? (mail.error instanceof Error ? mail.error.message : String(mail.error)) : null} />

      {first && !box && (
        <Alert severity="info" action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('Connect Gmail or Outlook on Connections to see the business’s email here.')}
        </Alert>
      )}
      {first && box && !first.can_read && (
        <Alert severity="info" action={<Button color="inherit" onClick={() => void run(() => api.connectService(box, 'email', { read: true }))}>{t('Allow reading')}</Button>}>
          {t('{mailbox} is connected to send email only. Allow Business Agent to read it too, to see the business’s email here. Nothing is changed or deleted in the mailbox.', { mailbox: boxName })}
        </Alert>
      )}

      {first?.can_read && (
        <Card sx={{ mb: 2, p: { xs: 1.5, sm: 2 } }}>
          {/* One row of chips; on a phone it scrolls sideways rather than taking half the screen. */}
          <Stack direction="row" role="group" aria-label={t('Filter emails')} useFlexGap
            sx={{ gap: 0.75, flexWrap: { xs: 'nowrap', md: 'wrap' }, overflowX: { xs: 'auto', md: 'visible' }, pb: { xs: 0.5, md: 0 }, mx: { xs: -0.5, md: 0 }, px: { xs: 0.5, md: 0 } }}>
            {EMAIL_FILTERS.map(f => (
              <FilterChip key={f.id} label={tc('email', f.label)} count={first?.counts?.[f.id]} selected={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <TextField type="search" size="small" value={typed} onChange={e => setTyped(e.target.value)} sx={{ flex: { sm: '1 1 auto' }, minWidth: 0 }}
              placeholder={t('Search {mailbox}', { mailbox: boxName })}
              onKeyDown={e => { if (e.key === 'Enter') setQ(typed.trim()) }}
              slotProps={{
                htmlInput: { 'aria-label': t('Search email') },
                input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
              }} />
            <TextField select size="small" label={t('Period')} value={days} onChange={e => setDays(Number(e.target.value))} sx={{ flex: { sm: '0 0 180px' } }}>
              {EMAIL_PERIODS.map(p => <MenuItem key={p.days} value={p.days}>{t(p.label)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('From supplier')} value={picked ? supplier : ''} onChange={e => setSupplier(e.target.value)}
              sx={{ flex: { sm: '0 0 240px' } }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('Anyone')}</MenuItem>
              {active.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Stack>
          <Hints filter={filter} picked={picked} suppliers={active} />
        </Card>
      )}

      {(mail.isPending || first?.can_read) && (
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ height: 4 }}>{mail.isFetching && <LinearProgress aria-label={t('Loading…')} />}</Box>
          {mail.isPending ? <Rows /> : messages.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Empty>
                {narrowed ? t('No emails match. Try All, a longer period or another search.') : t('No emails in this period.')}
                {narrowed && <Box sx={{ mt: 1.5 }}><Button size="small" onClick={clear}>{t('Show all emails')}</Button></Box>}
              </Empty>
            </Box>
          ) : (
            <Box component="ul" aria-label={t('Emails')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {messages.map(m => <EmailRow key={m.id} m={m} supplierName={nameOf(m.supplier_id)} boxName={boxName} />)}
            </Box>
          )}
          {mail.hasNextPage && (
            <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
              <Button onClick={() => void mail.fetchNextPage()} disabled={mail.isFetchingNextPage}>{t('Show more')}</Button>
            </Box>
          )}
        </Card>
      )}
    </>
  )
}

/** A word when a choice can't find anything: a supplier with no address to look for. */
function Hints({ filter, picked, suppliers }: { filter: EmailFilter; picked?: Supplier; suppliers: Supplier[] }) {
  const link = <Button component={RouterLink} to="/suppliers" color="inherit" size="small">{t('Suppliers')}</Button>
  if (picked && !supplierSenders(picked).length) {
    return <Alert severity="info" sx={{ mt: 2 }} action={link}>
      {t('{supplier} has no email or website on the Suppliers page, so their emails can’t be found. Add one there.', { supplier: picked.name })}
    </Alert>
  }
  if (filter === 'suppliers' && suppliers.length > 0 && !suppliers.some(s => supplierSenders(s).length)) {
    return <Alert severity="info" sx={{ mt: 2 }} action={link}>
      {t('Emails are matched to suppliers by the email or website on the Suppliers page. None has one yet.')}
    </Alert>
  }
  return null
}

function FilterChip({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
  return (
    <Chip clickable onClick={onClick} aria-pressed={selected}
      label={<>{label}{count !== undefined && <Box component="span" sx={{ opacity: 0.7, ml: 0.75 }}>{count >= EMAIL_COUNT_CAP ? `${EMAIL_COUNT_CAP}+` : count}</Box>}</>}
      sx={{
        flexShrink: 0, fontWeight: 500, opacity: count === 0 && !selected ? 0.6 : 1,
        bgcolor: selected ? tokens.ink : 'transparent', color: selected ? tokens.surface : 'text.primary',
        border: 1, borderColor: selected ? 'transparent' : 'divider',
        '&:hover': { bgcolor: selected ? tokens.ink : tokens.hover },
      }} />
  )
}

/** Placeholders while the mailbox is read. */
function Rows() {
  return (
    <Box aria-hidden sx={{ px: 2 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Box key={i} sx={{ py: 1.75, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
          <Skeleton width="35%" />
          <Skeleton width="85%" />
        </Box>
      ))}
    </Box>
  )
}

/** One email: who sent it (and the supplier or customer it is), the subject and preview, its files and when; opens in the mailbox. */
function EmailRow({ m, supplierName, boxName }: { m: EmailMessage; supplierName?: string; boxName: string }) {
  const who = m.from_name || m.from
  const bold = m.unread ? 600 : 400
  return (
    <Box component="li" aria-label={m.subject || t('(no subject)')} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
      <Box component="a" href={m.link} target="_blank" rel="noopener noreferrer" title={t('Open in {mailbox}', { mailbox: boxName })}
        sx={{
          display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 1, px: { xs: 1.5, sm: 2 }, py: 1.5, color: 'inherit', textDecoration: 'none',
          bgcolor: m.unread ? 'transparent' : tokens.surfaceAlt, '&:hover': { bgcolor: tokens.hover },
          '&:focus-visible': { outline: `2px solid ${tokens.rose}`, outlineOffset: -2 },
        }}>
        <Stack sx={{ alignItems: 'center', pt: 0.25, gap: 0.5 }}>
          {m.starred
            ? <StarIcon titleAccess={tc('email', 'Starred')} sx={{ fontSize: 20, color: STAR }} />
            : <StarOutlineIcon aria-hidden sx={{ fontSize: 20, color: tokens.inkFaint, opacity: 0.5 }} />}
          {m.unread && <Box component="span" role="img" aria-label={t('Unread')} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.rose }} />}
        </Stack>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{who}</Typography>
            {m.important && <ImportantIcon titleAccess={t('Important')} sx={{ fontSize: 18, color: tokens.warning, flexShrink: 0 }} />}
            {m.supplier_id && (
              <Tooltip title={t('Supplier')}>
                <span><Tag fg={tokens.goodFg} bg={tokens.goodBg}><SupplierIcon sx={{ fontSize: 14, mr: 0.5 }} />{supplierName && supplierName !== who ? supplierName : t('Supplier')}</Tag></span>
              </Tooltip>
            )}
            {m.customer_id && (
              <Tooltip title={t('Customer')}>
                <span><Tag fg={tokens.infoFg} bg={tokens.infoBg}><CustomerIcon sx={{ fontSize: 14, mr: 0.5 }} />{m.customer_name && m.customer_name !== who ? m.customer_name : t('Customer')}</Tag></span>
              </Tooltip>
            )}
            <Tooltip title={formatLocal(m.at, 'EEEE d MMMM yyyy, HH:mm')}>
              <Typography variant="body2" sx={{ ml: 'auto', pl: 1, flexShrink: 0, whiteSpace: 'nowrap', color: m.unread ? 'text.primary' : 'text.secondary', fontWeight: m.unread ? 600 : 400 }}>
                {when(m.at)}
              </Typography>
            </Tooltip>
          </Stack>
          <Typography variant="body2" sx={{
            mt: 0.25, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: { xs: 3, md: 1 }, overflowWrap: 'anywhere',
          }}>
            <Box component="span" sx={{ fontWeight: bold, color: 'text.primary' }}>{m.subject || t('(no subject)')}</Box>
            {m.snippet && <Box component="span" sx={{ color: 'text.secondary' }}> — {m.snippet}</Box>}
          </Typography>
          {m.attachments.length > 0 && (
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
              {m.attachments.slice(0, 3).map((a, i) => (
                <Chip key={`${a.name}-${i}`} size="small" variant="outlined" icon={<AttachIcon sx={{ fontSize: 16 }} />} label={a.name} title={`${a.name} · ${size(a.size)}`}
                  sx={{ maxWidth: { xs: '100%', sm: 260 }, bgcolor: 'background.paper' }} />
              ))}
              {m.attachments.length > 3 && <Chip size="small" variant="outlined" label={t('+{n} more', { n: m.attachments.length - 3 })} />}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  )
}
