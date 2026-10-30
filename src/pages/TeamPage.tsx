import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, FormControlLabel, IconButton,
  InputAdornment, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import WarnIcon from '@mui/icons-material/ErrorOutlineRounded'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { PageHeader, PersonAvatar } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import type { ContactMethod, Profile } from '../../shared/types'
import { howReached } from '../../shared/reach'
import { currencySymbol, formatMoney, today } from '../../shared/time'
import { FEATURES } from '../app/features'
import { ContactMethodField, contactMethod } from '../components/ContactMethod'
import { tokens } from '../theme'
import { PasswordToShare, SignInSetupFields, generatePassword, useSignInSetup } from '../components/TempPassword'
import { TEAM_ROLES, roleBlock, roleChange, teamRole, teamRoleLabel, type TeamRole } from '../../shared/teamRoles'
import { msg, t, tn, tr } from '../i18n'

type Filter = 'all' | TeamRole | 'off'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: msg('All') }, ...[...TEAM_ROLES].reverse().map(r => ({ key: r.id, label: r.plural })), { key: 'off', label: msg('Switched off') },
]
/** Owners first when sorted by role. */
const roleRank = (p: Profile) => -TEAM_ROLES.findIndex(r => r.id === teamRole(p))
const roleText = (p: Profile) => t(teamRoleLabel(p) ?? '')

