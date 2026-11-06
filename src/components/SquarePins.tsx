import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { Loading, PersonAvatar } from './common'
import { cleanPin, pinProblem, type SquarePins } from '../../shared/squarePins'
import { tokens } from '../theme'
import { t } from '../i18n'

/**
 * Square PINs (Leaderboard → Show PINs): each person's passcode for signing in to Square on the till, as an
 * owner typed it in (Square's API can't read passcodes). Owners see everyone's and add or change them; anyone
 * else on the team sees only their own. The PINs are read when the dialog opens and gone when it closes.
 */
export function SquarePinsDialog({ onClose }: { onClose: () => void }) {
  const { api, me, profiles } = useApp()
  const [data, setData] = useState<SquarePins | null>(null)
  const [pins, setPins] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.squarePins()
      const shown = await Promise.all(list.people.filter(p => p.set).map(async p => [p.profile_id, await api.showSquarePin(p.profile_id)] as const))
      setData(list)
      setPins(Object.fromEntries(shown))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])
  useEffect(() => { void load() }, [load])

  const owner = !!data?.owner
  const name = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—'
  const colour = (id: string) => profiles.find(p => p.id === id)?.colour ?? tokens.inkSoft
  const pin = (id: string) => pins[id]
    ? <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.2em' }}>{pins[id]}</Box>
    : <Box component="span" sx={{ color: 'text.secondary' }}>{t('Not saved yet')}</Box>
  const mine = me ? data?.people.find(p => p.profile_id === me.id) : undefined

  return (
    <Dialog open onClose={onClose} maxWidth={owner ? 'sm' : 'xs'} fullWidth aria-labelledby="square-pins-title">
      <DialogTitle id="square-pins-title">{data && !owner ? t('Your Square PIN') : t('Square PINs')}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!data && !error && <Loading />}
        {data && owner && (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {t('Each person’s passcode for signing in to Square on the till. Square doesn’t let apps read passcodes: type each one as it is in the Square Dashboard (Team → their name), and change it here when it changes there. Only owners see everyone’s; each person sees only their own.')}
            </Typography>
            <Table size="small" aria-label={t('Square PINs')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Name')}</TableCell>
                  <TableCell>{t('PIN')}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.people.map(p => (
                  <TableRow key={p.profile_id}>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <PersonAvatar name={name(p.profile_id)} colour={colour(p.profile_id)} size={26} />
                        <span>{p.profile_id === me?.id ? t('{name} (you)', { name: name(p.profile_id) }) : name(p.profile_id)}</span>
                      </Stack>
                    </TableCell>
                    <TableCell>{pin(p.profile_id)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setEditing(p.profile_id)}
                        aria-label={p.set ? t('Change the PIN for {name}', { name: name(p.profile_id) }) : t('Add the PIN for {name}', { name: name(p.profile_id) })}>
                        {p.set ? t('Change') : t('Add')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {data && !owner && (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('Your passcode for signing in to Square on the till, so your sales count for you.')}
            </Typography>
            {mine && pins[mine.profile_id]
              ? <Typography role="status" aria-label={t('Your Square PIN')} sx={{ fontSize: '2.2rem', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums', textAlign: 'center', py: 1 }}>
                  {pins[mine.profile_id]}
                </Typography>
              : <Alert severity="info">{t('No PIN is saved for you yet. Ask an owner to add it.')}</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
      {editing && (
        <PinDialog name={name(editing)} saved={!!data?.people.find(p => p.profile_id === editing)?.set} onClose={() => setEditing(null)}
          onSave={async value => { await api.saveSquarePin(editing, value); await load(); setEditing(null) }} />
      )}
    </Dialog>
  )
}

/** An owner types (or takes away) someone's Square PIN. */
function PinDialog({ name, saved, onClose, onSave }: { name: string; saved: boolean; onClose: () => void; onSave: (pin: string | null) => Promise<void> }) {
  const run = useAction()
  const [pin, setPin] = useState('')
  const problem = cleanPin(pin) ? pinProblem(pin) : null
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Square PIN for {name}', { name })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Type it as it is in the Square Dashboard (Team → {name}). Changing it here doesn’t change it in Square.', { name })}
        </Typography>
        <TextField label={t('PIN')} value={pin} onChange={e => setPin(e.target.value)} autoFocus fullWidth autoComplete="off"
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }} error={!!problem} helperText={problem ? t(problem) : ' '} />
      </DialogContent>
      <DialogActions>
        {saved && <Button color="error" onClick={() => void run(() => onSave(null), t('PIN removed'))} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!cleanPin(pin) || !!problem} onClick={() => void run(() => onSave(cleanPin(pin)), t('PIN saved'))}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
