import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, toEnter } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { today } from '../../shared/time'
import {
  ALLERGENS, allergenLabel, dishAllergens, suitability, variantChanges,
  type Allergen, type ItemAllergens, type Suitability,
} from '../../shared/allergens'
import { tokens } from '../theme'
import { msg, t } from '../i18n'

const names = (list: Allergen[]) => ALLERGENS.filter(a => list.includes(a.id)).map(a => t(allergenLabel(a.id))).join(', ')
const SUIT: Record<Suitability, { label: string; fg: string; bg: string }> = {
  safe: { label: msg('None of them'), fg: tokens.goodFg, bg: tokens.goodBg },
  may: { label: msg('May contain traces'), fg: tokens.warnFg, bg: tokens.warnBg },
  contains: { label: msg('Contains them'), fg: tokens.badFg, bg: tokens.badBg },
  unknown: { label: msg('Not known yet'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}

/**
 * Allergens (Stock): the 14 allergens the law says customers must be told about, for everything on
 * the menu: worked out from what goes in each item (Menu costing) and what each stock item contains
 * or may contain. Anyone serving picks what a customer can't have and sees what suits them. The
 * whole team reads it; admins enter each item's allergens (the database enforces it too).
 */
export function AllergensPage() {
  const { api, isAdmin, isPartner } = useApp()
  const menu = useAsync('menu-allergens', () => api.menuAllergens(), [])
  const [avoid, setAvoid] = useState<Allergen[]>([])
  const [editing, setEditing] = useState<ItemAllergens | null>(null)
  const canEdit = isAdmin && !isPartner

  const dishes = menu.data?.dishes ?? []
  const items = menu.data?.items ?? []
  const rows = dishes.map(d => ({ dish: d, has: dishAllergens(d, items), variants: variantChanges(d, items) }))
  const unknownItems = items.filter(i => i.allergens === null)
  const complete = rows.filter(r => !r.has.unknown.length).length
  const toggle = (a: Allergen) => setAvoid(x => (x.includes(a) ? x.filter(y => y !== a) : [...x, a]))
  const suits = avoid.length ? rows.filter(r => suitability(r.has, avoid) === 'safe').length : null

  const table = (): ExportTable => ({
    title: t('Allergens on the menu'), filename: `allergens-${today()}`,
    columns: [t('Menu item'), ...ALLERGENS.map(a => t(a.label))],
    rows: rows.flatMap(r => [
      [r.dish.name, ...ALLERGENS.map(a => (r.has.contains.includes(a.id) ? '●' : r.has.mayContain.includes(a.id) ? '○' : r.has.unknown.length ? '?' : ''))],
      ...r.variants.map(v => {
        const own = dishAllergens(r.dish, items, v.id)
        return [`  ${r.dish.name}: ${v.name}`, ...ALLERGENS.map(a => (own.contains.includes(a.id) ? '●' : own.mayContain.includes(a.id) ? '○' : own.unknown.length ? '?' : ''))]
      }),
    ]),
    footer: [t('● contains · ○ may contain traces · ? not known yet'), ...ALLERGENS.map(() => '')],
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Allergens')} actions={<ExportButton table={table} disabled={!rows.length} folder="Allergens" />} />
      <ErrorBox error={menu.error} />

      <StatGrid>
        <StatTile label={t('On the menu')} value={menu.data ? rows.length : '–'} note={t('From Menu costing')} />
        <StatTile label={t('Fully known')} value={complete} note={t('Every item in them has its allergens')} />
        <StatTile label={t('Items to enter')} value={unknownItems.length} note={unknownItems.length ? unknownItems.map(i => i.name).join(', ') : t('None')} />
        <StatTile label={t('Suits them')} value={suits === null ? '–' : suits} note={avoid.length ? t('Without {list}', { list: names(avoid) }) : t('Pick what they can’t have')} />
      </StatGrid>

      {unknownItems.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('Not entered yet: {list}. Until they are, the menu items with them show as not known.', { list: unknownItems.map(i => i.name).join(', ') })}
        </Alert>
      )}

      <Card component="section" aria-label={t('What can they have?')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={avoid.length ? <Button size="small" onClick={() => setAvoid([])}>{t('Clear')}</Button> : undefined}>{t('What can they have?')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('Pick what the customer can’t have: each menu item says whether it suits them.')}</Typography>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }} role="group" aria-label={t('They can’t have')}>
            {ALLERGENS.map(a => (
              <Chip key={a.id} label={t(a.label)} title={t(a.hint)} onClick={() => toggle(a.id)} aria-pressed={avoid.includes(a.id)}
                color={avoid.includes(a.id) ? 'primary' : 'default'} variant={avoid.includes(a.id) ? 'filled' : 'outlined'} />
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('The menu')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('The menu')}</SectionTitle>
          {rows.length === 0
            ? <Empty>{menu.data ? t('Nothing on the menu yet: menu items and what goes in them are added on Menu costing.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Menu item')}</TableCell><TableCell>{t('Contains')}</TableCell><TableCell>{t('May contain')}</TableCell>
                    {avoid.length > 0 && <TableCell>{t('For them')}</TableCell>}
                  </TableRow></TableHead>
                  <TableBody>
                    {rows.map(({ dish, has, variants }) => {
                      const s = suitability(has, avoid)
                      return (
                        <TableRow key={dish.id} hover>
                          <TableCell sx={{ minWidth: 180 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{dish.name}</Typography>
                            {dish.category && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t(dish.category)}</Typography>}
                            {variants.map(v => (
                              <Typography key={v.id} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                {t('{variant}: {changes}', { variant: v.name, changes: [v.adds.length ? t('adds {list}', { list: names(v.adds) }) : '',
                                  v.removes.length ? t('without {list}', { list: names(v.removes) }) : ''].filter(Boolean).join(', ') })}
                              </Typography>
                            ))}
                          </TableCell>
                          <TableCell sx={has.unknown.length ? toEnter : undefined}>
                            {has.contains.length ? names(has.contains) : has.unknown.length ? '' : t('None of the 14')}
                            {has.unknown.length > 0 && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Not known yet: {list}', { list: has.unknown.join(', ') })}</Typography>}
                          </TableCell>
                          <TableCell>{names(has.mayContain)}</TableCell>
                          {avoid.length > 0 && <TableCell><Tag fg={SUIT[s].fg} bg={SUIT[s].bg}>{t(SUIT[s].label)}</Tag></TableCell>}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('Customers must be able to see this for everything served, packaged or not. Export it to print for the counter.')}
          </Typography>
        </CardContent>
      </Card>

      {canEdit && (
        <Card component="section" aria-label={t('Ingredients')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Ingredients')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {t('The stock items in the menu, from the label or the supplier’s sheet. What goes in each menu item is on Menu costing.')}{' '}
              <RouterLink to="/recipes">{t('Open Menu costing')}</RouterLink>
            </Typography>
            {items.length === 0 ? <Empty>{t('No ingredients in the menu yet.')}</Empty>
              : <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell>{t('Item')}</TableCell><TableCell>{t('Contains')}</TableCell><TableCell>{t('May contain')}</TableCell><TableCell />
                    </TableRow></TableHead>
                    <TableBody>
                      {items.map(i => (
                        <TableRow key={i.id} hover>
                          <TableCell sx={{ minWidth: 180 }}>{i.name}</TableCell>
                          <TableCell sx={i.allergens === null ? toEnter : undefined}>{i.allergens === null ? t('To enter') : i.allergens.length ? names(i.allergens) : t('None of the 14')}</TableCell>
                          <TableCell>{names(i.may_contain)}</TableCell>
                          <TableCell align="right">
                            <IconButton size="small" aria-label={t('Allergens of {name}', { name: i.name })} onClick={() => setEditing(i)}><EditIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>}
          </CardContent>
        </Card>
      )}

      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** One item's allergens: what it contains (or none of the 14), and what it may contain traces of. */
function ItemDialog({ item, onClose }: { item: ItemAllergens; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [has, setHas] = useState<Allergen[]>(item.allergens ?? [])
  const [may, setMay] = useState<Allergen[]>(item.may_contain)
  const [known, setKnown] = useState(item.allergens !== null)
  const flip = (list: Allergen[], a: Allergen, on: boolean) => (on ? [...list, a] : list.filter(x => x !== a))
  const save = async () => {
    if (await run(() => api.saveItemAllergens(item.id, known ? has : null, may.filter(a => !has.includes(a))), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="allergens-title">
      <DialogTitle id="allergens-title">{t('Allergens of {name}', { name: item.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControlLabel control={<Switch checked={known} onChange={e => setKnown(e.target.checked)} />} label={t('Its allergens are known (from the label or the supplier)')} />
          <Table size="small" aria-label={t('Allergens')}>
            <TableHead><TableRow>
              <TableCell>{t('Allergen')}</TableCell><TableCell align="center">{t('Contains')}</TableCell><TableCell align="center">{t('May contain')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {ALLERGENS.map(a => (
                <TableRow key={a.id}>
                  <TableCell>
                    {t(a.label)}
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t(a.hint)}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox checked={has.includes(a.id)} disabled={!known} onChange={e => setHas(x => flip(x, a.id, e.target.checked))}
                      slotProps={{ input: { 'aria-label': t('Contains {name}', { name: t(a.label) }) } }} />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox checked={may.includes(a.id) && !has.includes(a.id)} disabled={has.includes(a.id)} onChange={e => setMay(x => flip(x, a.id, e.target.checked))}
                      slotProps={{ input: { 'aria-label': t('May contain {name}', { name: t(a.label) }) } }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {known && !has.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Saved like this, it contains none of the 14.')}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