/** The team as a clean list (like an admin console): search, filter, and details in a side panel. */
export function TeamPage() {
  const { profiles, isAdmin, canSeePay, rates, me, refresh } = useApp()
  const [inviting, setInviting] = useState(false)
  const [params] = useSearchParams()
  const [open, setOpen] = useState<string | null>(isAdmin ? params.get('person') : null)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  // Search (top bar) can link here while the page is already open.
  useEffect(() => {
    if (params.get('q') !== null) setQ(params.get('q')!)
    if (isAdmin && params.get('person')) setOpen(params.get('person'))
  }, [params, isAdmin])
  const people = profiles.filter(p => p.role !== 'kiosk' && p.role !== 'partner')
  const term = q.trim().toLowerCase()
  const shown = people
    .filter(p => filter === 'all' ? true : filter === 'off' ? !p.active : teamRole(p) === filter && p.active)
    .filter(p => !term || p.full_name.toLowerCase().includes(term) || (p.email ?? '').toLowerCase().includes(term))
    .sort((x, y) => Number(y.active) - Number(x.active) || x.full_name.localeCompare(y.full_name))
  const { rows, sort } = useSort(shown, {
    name: p => p.full_name, role: roleRank, status: p => (p.active ? 0 : 1), phone: p => p.phone,
    rate: p => (rates.has(p.id) ? rates.get(p.id)! : null),
  }, undefined, ['rate'])
  const named = (p: Profile) => (p.id === me?.id ? t('{name} (you)', { name: p.full_name }) : p.full_name)
  const table = (): ExportTable => ({
    title: filter === 'all' ? t('Team') : t('Team: {filter}', { filter: t(FILTERS.find(f => f.key === filter)!.label) }),
    filename: `team-${today()}`,
    columns: [t('Name'), t('Email'), t('Role'), ...(isAdmin ? [t('Status'), t('Prefers'), t('Phone')] : []), ...(canSeePay ? [t('Hourly rate ({currency})', { currency: currencySymbol() })] : [])],
    rows: rows.map(p => [p.full_name, p.email ?? '', roleText(p),
      ...(isAdmin ? [p.active ? t('Active') : t('Switched off'), t(contactMethod(p.contact_method)?.label ?? ''), p.phone ?? ''] : []),
      ...(canSeePay ? [rates.has(p.id) ? rates.get(p.id)! : null] : [])]),
    money: canSeePay ? [isAdmin ? 6 : 3] : [],
  })
  const selected = people.find(p => p.id === open) ?? null
  const cell = { py: 1.25, borderColor: tokens.line } as const
  const integ = useReachData(isAdmin)

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Team')} />

      {/* Command bar */}
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5, pb: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
        {isAdmin && <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviting(true)}>{t('Invite')}</Button>}
        <Button startIcon={<RefreshIcon />} onClick={() => refresh()}>{t('Refresh')}</Button>
        {isAdmin && <ExportButton table={table} disabled={!rows.length} folder="Team" />}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder={t('Search by name or email')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 280 } }}
          slotProps={{ htmlInput: { 'aria-label': t('Search the team') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Stack>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        {FILTERS.map(f => (
          <Chip key={f.key} size="small" clickable label={t(f.label)} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            variant={filter === f.key ? 'filled' : 'outlined'} color={filter === f.key ? 'primary' : 'default'} />
        ))}
        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>{tn(shown.length, '{n} person', '{n} people')}</Typography>
      </Stack>

      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Team')}>
            <TableHead>
              <TableRow>
                <SortCell sort={sort} id="name">{t('Name')}</SortCell>
                <SortCell sort={sort} id="role">{t('Role')}</SortCell>
                {isAdmin && <SortCell sort={sort} id="status">{t('Status')}</SortCell>}
                {isAdmin && <TableCell>{t('Prefers')}</TableCell>}
                {isAdmin && <SortCell sort={sort} id="phone" sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Phone')}</SortCell>}
                {canSeePay && <SortCell sort={sort} id="rate" align="right">{t('Hourly rate')}</SortCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(p => (
                <TableRow key={p.id} hover={isAdmin} onClick={isAdmin ? () => setOpen(p.id) : undefined}
                  tabIndex={isAdmin ? 0 : undefined} onKeyDown={e => { if (isAdmin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(p.id) } }}
                  aria-label={isAdmin ? t('{name}: open details', { name: named(p) }) : undefined}
                  sx={{ cursor: isAdmin ? 'pointer' : 'default', opacity: p.active ? 1 : 0.6, '&:last-child td': { borderBottom: 0 },
                    '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: -2 } }}>
                  <TableCell sx={cell}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 220 }}>
                      <PersonAvatar name={p.full_name} colour={p.colour} size={32} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500 }} noWrap>{named(p)}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.email ?? t('No email')}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={cell}>{roleText(p)}</TableCell>
                  {isAdmin && (
                    <TableCell sx={cell}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.active ? tokens.matcha : tokens.inkFaint }} />
                        <span>{p.active ? t('Active') : t('Switched off')}</span>
                        {p.active && p.on_rota === false && <Box component="span" sx={{ color: 'text.secondary' }}>{t('· off the rota')}</Box>}
                      </Stack>
                    </TableCell>
                  )}
                  {isAdmin && <TableCell sx={cell}><Preference person={p} integrations={integ} /></TableCell>}
                  {isAdmin && <TableCell sx={{ ...cell, display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>{p.phone ?? '—'}</TableCell>}
                  {canSeePay && <TableCell sx={{ ...cell, fontVariantNumeric: 'tabular-nums' }} align="right">{rates.has(p.id) ? t('{amount}/h', { amount: formatMoney(rates.get(p.id)!) }) : '—'}</TableCell>}
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('Nobody matches that.')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Card>
      {isAdmin && FEATURES.kiosk && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
          {tr('For the café tablet, invite a separate account with the {kiosk} role and sign in with it on the tablet; it only shows the clock-in screen.', { kiosk: <b>{t('Kiosk')}</b> })}
        </Typography>
      )}
      {selected && <PersonPanel person={selected} onClose={() => setOpen(null)} />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  )
}

/** The business's connections, to tell admins how each person will really be reached. */
function useReachData(isAdmin: boolean) {
  const { api } = useApp()
  const data = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [])
  return data.data?.integrations ?? null
}

/** "WhatsApp" with its icon, and a warning when that preference can't be honoured yet. */
function Preference({ person, integrations }: { person: Profile; integrations: ReturnType<typeof useReachData> }) {
  const m = contactMethod(person.contact_method)
  const reach = integrations ? howReached(person, integrations) : null
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', whiteSpace: 'nowrap', '& svg': { color: tokens.inkSoft } }}>
      {m ? <>{m.icon}<span>{t(m.label)}</span></> : <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>{t('No preference')}</Typography>}
      {reach && !reach.ok && (
        <Tooltip title={reach.text}>
          <WarnIcon aria-label={t('Alerts won’t reach {name} this way: {reason}', { name: person.full_name, reason: reach.text })} sx={{ fontSize: 18, color: `${tokens.warnFg} !important` }} />
        </Tooltip>
      )}
    </Stack>
  )
}

