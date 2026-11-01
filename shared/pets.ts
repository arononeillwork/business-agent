// Pets: the team's dogs (and cats and others). Everyone adds their own on My account, with a photo;
// the People page shows them beside their person (the `pets` migration).
import { msg } from './i18n'

export type PetKind = 'dog' | 'cat' | 'other'
export const PET_KINDS: { id: PetKind; label: string }[] = [
  { id: 'dog', label: msg('Dog') },
  { id: 'cat', label: msg('Cat') },
  { id: 'other', label: msg('Other pet') },
]

export interface Pet {
  id: string
  /** Whose pet it is. */
  profile_id: string
  name: string
  kind: PetKind
  breed: string | null
  /** A small square JPEG as a data: URL, or null while it has no photo yet. */
  photo: string | null
  /** How far the photo is zoomed in (1: as it is, up to 3) and on which point, across and down (0–100%). */
  photo_zoom?: number
  photo_x?: number
  photo_y?: number
  sort: number
  created_at: string
}
export type PetInput = Partial<Pick<Pet, 'kind' | 'breed' | 'photo' | 'photo_zoom' | 'photo_x' | 'photo_y' | 'sort'>> & Pick<Pet, 'name'> & { id?: string; profile_id?: string }

/** The same limits as the database's. */
export const PET_LIMITS = { name: 40, breed: 60, photo: 1_000_000, each: 20, zoom: 3 }

/** How a pet's photo is framed: zoomed in on its point (the photo itself isn't changed). */
export function petPhotoFrame(p: Pick<Pet, 'photo_zoom' | 'photo_x' | 'photo_y'>) {
  const zoom = Math.min(Math.max(Number(p.photo_zoom ?? 1) || 1, 1), PET_LIMITS.zoom)
  const at = (n: number | undefined) => Math.min(Math.max(Math.round(n ?? 50), 0), 100)
  return { zoom, x: at(p.photo_x), y: at(p.photo_y) }
}

/** What's wrong with a pet before it's saved (the database says the same), or null. */
export function petProblem(p: Pick<PetInput, 'name' | 'breed' | 'photo'>): string | null {
  if (!p.name.trim()) return msg('Give your pet a name')
  if (p.name.trim().length > PET_LIMITS.name) return msg('Keep the name to 40 characters')
  if ((p.breed ?? '').trim().length > PET_LIMITS.breed) return msg('Keep the breed to 60 characters')
  if (p.photo && (!/^data:image\/(jpeg|png|webp);base64,/.test(p.photo) || p.photo.length > PET_LIMITS.photo)) return msg('That photo can’t be used. Try another.')
  return null
}

/** Each person's pets, in their order. */
export function petsByPerson(pets: Pet[]): Map<string, Pet[]> {
  const by = new Map<string, Pet[]>()
  for (const p of [...pets].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
    by.set(p.profile_id, [...(by.get(p.profile_id) ?? []), p])
  }
  return by
}
