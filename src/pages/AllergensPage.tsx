import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  FormLabel, IconButton, InputAdornment, Radio, RadioGroup, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import AutoIcon from '@mui/icons-material/AutoFixHighOutlined'
import SearchIcon from '@mui/icons-material/Search'
import MoreIcon from '@mui/icons-material/ExpandMore'
import LessIcon from '@mui/icons-material/ExpandLess'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { ExportButton, toEnter } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { today } from '../../shared/time'
import {
  ALLERGENS, DIETS, MENU_FILTERS, OTHER_ALLERGENS, allergenLabel, asked, bestServing, dietLabel, dietsFor, dishAllergens, tagsOf, variantChanges,
  type Allergen, type Diet, type DishAllergens, type ItemAllergens, type MenuFilter, type Suitability,
} from '../../shared/allergens'
import { isFoodItem, suggestAllergens, type AllergenSuggestion } from '../../shared/allergenGuide'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const names = (list: Allergen[]) => ALLERGENS.filter(a => list.includes(a.id)).map(a => t(allergenLabel(a.id))).join(', ')
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const filterLabel = (f: MenuFilter) => MENU_FILTERS.find(x => x.id === f)!.label
/** A menu item that only might suit what's picked says why. */
const UNSURE: Partial<Record<Suitability, { label: string; fg: string; bg: string }>> = {
  may: { label: msg('May contain traces'), fg: tokens.warnFg, bg: tokens.warnBg },
  unknown: { label: msg('Not known yet'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const ORDER: Suitability[] = ['safe', 'may', 'unknown', 'contains']
const dietOf = (d: DishAllergens) => (d.vegan ? t('Vegan') : d.vegetarian ? t('Vegetarian') : '')

/**
 * Allergens (Stock): the menu, each item tagged with what it suits (vegan, gluten free…) and the 14
 * allergens it contains or may contain, worked out from what goes in it (Menu costing) and what each
 * stock item contains and is. Anyone serving taps what a customer needs and sees only what suits
 * them, a variant included (a flat white with oat milk). The whole team reads it; admins enter each
 * item's allergens and whether it's vegan or vegetarian (the database enforces it too).
 */
export function AllergensPage() {
  const { api, isAdmin, isPartner } = useApp()
  const menu = useAsync('menu-allergens', () => api.menuAllergens(), [])
  const [filters, setFilters] = useState<MenuFilter[]>([])
  const [without, setWithout] = useState<Allergen[]>([])
  const [more, setMore] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ItemAllergens | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [toEnterOnly, setToEnterOnly] = useState(false)
  const canEdit = isAdmin && !isPartner
  // Admins: every food and drink in stock, not just what's in the menu yet, so it's all tagged by the time it is.
  const stock = useAsync('stock', () => api.stockItems(), [])

  const dishes = menu.data?.dishes ?? []
  const items = menu.data?.items ?? []
  const { avoid, diets } = asked(filters, without)
  const filtering = avoid.length > 0 || diets.length > 0
  const rows = dishes.map(d => {
    const has = dishAllergens(d, items)
    return { dish: d, has, tags: tagsOf(has), variants: variantChanges(d, items), fit: filtering ? bestServing(d, items, avoid, diets) : null }
  })
  const categories = [...new Set(dishes.map(d => d.category ?? ''))]
  const words = fold(q.trim())
  const shown = rows.filter(r => (category === null || (r.dish.category ?? '') === category)
    && (!words || fold(`${r.dish.name} ${r.dish.category ?? ''}`).includes(words)) && r.fit?.suits !== 'contains')
  // Each category in the menu's order; while filtering, what suits them for sure first.
  const groups = categories.map(c => ({ category: c, rows: shown.filter(r => (r.dish.category ?? '') === c)
    .sort((a, b) => ORDER.indexOf(a.fit?.suits ?? 'safe') - ORDER.indexOf(b.fit?.suits ?? 'safe')) })).filter(g => g.rows.length)
  const inMenu = new Set(items.map(i => i.id))
  const food = (stock.data ?? []).filter(i => i.active && !inMenu.has(i.id) && isFoodItem(i))
  const ingredients: ItemAllergens[] = [...items, ...food.map(i => ({ id: i.id, name: i.name, allergens: i.allergens ?? null, may_contain: i.may_contain ?? [], diet: i.diet ?? null }))]
    .sort((a, b) => a.name.localeCompare(b.name))
  const missing = (i: ItemAllergens) => i.allergens === null || i.diet === null
  const categoryOf = new Map((stock.data ?? []).map(i => [i.id, i.category]))
  // What each item still to enter usually has, from its name (the menu's and the rest).
  const suggestions = ingredients.filter(missing)
    .map(i => ({ item: i, usual: suggestAllergens({ name: i.name, category: categoryOf.get(i.id) ?? null }) }))
  const notEntered = items.filter(i => i.allergens === null)
  const noDiet = items.filter(i => i.allergens !== null && i.diet === null)
  const flip = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter(y => y !== x) : [...list, x])
  const clear = () => { setFilters([]); setWithout([]) }

  const mark = (d: DishAllergens, a: Allergen) => (d.contains.includes(a) ? '●' : d.mayContain.includes(a) ? '○' : d.unknown.length ? '?' : '')
  const table = (): ExportTable => ({
    title: t('Allergens on the menu'), filename: `allergens-${today()}`,
    columns: [t('Menu item'), t('Vegan or vegetarian'), ...ALLERGENS.map(a => t(a.label))],
    rows: rows.flatMap(r => [
      [r.dish.name, dietOf(r.has), ...ALLERGENS.map(a => mark(r.has, a.id))],
      ...r.variants.map(v => {
        const own = dishAllergens(r.dish, items, v.id)
        return [`  ${r.dish.name}: ${v.name}`, dietOf(own), ...ALLERGENS.map(a => mark(own, a.id))]
      }),
    ]),
    footer: [t('● contains · ○ may contain traces · ? not known yet'), '', ...ALLERGENS.map(() => '')],
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Allergens')} actions={<ExportButton table={table} disabled={!rows.length} folder="Allergens" />} />
      <ErrorBox error={menu.error} />

      {notEntered.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('Not entered yet: {list}. Until they are, the menu items with them show as not known.', { list: notEntered.map(i => i.name).join(', ') })}
        </Alert>
      )}
      {canEdit && noDiet.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('Vegan or vegetarian not said yet: {list}. Until it is, Vegan and Vegetarian can’t pick out the menu items with them.', { list: noDiet.map(i => i.name).join(', ') })}
        </Alert>
      )}

      <Card component="section" aria-label={t('The menu')} sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
            <TextField size="small" placeholder={t('Search the menu')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 260 } }}
              slotProps={{ htmlInput: { 'aria-label': t('Search the menu') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            {categories.length > 1 && (
              <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }} role="group" aria-label={t('Category')}>
                {[null, ...categories].map(c => (
                  <Chip key={c ?? '*'} size="small" label={c === null ? t('All') : c ? t(c) : t('Other')} onClick={() => setCategory(c)} aria-pressed={category === c}
                    color={category === c ? 'primary' : 'default'} variant={category === c ? 'filled' : 'outlined'} />
                ))}
              </Stack>
            )}
          </Stack>

          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label={t('Show only')}>
            {MENU_FILTERS.map(f => (
              <Chip key={f.id} label={t(f.label)} onClick={() => setFilters(x => flip(x, f.id))} aria-pressed={filters.includes(f.id)}
                color={filters.includes(f.id) ? 'primary' : 'default'} variant={filters.includes(f.id) ? 'filled' : 'outlined'} />
            ))}
            <Button size="small" onClick={() => setMore(x => !x)} endIcon={more ? <LessIcon /> : <MoreIcon />} aria-expanded={more}>
              {without.length ? t('More allergens ({n})', { n: without.length }) : t('More allergens')}
            </Button>
          </Stack>
          <Collapse in={more}>
            <Typography id="also-without" variant="body2" sx={{ color: 'text.secondary', mt: 1.5, mb: 1 }}>{t('Also without')}</Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }} role="group" aria-labelledby="also-without">
              {OTHER_ALLERGENS.map(a => (
                <Chip key={a.id} size="small" label={t(a.label)} title={t(a.hint)} onClick={() => setWithout(x => flip(x, a.id))} aria-pressed={without.includes(a.id)}
                  color={without.includes(a.id) ? 'primary' : 'default'} variant={without.includes(a.id) ? 'filled' : 'outlined'} />
              ))}
            </Stack>
          </Collapse>

          {filtering && (
            <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {tn(shown.length, '{n} of {total} on the menu suits them', '{n} of {total} on the menu suit them', { total: rows.length })}
              </Typography>
              <Button size="small" onClick={clear}>{t('Clear')}</Button>
            </Stack>
          )}

          <Box sx={{ mt: 2.5 }}>
            {rows.length === 0
              ? <Empty>{menu.data ? t('Nothing on the menu yet: menu items and what goes in them are added on Menu costing.') : t('Loading…')}</Empty>
              : groups.length === 0
                ? <Empty>{filtering ? t('Nothing on the menu suits all of that.') : t('Nothing on the menu matches that.')}</Empty>
                : groups.map(g => (
                    <Box key={g.category} sx={{ mb: 2.5, '&:last-child': { mb: 0 } }}>
                      {categories.length > 1 && <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>{g.category ? t(g.category) : t('Other')}</Typography>}
                      <Box component="ul" aria-label={g.category ? t(g.category) : t('Other')}
                        sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                        {g.rows.map(({ dish, has, tags, variants, fit }) => (
                          <Box component="li" key={dish.id} aria-label={dish.name}
                            sx={{ p: 1.75, border: `1px solid ${tokens.line}`, borderRadius: 2.5, bgcolor: 'background.paper', minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                              <Typography sx={{ fontWeight: 600, lineHeight: 1.35 }}>{dish.name}</Typography>
                              <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {fit?.variant && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('With {variant}', { variant: fit.variant })}</Tag>}
                                {fit && UNSURE[fit.suits] && <Tag fg={UNSURE[fit.suits]!.fg} bg={UNSURE[fit.suits]!.bg}>{t(UNSURE[fit.suits]!.label)}</Tag>}
                              </Stack>
                            </Stack>
                            {tags.length > 0 && (
                              <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', mb: 1 }}>
                                {tags.map(f => <Tag key={f} fg={tokens.goodFg} bg={tokens.goodBg}>{t(filterLabel(f))}</Tag>)}
                              </Stack>
                            )}
                            <Typography variant="body2" sx={{ color: has.contains.length ? 'text.primary' : 'text.secondary' }}>
                              {has.empty ? t('Nothing in it on Menu costing yet')
                                : has.contains.length ? t('Contains {list}', { list: names(has.contains) })
                                : has.unknown.length ? '' : t('None of the 14 allergens')}
                            </Typography>
                            {has.mayContain.length > 0 && <Typography variant="body2" sx={{ color: tokens.warnFg }}>{t('May contain traces of {list}', { list: names(has.mayContain) })}</Typography>}
                            {has.unknown.length > 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Not known yet: {list}', { list: has.unknown.join(', ') })}</Typography>}
                            {variants.map(v => (
                              <Typography key={v.id} variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                                {t('{variant}: {changes}', { variant: v.name, changes: [v.adds.length ? t('adds {list}', { list: names(v.adds) }) : '',
                                  v.removes.length ? t('without {list}', { list: names(v.removes) }) : ''].filter(Boolean).join(', ') })}
                              </Typography>
                            ))}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ))}
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2.5 }}>
            {t('Customers must be able to see this for everything served, packaged or not. Export it to print for the counter.')}
          </Typography>
        </CardContent>
      </Card>

      {canEdit && (
        <Card component="section" aria-label={t('Ingredients')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle action={suggestions.some(x => x.usual) && (
              <Button size="small" variant="outlined" startIcon={<AutoIcon />} onClick={() => setSuggesting(true)}>{t('Fill in the usual allergens')}</Button>
            )}>{t('Ingredients')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {t('Every food and drink in stock, from the label or the supplier’s sheet. What goes in each menu item is on Menu costing.')}{' '}
              <RouterLink to="/recipes">{t('Open Menu costing')}</RouterLink>
            </Typography>
            {ingredients.some(missing) && (
              <Chip size="small" sx={{ mb: 1.5 }} label={t('To enter ({n})', { n: ingredients.filter(missing).length })} onClick={() => setToEnterOnly(x => !x)}
                aria-pressed={toEnterOnly} color={toEnterOnly ? 'primary' : 'default'} variant={toEnterOnly ? 'filled' : 'outlined'} />
            )}
            {ingredients.length === 0 ? <Empty>{t('No ingredients in the menu yet.')}</Empty>
              : <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell>{t('Item')}</TableCell><TableCell>{t('Contains')}</TableCell><TableCell>{t('May contain')}</TableCell>
                      <TableCell>{t('Vegan or vegetarian')}</TableCell><TableCell />
                    </TableRow></TableHead>
                    <TableBody>
                      {ingredients.filter(i => !toEnterOnly || missing(i)).map(i => (
                        <TableRow key={i.id} hover>
                          <TableCell sx={{ minWidth: 180 }}>
                            {i.name}
                            {!inMenu.has(i.id) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Not in a menu item yet')}</Typography>}
                          </TableCell>
                          <TableCell sx={i.allergens === null ? toEnter : undefined}>{i.allergens === null ? t('To enter') : i.allergens.length ? names(i.allergens) : t('None of the 14')}</TableCell>
                          <TableCell>{names(i.may_contain)}</TableCell>
                          <TableCell sx={i.diet === null ? toEnter : undefined}>{i.diet === null ? t('To enter') : t(dietLabel(i.diet))}</TableCell>
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
      {suggesting && <SuggestDialog suggestions={suggestions} onClose={() => setSuggesting(false)} />}
    </>
  )
}

/**
 * The usual allergens of every item still to enter, worked out from its name (a croissant is wheat
 * flour, butter and eggs). Ticked ones are saved as they are; each can be changed after, as ever.
 */
function SuggestDialog({ suggestions, onClose }: { suggestions: { item: ItemAllergens; usual: AllergenSuggestion | null }[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const known = suggestions.filter((x): x is { item: ItemAllergens; usual: AllergenSuggestion } => !!x.usual)
  const unknown = suggestions.filter(x => !x.usual)
  const [picked, setPicked] = useState<string[]>(known.map(x => x.item.id))
  const apply = async () => {
    const chosen = known.filter(x => picked.includes(x.item.id))
    const ok = await run(async () => {
      // Each item's own entry where it has one (allergens entered, diet not yet): only what's missing is filled in.
      for (const { item, usual } of chosen) {
        const has = item.allergens ?? usual.contains
        const diet = item.diet ?? (dietsFor(has).includes(usual.diet) ? usual.diet : dietsFor(has)[0])
        await api.saveItemAllergens(item.id, has, item.allergens === null ? usual.may : item.may_contain, diet)
      }
    }, tn(chosen.length, '{n} item filled in', '{n} items filled in'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="suggest-title">
      <DialogTitle id="suggest-title">{t('Fill in the usual allergens')}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('From what each one is usually made of. Recipes differ between makers: check the label or the supplier’s sheet, and change any of them after.')}
        </Alert>
        <Table size="small" aria-label={t('Usual allergens')}>
          <TableHead><TableRow>
            <TableCell padding="checkbox">
              <Checkbox checked={picked.length === known.length} indeterminate={picked.length > 0 && picked.length < known.length}
                onChange={e => setPicked(e.target.checked ? known.map(x => x.item.id) : [])} slotProps={{ input: { 'aria-label': t('All') } }} />
            </TableCell>
            <TableCell>{t('Item')}</TableCell><TableCell>{t('Contains')}</TableCell><TableCell>{t('May contain')}</TableCell><TableCell>{t('Vegan or vegetarian')}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {known.map(({ item, usual }) => (
              <TableRow key={item.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox checked={picked.includes(item.id)} onChange={e => setPicked(x => (e.target.checked ? [...x, item.id] : x.filter(y => y !== item.id)))}
                    slotProps={{ input: { 'aria-label': item.name } }} />
                </TableCell>
                <TableCell>
                  {item.name}
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Usually: {what}', { what: t(usual.usually) })}</Typography>
                </TableCell>
                <TableCell>{item.allergens !== null ? names(item.allergens) || t('None of the 14') : usual.contains.length ? names(usual.contains) : t('None of the 14')}</TableCell>
                <TableCell sx={{ color: tokens.warnFg }}>{names(item.allergens === null ? usual.may : item.may_contain)}</TableCell>
                <TableCell>{t(dietLabel(item.diet ?? usual.diet))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {unknown.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('Nothing to go on for {list}: enter them from the label.', { list: unknown.map(x => x.item.name).join(', ') })}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!picked.length} onClick={() => void apply()}>{tn(picked.length, 'Fill in {n} item', 'Fill in {n} items')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** One item's allergens: what it contains (or none of the 14), what it may contain traces of, and whether it's vegan or vegetarian. */
function ItemDialog({ item, onClose }: { item: ItemAllergens; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [has, setHas] = useState<Allergen[]>(item.allergens ?? [])
  const [may, setMay] = useState<Allergen[]>(item.may_contain)
  const [known, setKnown] = useState(item.allergens !== null)
  const [diet, setDiet] = useState<Diet | null>(item.diet)
  const flip = (list: Allergen[], a: Allergen, on: boolean) => (on ? [...list, a] : list.filter(x => x !== a))
  const fits = dietsFor(known ? has : null)
  // Milk or eggs make it vegetarian at most, fish or shellfish neither.
  const change = (nextHas: Allergen[], nextKnown: boolean) => {
    setHas(nextHas)
    setKnown(nextKnown)
    const ok = dietsFor(nextKnown ? nextHas : null)
    if (diet && !ok.includes(diet)) setDiet(ok[0])
  }
  const save = async () => {
    if (await run(() => api.saveItemAllergens(item.id, known ? has : null, may.filter(a => !has.includes(a)), diet), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="allergens-title">
      <DialogTitle id="allergens-title">{t('Allergens of {name}', { name: item.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControl>
            <FormLabel id="diet-label">{t('Vegan or vegetarian')}</FormLabel>
            <RadioGroup aria-labelledby="diet-label" value={diet ?? ''} onChange={e => setDiet(e.target.value as Diet)}>
              {DIETS.map(d => (
                <FormControlLabel key={d.id} value={d.id} disabled={!fits.includes(d.id)} control={<Radio size="small" />}
                  label={<>{t(d.label)}<Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>{t(d.hint)}</Typography></>} />
              ))}
            </RadioGroup>
          </FormControl>
          <FormControlLabel control={<Switch checked={known} onChange={e => change(has, e.target.checked)} />} label={t('Its allergens are known (from the label or the supplier)')} />
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
                    <Checkbox checked={has.includes(a.id)} disabled={!known} onChange={e => change(flip(has, a.id, e.target.checked), known)}
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
