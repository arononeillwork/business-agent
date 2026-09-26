import {
  Alert, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  FormGroup, Grid, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle, Tag } from '../components/common'
import { PARTNER_AREAS, type PartnerArea, type Profile } from '../../shared/types'
import { tokens } from '../theme'

/**
 * Admins: outside businesses (gestoría, supplier, franchise partner) with a read-only login.
 * Each partner sees the business details plus only the areas ticked here; the database enforces it.
 */
export function PartnersPage() {
  const { api } = useApp()
  const run = useAction()
  const partners = useAsync('partners', () => api.partners(), [])
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)

  return (
    <>
      <PageHeader eyebrow="Settings" title="Partners"
        subtitle="Give another business its own login to part of Easy Beans, for example your gestoría for payroll or a supplier for the calendar. Partners can look but never change anything."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>Invite partner</Button>} />
      <ErrorBox error={partners.error} />

      {partners.data?.length === 0 && <Empty>No partners yet. Invite one and choose what they can see.</Empty>}
      <Grid container spacing={2.5}>
        {partners.data?.map(p => (
          <Grid key={p.id} size={{ xs: 12, md: 6, xl: 4 }}>
            <Card sx={{ height: '100%', opacity: p.active ? 1 : 0.6 }}>
              <CardContent>
                <SectionTitle action={<Button size="small" onClick={() => setEditing(p)}>Edit access</Button>}>
                  {p.partner_company ?? 'Partner'}
                </SectionTitle>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <PersonAvatar name={p.full_name} colour={p.colour} size={36} />
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>{p.full_name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.email}</Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  <Tag>Business info</Tag>
                  {PARTNER_AREAS.filter(a => p.partner_access?.includes(a.key)).map(a => (
                    <Tag key={a.key} fg={tokens.roseDeep} bg={tokens.roseSoft}>{a.label}</Tag>
                  ))}
                  {!p.active && <Tag fg={tokens.danger} bg={tokens.dangerSoft}>Access removed</Tag>}
                </Stack>
                <Button size="small" sx={{ mt: 1.5, ml: -1 }} onClick={() => run(async () => {
                  await api.updateProfile(p.id, { active: !p.active }); await partners.reload()
                }, p.active ? 'Access removed' : 'Access restored')}>
                  {p.active ? 'Remove access' : 'Restore access'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {editing && <PartnerDialog partner={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)} onSaved={() => partners.reload()} />}
    </>
  )
}

function PartnerDialog({ partner, onClose, onSaved }: { partner: Profile | null; onClose: () => void; onSaved: () => unknown }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState(partner?.full_name ?? '')
  const [email, setEmail] = useState(partner?.email ?? '')
  const [company, setCompany] = useState(partner?.partner_company ?? '')
  const [access, setAccess] = useState<PartnerArea[]>(partner?.partner_access ?? [])
  const toggle = (a: PartnerArea) => setAccess(x => x.includes(a) ? x.filter(y => y !== a) : [...x, a])

  const save = async () => {
    const ok = await run(async () => {
      if (partner) await api.setPartnerAccess(partner.id, company, access)
      else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) throw new Error('Enter a full email address, like name@example.com')
        await api.invitePartner(email.trim(), name.trim(), company, access)
      }
      await onSaved()
    }, partner ? 'Access updated' : 'Invite sent')
    if (ok) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{partner ? `Access for ${partner.full_name}` : 'Invite a partner'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Company" value={company} onChange={e => setCompany(e.target.value)} autoFocus />
          {!partner && <>
            <TextField label="Contact name" value={name} onChange={e => setName(e.target.value)} />
            <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </>}
          <div>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>What they can see</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              Business details are always visible. Everything is read-only.
            </Typography>
            <FormGroup>
              {PARTNER_AREAS.map(a => (
                <FormControlLabel key={a.key} control={<Checkbox checked={access.includes(a.key)} onChange={() => toggle(a.key)} />}
                  label={<><b>{a.label}</b> <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>· {a.detail}</Typography></>} />
              ))}
            </FormGroup>
          </div>
          {(access.includes('payroll') || access.includes('finances')) && (
            <Alert severity="info">Payroll and finances include pay rates and costs. Only share them with your gestoría or accountant.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>{partner ? 'Save' : 'Send invite'}</Button>
      </DialogActions>
    </Dialog>
  )
}
