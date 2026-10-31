// Pets: a pet's photo (a paw while it has none), the dialog to add or change one, and the Pets section
// of My account where everyone adds their own. The People page shows them beside their person; there
// admins change anyone's, and everyone their own.
import { Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PawIcon from '@mui/icons-material/PetsOutlined'
import PhotoIcon from '@mui/icons-material/AddAPhotoOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import { tokens } from '../theme'
import { t } from '../i18n'
import { PET_KINDS, PET_LIMITS, petProblem, petsByPerson, type Pet, type PetKind } from '../../shared/pets'

/** The team's pets, for the page: everyone's (the database leaves out what someone can't see). */
export function usePets() {
  const { api } = useApp()
  return useAsync('pets', () => api.pets(), [])
}

/** A pet's photo, square, or a paw where its photo goes until there is one. */
export function PetPhoto({ pet, size = 56 }: { pet: Pick<Pet, 'name' | 'photo'>; size?: number }) {
  return (
    <Avatar variant="rounded" src={pet.photo ?? undefined} alt={pet.photo ? pet.name : undefined}
      aria-label={pet.photo ? undefined : t('{name} has no photo yet', { name: pet.name })}
      sx={{ width: size, height: size, borderRadius: '30%', bgcolor: tokens.neutralBg, color: tokens.inkSoft, border: `1px solid ${tokens.line}` }}>
      <PawIcon sx={{ fontSize: size * 0.45 }} />
    </Avatar>
  )
}

/** The kind, and the breed when there is one: "Dog · Cocker spaniel". */
export const petLine = (p: Pick<Pet, 'kind' | 'breed'>) =>
  [t(PET_KINDS.find(k => k.id === p.kind)?.label ?? ''), p.breed].filter(Boolean).join(' · ')

/** A photo from the phone or computer as a small square JPEG, cut from the middle (a data: URL). */
async function squarePhoto(file: File, size = 480): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(t('That isn’t a photo'))
  if (file.size > 25_000_000) throw new Error(t('That photo is over 25 MB. Try a smaller one.'))
  const img = await createImageBitmap(file).catch(() => { throw new Error(t('That photo can’t be read here. Use a JPEG or PNG.')) })
  const side = Math.min(img.width, img.height)
  const out = Math.min(size, side)
  const canvas = Object.assign(document.createElement('canvas'), { width: out, height: out })
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out)
  img.close()
  const url = canvas.toDataURL('image/jpeg', 0.85)
  if (url.length > PET_LIMITS.photo) throw new Error(t('That photo is over 25 MB. Try a smaller one.'))
  return url
}

/** A button that picks a photo and hands it over ready to keep. */
function PhotoPicker({ label, inputLabel, onPhoto, variant = 'outlined' }: { label: string; inputLabel: string; onPhoto: (url: string) => void; variant?: 'outlined' | 'text' }) {
  const file = useRef<HTMLInputElement>(null)
  const run = useAction()
  return (
    <>
      <Button size="small" variant={variant} startIcon={<PhotoIcon />} onClick={() => file.current?.click()}>{label}</Button>
      <input ref={file} type="file" accept="image/*" hidden aria-label={inputLabel} onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) void run(async () => onPhoto(await squarePhoto(f)))
      }} />
    </>
  )
}

/** Add a pet of your own, or change one: yours, or anyone's for an admin. */
export function PetDialog({ pet, onClose }: { pet?: Pet; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState(pet?.name ?? '')
  const [kind, setKind] = useState<PetKind>(pet?.kind ?? 'dog')
  const [breed, setBreed] = useState(pet?.breed ?? '')
  const [photo, setPhoto] = useState<string | null>(pet?.photo ?? null)
  const save = () => run(async () => {
    const problem = petProblem({ name, breed, photo })
    if (problem) throw new Error(t(problem))
    await api.savePet({ id: pet?.id, name: name.trim(), kind, breed: breed.trim() || null, photo })
    onClose()
  }, pet ? t('Saved') : t('{name} added', { name: name.trim() }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{pet ? pet.name : t('Add a pet')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <PetPhoto pet={{ name: name.trim() || t('Your pet'), photo }} size={96} />
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <PhotoPicker label={photo ? t('Change photo') : t('Add photo')} inputLabel={t('Pet photo file')} onPhoto={setPhoto} />
              {photo && <Button size="small" onClick={() => setPhoto(null)}>{t('Remove photo')}</Button>}
            </Stack>
          </Stack>
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} autoFocus={!pet}
            slotProps={{ htmlInput: { maxLength: PET_LIMITS.name } }} />
          <TextField select label={t('Kind')} value={kind} onChange={e => setKind(e.target.value as PetKind)}>
            {PET_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
          </TextField>
          <TextField label={t('Breed (optional)')} value={breed} onChange={e => setBreed(e.target.value)}
            slotProps={{ htmlInput: { maxLength: PET_LIMITS.breed } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {pet && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => { await api.deletePet(pet.id); onClose() }, t('{name} removed', { name: pet.name }))}>
          {t('Remove')}
        </Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={save}>{pet ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** My account → Pets: your own pets, each with its photo, to add, change and take off. */
export function MyPets() {
  const { api, me } = useApp()
  const run = useAction()
  const pets = usePets()
  const [editing, setEditing] = useState<Pet | 'new' | null>(null)
  if (!me) return null
  const mine = petsByPerson(pets.data ?? []).get(me.id) ?? []
  return (
    <Card component="section" aria-label={t('Pets')}>
      <CardContent>
        <SectionTitle action={<Button size="small" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add a pet')}</Button>}>{t('Pets')}</SectionTitle>
        {mine.length === 0
          ? <Typography variant="body2" color="text.secondary">{t('No pets yet. Add your dog (or cat) with a photo, and the team meets them on the People page.')}</Typography>
          : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {mine.map(p => (
                <Stack key={p.id} direction="row" spacing={1.5} role="group" aria-label={p.name}
                  sx={{ alignItems: 'center', p: 1.5, border: `1px solid ${tokens.line}`, borderRadius: 2.5 }}>
                  <PetPhoto pet={p} size={72} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>{p.name}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{petLine(p)}</Typography>
                    <Stack direction="row" sx={{ gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                      <PhotoPicker variant="text" label={p.photo ? t('Change photo') : t('Add photo')} inputLabel={t('Photo of {name}', { name: p.name })}
                        onPhoto={photo => run(() => api.savePet({ id: p.id, name: p.name, photo }), t('Photo saved'))} />
                      <Button size="small" onClick={() => setEditing(p)}>{t('Edit')}</Button>
                    </Stack>
                  </Box>
                </Stack>
              ))}
            </Box>
          )}
      </CardContent>
      {editing && <PetDialog pet={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}
