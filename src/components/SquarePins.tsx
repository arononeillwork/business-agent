import {
  Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import ShowIcon from '@mui/icons-material/VisibilityOutlined'
import HideIcon from '@mui/icons-material/VisibilityOffOutlined'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PersonAvatar, SectionTitle } from './common'
import { HIDDEN, SHOW_FOR_MS, cleanPin, pinProblem } from '../../shared/squarePins'
import { tokens } from '../theme'
import { t } from '../i18n'

/**
 * Square PINs (Leaderboard): each person's passcode for signing in to Square on the till, as an owner typed
 * it in (Square's API can't read passcodes). Owners see and change everyone's; anyone else on the team sees
 * only their own. A PIN shows when Show is pressed, and hides again after half a minute.
 */
export function SquarePinsSection() {
  const { api, me, profiles } = useApp()
  const run = useAction()
  const data = useAsync('square-pins', () => api.squarePins(), [])
  const [shown, setShown] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => () => { for (const id of timers.current.values()) clearTimeout(id) }, [])

  const hide = (id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setShown(s => { const { [id]: _gone, ...rest } = s; return rest })
  }
  const show = (id: string) => run(async () => {
    const pin = await api.showSquarePin(id)
    setShown(s => ({ ...s, [id]: pin }))
    clearTimeout(timers.current.get(id))
    timers.current.set(id, setTimeout(() => hide(id), SHOW_FOR_MS))
  })

  if (data.error) return <ErrorBox error={data.error} />
  if (!data.data) return null
  const { owner, people } = data.data
  const name = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—'
  const colour = (id: string) => profiles.find(p => p.id === id)?.colour ?? tokens.inkSoft

  const pinCell = (id: string, set: boolean) => (
    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: shown[id] ? '0.2em' : '0.1em', color: set ? 'text.primary' : 'text.secondary' }}>
      {!set ? t('Not saved yet') : shown[id] ?? HIDDEN}
    </Box>
  )
  const showButton = (id: string, set: boolean) => set && (
    shown[id]
      ? <Button size="small" startIcon={<HideIcon />} onClick={() => hide(id)} aria-label={t('Hide the PIN for {name}', { name: name(id) })}>{t('Hide')}</Button>
      : <Button size="small" startIcon={<ShowIcon />} onClick={() => void show(id)} aria-label={t('Show the PIN for {name}', { name: name(id) })}>{t('Show')}</Button>
  )

  return (
    <Box component="section" aria-label={owner ? t('Square PINs') : t('Your Square PIN')} sx={{ mt: 4 }}>
      <SectionTitle>{owner ? t('Square PINs') : t('Your Square PIN')}</SectionTitle>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, maxWidth: 760 }}>
        {owner
          ? t('Each person’s passcode for signing in to Square on the till, so their sales count for them. Square doesn’t let apps read passcodes: type each one as it is in the Square Dashboard (Team → their name), and change it here when it changes there. Only owners see everyone’s; each person sees only their own.')
          : t('Your passcode for signing in to Square on the till, so your sales count for you.')}
      </Typography>
      {owner ? (
        <Card sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Square PINs')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Name')}</TableCell>
                <TableCell>{t('PIN')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map(p => (
                <TableRow key={p.profile_id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <PersonAvatar name={name(p.profile_id)} colour={colour(p.profile_id)} size={26} />
                      <span>{p.profile_id === me?.id ? t('{name} (you)', { name: name(p.profile_id) }) : name(p.profile_id)}</span>
                    </Stack>
                  </TableCell>
                  <TableCell>{pinCell(p.profile_id, p.set)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {showButton(p.profile_id, p.set)}
                    <Button size="small" onClick={() => setEditing(p.profile_id)}
                      aria-label={p.set ? t('Change the PIN for {name}', { name: name(p.profile_id) }) : t('Add the PIN for {name}', { name: name(p.profile_id) })}>
                      {p.set ? t('Change') : t('Add')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : people.map(p => (
        <Card key={p.profile_id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', maxWidth: 480 }}>
          <Typography sx={{ fontSize: '1.4rem', flexGrow: 1 }}>{pinCell(p.profile_id, p.set)}</Typography>
          {p.set ? showButton(p.profile_id, p.set) : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Ask an owner to add it.')}</Typography>}
        </Card>
      ))}
      {editing && (
        <PinDialog name={name(editing)} saved={!!people.find(p => p.profile_id === editing)?.set} onClose={() => setEditing(null)}
          onSave={async pin => { await api.saveSquarePin(editing, pin); hide(editing); await data.reload(); setEditing(null) }} />
      )}
    </Box>
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
