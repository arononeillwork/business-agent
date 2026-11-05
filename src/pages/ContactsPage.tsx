import {
  Autocomplete, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Stack,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import SearchIcon from '@mui/icons-material/Search'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import {
  CONTACT_LIMITS, USUAL_JOBS, contactProblem, jobKey, jobName, matchesContact, siteName, sortContacts, tidyContact, type Contact, type ContactInput,
} from '../../shared/contacts'
import { tokens } from '../theme'
import { t, useLanguage } from '../i18n'

/** More than this many contacts, and a search box shows. */
const SEARCH_FROM = 6

/**
 * Contacts: the people the business calls on (the lawyer, the bank, the plumber…), each with a button to
 * call, WhatsApp, email or open their website. Only the owners open it (the menu and the route), and add,
 * change and delete them.
 */
export function ContactsPage() {
  const { api } = useApp()
  useLanguage()
  const data = useAsync('contacts', () => api.contacts(), [])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<ContactInput | null>(null)
  const all = sortContacts(data.data ?? [], t)
  const shown = all.filter(c => matchesContact(c, search, t))

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Contacts')} actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ name: '' })}>{t('Add a contact')}</Button>
      } />
      <ErrorBox error={data.error} />

      {all.length > SEARCH_FROM && (
        <TextField size="small" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Name, job, company or number')}
          slotProps={{ htmlInput: { 'aria-label': t('Search contacts') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ mb: 2, width: { xs: '100%', sm: 340 } }} />
      )}

      {data.data && !all.length ? (
        <Empty>{t('Add the people the business calls on: the lawyer, the bank, the plumber…')}</Empty>
      ) : data.data && !shown.length ? (
        <Empty>{t('Nobody matches “{text}”.', { text: search.trim() })}</Empty>
      ) : (
        <Box role="list" aria-label={t('Contacts')}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          {shown.map(c => <ContactCard key={c.id} contact={c} onEdit={() => setForm(c)} />)}
        </Box>
      )}

      {form && <ContactDialog contact={form} onClose={() => setForm(null)} />}
    </>
  )
}

/** One person: what they do, and a button for each way to reach them. */
function ContactCard({ contact: c, onEdit }: { contact: Contact; onEdit: () => void }) {
  const about = [jobName(c.job, t), c.company].filter(Boolean).join(' · ')
  // Long addresses shorten with "…" rather than push the card wider.
  const label = (text: string) => <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</Box>
  const reach = { size: 'small', variant: 'outlined', sx: { minWidth: 0, maxWidth: '100%' } } as const
  return (
    <Card role="listitem" component="article" aria-label={c.name} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ wordBreak: 'break-word' }}>{c.name}</Typography>
          {about && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{about}</Typography>}
        </Box>
        <Tooltip title={t('Edit')}>
          <IconButton size="small" onClick={onEdit} aria-label={t('Edit {name}', { name: c.name })} sx={{ mt: -0.5, mr: -0.5 }}><EditIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
      {(c.phone || c.email || c.website) && (
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {c.phone && <Button {...reach} startIcon={<PhoneIcon />} href={`tel:${c.phone.replace(/\s/g, '')}`}>{label(c.phone)}</Button>}
          {c.phone && c.whatsapp && (
            <Button {...reach} startIcon={<WhatsAppIcon />} href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener">{'WhatsApp'}</Button>
          )}
          {c.email && <Button {...reach} startIcon={<EmailIcon />} href={`mailto:${c.email}`}>{label(c.email)}</Button>}
          {c.website && <Button {...reach} startIcon={<WebIcon />} href={c.website} target="_blank" rel="noopener">{label(siteName(c.website))}</Button>}
        </Stack>
      )}
      {c.notes && <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.notes}</Typography>}
    </Card>
  )
}

/** Add someone, or change or delete them. */
function ContactDialog({ contact, onClose }: { contact: ContactInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  // What they do is edited in the person's language, and saved as a usual job's English name when it is one.
  const [c, setC] = useState<ContactInput>({ ...contact, job: jobName(contact.job, t) || null })
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<ContactInput>) => setC(x => ({ ...x, ...p }))

  const save = async () => {
    const ok = await run(async () => {
      const next = tidyContact({ ...c, job: jobKey(c.job, t) })
      const problem = contactProblem(next)
      if (problem) throw new Error(t(problem))
      await api.saveContact(next)
    }, contact.id ? t('Saved') : t('Added {name}', { name: c.name.trim() }))
    if (ok) onClose()
  }
  const remove = async () => { if (await run(() => api.deleteContact(contact.id!), t('Deleted {name}', { name: contact.name }))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="contact-dialog-title">
      <DialogTitle id="contact-dialog-title">{contact.id ? contact.name : t('Add a contact')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={c.name} onChange={e => set({ name: e.target.value })} autoFocus={!contact.id}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.name } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete freeSolo fullWidth options={USUAL_JOBS.map(j => t(j))} inputValue={c.job ?? ''} onInputChange={(_, v) => set({ job: v })}
              renderInput={p => <TextField {...p} label={t('What they do')} placeholder={t('e.g. Lawyer')} />} />
            <TextField fullWidth label={t('Company')} value={c.company ?? ''} onChange={e => set({ company: e.target.value })} placeholder={t('e.g. BBVA')}
              slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.company } }} />
          </Stack>
          <PhoneField label={t('Phone')} value={c.phone ?? ''} onChange={v => set({ phone: v })} />
          <FormControlLabel label={t('They answer on WhatsApp')} control={<Checkbox checked={!!c.whatsapp} onChange={e => set({ whatsapp: e.target.checked })} />} />
          <TextField label={t('Email')} type="email" value={c.email ?? ''} onChange={e => set({ email: e.target.value })}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.email } }} />
          <TextField label={t('Website')} type="url" placeholder={'https://'} value={c.website ?? ''} onChange={e => set({ website: e.target.value })}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.website } }} />
          <TextField label={t('Notes')} value={c.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            placeholder={t('e.g. their office address, when to call, what they did for us')} slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.notes } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {contact.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete {name}?', { name: contact.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{contact.id ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
