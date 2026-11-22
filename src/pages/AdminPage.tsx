import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import LockIcon from '@mui/icons-material/LockOutlined'
import KeyIcon from '@mui/icons-material/PasswordOutlined'
import GroupIcon from '@mui/icons-material/GroupsOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import CheckIcon from '@mui/icons-material/Check'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile } from '../components/common'
import { Logo } from '../components/Logo'
import { SalesTeamBoard, type Spot } from '../components/SalesTeamBoard'
import { DEMO_ADMIN_PIN } from '../data/adminArea'
import { today } from '../../shared/time'
import {
  AdminLocked, PROSPECT_STAGES, followUpDue, isAdminPin, nameFromHandle, nameFromWebsite, prospectStageLabel, readContact,
  type AdminSession, type ContactKind, type Prospect, type ProspectInput, type SalesBoard, type SalesMember,
} from '../../shared/salesTeam'
import { fonts } from '../theme'
import { t } from '../i18n'

// The session's token, kept on this device until it ends (12 hours) or someone locks it.
const KEY = 'business-agent.admin-area'
function keptSession(): AdminSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AdminSession | null
    return s?.token && Date.parse(s.expires_at) > Date.now() ? s : null
  } catch { return null }
}
function keepSession(s: AdminSession | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* private window: this tab only */ }
}

/**
 * The admin area (/admin): The Business Agent's own back room, for running Business Agent itself rather
 * than a café. No sign-in; it opens with its PIN (checked by the Worker, never here), and stays open on
 * this device for 12 hours or until Lock. First in it: the sales team's board.
 */
export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(keptSession)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => { document.title = `${t('Admin')} · The Business Agent` }, [])
  const open = (s: AdminSession | null, why: string | null = null) => { keepSession(s); setSession(s); setNotice(why) }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: 2, pt: 2.5, pb: 4 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2.5 }}>
          <Logo size={32} />
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 600 }}>{'The Business Agent'}</Typography>
        </Stack>
        {session
          ? <AdminHome token={session.token} onLocked={why => open(null, why)} />
          : <PinScreen notice={notice} onOpen={s => open(s)} />}
      </Box>
    </Box>
  )
}

function PinScreen({ notice, onOpen }: { notice: string | null; onOpen: (s: AdminSession) => void }) {
  const { api } = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unlock = async () => {
    setBusy(true)
    setError(null)
    try { onOpen(await api.adminUnlock(pin)) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPin('') } finally { setBusy(false) }
  }
  return (
    <Card sx={{ maxWidth: 420, mx: 'auto', mt: { xs: 2, md: 8 } }}>
      <CardContent component="form" onSubmit={e => { e.preventDefault(); if (pin) void unlock() }} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LockIcon />
            <Typography variant="h5" component="h1">{t('Admin')}</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('The Business Agent’s own: its sales team and how it’s run. Type the PIN to open it.')}
          </Typography>
          {notice && <Alert severity="info">{notice}</Alert>}
          <TextField label={t('PIN')} type="password" value={pin} autoFocus autoComplete="off"
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }} error={!!error} helperText={error ?? undefined} />
          {api.mode === 'demo' && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('In the demo, the PIN is {pin}.', { pin: DEMO_ADMIN_PIN })}</Typography>}
          <Button type="submit" variant="contained" disabled={!pin || busy}>{t('Open')}</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

