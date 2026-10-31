import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Radio,
  RadioGroup, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import ClockIcon from '@mui/icons-material/ScheduleOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle, Tag } from '../components/common'
import { LEAD_TIMES, lastDayPrice, lastDayRuleProblem, newLastDayRule, type LastDayRule, type LastDayRuleInput } from '../../shared/lastDayOffers'
import { CATEGORIES, type StockItem } from '../../shared/stock'
import type { Screen } from '../../shared/screens'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** "2 hours before closing", or "45 minutes before closing" for one not on the list. */
export const leadText = (minutes: number) => {
  const known = LEAD_TIMES.find(l => l.minutes === minutes)
  return known ? t(known.label) : tn(minutes, '{n} minute before closing', '{n} minutes before closing')
}
/** What it takes off: "30% off" or "2 for €3". */
export const discountText = (r: Pick<LastDayRule, 'discount' | 'percent_off' | 'price'>) =>
  (r.discount === 'percent' ? t('{n}% off', { n: r.percent_off }) : r.price ?? '')

/**
 * Last-day offers (Offers & specials, admins): the rules that put stock on its last day to sell on
 * offer by itself, from a time before closing until closing, on the screens picked.
 */
export function LastDayRules({ screens }: { screens: Screen[] }) {
  const { api } = useApp()
  const run = useAction()
  const rules = useAsync('last-day-rules', () => api.lastDayRules(), [])
  const stock = useAsync('stock', () => api.stockItems(), [])
  const [editing, setEditing] = useState<LastDayRuleInput | null>(null)
  const items = (stock.data ?? []).filter(i => i.active)
  const list = rules.data ?? []

  const toggle = (r: LastDayRule) => run(async () => {
    await api.saveLastDayRule({ ...r, active: !r.active })
    await rules.reload()
  }, r.active ? t('{name} is switched off', { name: r.name }) : t('{name} is switched on', { name: r.name }))
  const what = (r: LastDayRule) => {
    const names = [...r.categories.map(c => t(c)), ...r.item_ids.map(id => items.find(i => i.id === id)?.name).filter((x): x is string => !!x)]
    return names.length ? names.join(', ') : t('Everything with a use-by')
  }
  const where = (r: LastDayRule) => (r.screen_ids.length
    ? screens.filter(s => r.screen_ids.includes(s.id)).map(s => s.name).join(', ') || t('Not on a screen')
    : t('Every screen'))

  return (
    <Box component="section" aria-label={t('Last-day offers')} sx={{ mb: 3 }}>
      <SectionTitle action={<Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ ...newLastDayRule(), name: '', sort: list.length })}>{t('Add a rule')}</Button>}>
        {t('Last-day offers')}
      </SectionTitle>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, maxWidth: 820 }}>
        {t('Stock on its last day to sell (its use-by on Stock) goes on offer by itself: from the time you pick until closing, on your screens, with the usual price crossed out. You can stop it like any offer. Nothing is charged or changed in Square: ring it up at the offer price.')}
      </Typography>
      <Stack spacing={1.5}>
        {list.map(r => (
          <Card key={r.id} component="article" aria-label={r.name} variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Typography component="h3" sx={{ fontWeight: 600 }}>{r.name}</Typography>
                  <Typography sx={{ fontWeight: 600, color: tokens.roseDeep }}>{discountText(r)}</Typography>
                  {!r.active && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Switched off')}</Tag>}
                </Stack>
                <Typography variant="body2">{what(r)}</Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                  <ClockIcon sx={{ fontSize: 16 }} />
                  <Typography variant="body2">
                    {t('From {when} until closing · {screens}', { when: leadText(r.minutes_before_close), screens: where(r) })}
                    {r.story ? ` · ${t('story suggested')}` : ''}
                  </Typography>
                </Stack>
              </Box>
              <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
                <FormControlLabel control={<Switch checked={r.active} onChange={() => void toggle(r)} />} label={r.active ? t('On') : t('Off')}
                  slotProps={{ typography: { variant: 'body2' } }} aria-label={t('{name} on or off', { name: r.name })} />
                <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing({ ...r })}>{t('Edit')}</Button>
              </Stack>
            </Stack>
          </Card>
        ))}
        {rules.data && !list.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No rules yet. Add one, e.g. today’s bakes at 30% off from two hours before closing.')}</Typography>
        )}
      </Stack>
      {editing && <RuleDialog rule={editing} screens={screens} items={items} onClose={() => setEditing(null)} onSaved={async () => { await rules.reload(); setEditing(null) }} />}
    </Box>
  )
}

