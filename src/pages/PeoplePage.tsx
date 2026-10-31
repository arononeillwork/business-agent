import { Box, Button, ButtonBase, Card, CardActionArea, Stack, Typography } from '@mui/material'
import PawIcon from '@mui/icons-material/PetsOutlined'
import AddPhotoIcon from '@mui/icons-material/AddAPhotoOutlined'
import { Fragment, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { PageHeader, PersonAvatar, Tag } from '../components/common'
import { PetDialog, PetPhoto, petLine, usePets } from '../components/Pets'
import { tokens } from '../theme'
import { t, tn } from '../i18n'
import { jobRolesByPerson, teamTiers } from '../../shared/people'
import { petsByPerson, type Pet } from '../../shared/pets'
import type { Profile } from '../../shared/types'

/**
 * The team as a hierarchy: the owners at the top, then the shop managers, then the employees, each
 * with the roles they hold on Roles & responsibilities. "Show pets" puts everyone's dogs (and cats)
 * under them, with their photos. Admins open a person on the Team page from here, and add a pet with
 * its photo for anyone or change anyone's; everyone else adds and changes their own.
 */
export function PeoplePage() {
  const { api, profiles, me, isAdmin } = useApp()
  const [showPets, setShowPets] = useState(false)
  const [editing, setEditing] = useState<Pet | null>(null)
  const [adding, setAdding] = useState<Profile | null>(null)
  const pets = usePets()
  const roles = useAsync('roles', () => api.jobRoles(), [])
  const tiers = teamTiers(profiles)
  const petsOf = petsByPerson(pets.data ?? [])
  const rolesOf = jobRolesByPerson(roles.data ?? [])
  const people = tiers.reduce((n, tier) => n + tier.people.length, 0)
  const petCount = tiers.reduce((n, tier) => n + tier.people.reduce((m, p) => m + (petsOf.get(p.id)?.length ?? 0), 0), 0)
  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('People')}
        actions={<Button variant={showPets ? 'contained' : 'outlined'} startIcon={<PawIcon />} aria-pressed={showPets}
          onClick={() => setShowPets(!showPets)}>{showPets ? t('Hide pets') : t('Show pets')}</Button>} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
        {showPets ? t('{people} · {pets}', { people: tn(people, '{n} person', '{n} people'), pets: tn(petCount, '{n} pet', '{n} pets') })
          : tn(people, '{n} person', '{n} people')}
      </Typography>
      <Stack sx={{ alignItems: 'center' }}>
        {tiers.map((tier, i) => (
          <Fragment key={tier.role}>
            {i > 0 && <Connector />}
            <Box component="section" aria-label={t(tier.plural)} sx={{ width: '100%' }}>
              <Typography variant="overline" component="h2" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 1 }}>
                {t(tier.plural)} · {tier.people.length}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
                {tier.people.map(p => (
                  <PersonCard key={p.id} person={p} you={p.id === me?.id} roles={rolesOf.get(p.id) ?? []}
                    pets={showPets ? petsOf.get(p.id) ?? [] : null} onPet={isAdmin || p.id === me?.id ? setEditing : null}
                    onAddPet={isAdmin || p.id === me?.id ? () => setAdding(p) : null}
                    link={p.id === me?.id ? '/account' : isAdmin ? `/team?person=${p.id}` : null} />
                ))}
              </Box>
            </Box>
          </Fragment>
        ))}
      </Stack>
      {editing && <PetDialog pet={editing} onClose={() => setEditing(null)} />}
      {adding && <PetDialog owner={adding.id === me?.id ? undefined : { id: adding.id, name: adding.full_name }} onClose={() => setAdding(null)} />}
    </>
  )
}

/** A pet on a person's card: its photo, then its name and kind. */
const petColumn = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: '100%' } as const

/** The line from one level of the hierarchy down to the next. */
const Connector = () => <Box aria-hidden sx={{ width: 2, height: 28, bgcolor: tokens.lineStrong, my: 1 }} />

/** One person: who they are, their team role and roles, and their pets while they're shown (to change, with `onPet`; to add one, with `onAddPet`). */
function PersonCard({ person: p, you, roles, pets, link, onPet, onAddPet }: {
  person: Profile; you: boolean; roles: string[]; pets: Pet[] | null; link: string | null; onPet: ((pet: Pet) => void) | null; onAddPet: (() => void) | null
}) {
  const name = you ? t('{name} (you)', { name: p.full_name }) : p.full_name
  const body: ReactNode = (
    <Stack spacing={1.25} sx={{ p: 2, pb: pets ? 1.25 : 2, alignItems: 'center', textAlign: 'center', height: '100%' }}>
      <PersonAvatar name={p.full_name} colour={p.colour} size={56} />
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Typography sx={{ fontWeight: 500 }} noWrap>{name}</Typography>
        {roles.length > 0 && (
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', justifyContent: 'center', mt: 0.75 }}>
            {roles.map(r => <Tag key={r}>{r}</Tag>)}
          </Stack>
        )}
      </Box>
      {/* Their own card opens My account, where they add their pets with a photo. */}
      {you && (
        <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', color: tokens.roseDeep }}>
          <AddPhotoIcon sx={{ fontSize: 18 }} aria-hidden />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('Add your pet')}</Typography>
        </Stack>
      )}
    </Stack>
  )
  return (
    <Card role="article" aria-label={name}
      sx={{ width: { xs: '100%', sm: 220 }, display: 'flex', flexDirection: 'column', outline: you ? `2px solid ${tokens.roseDeep}` : undefined }}>
      {link ? <CardActionArea component={RouterLink} to={link} sx={{ flexGrow: 1 }}>{body}</CardActionArea> : body}
      {pets && (
        <Box sx={{ mx: 2, mb: 2, pt: 1.25, borderTop: `1px solid ${tokens.line}`, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
          {(pets.length > 0 || !onAddPet) && (
            <Box role="list" aria-label={t('{name}’s pets', { name: p.full_name })}
              sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5, maxWidth: '100%' }}>
              {pets.length === 0
                ? <Typography variant="body2" role="listitem" sx={{ color: 'text.secondary' }}>{t('No pets')}</Typography>
                : pets.map(pet => {
                  const inner = (
                    <>
                      <PetPhoto pet={pet} size={64} />
                      <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: '100%' }} noWrap>{pet.name}</Typography>
                      {petLine(pet) && <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: '100%' }} noWrap>{petLine(pet)}</Typography>}
                    </>
                  )
                  return (
                    <Box key={pet.id} role="listitem" aria-label={pet.name} sx={{ width: 76 }}>
                      {onPet
                        ? <ButtonBase onClick={() => onPet(pet)} aria-label={t('Edit {name}', { name: pet.name })} sx={{ ...petColumn, borderRadius: 2 }}>{inner}</ButtonBase>
                        : <Box sx={petColumn}>{inner}</Box>}
                    </Box>
                  )
                })}
            </Box>
          )}
          {/* A pet with its photo for this person: an admin adds one for anyone, everyone else for themselves. */}
          {onAddPet && (
            <ButtonBase onClick={onAddPet} aria-label={you ? t('Add a pet') : t('Add a pet for {name}', { name: p.full_name })}
              sx={{ ...petColumn, width: 76, borderRadius: 2, color: tokens.inkSoft }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '30%', border: `1px dashed ${tokens.lineStrong}`, display: 'grid', placeItems: 'center' }}>
                <AddPhotoIcon sx={{ fontSize: 26 }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('Add a pet')}</Typography>
            </ButtonBase>
          )}
        </Box>
      )}
    </Card>
  )
}
