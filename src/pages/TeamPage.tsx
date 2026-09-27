import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, FormControlLabel, IconButton,
  InputAdornment, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, PersonAvatar } from '../components/common'
import type { Profile } from '../../shared/types'
import { currencySymbol, formatMoney } from '../../shared/time'
import { FEATURES } from '../app/features'
import { ContactMethodField, contactMethod } from '../components/ContactMethod'
import { tokens } from '../theme'
import { PasswordToShare, SignInSetupFields, generatePassword, useSignInSetup } from '../components/TempPassword'

type Filter = 'all' | 'admin' | 'employee' | 'off'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'admin', label: 'Admins' }, { key: 'employee', label: 'Employees' }, { key: 'off', label: 'Switched off' },
]

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
    .filter(p => filter === 'all' ? true : filter === 'off' ? !p.active : p.role === filter && p.active)
    .filter(p => !term || p.full_name.toLowerCase().includes(term) || (p.email ?? '').toLowerCase().includes(term))
    .sort((x, y) => Number(y.active) - Number(x.active) || x.full_name.localeCompare(y.full_name))
  const selected = people.find(p => p.id === open) ?? null
  const cell = { py: 1.25, borderColor: tokens.line } as const

  return (
    <>
      <PageHeader eyebrow="Team" title="Team" subtitle={isAdmin ? 'Everyone with a login. Click a person to change their role, pay, PIN or access.' : 'Your colleagues'} />

      {/* Command bar */}
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5, pb: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
        {isAdmin && <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviting(true)}>Invite</Button>}
        <Button startIcon={<RefreshIcon />} onClick={() => refresh()}>Refresh</Button>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 280 } }}
          slotProps={{ htmlInput: { 'aria-label': 'Search the team' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Stack>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        {FILTERS.map(f => (
          <Chip key={f.key} size="small" clickable label={f.label} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            variant={filter === f.key ? 'filled' : 'outlined'} color={filter === f.key ? 'primary' : 'default'} />
        ))}
        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>{shown.length} {shown.length === 1 ? 'person' : 'people'}</Typography>
      </Stack>

      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Team">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                {isAdmin && <TableCell>Status</TableCell>}
                {isAdmin && <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Contact</TableCell>}
                {canSeePay && <TableCell align="right">Hourly rate</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map(p => (
                <TableRow key={p.id} hover={isAdmin} onClick={isAdmin ? () => setOpen(p.id) : undefined}
                  tabIndex={isAdmin ? 0 : undefined} onKeyDown={e => { if (isAdmin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(p.id) } }}
                  aria-label={isAdmin ? `${p.full_name}${p.id === me?.id ? ' (you)' : ''}: open details` : undefined}
                  sx={{ cursor: isAdmin ? 'pointer' : 'default', opacity: p.active ? 1 : 0.6, '&:last-child td': { borderBottom: 0 },
                    '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: -2 } }}>
                  <TableCell sx={cell}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 220 }}>
                      <PersonAvatar name={p.full_name} colour={p.colour} size={32} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500 }} noWrap>{p.full_name}{p.id === me?.id ? ' (you)' : ''}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.email ?? 'No email'}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={cell}>{p.role === 'admin' ? 'Admin' : 'Employee'}{p.role === 'admin' && p.can_see_pay && isAdmin ? <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}> · sees pay</Typography> : null}</TableCell>
                  {isAdmin && (
                    <TableCell sx={cell}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.active ? tokens.matcha : tokens.inkFaint }} />
                        <span>{p.active ? 'Active' : 'Switched off'}</span>
                      </Stack>
                    </TableCell>
                  )}
                  {isAdmin && <TableCell sx={{ ...cell, display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{p.phone ?? '—'}</span>
                      {contactMethod(p.contact_method) && (
                        <Tooltip title={`Prefers ${contactMethod(p.contact_method)!.label.toLowerCase()}`}>
                          <Box component="span" aria-label={`Prefers ${contactMethod(p.contact_method)!.label}`} sx={{ display: 'inline-flex', color: tokens.roseDeep }}>{contactMethod(p.contact_method)!.icon}</Box>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>}
                  {canSeePay && <TableCell sx={{ ...cell, fontVariantNumeric: 'tabular-nums' }} align="right">{rates.has(p.id) ? `${formatMoney(rates.get(p.id)!)}/h` : '—'}</TableCell>}
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>Nobody matches that.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Card>
      {isAdmin && FEATURES.kiosk && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
          For the café tablet, invite a separate account with the <b>Kiosk</b> role and sign in with it on the tablet; it only shows the clock-in screen.
        </Typography>
      )}
      {selected && <PersonPanel person={selected} onClose={() => setOpen(null)} />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  )
}

/** The side panel with everything an admin can change about one person. */
function PersonPanel({ person: p, onClose }: { person: Profile; onClose: () => void }) {
  const { api, canSeePay, rates, me, refresh } = useApp()
  const run = useAction()
  const [pinFor, setPinFor] = useState<Profile | null>(null)
  const [passwordFor, setPasswordFor] = useState<Profile | null>(null)
  const update = (patch: Partial<Profile>, msg = 'Saved') => run(async () => { await api.updateProfile(p.id, patch); await refresh() }, msg)
  const self = p.id === me?.id
  return (
    <Drawer anchor="right" open onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-label': `${p.full_name}${self ? ' (you)' : ''}`, sx: { width: { xs: '100%', sm: 420 }, p: 3, borderLeft: `1px solid ${tokens.line}` } } as never }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
        <PersonAvatar name={p.full_name} colour={p.colour} size={48} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" component="h2" noWrap>{p.full_name}{self ? ' (you)' : ''}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.email ?? 'No email'}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </Stack>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>Access</Typography>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField select label="Role" value={p.role} disabled={self}
              helperText={self ? 'Another admin can change this' : undefined}
              onChange={e => update({ role: e.target.value as Profile['role'] }, 'Role updated')}>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="employee">Employee</MenuItem>
            </TextField>
            {/* Switching yourself off would lock you out immediately. */}
            <FormControlLabel disabled={self} label="Active (can sign in)"
              control={<Switch checked={p.active} slotProps={{ input: { 'aria-label': 'Active' } }}
                onChange={e => update({ active: e.target.checked }, e.target.checked ? 'Access restored' : `${p.full_name} can no longer sign in`)} />} />
            {p.role === 'admin' && canSeePay && (
              <FormControlLabel label="Sees pay and finances" control={<Switch checked={p.can_see_pay} onChange={e => update({ can_see_pay: e.target.checked })} />} />
            )}
          </Stack>
        </Box>
        {canSeePay && (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>Pay</Typography>
            <TextField label="Hourly rate" type="number" defaultValue={rates.get(p.id) ?? ''} sx={{ mt: 0.5 }}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{currencySymbol()}/h</InputAdornment> }, htmlInput: { step: 0.05, min: 0 } }}
              onBlur={e => {
                const v = Number(e.target.value)
                if (e.target.value !== '' && v !== rates.get(p.id)) run(async () => { await api.setPayRate(p.id, v); await refresh() }, 'Pay rate saved')
              }} />
          </Box>
        )}
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>Sign-in</Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {FEATURES.kiosk && <Button variant="outlined" onClick={() => setPinFor(p)}>Set kiosk PIN</Button>}
            {p.role !== 'admin' && p.email && <Button variant="outlined" onClick={() => setPasswordFor(p)}>Temporary password</Button>}
          </Stack>
        </Box>
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>Contact</Typography>
          <Typography sx={{ mt: 0.5, mb: 1.5 }}>{p.phone ?? 'No phone number'}{p.email ? ` · ${p.email}` : ''}</Typography>
          <ContactMethodField value={p.contact_method ?? null} label="Prefers to be contacted by"
            onChange={v => run(async () => { await api.updateProfile(p.id, { contact_method: v }); await refresh() }, 'Contact preference saved')} />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>WhatsApp messages {p.whatsapp_opt_in ? 'on' : 'off'} (they choose this on My account)</Typography>
        </Box>
      </Stack>
      {pinFor && <PinDialog person={pinFor} onClose={() => setPinFor(null)} />}
      {passwordFor && <TempPasswordDialog person={passwordFor} onClose={() => setPasswordFor(null)} />}
    </Drawer>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const run = useAction()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'employee' | 'kiosk'>('employee')
  const [setup, setSetup] = useSignInSetup()
  const [done, setDone] = useState<string | null>(null)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Invite to the team</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Full name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <TextField select label="Role" value={role} onChange={e => setRole(e.target.value as typeof role)}>
            <MenuItem value="employee">Employee</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
            {FEATURES.kiosk && <MenuItem value="kiosk">Kiosk (café tablet)</MenuItem>}
          </TextField>
          {done ? <PasswordToShare email={email.trim()} password={done} /> : <SignInSetupFields value={setup} onChange={setSetup} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {done ? <Button variant="contained" onClick={onClose}>Done</Button> : <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!email.trim() || !name.trim()} onClick={() => run(async () => {
            if (!EMAIL.test(email.trim())) throw new Error('Enter a full email address, like name@example.com')
            if (setup.how === 'password') {
              await api.invite(email.trim(), name.trim(), role, setup.password); await refresh(); setDone(setup.password)
            } else {
              await api.invite(email.trim(), name.trim(), role); await refresh(); onClose()
            }
          }, setup.how === 'password' ? `Account created for ${name.trim()}` : `Invite sent to ${email.trim()}`)}>
            {setup.how === 'password' ? 'Create account' : 'Send invite'}
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
      <DialogTitle>Temporary password for {person.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {done ? <PasswordToShare email={person.email ?? ''} password={password} /> : <>
            <Typography variant="body2" color="text.secondary">Their old password stops working. Give them this one; they can change it on My account.</Typography>
            <TextField label="Temporary password" value={password} onChange={e => setPassword(e.target.value)} />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {done ? <Button variant="contained" onClick={onClose}>Done</Button> : <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={async () => {
            if (await run(() => api.setTemporaryPassword(person.id, password), 'Password set')) setDone(true)
          }}>Set password</Button>
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
      <DialogTitle>Kiosk PIN{person ? ` for ${person.full_name}` : ''}</DialogTitle>
      <DialogContent>
        <TextField label="4-digit PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }} sx={{ mt: 1 }} autoFocus />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Used only on the café tablet. Stored encrypted.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={pin.length !== 4} onClick={() => run(async () => {
          await api.setPin(pin, person?.id); onClose()
        }, 'PIN saved')}>Save PIN</Button>
      </DialogActions>
    </Dialog>
  )
}
