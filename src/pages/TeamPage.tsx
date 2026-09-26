import {
  Alert, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, InputAdornment, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, PersonAvatar } from '../components/common'
import type { Profile } from '../../shared/types'

export function TeamPage() {
  const { api, profiles, isAdmin, canSeePay, rates, me, refresh } = useApp()
  const run = useAction()
  const [inviting, setInviting] = useState(false)
  const [pinFor, setPinFor] = useState<Profile | null>(null)

  const update = (p: Profile, patch: Partial<Profile>, msg = 'Saved') =>
    run(async () => { await api.updateProfile(p.id, patch); await refresh() }, msg)

  return (
    <>
      <PageHeader eyebrow="People" title="Team" subtitle={isAdmin ? 'Roles, pay rates and kiosk PINs' : 'Your colleagues'}
        actions={isAdmin && <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setInviting(true)}>Invite</Button>} />
      <Grid container spacing={2}>
        {profiles.filter(p => p.role !== 'kiosk').map(p => (
          <Grid key={p.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card sx={{ opacity: p.active ? 1 : 0.55, height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: isAdmin ? 2 : 0 }}>
                  <PersonAvatar name={p.full_name} colour={p.colour} size={44} />
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }} noWrap>{p.full_name}{p.id === me?.id ? ' (you)' : ''}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{p.email ?? 'No email'}</Typography>
                  </Stack>
                  <Chip size="small" label={p.role === 'admin' ? 'Admin' : 'Employee'} color={p.role === 'admin' ? 'primary' : 'default'} />
                </Stack>
                {isAdmin && (
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1}>
                      <TextField select label="Role" value={p.role} disabled={p.id === me?.id}
                        helperText={p.id === me?.id ? 'Another admin can change this' : undefined}
                        onChange={e => update(p, { role: e.target.value as Profile['role'] }, 'Role updated')}>
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="employee">Employee</MenuItem>
                      </TextField>
                      {canSeePay && (
                        <TextField label="Hourly rate" type="number" defaultValue={rates.get(p.id) ?? ''}
                          slotProps={{ input: { endAdornment: <InputAdornment position="end">€/h</InputAdornment> }, htmlInput: { step: 0.05, min: 0 } }}
                          onBlur={e => {
                            const v = Number(e.target.value)
                            if (e.target.value !== '' && v !== rates.get(p.id)) {
                              run(async () => { await api.setPayRate(p.id, v); await refresh() }, 'Pay rate saved')
                            }
                          }} />
                      )}
                    </Stack>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      {p.role === 'admin' && canSeePay && (
                        <FormControlLabel control={<Switch checked={p.can_see_pay} onChange={e => update(p, { can_see_pay: e.target.checked })} />} label="Sees pay" />
                      )}
                      {/* Switching yourself off would lock you out immediately. */}
                      <FormControlLabel disabled={p.id === me?.id} label="Active"
                        control={<Switch checked={p.active} onChange={e => update(p, { active: e.target.checked }, e.target.checked ? 'Access restored' : `${p.full_name} can no longer sign in`)} />} />
                      <Button size="small" onClick={() => setPinFor(p)}>Set kiosk PIN</Button>
                    </Stack>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {isAdmin && (
        <Alert severity="info" sx={{ mt: 2 }}>
          For the café tablet, invite a separate account with the <b>Kiosk</b> role, sign in with it on the tablet, and it will only show the clock-in screen.
        </Alert>
      )}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {pinFor && <PinDialog person={pinFor} onClose={() => setPinFor(null)} />}
    </>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const run = useAction()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'employee' | 'kiosk'>('employee')
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
            <MenuItem value="kiosk">Kiosk (café tablet)</MenuItem>
          </TextField>
          <Typography variant="body2" color="text.secondary">They'll get an email to set a password, then can add the app to their home screen.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!email.trim() || !name.trim()} onClick={() => run(async () => {
          if (!EMAIL.test(email.trim())) throw new Error('Enter a full email address, like name@example.com')
          await api.invite(email.trim(), name.trim(), role); await refresh(); onClose()
        }, `Invite sent to ${email.trim()}`)}>Send invite</Button>
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