/** The side panel with everything an admin can change about one person. */
function PersonPanel({ person: p, onClose }: { person: Profile; onClose: () => void }) {
  const { api, canSeePay, rates, me, profiles, refresh } = useApp()
  const run = useAction()
  const [pinFor, setPinFor] = useState<Profile | null>(null)
  const [passwordFor, setPasswordFor] = useState<Profile | null>(null)
  const integrations = useReachData(true)
  const reach = integrations ? howReached(p, integrations) : null
  const update = (patch: Partial<Profile>, toast = t('Saved')) => run(async () => { await api.updateProfile(p.id, patch); await refresh() }, toast)
  const self = p.id === me?.id
  const role = teamRole(p) ?? 'employee'
  const blocked = (r: TeamRole) => (me ? roleBlock(me, p, r, profiles) : null)
  // An owner's role is an owner's to change; your own, someone else's (so you can't lock yourself out).
  const locked = role === 'owner' ? blocked('manager') : null
  const why = self ? t('Another admin can change this') : locked ? t(locked) : null
  return (
    <Drawer anchor="right" open onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-label': self ? t('{name} (you)', { name: p.full_name }) : p.full_name, sx: { width: { xs: '100%', sm: 420 }, p: 3, borderLeft: `1px solid ${tokens.line}` } } as never }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
        <PersonAvatar name={p.full_name} colour={p.colour} size={48} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" component="h2" noWrap>{self ? t('{name} (you)', { name: p.full_name }) : p.full_name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.email ?? t('No email')}</Typography>
        </Box>
        <IconButton aria-label={t('Close')} onClick={onClose}><CloseIcon /></IconButton>
      </Stack>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Access')}</Typography>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField select label={t('Role')} value={role} disabled={self || !!locked}
              helperText={why ?? t(TEAM_ROLES.find(x => x.id === role)!.summary)}
              onChange={e => update(roleChange(p, e.target.value as TeamRole), t('Role updated'))}>
              {TEAM_ROLES.map(x => <MenuItem key={x.id} value={x.id} disabled={x.id !== role && !!blocked(x.id)}>{t(x.label)}</MenuItem>)}
            </TextField>
            {/* Switching yourself off would lock you out immediately. */}
            <FormControlLabel disabled={self} label={t('Active (can sign in)')}
              control={<Switch checked={p.active} slotProps={{ input: { 'aria-label': t('Active') } }}
                onChange={e => update({ active: e.target.checked }, e.target.checked ? t('Access restored') : t('{name} can no longer sign in', { name: p.full_name }))} />} />
            <FormControlLabel label={t('On the rota')}
              control={<Switch checked={p.on_rota !== false} slotProps={{ input: { 'aria-label': t('On the rota') } }}
                onChange={e => update({ on_rota: e.target.checked }, e.target.checked ? t('{name} is back on the rota', { name: p.full_name }) : t('{name} is off the rota: they still sign in', { name: p.full_name }))} />} />
          </Stack>
        </Box>
        {canSeePay && (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Pay')}</Typography>
            <TextField label={t('Hourly rate')} type="number" defaultValue={rates.get(p.id) ?? ''} sx={{ mt: 0.5 }}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('{currency}/h', { currency: currencySymbol() })}</InputAdornment> }, htmlInput: { step: 0.05, min: 0 } }}
              onBlur={e => {
                const v = Number(e.target.value)
                if (e.target.value !== '' && v !== rates.get(p.id)) run(async () => { await api.setPayRate(p.id, v); await refresh() }, t('Pay rate saved'))
              }} />
          </Box>
        )}
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Sign-in')}</Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {FEATURES.kiosk && <Button variant="outlined" onClick={() => setPinFor(p)}>{t('Set kiosk PIN')}</Button>}
            {p.role !== 'admin' && p.email && <Button variant="outlined" onClick={() => setPasswordFor(p)}>{t('Temporary password')}</Button>}
          </Stack>
        </Box>
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Contact')}</Typography>
          <Typography sx={{ mt: 0.5, mb: 1.5 }}>{p.phone ?? t('No phone number')}{p.email ? ` · ${p.email}` : ''}</Typography>
          <ContactMethodField value={p.contact_method ?? null} label={t('Prefers to be contacted by')} helperText={t('How the café reaches them about shifts and changes')}
            onChange={v => run(async () => { await api.updateProfile(p.id, { contact_method: v }); await refresh() }, t('Contact preference saved'))} />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{p.whatsapp_opt_in ? t('WhatsApp messages on (they choose this on My account)') : t('WhatsApp messages off (they choose this on My account)')}</Typography>
          {reach && <Alert severity={reach.ok ? 'success' : 'warning'} sx={{ mt: 1.5 }} role="status" aria-label={t('How alerts reach them')}>
            <b>{t('Shift alerts reach them by:')}</b> {reach.text}
          </Alert>}
        </Box>
      </Stack>
      {pinFor && <PinDialog person={pinFor} onClose={() => setPinFor(null)} />}
      {passwordFor && <TempPasswordDialog person={passwordFor} onClose={() => setPasswordFor(null)} />}
    </Drawer>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<TeamRole | 'kiosk'>('employee')
  const chosen = TEAM_ROLES.find(r => r.id === role)
  const owner = !!me && teamRole(me) === 'owner'
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState<ContactMethod | null>(null)
  const [setup, setSetup] = useSignInSetup()
  const [done, setDone] = useState<string | null>(null)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Invite to the team')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Full name')} value={name} onChange={e => setName(e.target.value)} autoFocus />
          <TextField label={t('Email')} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <TextField select label={t('Role')} value={role} onChange={e => setRole(e.target.value as typeof role)}
            helperText={chosen ? t(chosen.summary) : undefined}>
            {TEAM_ROLES.map(r => (
              <MenuItem key={r.id} value={r.id} disabled={r.id === 'owner' && !owner}>{t(r.label)}</MenuItem>
            ))}
            {FEATURES.kiosk && <MenuItem value="kiosk">{t('Kiosk (café tablet)')}</MenuItem>}
          </TextField>
          {role !== 'kiosk' && <>
            <PhoneField label={t('Mobile (optional)')} value={phone} onChange={setPhone} />
            <ContactMethodField value={method} onChange={setMethod} label={t('Prefers to be contacted by')} helperText={t('They can change it later on My account')} />
          </>}
          {done ? <PasswordToShare email={email.trim()} password={done} /> : <SignInSetupFields value={setup} onChange={setSetup} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {done ? <Button variant="contained" onClick={onClose}>{t('Done')}</Button> : <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="contained" disabled={!email.trim() || !name.trim()} onClick={() => run(async () => {
            if (!EMAIL.test(email.trim())) throw new Error(t('Enter a full email address, like name@example.com'))
            const contact = role === 'kiosk' ? undefined : { phone: phone.trim() || null, contact_method: method }
            const { joined } = await api.invite(email.trim(), name.trim(), role, setup.how === 'password' ? setup.password : undefined, contact)
            await refresh()
            // Already had an account (signed up on their own): on the team now, with their own password.
            if (joined) notify(t('{email} already had an account: they’re on the team now', { email: email.trim() }), 'success')
            else notify(setup.how === 'password' ? t('Account created for {name}', { name: name.trim() }) : t('Invite sent to {email}', { email: email.trim() }), 'success')
            if (setup.how === 'password' && !joined) setDone(setup.password)
            else onClose()
          })}>
            {setup.how === 'password' ? t('Create account') : t('Send invite')}
          </Button>
        </>}
      </DialogActions>
    </Dialog>
  )
}

