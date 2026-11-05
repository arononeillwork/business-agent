import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/PersonAddAlt'
import MatchIcon from '@mui/icons-material/LinkRounded'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PASSCODE_HELP, RECONNECT_TEAM, addProblem, suggestLinks, type SquareTeam } from '../../shared/squareTeam'
import type { Profile } from '../../shared/types'
import { ErrorBox, Loading, PersonAvatar } from './common'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** The Square team members and who's linked to whom (admins): one read, shared by the Team panel and the Leaderboard. */
export function useSquareTeam(enabled = true) {
  const { api } = useApp()
  return useAsync('square-team', () => (enabled ? api.squareTeam() : Promise.resolve(null)), [enabled])
}

const onTeam = (p: Profile) => p.active && (p.role === 'admin' || p.role === 'employee')

/** Why there's nothing to choose from: Square isn't connected, or was connected before team members were asked for. */
function NotReady({ team }: { team: SquareTeam }) {
  if (team.status === 'ok') return null
  return (
    <Alert severity="info" action={<Button component={RouterLink} to="/connections" color="inherit" size="small">{t('Connections')}</Button>}>
      {team.status === 'reconnect' ? t(RECONNECT_TEAM) : t('Connect Square on the Connections page to give each person their own Square login.')}
    </Alert>
  )
}

/** One person: which Square team member they are, or Add to Square. */
function PersonLogin({ person, team, compact }: { person: Profile; team: SquareTeam; compact?: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const mine = team.links.find(l => l.profile_id === person.id)
  const taken = new Set(team.links.filter(l => l.profile_id !== person.id).map(l => l.team_member_id))
  const choices = team.members.filter(m => m.id === mine?.team_member_id || (m.active && !taken.has(m.id)))
  const problem = addProblem(person, !!mine)
  return (
    <Stack direction={{ xs: 'column', sm: compact ? 'column' : 'row' }} spacing={1} sx={{ alignItems: { sm: compact ? 'stretch' : 'center' } }}>
      <TextField select size="small" value={mine?.team_member_id ?? ''} sx={{ minWidth: 220, flex: 1 }}
        slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': t('Square login for {name}', { name: person.full_name }) } } }}
        onChange={e => run(() => api.linkSquareMember(person.id, e.target.value || null), e.target.value ? t('{name} linked to their Square login', { name: person.full_name }) : t('{name} unlinked from Square', { name: person.full_name }))}>
        <MenuItem value=""><em>{t('Not linked')}</em></MenuItem>
        {choices.map(m => (
          <MenuItem key={m.id} value={m.id}>{m.name}{m.email ? ` · ${m.email}` : ''}{m.is_owner ? ` · ${t('Square account owner')}` : ''}</MenuItem>
        ))}
      </TextField>
      {!mine && !problem && (
        <Button variant="outlined" startIcon={<AddIcon />} sx={{ flexShrink: 0 }}
          onClick={() => run(() => api.addToSquare(person.id), t('{name} is in Square: set their passcode in the Square Dashboard', { name: person.full_name }))}>
          {t('Add to Square')}
        </Button>
      )}
    </Stack>
  )
}

/**
 * The person's Square login, on their Team panel (admins, while Square is connected): link them to their
 * Square team member, or add them to Square. Their passcode is set in the Square Dashboard.
 */
export function SquareLoginSection({ person }: { person: Profile }) {
  const { isAdmin } = useApp()
  const team = useSquareTeam(isAdmin)
  if (!team.data || team.data.status === 'not_connected' || !onTeam(person)) return null
  return (
    <Box component="section" aria-label={t('Square login')}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Square login')}</Typography>
      <Stack spacing={1.25} sx={{ mt: 0.5 }}>
        {team.data.status === 'ok' ? <PersonLogin person={person} team={team.data} compact /> : <NotReady team={team.data} />}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t(PASSCODE_HELP)}</Typography>
      </Stack>
    </Box>
  )
}

/** Everyone's Square login at once (the Leaderboard, admins): link each person, match them all, or add someone to Square. */
export function SquareLoginsDialog({ onClose }: { onClose: () => void }) {
  const { api, profiles } = useApp()
  const run = useAction()
  const team = useSquareTeam()
  const people = profiles.filter(onTeam).sort((a, b) => a.full_name.localeCompare(b.full_name))
  const t0 = team.data
  const canMatch = t0?.status === 'ok' ? suggestLinks(people, t0.members, t0.links).length : 0
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Square logins')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Each person takes payments at the till with their own Square login, so the Leaderboard knows who sold what. Link each person to theirs, or add them to Square.')}
        </Typography>
        <ErrorBox error={team.error} />
        {!t0 ? <Loading /> : t0.status !== 'ok' ? <NotReady team={t0} /> : (
          <Stack spacing={1.75}>
            {people.map(p => (
              <Stack key={p.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, pb: 1.75, borderBottom: `1px solid ${tokens.line}` }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 150 }}>
                  <PersonAvatar name={p.full_name} colour={p.colour} size={28} />
                  <Typography noWrap>{p.full_name}</Typography>
                </Stack>
                <Box sx={{ flex: 1 }}><PersonLogin person={p} team={t0} /></Box>
              </Stack>
            ))}
            <Alert severity="info">{t(PASSCODE_HELP)}</Alert>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {t0?.status === 'ok' && (
          <Button startIcon={<MatchIcon />} disabled={!canMatch}
            onClick={() => run(async () => { await api.matchSquareMembers() }, tn(canMatch, 'Linked 1 person by their email or name', 'Linked {n} people by their email or name'))}>
            {t('Match by email or name')}
          </Button>
        )}
        <Button onClick={onClose}>{t('Done')}</Button>
      </DialogActions>
    </Dialog>
  )
}
