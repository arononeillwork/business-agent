// Pets: a pet's photo (a paw while it has none), the dialog to add or change one, and the Pets section
// of My account where everyone adds their own. The People page shows them beside their person; there
// admins add a pet with its photo for anyone on the team and change anyone's, and everyone their own.
import { Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material'
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
import { PET_KINDS, PET_LIMITS, petPhotoFrame, petProblem, petsByPerson, type Pet, type PetKind } from '../../shared/pets'

/** The team's pets, for the page: everyone's (the database leaves out what someone can't see). */
export function usePets() {
  const { api } = useApp()
  return useAsync('pets', () => api.pets(), [])
}

/** A pet's photo, square and zoomed in as it was set (its dialog), or a paw where its photo goes until there is one. */
export function PetPhoto({ pet, size = 56 }: { pet: Pick<Pet, 'name' | 'photo' | 'photo_zoom' | 'photo_x' | 'photo_y'>; size?: number }) {
  const { zoom, x, y } = petPhotoFrame(pet)
  return (
    <Avatar variant="rounded" src={pet.photo ?? undefined} alt={pet.photo ? pet.name : undefined}
      aria-label={pet.photo ? undefined : t('{name} has no photo yet', { name: pet.name })}
      sx={{ width: size, height: size, borderRadius: '30%', bgcolor: tokens.neutralBg, color: tokens.inkSoft, border: `1px solid ${tokens.line}`,
        '& .MuiAvatar-img': { transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` } }}>
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

/** Add a pet (your own, or for `owner`, someone on the team, as an admin), or change one: yours, or anyone's for an admin. */
export function PetDialog({ pet, owner, onClose }: { pet?: Pet; owner?: { id: string; name: string }; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState(pet?.name ?? '')
  const [kind, setKind] = useState<PetKind>(pet?.kind ?? 'dog')
  const [breed, setBreed] = useState(pet?.breed ?? '')
  const [photo, setPhotoNow] = useState<string | null>(pet?.photo ?? null)
  const [frame, setFrame] = useState(petPhotoFrame(pet ?? {}))
  // A new photo starts as it is, not zoomed.
  const setPhoto = (url: string | null) => { setPhotoNow(url); setFrame({ zoom: 1, x: 50, y: 50 }) }
  const save = () => run(async () => {
    const problem = petProblem({ name, breed, photo })
    if (problem) throw new Error(t(problem))
    await api.savePet({ id: pet?.id, profile_id: pet ? undefined : owner?.id, name: name.trim(), kind, breed: breed.trim() || null, photo,
      photo_zoom: Math.round(frame.zoom * 100) / 100, photo_x: frame.x, photo_y: frame.y })
    onClose()
  }, pet ? t('Saved') : t('{name} added', { name: name.trim() }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{pet ? pet.name : owner ? t('Add a pet for {name}', { name: owner.name }) : t('Add a pet')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <FramedPhoto name={name.trim() || t('Your pet')} photo={photo} frame={frame} onFrame={setFrame} />
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <PhotoPicker label={photo ? t('Change photo') : t('Add photo')} inputLabel={t('Pet photo file')} onPhoto={setPhoto} />
              {photo && <Button size="small" onClick={() => setPhoto(null)}>{t('Remove photo')}</Button>}
            </Stack>
          </Stack>
          {photo && (
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Zoom in on your pet (drag the photo to move it)')}</Typography>
              <Slider aria-label={t('Zoom')} min={1} max={PET_LIMITS.zoom} step={0.05} value={frame.zoom}
                valueLabelDisplay="auto" valueLabelFormat={v => `${v.toFixed(1)}×`} onChange={(_, v) => setFrame(f => ({ ...f, zoom: v as number }))} />
            </Box>
          )}
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

/**
 * The photo in the pet's dialog, zoomed as set: dragged (or moved with the arrow keys) to choose the point it
 * zooms in on. Dragging right shows more of the left of the photo, as when moving a photo in a frame.
 */
function FramedPhoto({ name, photo, frame, onFrame }: {
  name: string; photo: string | null; frame: { zoom: number; x: number; y: number }; onFrame: (f: { zoom: number; x: number; y: number }) => void
}) {
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const clamp = (n: number) => Math.min(Math.max(Math.round(n), 0), 100)
  const size = 96
  if (!photo) return <PetPhoto pet={{ name, photo }} size={size} />
  return (
    <Box role="group" aria-label={t('Move the photo of {name}', { name })} tabIndex={0}
      title={t('Drag to move the photo; the arrow keys move it too')}
      onPointerDown={e => { drag.current = { px: e.clientX, py: e.clientY, x: frame.x, y: frame.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        // The further in it's zoomed, the less the point moves for the same drag.
        const per = 100 / (size * Math.max(frame.zoom - 1, 0.25))
        onFrame({ ...frame, x: clamp(d.x - (e.clientX - d.px) * per), y: clamp(d.y - (e.clientY - d.py) * per) })
      }}
      onPointerUp={() => { drag.current = null }}
      onKeyDown={e => {
        const step = { ArrowLeft: [5, 0], ArrowRight: [-5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key]
        if (!step) return
        e.preventDefault()
        onFrame({ ...frame, x: clamp(frame.x + step[0]), y: clamp(frame.y + step[1]) })
      }}
      sx={{ flexShrink: 0, cursor: frame.zoom > 1 ? 'grab' : 'default', touchAction: 'none', borderRadius: '30%',
        '&:focus-visible': { outline: `2px solid ${tokens.rose}`, outlineOffset: 2 } }}>
      <PetPhoto pet={{ name, photo, photo_zoom: frame.zoom, photo_x: frame.x, photo_y: frame.y }} size={size} />
    </Box>
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
                        onPhoto={photo => run(() => api.savePet({ id: p.id, name: p.name, photo, photo_zoom: 1, photo_x: 50, photo_y: 50 }), t('Photo saved'))} />
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