function AdminHome({ token, onLocked }: { token: string; onLocked: (why: string | null) => void }) {
  const { api } = useApp()
  const run = useAction()
  const board = useQuery({ queryKey: ['admin-area', 'sales', token], queryFn: () => api.salesBoard(token),
    retry: (n, e) => n < 2 && !(e instanceof AdminLocked) })
  const [editing, setEditing] = useState<ProspectInput | null>(null)
  const [team, setTeam] = useState(false)
  const [pin, setPin] = useState(false)
  const [removing, setRemoving] = useState<Prospect | null>(null)

  // Locked meanwhile (12 hours gone by, or the PIN changed elsewhere): back to the PIN.
  useEffect(() => { if (board.error instanceof AdminLocked) onLocked(t('Locked: type the PIN to open it again')) }, [board.error, onLocked])

  const lock = async () => {
    await api.adminLock(token).catch(() => undefined)
    onLocked(null)
  }
  const now = today('Europe/Madrid')
  const data = board.data
  const move = (p: Prospect, to: Spot) => {
    const who = data?.team.find(m => m.id === to.member_id)?.name
    return run(() => api.saveProspect(token, { id: p.id, stage: to.stage, member_id: to.member_id }),
      to.member_id !== p.member_id && who ? t('{name} is {who}’s now', { name: p.name, who })
        : t('{name}: {stage}', { name: p.name, stage: t(prospectStageLabel(to.stage)) }))
  }
  const blank = (member: SalesMember | null): ProspectInput => ({ member_id: member?.id ?? data?.team[0]?.id ?? null, stage: 'to_contact' })

  return (
    <>
      <PageHeader eyebrow={t('The Business Agent')} title={t('Admin')} actions={<>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(blank(null))} disabled={!data}>{t('Add a contact')}</Button>
        <Button startIcon={<GroupIcon />} onClick={() => setTeam(true)} disabled={!data}>{t('Sales team')}</Button>
        <Button startIcon={<KeyIcon />} onClick={() => setPin(true)}>{t('Change PIN')}</Button>
        <Button startIcon={<LockIcon />} onClick={() => void lock()}>{t('Lock')}</Button>
      </>} />
      <ErrorBox error={board.error && !(board.error instanceof AdminLocked) ? (board.error as Error).message : null} />
      {!data ? (board.isLoading ? <Loading /> : null) : (
        <Box component="section" aria-labelledby="sales-team">
          <SectionTitle><span id="sales-team">{t('Sales team')}</span></SectionTitle>
          <Figures board={data} today={now} />
          {data.team.length === 0 && data.prospects.length === 0
            ? <Alert severity="info" action={<Button onClick={() => setTeam(true)}>{t('Add someone')}</Button>}>{t('Nobody on the sales team yet.')}</Alert>
            : <SalesTeamBoard board={data} today={now} onMove={(p, to) => void move(p, to)} onEdit={p => setEditing(p)}
                onAdd={m => setEditing(blank(m))} onRemove={setRemoving} />}
        </Box>
      )}
      {editing && data && <ProspectDialog token={token} start={editing} team={data.team} onClose={() => setEditing(null)} />}
      {team && data && <TeamDialog token={token} team={data.team} onClose={() => setTeam(false)} />}
      {pin && <PinDialog token={token} onClose={() => setPin(false)} />}
      <Dialog open={!!removing} onClose={() => setRemoving(null)}>
        <DialogTitle>{t('Take {name} off the board?', { name: removing?.name ?? '' })}</DialogTitle>
        <DialogContent><Typography variant="body2">{t('Its notes and ways to reach it go too. To keep it, move it to Not now instead.')}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>{t('Cancel')}</Button>
          <Button color="error" onClick={() => {
            const p = removing!
            setRemoving(null)
            void run(() => api.deleteProspect(token, p.id), t('{name} is off the board', { name: p.name }))
          }}>{t('Take it off')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** How the board stands: businesses being talked to, signed up, and follow-ups due. */
function Figures({ board, today: now }: { board: SalesBoard; today: string }) {
  const open = board.prospects.filter(p => p.stage !== 'won' && p.stage !== 'lost').length
  const won = board.prospects.filter(p => p.stage === 'won').length
  const due = board.prospects.filter(p => followUpDue(p, now)).length
  return (
    <StatGrid>
      <StatTile label={t('Being talked to')} value={open} />
      <StatTile label={t('Signed up')} value={won} />
      <StatTile label={t('To follow up')} value={due} note={due ? t('today or before') : undefined} />
      <StatTile label={t('On the team')} value={board.team.length} />
    </StatGrid>
  )
}

const KIND_LABEL: Record<ContactKind, string> = { instagram: 'Instagram', phone: 'Phone', email: 'Email', website: 'Website' }

/** Add a business, or change one: paste whatever's to hand into the first box and it goes where it belongs. */
function ProspectDialog({ token, start, team, onClose }: { token: string; start: ProspectInput; team: SalesMember[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [p, setP] = useState<ProspectInput>(start)
  const [paste, setPaste] = useState('')
  const [named, setNamed] = useState(!!start.name)
  const found = readContact(paste)
  const set = (patch: ProspectInput) => setP(x => ({ ...x, ...patch }))
  const take = (text: string) => {
    const c = readContact(text)
    if (!c) return false
    const name = !named && !p.name ? (c.kind === 'instagram' ? nameFromHandle(c.value) : c.kind === 'website' ? nameFromWebsite(c.value) : '') : ''
    set({ [c.kind]: c.value, ...(name ? { name } : {}) })
    setPaste('')
    return true
  }
  const reachable = !!(p.instagram || p.phone || p.email || p.website)
  const save = async () => {
    const ok = await run(() => api.saveProspect(token, p), p.id ? t('{name} saved', { name: p.name ?? '' }) : t('{name} is on the board', { name: p.name || t('The business') }))
    if (ok) onClose()
  }
  const str = (v: string | null | undefined) => v ?? ''

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{p.id ? t('Edit {name}', { name: start.name ?? '' }) : t('Add a contact')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!p.id && (
            <TextField label={t('Instagram link, phone number, email or website')} value={paste} autoFocus
              onChange={e => setPaste(e.target.value)}
              onPaste={e => { if (take(e.clipboardData.getData('text'))) e.preventDefault() }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); take(paste) } }}
              helperText={!paste.trim() ? t('Paste it here and it goes in the right box below')
                : found ? t('{kind}: {value}. Press Enter to add it.', { kind: t(KIND_LABEL[found.kind]), value: found.kind === 'instagram' ? `@${found.value}` : found.value })
                : t('Not a link, number or email yet')}
              slotProps={{ input: { endAdornment: found ? (
                <InputAdornment position="end">
                  <IconButton edge="end" onClick={() => take(paste)} aria-label={t('Add it')}><CheckIcon /></IconButton>
                </InputAdornment>
              ) : undefined } }} />
          )}
          <TextField label={t('Business name')} value={str(p.name)} onChange={e => { setNamed(true); set({ name: e.target.value }) }}
            helperText={!p.name && p.instagram ? t('Leave it empty to use its Instagram name') : undefined} />
          <Row>
            <TextField label={t('Salesperson')} select value={p.member_id ?? ''} onChange={e => set({ member_id: e.target.value || null })} fullWidth>
              {team.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
              <MenuItem value="">{t('Nobody yet')}</MenuItem>
            </TextField>
            <TextField label={t('Stage')} select value={p.stage ?? 'to_contact'} onChange={e => set({ stage: e.target.value as Prospect['stage'] })} fullWidth>
              {PROSPECT_STAGES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          </Row>
          <Row>
            <TextField label={'Instagram'} value={str(p.instagram)} onChange={e => set({ instagram: e.target.value })} fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
            <TextField label={t('Phone')} value={str(p.phone)} onChange={e => set({ phone: e.target.value })} fullWidth slotProps={{ htmlInput: { inputMode: 'tel' } }} />
          </Row>
          <Row>
            <TextField label={t('Email')} value={str(p.email)} onChange={e => set({ email: e.target.value })} fullWidth slotProps={{ htmlInput: { inputMode: 'email' } }} />
            <TextField label={t('Website')} value={str(p.website)} onChange={e => set({ website: e.target.value })} fullWidth slotProps={{ htmlInput: { inputMode: 'url' } }} />
          </Row>
          <Row>
            <TextField label={t('Town')} value={str(p.town)} onChange={e => set({ town: e.target.value })} fullWidth />
            <TextField label={t('Follow up on')} type="date" value={str(p.follow_up_on)} onChange={e => set({ follow_up_on: e.target.value || null })} fullWidth
              slotProps={{ inputLabel: { shrink: true } }} />
          </Row>
          <TextField label={t('Notes')} value={str(p.notes)} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            placeholder={t('Who you spoke to, what they use now, what they asked')} />
          {!reachable && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Add at least one way to reach them.')}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!reachable || (!p.name?.trim() && !p.instagram && !p.website)}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

const Row = ({ children }: { children: ReactNode }) => <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{children}</Stack>

/** Who's on the sales team: a lane each. Someone renamed, added, or taken off (their businesses stay, in nobody's lane). */
function TeamDialog({ token, team, onClose }: { token: string; team: SalesMember[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(team.map(m => [m.id, m.name])))
  const [adding, setAdding] = useState('')
  useEffect(() => setNames(n => ({ ...Object.fromEntries(team.map(m => [m.id, m.name])), ...n })), [team])
  const add = async () => {
    if (await run(() => api.addSalesMember(token, adding), t('{name} has a lane now', { name: adding.trim() }))) setAdding('')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Sales team')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {team.map(m => {
            const v = names[m.id] ?? m.name
            const changed = v.trim() !== m.name && !!v.trim()
            return (
              <Stack key={m.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField size="small" label={t('Name')} value={v} onChange={e => setNames(n => ({ ...n, [m.id]: e.target.value }))} fullWidth
                  slotProps={{ htmlInput: { 'aria-label': t('Name of {name}', { name: m.name }) } }} />
                {changed && (
                  <IconButton onClick={() => void run(() => api.updateSalesMember(token, m.id, { name: v }), t('Saved'))} aria-label={t('Save the name of {name}', { name: m.name })}>
                    <CheckIcon />
                  </IconButton>
                )}
                <IconButton onClick={() => void run(() => api.deleteSalesMember(token, m.id), t('{name} is off the sales team', { name: m.name }))}
                  aria-label={t('Take {name} off the sales team', { name: m.name })}>
                  <DeleteIcon />
                </IconButton>
              </Stack>
            )
          })}
          <Stack component="form" direction="row" spacing={1} sx={{ alignItems: 'center', pt: 1 }} onSubmit={e => { e.preventDefault(); if (adding.trim()) void add() }}>
            <TextField size="small" label={t('Someone new')} value={adding} onChange={e => setAdding(e.target.value)} fullWidth />
            <Button type="submit" variant="outlined" disabled={!adding.trim()}>{t('Add')}</Button>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Someone taken off leaves their businesses on the board, in nobody’s lane, to give to someone else.')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Done')}</Button></DialogActions>
    </Dialog>
  )
}

/** A new PIN: the one in use typed again, the new one twice. Everyone else is locked out until they type it. */
function PinDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12)
  const field = { type: 'password', autoComplete: 'off', slotProps: { htmlInput: { inputMode: 'numeric' as const, pattern: '[0-9]*' } } }
  const mismatch = !!again && again !== next
  const save = async () => {
    if (await run(() => api.adminChangePin(token, current, next), t('The PIN is changed. Everyone else types the new one.'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Change PIN')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('PIN in use now')} value={current} onChange={e => setCurrent(digits(e.target.value))} autoFocus {...field} />
          <TextField label={t('New PIN')} value={next} onChange={e => setNext(digits(e.target.value))} helperText={t('4 to 12 digits')} {...field} />
          <TextField label={t('New PIN again')} value={again} onChange={e => setAgain(digits(e.target.value))} error={mismatch}
            helperText={mismatch ? t('The two aren’t the same') : undefined} {...field} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Anyone else with the admin area open is locked out, and opens it with the new PIN.')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!current || !isAdminPin(next) || next !== again}>{t('Change PIN')}</Button>
      </DialogActions>
    </Dialog>
  )
}
