import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import BlockIcon from '@mui/icons-material/DoNotDisturbAltOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle } from '../components/common'
import { EditRow, TwoLanguageDialog } from '../components/TwoLanguageList'
import { itemText } from '../../shared/checklists'
import {
  VALUE_TEXT_MAX, valueProblem, valuesOf, type CompanyValue, type CompanyValueInput, type ValueKind, type ValueNode,
} from '../../shared/companyValues'
import { fonts, tokens } from '../theme'
import { t, tn, useLanguage } from '../i18n'

/**
 * Company values: what the business stands for and how the team behaves, and the words nobody says in the
 * café, in the language each person uses the app in. The whole team reads them; admins change them (each
 * in English and Spanish, a value's points, the order).
 */
export function CompanyValuesPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const lang = useLanguage()
  const data = useAsync('company-values', () => api.companyValues(), [])
  const items = data.data ?? []
  const values = valuesOf(items, 'value')
  const words = valuesOf(items, 'word')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CompanyValueInput | null>(null)
  const [removing, setRemoving] = useState<ValueNode | null>(null)
  const text = (v: Pick<CompanyValue, 'text_en' | 'text_es'>) => itemText(v, lang)
  const nextSort = (siblings: CompanyValue[]) => siblings.reduce((m, x) => Math.max(m, x.sort + 1), 1)
  /** Swap one with the one above or below it. */
  const move = (siblings: CompanyValue[], i: number, by: -1 | 1) => {
    const order = [...siblings]
    ;[order[i], order[i + by]] = [order[i + by], order[i]]
    void run(() => api.orderCompanyValues(order.map(x => x.id)))
  }
  const remove = (n: ValueNode) => run(() => api.deleteCompanyValue(n.item.id), t('Removed'))
  const add = (kind: ValueKind, siblings: CompanyValue[], parent_id: string | null = null) => setForm({ kind, parent_id, sort: nextSort(siblings) })
  const editRow = (v: CompanyValue, siblings: CompanyValue[], i: number, points?: CompanyValue[]) => (
    <EditRow item={v} lang={lang} small={!!v.parent_id} first={i === 0} last={i === siblings.length - 1}
      onUp={() => move(siblings, i, -1)} onDown={() => move(siblings, i, 1)} onEdit={() => setForm(v)}
      onRemove={() => (points?.length ? setRemoving({ item: v, points }) : void remove({ item: v, points: [] }))}
      add={points && { tooltip: t('Add a point'), label: t('Add a point to “{text}”', { text: text(v) }), onClick: () => add('value', points, v.id) }} />
  )
  const parent = form?.parent_id ? items.find(i => i.id === form.parent_id) : undefined
  const formTitle = form?.id ? t('Change it') : parent ? t('Add a point to “{text}”', { text: text(parent) }) : form?.kind === 'word' ? t('Add a word') : t('Add a value')

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Company values')} actions={isAdmin && (
        <Button variant={editing ? 'contained' : 'outlined'} startIcon={editing ? undefined : <EditIcon />} onClick={() => setEditing(!editing)}>
          {editing ? t('Done') : t('Change the values')}
        </Button>
      )} />
      <ErrorBox error={data.error} />

      <Card component="section" aria-label={t('Our values')} sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '8px !important' }}>
          <SectionTitle>{t('Our values')}</SectionTitle>
          {data.data && !values.length && <Empty>{t('No values written yet.')}</Empty>}
          <Box component="ol" aria-label={t('Our values')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {values.map((n, i) => (
              <Box component="li" key={n.item.id} aria-label={text(n.item)} sx={{ borderTop: i ? `1px solid ${tokens.line}` : 0 }}>
                {editing ? editRow(n.item, values.map(x => x.item), i, n.points) : (
                  <Stack direction="row" spacing={1.75} sx={{ py: 1.5, alignItems: 'flex-start' }}>
                    <Box aria-hidden sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: tokens.roseSoft, color: tokens.roseDeep, flexShrink: 0,
                      display: 'grid', placeItems: 'center', fontFamily: fonts.display, fontSize: '0.95rem' }}>{i + 1}</Box>
                    <Box sx={{ minWidth: 0, pt: 0.4 }}>
                      <Typography sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{text(n.item)}</Typography>
                      {n.points.length > 0 && (
                        <Box component="ul" aria-label={t('Points')} sx={{ m: 0, mt: 0.5, pl: 2.25, color: 'text.secondary' }}>
                          {n.points.map(p => <Typography component="li" key={p.id} variant="body2" sx={{ wordBreak: 'break-word' }}>{text(p)}</Typography>)}
                        </Box>
                      )}
                    </Box>
                  </Stack>
                )}
                {editing && n.points.length > 0 && (
                  <Box sx={{ pl: { xs: 3.5, sm: 5 }, pb: 0.5 }}>
                    {n.points.map((p, j) => <Box key={p.id} aria-label={text(p)}>{editRow(p, n.points, j)}</Box>)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
          {isAdmin && (
            <Box sx={{ pt: 1, borderTop: values.length ? `1px solid ${tokens.line}` : 0 }}>
              <Button startIcon={<AddIcon />} onClick={() => add('value', values.map(x => x.item))}>{t('Add a value')}</Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Words we don’t say')} sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '8px !important' }}>
          <SectionTitle>{t('Words we don’t say')}</SectionTitle>
          {data.data && !words.length && <Empty>{t('No words here yet.')}</Empty>}
          {editing ? (
            <Box>{words.map((n, i) => <Box key={n.item.id} aria-label={text(n.item)} sx={{ borderTop: i ? `1px solid ${tokens.line}` : 0 }}>{editRow(n.item, words.map(x => x.item), i)}</Box>)}</Box>
          ) : words.length > 0 && (
            <Stack direction="row" role="list" aria-label={t('Words we don’t say')} sx={{ gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {words.map(n => (
                <Chip key={n.item.id} role="listitem" label={text(n.item)} icon={<BlockIcon />} variant="outlined"
                  sx={{ color: tokens.badFg, borderColor: tokens.badFg, bgcolor: tokens.badBg, fontWeight: 500, '& .MuiChip-icon': { color: tokens.badFg } }} />
              ))}
            </Stack>
          )}
          {isAdmin && (
            <Box sx={{ pt: 1, borderTop: editing && words.length ? `1px solid ${tokens.line}` : 0 }}>
              <Button startIcon={<AddIcon />} onClick={() => add('word', words.map(x => x.item))}>{t('Add a word')}</Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {form && (
        <TwoLanguageDialog title={formTitle} item={{ text_en: form.text_en ?? null, text_es: form.text_es ?? null }} lang={lang} max={VALUE_TEXT_MAX}
          isNew={!form.id} problem={valueProblem} onClose={() => setForm(null)}
          save={w => run(() => api.saveCompanyValue({ ...form, ...w }), form.id ? t('Saved') : t('Added'))} />
      )}
      {removing && (
        <Dialog open onClose={() => setRemoving(null)} fullWidth maxWidth="xs" aria-labelledby="remove-value-title">
          <DialogTitle id="remove-value-title">{t('Remove “{text}”?', { text: text(removing.item) })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{tn(removing.points.length, 'Its point goes too.', 'Its {n} points go too.')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoving(null)}>{t('Cancel')}</Button>
            <Button variant="contained" color="error" onClick={() => { const n = removing; setRemoving(null); void remove(n) }}>{t('Remove')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}
