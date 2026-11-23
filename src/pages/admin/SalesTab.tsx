import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { ErrorBox, Loading, StatGrid, StatTile } from '../../components/common'
import { SalesTeamBoard, type Spot } from '../../components/SalesTeamBoard'
import { today } from '../../../shared/time'
import {
  BUSINESS_TYPES, PROSPECT_KINDS, PROSPECT_STAGES, businessTypeOf, followUpDue, nameFromHandle, nameFromWebsite, prospectStageLabel, readContact,
  type BusinessType, type ContactKind, type Prospect, type ProspectInput, type ProspectKind, type SalesBoard, type SalesMember,
} from '../../../shared/salesTeam'
import { ContactDialog } from './ContactDialog'
import { useAdmin, useAdminQuery } from './shared'
import { t } from '../../i18n'

type Show = 'all' | ProspectKind
type ShowType = 'all' | BusinessType

/**
 * Sales: a swimlane per salesperson, a column per stage, a card per business (a café to sign up, or a
 * partner who could bring cafés). Shown by kind of business (cafés, restaurants, garages), by town and by
 * customers or partners; each card opens to its
 * history and the messages to send. A café that signs up with a salesperson's code moves by itself.
 */
export function SalesTab() {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const board = useAdminQuery('sales', tk => api.salesBoard(tk))
  const [editing, setEditing] = useState<ProspectInput | null>(null)
  const [opened, setOpened] = useState<Prospect | null>(null)
  const [removing, setRemoving] = useState<Prospect | null>(null)
  const [town, setTown] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [type, setType] = useState<ShowType>('all')
  const navigate = useNavigate()
  const now = today('Europe/Madrid')
  const data = board.data
  const towns = useMemo(() => [...new Set((data?.prospects ?? []).map(p => p.town).filter((x): x is string => !!x))].sort(), [data])
  const shown = useMemo<SalesBoard | undefined>(() => data && {
    team: data.team,
    prospects: data.prospects.filter(p => (!town || p.town === town) && (show === 'all' || (p.kind ?? 'customer') === show)
      && (type === 'all' || businessTypeOf(p) === type)),
  }, [data, town, show, type])

  const move = (p: Prospect, to: Spot) => {
    const who = data?.team.find(m => m.id === to.member_id)?.name
    return run(() => api.saveProspect(token, { id: p.id, stage: to.stage, member_id: to.member_id }),
      to.member_id !== p.member_id && who ? t('{name} is {who}’s now', { name: p.name, who })
        : t('{name}: {stage}', { name: p.name, stage: t(prospectStageLabel(to.stage)) }))
  }
  // A new contact is the kind of business the board is showing (a café, when it's showing them all).
  const blank = (member: SalesMember | null): ProspectInput => ({ member_id: member?.id ?? data?.team[0]?.id ?? null, stage: 'to_contact', kind: 'customer',
    business_type: type === 'all' ? 'cafe' : type })

  return (
    <>
      <ErrorBox error={board.error} />
      {!data || !shown ? (board.loading ? <Loading /> : null) : (
        <>
          <Figures board={data} today={now} />
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(blank(null))}>{t('Add a contact')}</Button>
            <ToggleButtonGroup exclusive size="small" value={show} onChange={(_, v: Show | null) => v && setShow(v)} aria-label={t('Show')}>
              <ToggleButton value="all">{t('Everyone')}</ToggleButton>
              {PROSPECT_KINDS.map(k => <ToggleButton key={k.id} value={k.id}>{t(k.id === 'customer' ? 'Customers' : 'Partners')}</ToggleButton>)}
            </ToggleButtonGroup>
            <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v: ShowType | null) => v && setType(v)} aria-label={t('Kind of business')}
              sx={{ flexWrap: 'wrap' }}>
              <ToggleButton value="all">{t('All')}</ToggleButton>
              {BUSINESS_TYPES.map(b => <ToggleButton key={b.id} value={b.id}>{t(b.many)}</ToggleButton>)}
            </ToggleButtonGroup>
            {towns.length > 0 && (
              <TextField select size="small" label={t('Town')} value={town} onChange={e => setTown(e.target.value)} fullWidth={false} sx={{ width: 200 }}>
                <MenuItem value="">{t('Every town')}</MenuItem>
                {towns.map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
              </TextField>
            )}
          </Stack>
          {data.team.length === 0 && data.prospects.length === 0
            ? <Alert severity="info" action={<Button onClick={() => navigate('/admin/settings')}>{t('Add someone')}</Button>}>{t('Nobody on the sales team yet.')}</Alert>
            : <SalesTeamBoard board={shown} today={now} onMove={(p, to) => void move(p, to)} onEdit={p => setEditing(p)} onOpen={setOpened}
                onAdd={m => setEditing(blank(m))} onRemove={setRemoving} />}
        </>
      )}
      {editing && data && <ProspectDialog start={editing} team={data.team} onClose={() => setEditing(null)} />}
      {opened && data && <ContactDialog prospect={data.prospects.find(p => p.id === opened.id) ?? opened} team={data.team} onClose={() => setOpened(null)}
        onEdit={p => { setOpened(null); setEditing(p) }} />}
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

/** How the board stands: businesses being talked to, signed up and paying, and follow-ups due. */
function Figures({ board, today: now }: { board: SalesBoard; today: string }) {
  const talking = board.prospects.filter(p => ['to_contact', 'contacted', 'demo'].includes(p.stage)).length
  const signedUp = board.prospects.filter(p => p.stage === 'trial' || p.stage === 'won').length
  const paying = board.prospects.filter(p => p.stage === 'won').length
  const due = board.prospects.filter(p => followUpDue(p, now)).length
  return (
    <Box sx={{ '& > [role=list]': { mb: 2 } }}>
      <StatGrid>
        <StatTile label={t('Being talked to')} value={talking} />
        <StatTile label={t('Signed up')} value={signedUp} />
        <StatTile label={t('Paying')} value={paying} />
        <StatTile label={t('To follow up')} value={due} note={due ? t('today or before') : undefined} />
      </StatGrid>
    </Box>
  )
}

const KIND_LABEL: Record<ContactKind, string> = { instagram: 'Instagram', phone: 'Phone', email: 'Email', website: 'Website' }

/** Add a business, or change one: paste whatever's to hand into the first box and it goes where it belongs. */
export function ProspectDialog({ start, team, onClose }: { start: ProspectInput; team: SalesMember[]; onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField label={t('Kind of business')} select value={businessTypeOf(p)} onChange={e => set({ business_type: e.target.value as BusinessType })}
              sx={{ minWidth: 200 }}>
              {BUSINESS_TYPES.map(b => <MenuItem key={b.id} value={b.id}>{t(b.label)}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup exclusive size="small" value={p.kind ?? 'customer'} onChange={(_, v) => v && set({ kind: v })} aria-label={t('Customer or partner')}>
              {PROSPECT_KINDS.map(k => <ToggleButton key={k.id} value={k.id}>{t(k.label)}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
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

export const Row = ({ children }: { children: ReactNode }) => <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{children}</Stack>