/** Give someone who can't get in a new temporary password (not for admins). */
function TempPasswordDialog({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [password, setPassword] = useState(generatePassword)
  const [done, setDone] = useState(false)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Temporary password for {name}', { name: person.full_name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {done ? <PasswordToShare email={person.email ?? ''} password={password} /> : <>
            <Typography variant="body2" color="text.secondary">{t('Their old password stops working. Give them this one; they can change it on My account.')}</Typography>
            <TextField label={t('Temporary password')} value={password} onChange={e => setPassword(e.target.value)} />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {done ? <Button variant="contained" onClick={onClose}>{t('Done')}</Button> : <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="contained" onClick={async () => {
            if (await run(() => api.setTemporaryPassword(person.id, password), t('Password set'))) setDone(true)
          }}>{t('Set password')}</Button>
        </>}
      </DialogActions>
    </Dialog>
  )
}

export function PinDialog({ person, onClose }: { person?: Profile; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [pin, setPin] = useState('')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{person ? t('Kiosk PIN for {name}', { name: person.full_name }) : t('Kiosk PIN')}</DialogTitle>
      <DialogContent>
        <TextField label={t('4-digit PIN')} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }} sx={{ mt: 1 }} autoFocus />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('Used only on the café tablet. Stored encrypted.')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={pin.length !== 4} onClick={() => run(async () => {
          await api.setPin(pin, person?.id); onClose()
        }, t('PIN saved'))}>{t('Save PIN')}</Button>
      </DialogActions>
    </Dialog>
  )
}
