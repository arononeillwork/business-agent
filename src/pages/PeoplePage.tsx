import { Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import PawIcon from '@mui/icons-material/PetsOutlined'
import { Fragment, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { PageHeader, PersonAvatar, Tag } from '../components/common'
import { PetPhoto, petLine, usePets } from '../components/Pets'
import { tokens } from '../theme'
import { t, tn } from '../i18n'
import { jobRolesByPerson, teamTiers } from '../../shared/people'
import { petsByPerson, type Pet } from '../../shared/pets'
import type { Profile } from '../../shared/types'

/**
 * The team as a hierarchy: the owners at the top, then the shop managers, then the employees, each
 * with the roles they hold on Roles & responsibilities. "Show pets" puts everyone's dogs (and cats)
 * under them, with their photos. Admins open a person on the Team page from here.
 */
export function PeoplePage() {
  const { api, profiles, me, isAdmin } = useApp()
  const [showPets, setShowPets] = useState(false)
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
                    pets={showPets ? petsOf.get(p.id) ?? [] : null} link={isAdmin ? `/team?person=${p.id}` : null} />
                ))}
              </Box>
            </Box>
          </Fragment>
        ))}
      </Stack>
    </>
  )
}

/** The line from one level of the hierarchy down to the next. */
const Connector = () => <Box aria-hidden sx={{ width: 2, height: 28, bgcolor: tokens.lineStrong, my: 1 }} />

/** One person: who they are, their team role and roles, and their pets while they're shown. */
function PersonCard({ person: p, you, roles, pets, link }: { person: Profile; you: boolean; roles: string[]; pets: Pet[] | null; link: string | null }) {
  const name = you ? t('{name} (you)', { name: p.full_name }) : p.full_name
  const body: ReactNode = (
    <Stack spacing={1.25} sx={{ p: 2, alignItems: 'center', textAlign: 'center', height: '100%' }}>
      <PersonAvatar name={p.full_name} colour={p.colour} size={56} />
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Typography sx={{ fontWeight: 500 }} noWrap>{name}</Typography>
        {roles.length > 0 && (
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', justifyContent: 'center', mt: 0.75 }}>
            {roles.map(r => <Tag key={r}>{r}</Tag>)}
          </Stack>
        )}
      </Box>
      {pets && (
        <Box role="list" aria-label={t('{name}’s pets', { name: p.full_name })}
          sx={{ width: '100%', pt: 1.25, borderTop: `1px solid ${tokens.line}`, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
          {pets.length === 0
            ? <Typography variant="body2" role="listitem" sx={{ color: 'text.secondary' }}>{t('No pets')}</Typography>
            : pets.map(pet => (
              <Stack key={pet.id} role="listitem" aria-label={pet.name} spacing={0.5} sx={{ alignItems: 'center', width: 76 }}>
                <PetPhoto pet={pet} size={64} />
                <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: '100%' }} noWrap>{pet.name}</Typography>
                {petLine(pet) && <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: '100%', mt: '0 !important' }} noWrap>{petLine(pet)}</Typography>}
              </Stack>
            ))}
        </Box>
      )}
    </Stack>
  )
  return (
    <Card role="article" aria-label={name} sx={{ width: { xs: '100%', sm: 220 }, outline: you ? `2px solid ${tokens.roseDeep}` : undefined }}>
      {link ? <CardActionArea component={RouterLink} to={link} sx={{ height: '100%' }}>{body}</CardActionArea> : body}
    </Card>
  )
}
