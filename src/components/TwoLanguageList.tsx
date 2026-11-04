// Lists written in English and Spanish that admins change (Daily checklists, Company values): a row as
// it's changed (both languages, move up and down, change, remove, add something under it) and the
// dialog that writes it. Each person reads the list in the language they use the app in.
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import { useState } from 'react'
import { useNotify } from '../app/Notify'
import { itemText } from '../../shared/checklists'
import { tokens } from '../theme'
import { t, type Language } from '../i18n'

interface Words { text_en: string | null; text_es: string | null }

/** A row as an admin changes it: its words in both languages, its place, and what goes under it. */
export function EditRow({ item, lang, small, first, last, onUp, onDown, onEdit, onRemove, add }: {
  item: Words; lang: Language; small?: boolean; first: boolean; last: boolean
  onUp: () => void; onDown: () => void; onEdit: () => void; onRemove: () => void
  /** Something to add under it: the button's tooltip and its name for screen readers. */
  add?: { tooltip: string; label: string; onClick: () => void }
}) {
  const other = lang === 'es' ? item.text_en : item.text_es
  const text = itemText(item, lang)
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography variant={small ? 'body2' : 'body1'} sx={{ wordBreak: 'break-word' }}>{text}</Typography>
        <Typography variant="caption" sx={{ color: other ? 'text.secondary' : tokens.warnFg, display: 'block' }}>
          {other ?? (lang === 'es' ? t('No English yet') : t('No Spanish yet'))}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ flexShrink: 0 }}>
        {add && <Tooltip title={add.tooltip}><IconButton size="small" aria-label={add.label} onClick={add.onClick}><AddIcon fontSize="small" /></IconButton></Tooltip>}
        <Tooltip title={t('Move up')}><span><IconButton size="small" aria-label={t('Move “{text}” up', { text })} disabled={first} onClick={onUp}><UpIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('Move down')}><span><IconButton size="small" aria-label={t('Move “{text}” down', { text })} disabled={last} onClick={onDown}><DownIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('Change')}><IconButton size="small" aria-label={t('Change “{text}”', { text })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title={t('Remove')}><IconButton size="small" aria-label={t('Remove “{text}”', { text })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Stack>
  )
}

/**
 * Write something new, or change it, in English and Spanish (the person's own language first). `save`
 * keeps it (true once it's kept); `problem` says what's wrong first, as the database would.
 */
export function TwoLanguageDialog({ title, item, lang, max, isNew, problem, save, onClose }: {
  title: string; item: Words; lang: Language; max: number; isNew: boolean
  problem: (w: Words) => string | null; save: (w: Words) => Promise<boolean>; onClose: () => void
}) {
  const notify = useNotify()
  const [en, setEn] = useState(item.text_en ?? '')
  const [es, setEs] = useState(item.text_es ?? '')
  const keep = async () => {
    const words = { text_en: en.trim() || null, text_es: es.trim() || null }
    const wrong = problem(words)
    if (wrong) return notify(t(wrong), 'error')
    if (await save(words)) onClose()
  }
  const field = { multiline: true, maxRows: 4, slotProps: { htmlInput: { maxLength: max } } }
  const fields = [
    <TextField key="en" label={t('In English')} value={en} onChange={e => setEn(e.target.value)} autoFocus={lang === 'en'} {...field} />,
    <TextField key="es" label={t('In Spanish')} value={es} onChange={e => setEs(e.target.value)} autoFocus={lang === 'es'} {...field} />,
  ]
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {lang === 'es' ? fields.reverse() : fields}
          <Typography variant="body2" color="text.secondary">{t('Everyone reads it in the language they use the app in. Leave one blank and they see the other.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!en.trim() && !es.trim()} onClick={() => void keep()}>{isNew ? t('Add') : t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