function RuleDialog({ rule, screens, items, onClose, onSaved }: {
  rule: LastDayRuleInput; screens: Screen[]; items: StockItem[]; onClose: () => void; onSaved: () => Promise<void>
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [r, setR] = useState<LastDayRuleInput>(rule)
  const [deleting, setDeleting] = useState(false)
  const set = (patch: Partial<LastDayRuleInput>) => setR(x => ({ ...x, ...patch }))
  const problem = lastDayRuleProblem(r)
  const categories = [...new Set([...CATEGORIES, ...items.map(i => i.category).filter((c): c is string => !!c), ...r.categories])]
  const sample = items.find(i => i.sell_price !== null && (r.item_ids.includes(i.id) || (!!i.category && r.categories.includes(i.category))))
  const shown = sample && !problem ? lastDayPrice(r, sample.sell_price) : null

  const save = () => run(async () => {
    if (problem) throw new Error(t(problem))
    await api.saveLastDayRule(r)
    await onSaved()
  }, t('Saved. Items on their last day go on offer by themselves.'))
  const remove = () => run(async () => {
    await api.deleteLastDayRule(r.id!)
    await onSaved()
  }, t('Deleted {name}', { name: r.name }))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{r.id ? t('Edit the rule') : t('New last-day rule')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <TextField autoFocus={!r.id} label={t('Name')} placeholder={t('e.g. Today’s bakes')} value={r.name} onChange={e => set({ name: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 60 } }} />

          <Box role="group" aria-label={t('Which items')}>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Which items')}</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
              {categories.map(c => (
                <FormControlLabel key={c} label={t(c)} control={<Checkbox size="small" checked={r.categories.includes(c)}
                  onChange={e => set({ categories: e.target.checked ? [...r.categories, c] : r.categories.filter(x => x !== c) })} />} />
              ))}
            </Stack>
            <Autocomplete multiple size="small" options={items} getOptionLabel={o => o.name} isOptionEqualToValue={(a, b) => a.id === b.id}
              value={items.filter(i => r.item_ids.includes(i.id))} onChange={(_, v) => set({ item_ids: v.map(i => i.id) })}
              renderInput={p => <TextField {...p} label={t('And these items (optional)')} />} sx={{ mt: 1 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              {t('Only items with a use-by (Stock → the item → Sells for) are ever on their last day. Nothing picked: all of them.')}
            </Typography>
          </Box>

          <Box role="group" aria-label={t('The offer')}>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('The offer')}</Typography>
            <ToggleButtonGroup exclusive size="small" value={r.discount} onChange={(_, v: LastDayRule['discount'] | null) => v && set({ discount: v })}
              aria-label={t('The offer')} sx={{ mb: 1.5, display: 'flex' }}>
              <ToggleButton value="percent" sx={{ textTransform: 'none' }}>{t('A % off')}</ToggleButton>
              <ToggleButton value="price" sx={{ textTransform: 'none' }}>{t('A set price')}</ToggleButton>
            </ToggleButtonGroup>
            {r.discount === 'percent' ? (
              <TextField label={t('Off the usual price')} value={r.percent_off} onChange={e => set({ percent_off: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                inputMode="numeric" sx={{ maxWidth: 200 }} slotProps={{ input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
            ) : (
              <TextField label={t('Offer price')} placeholder={t('e.g. 2 for €3')} value={r.price ?? ''} onChange={e => set({ price: e.target.value || null })}
                slotProps={{ htmlInput: { maxLength: 40 } }} sx={{ maxWidth: 260 }} />
            )}
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
              {shown ? t('{item}: {price} instead of {was}', { item: sample!.name, price: shown.price, was: shown.was_price ?? '—' })
                : t('The usual price is the item’s price on Stock, shown crossed out.')}
            </Typography>
          </Box>

          <TextField select label={t('From')} value={r.minutes_before_close} onChange={e => set({ minutes_before_close: Number(e.target.value) })} sx={{ maxWidth: 320 }}
            helperText={t('Until closing, by the opening hours. Not on a day you’re closed.')}>
            {[...new Set([...LEAD_TIMES.map(l => l.minutes), r.minutes_before_close])].sort((a, b) => a - b).map(m => <MenuItem key={m} value={m}>{leadText(m)}</MenuItem>)}
          </TextField>

          <Box role="group" aria-label={t('Screens')}>
            <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Screens')}</Typography>
            {screens.length ? <>
              <FormControlLabel label={t('Every screen that’s on')} control={<Checkbox checked={!r.screen_ids.length}
                onChange={e => set({ screen_ids: e.target.checked ? [] : screens.filter(s => s.active).map(s => s.id).slice(0, 1) })} />} />
              {!!r.screen_ids.length && (
                <Stack sx={{ ml: 3 }}>
                  {screens.map(s => (
                    <FormControlLabel key={s.id} label={s.active ? s.name : `${s.name} (${t('switched off')})`}
                      control={<Checkbox size="small" checked={r.screen_ids.includes(s.id)}
                        onChange={e => set({ screen_ids: e.target.checked ? [...r.screen_ids, s.id] : r.screen_ids.filter(x => x !== s.id) })} />} />
                  ))}
                </Stack>
              )}
              <RadioGroup value={r.screen_mode} onChange={e => set({ screen_mode: e.target.value as LastDayRule['screen_mode'] })} aria-label={t('How it shows')}>
                <FormControlLabel value="turns" control={<Radio size="small" />} label={t('In turn with the screen’s other slides')} />
                <FormControlLabel value="only" control={<Radio size="small" />} label={t('On its own: the screen shows only this offer until it ends')} />
              </RadioGroup>
            </> : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('No screens yet.')} <Button size="small" component={RouterLink} to="/screens">{t('Add one on Screens')}</Button>
              </Typography>
            )}
          </Box>

          <FormControlLabel control={<Checkbox checked={r.story} onChange={e => set({ story: e.target.checked })} />}
            label={t('Suggest its Instagram story: the bell links to the story, ready to post')} />
          <FormControlLabel control={<Switch checked={r.active} onChange={e => set({ active: e.target.checked })} />}
            label={r.active ? t('Switched on') : t('Switched off')} />
          <Alert severity="info" variant="outlined">{t('Nothing is charged or changed in Square. The team rings it up at the offer price.')}</Alert>
        </Stack>
        {problem && (r.name.trim() || problem !== 'Give the rule a name') && <Alert severity="warning" sx={{ mt: 2 }}>{t(problem)}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        {r.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Delete {name}?', { name: r.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
