import {
  Box, Button, ButtonBase, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, InputAdornment,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CopyIcon from '@mui/icons-material/ContentCopy'
import EditIcon from '@mui/icons-material/EditOutlined'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { FEATURES } from '../app/features'
import { ErrorBox, PageHeader, SectionTitle } from '../components/common'
import type { BrandColour } from '../../shared/types'
import { MOODS, MOOD_IDS } from '../../shared/music'
import logoUrl from '../assets/logo.png'
import { formatNumber } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t } from '../i18n'

const ROLES: Record<BrandColour['role'], string> = { primary: msg('Primary'), secondary: msg('Secondary'), accent: msg('Accent'), base: msg('Background') }
const CATEGORIES = ['all', 'sans-serif', 'serif', 'display', 'handwriting', 'monospace'] as const
/** Google's font categories, lower case as Google writes them (capitalised on the filter chips). */
const CATEGORY_NAMES: Record<string, string> = {
  'sans-serif': msg('sans-serif'), serif: msg('serif'), display: msg('display'), handwriting: msg('handwriting'), monospace: msg('monospace'),
}

/** Loads a Google font into the page (once). `text` limits it to those letters for quick previews. */
function useGoogleFont(family: string | null | undefined, text?: string) {
  useEffect(() => {
    if (!family) return
    const id = `gf-${family}-${text ? 'preview' : 'full'}`.replace(/\W+/g, '-')
    if (document.getElementById(id)) return
    const params = `family=${encodeURIComponent(family).replace(/%20/g, '+')}${text ? '' : ':wght@400;600'}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`
    document.head.appendChild(Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${params}` }))
  }, [family, text])
}

/** Readable text colour on a swatch. */
const inkOn = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#2B2522' : '#FFFFFF'
}

/** Images up to 800px, re-encoded as PNG (SVGs are kept as they are). */
async function readLogo(file: File): Promise<string> {
  if (file.size > 5_000_000) throw new Error(t('That file is over 5 MB. Use a smaller logo file.'))
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error(t('Could not read that file'))); r.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml') {
    if (raw.length > 600_000) throw new Error(t('That SVG is too big. Try a simpler or smaller file.'))
    return raw
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(t('That file is not an image we can read'))); i.src = raw
  })
  const scale = Math.min(1, 800 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** The brand guidelines: logo, colours and fonts. Everyone sees them; admins change them. */
export function BrandPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const brand = useAsync('brand', () => api.brand(), [])
  const [editing, setEditing] = useState<{ index: number | null; colour: BrandColour } | null>(null)
  const [picking, setPicking] = useState<'heading_font' | 'body_font' | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const b = brand.data
  useGoogleFont(b?.heading_font)
  useGoogleFont(b?.body_font)
  const save = (patch: Parameters<typeof api.saveBrand>[0], note: string) => run(async () => { await api.saveBrand(patch); await brand.reload() }, note)

  return (
    <>
      <PageHeader eyebrow={t('Café')} title={t('Brand')} />
      <ErrorBox error={brand.error} />
      {b && (
        <Grid container spacing={2.5}>
          {/* The logo on the left, its colours beside it (stacked on phones). */}
          <Grid size={{ xs: 12, md: 5 }}>
            <LogoCard title={t('Logo')} value={b.logo} fallback={logoUrl} canEdit={isAdmin}
              onChange={logo => save({ logo }, logo ? t('Logo updated') : t('Logo removed'))} />
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Card component="section" aria-label={t('Colours')} sx={{ height: '100%' }}>
              <CardContent>
                <SectionTitle action={isAdmin && <Button size="small" startIcon={<AddIcon />}
                  onClick={() => setEditing({ index: null, colour: { name: '', hex: '#F79BA4', role: 'accent' } })}>{t('Add colour')}</Button>}>{t('Colours')}</SectionTitle>
                <Box sx={{ display: 'grid', gap: 1.25 }}>
                  {b.colours.map((c, i) => <Swatch key={`${c.name}-${i}`} colour={c} canEdit={isAdmin} onEdit={() => setEditing({ index: i, colour: c })} />)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={12}>
            <Stack spacing={2.5}>

              <Card component="section" aria-label={t('Fonts')}>
                <CardContent>
                  <SectionTitle>{t('Fonts')}</SectionTitle>
                  <Stack spacing={1.5}>
                    {([['heading_font', t('Headings'), 'Easy Beans Coffee', 600, '2rem'], ['body_font', t('Body text'), t('Specialty coffee, matcha and fresh bakes in San Pedro. Open every day from 8.'), 400, '1.05rem']] as const)
                      .map(([key, label, sample, weight, size]) => (
                        <Box key={key} sx={{ p: 2, borderRadius: '14px', bgcolor: tokens.surfaceAlt }}>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{label} · {b[key]}</Typography>
                            {isAdmin && <Button size="small" onClick={() => setPicking(key)}>{t('Change')}</Button>}
                          </Stack>
                          <Typography sx={{ fontFamily: `"${b[key]}", system-ui, sans-serif`, fontWeight: weight, fontSize: size, lineHeight: 1.3 }}>{sample}</Typography>
                        </Box>
                      ))}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                    {t('All free from Google Fonts:')}{' '}<a href={`https://fonts.google.com/specimen/${b.heading_font.replace(/ /g, '+')}`} target="_blank" rel="noreferrer">{b.heading_font}</a>
                    {' · '}<a href={`https://fonts.google.com/specimen/${b.body_font.replace(/ /g, '+')}`} target="_blank" rel="noreferrer">{b.body_font}</a>
                  </Typography>
                </CardContent>
              </Card>

              {FEATURES.music && <SoundCard moods={b.sound_moods ?? []} avoid={b.sound_avoid ?? []} canEdit={isAdmin} onSave={patch => save(patch, t('Saved'))} />}

              <Card component="section" aria-label={t('How to use the brand')}>
                <CardContent>
                  <SectionTitle action={isAdmin && notes === null && <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setNotes(b.notes ?? '')}>{t('Edit')}</Button>}>{t('How to use it')}</SectionTitle>
                  {notes === null
                    ? <Typography sx={{ whiteSpace: 'pre-wrap', color: b.notes ? 'text.primary' : 'text.secondary' }}>{b.notes || t('No notes yet.')}</Typography>
                    : (
                      <Stack spacing={1}>
                        <TextField multiline minRows={3} value={notes} onChange={e => setNotes(e.target.value)} label={t('Rules for using the brand')} />
                        <Stack direction="row" spacing={1}>
                          <Button variant="contained" onClick={async () => { if (await save({ notes: notes.trim() || null }, t('Saved'))) setNotes(null) }}>{t('Save')}</Button>
                          <Button onClick={() => setNotes(null)}>{t('Cancel')}</Button>
                        </Stack>
                      </Stack>
                    )}
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}
      {editing && b && (
        <ColourDialog value={editing.colour} isNew={editing.index === null} onClose={() => setEditing(null)}
          onRemove={() => { save({ colours: b.colours.filter((_, i) => i !== editing.index) }, t('Colour removed')); setEditing(null) }}
          onSave={async c => {
            const colours = editing.index === null ? [...b.colours, c] : b.colours.map((x, i) => (i === editing.index ? c : x))
            if (await save({ colours }, t('Colour saved'))) setEditing(null)
          }} />
      )}
      {picking && b && (
        <FontPicker current={b[picking]} title={picking === 'heading_font' ? t('Heading font') : t('Body font')} onClose={() => setPicking(null)}
          onPick={async family => { if (await save({ [picking]: family }, picking === 'heading_font' ? t('Heading font: {family}', { family }) : t('Body font: {family}', { family }))) setPicking(null) }} />
      )}
    </>
  )
}

/** At most this many moods in each list (the database's limit too). */
const MAX_SOUND = 5

/**
 * The brand's sound: the moods its music has, and the ones it never has. Music suggestions on
 * stories and reels and AI tracks start from it. Tapping a mood moves it in or out (admins).
 */
function SoundCard({ moods, avoid, canEdit, onSave }: {
  moods: string[]; avoid: string[]; canEdit: boolean; onSave: (patch: { sound_moods?: string[]; sound_avoid?: string[] }) => unknown
}) {
  const notify = useNotify()
  const toggle = (list: 'sound_moods' | 'sound_avoid', mood: string) => {
    const [mine, other] = list === 'sound_moods' ? [moods, avoid] : [avoid, moods]
    if (mine.includes(mood)) return onSave({ [list]: mine.filter(m => m !== mood) })
    if (mine.length >= MAX_SOUND) return notify(t('Up to {n} moods in each list', { n: MAX_SOUND }), 'error')
    // A mood is in one list or the other, never both.
    return onSave({ [list]: [...mine, mood], [list === 'sound_moods' ? 'sound_avoid' : 'sound_moods']: other.filter(m => m !== mood) })
  }
  const row = (list: 'sound_moods' | 'sound_avoid', label: string, chosen: string[]) => (
    <Box role="group" aria-label={label}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
        {(canEdit ? MOOD_IDS : MOOD_IDS.filter(m => chosen.includes(m))).map(m => (
          <Chip key={m} label={t(MOODS[m].label)} disabled={!canEdit} onClick={canEdit ? () => toggle(list, m) : undefined}
            color={chosen.includes(m) ? (list === 'sound_moods' ? 'primary' : 'default') : 'default'}
            variant={chosen.includes(m) ? 'filled' : 'outlined'} aria-pressed={canEdit ? chosen.includes(m) : undefined}
            sx={list === 'sound_avoid' && chosen.includes(m) ? { textDecoration: 'line-through' } : undefined} />
        ))}
        {!canEdit && !chosen.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('None yet.')}</Typography>}
      </Stack>
    </Box>
  )
  return (
    <Card component="section" aria-label={t('Our sound')}>
      <CardContent>
        <SectionTitle>{t('Our sound')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('The feel of the music on your stories and reels. Suggested tracks and AI music start from it.')}
        </Typography>
        <Stack spacing={1.5}>
          {row('sound_moods', t('Sounds like'), moods)}
          {row('sound_avoid', t('Never sounds like'), avoid)}
        </Stack>
      </CardContent>
    </Card>
  )
}

/**
 * The one logo, on white. Admins click it to upload a new one ("Replace" shows faintly at the
 * bottom right on hover, and always on touch screens, which can't hover).
 */
function LogoCard({ title, hint, value, fallback, canEdit, onChange }: {
  title: string; hint?: string; value: string | null; fallback?: string; canEdit: boolean; onChange: (v: string | null) => unknown
}) {
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const src = value ?? fallback ?? null
  // Fills the card beside the colours on a computer; a fixed height on phones.
  const frame = { width: '100%', height: { xs: 200, md: 'auto' }, minHeight: { md: 240 }, flex: { md: 1 }, borderRadius: '14px', bgcolor: '#FFFFFF', border: 1, borderColor: 'divider',
    display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2.5, overflow: 'hidden' }
  const preview = src
    ? <Box component="img" src={src} alt={title} sx={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    : <Typography variant="body2" sx={{ color: '#8E877F' }}>{canEdit ? t('Click to upload your logo') : t('No file yet')}</Typography>
  return (
    <Card component="section" aria-label={title} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <SectionTitle action={src && <Button size="small" startIcon={<DownloadIcon fontSize="small" />} component="a" href={src} download={`easy-beans-${title.toLowerCase().replace(/\W+/g, '-')}.png`}>{t('Download')}</Button>}>{title}</SectionTitle>
        {hint && <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>{hint}</Typography>}
        {canEdit ? (
          <ButtonBase disableRipple onClick={() => input.current?.click()} aria-label={src ? t('Replace {name}', { name: title.toLowerCase() }) : t('Upload {name}', { name: title.toLowerCase() })}
            sx={{ ...frame, position: 'relative', cursor: 'pointer',
              '&:hover .replace, &.Mui-focusVisible .replace': { opacity: 1 }, '@media (hover: none)': { '& .replace': { opacity: 1 } },
              '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}`, outlineOffset: 2 } }}>
            {preview}
            {src && <Typography className="replace" component="span" aria-hidden variant="caption"
              sx={{ position: 'absolute', right: 12, bottom: 8, color: '#8E877F', opacity: 0, transition: 'opacity 150ms' }}>{t('Replace')}</Typography>}
          </ButtonBase>
        ) : <Box sx={frame}>{preview}</Box>}
        {canEdit && (
          <>
            <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={t('Upload {name}', { name: title.toLowerCase() })}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                try { await onChange(await readLogo(f)) } catch (err) { notify(err instanceof Error ? err.message : String(err), 'error') }
              }} />
            {value && <Button size="small" color="error" sx={{ mt: 1, alignSelf: 'flex-start' }} onClick={() => onChange(null)}>{t('Remove')}</Button>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Swatch({ colour: c, canEdit, onEdit }: { colour: BrandColour; canEdit: boolean; onEdit: () => void }) {
  const notify = useNotify()
  return (
    <Box sx={{ borderRadius: '14px', overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: tokens.surface, display: 'flex', alignItems: 'stretch' }}>
      <Box sx={{ width: 88, flexShrink: 0, bgcolor: c.hex, color: inkOn(c.hex) }} />
      <Box sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 500 }} noWrap>{c.name}</Typography>
          <Chip size="small" label={t(ROLES[c.role])} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: c.name })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>{c.hex.toUpperCase()}</Typography>
          <Tooltip title={t('Copy')}>
            <IconButton size="small" aria-label={t('Copy {hex}', { hex: c.hex })} onClick={() => navigator.clipboard?.writeText(c.hex.toUpperCase()).then(() => notify(t('Copied {hex}', { hex: c.hex.toUpperCase() }), 'success'), () => {})}>
              <CopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        {c.use && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{c.use}</Typography>}
      </Box>
    </Box>
  )
}

function ColourDialog({ value, isNew, onClose, onSave, onRemove }: {
  value: BrandColour; isNew: boolean; onClose: () => void; onSave: (c: BrandColour) => unknown; onRemove: () => void
}) {
  const [c, setC] = useState(value)
  const valid = /^#[0-9a-fA-F]{6}$/.test(c.hex) && c.name.trim()
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isNew ? t('Add a colour') : t('Edit {name}', { name: value.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={c.name} onChange={e => setC({ ...c, name: e.target.value })} autoFocus />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box component="input" type="color" aria-label={t('Pick a colour')} value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#000000'}
              onChange={e => setC({ ...c, hex: e.target.value.toUpperCase() })}
              sx={{ width: 52, height: 40, p: 0, border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'transparent', cursor: 'pointer' }} />
            <TextField label={t('Hex code')} value={c.hex} onChange={e => setC({ ...c, hex: e.target.value.trim() })}
              error={!/^#[0-9a-fA-F]{6}$/.test(c.hex)} helperText={t('Like {hex}', { hex: '#F79BA4' })} />
          </Stack>
          <TextField select label={t('Role')} value={c.role} onChange={e => setC({ ...c, role: e.target.value as BrandColour['role'] })}>
            {Object.entries(ROLES).map(([k, v]) => <MenuItem key={k} value={k}>{t(v)}</MenuItem>)}
          </TextField>
          <TextField label={t('Where to use it (optional)')} value={c.use ?? ''} onChange={e => setC({ ...c, use: e.target.value || undefined })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {!isNew && <Button color="error" sx={{ mr: 'auto' }} onClick={onRemove}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!valid} onClick={() => onSave({ ...c, name: c.name.trim(), hex: c.hex.toUpperCase() })}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Search every Google Font, previewed in its own typeface. */
function FontPicker({ current, title, onClose, onPick }: { current: string; title: string; onClose: () => void; onPick: (family: string) => unknown }) {
  const { api } = useApp()
  const list = useAsync('font-list', () => api.fontList(), [])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all')
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (list.data?.fonts ?? []).filter(f => (cat === 'all' || f.category === cat) && (!term || f.family.toLowerCase().includes(term)))
  }, [list.data, q, cat])
  const shown = matches.slice(0, 40)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <TextField autoFocus placeholder={t('Search Google Fonts')} value={q} onChange={e => setQ(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': t('Search fonts') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
            {CATEGORIES.map(k => (
              <Chip key={k} label={k === 'all' ? t('All') : (name => name[0].toUpperCase() + name.slice(1))(t(CATEGORY_NAMES[k]))} clickable size="small"
                color={cat === k ? 'primary' : 'default'} variant={cat === k ? 'filled' : 'outlined'} onClick={() => setCat(k)} aria-pressed={cat === k} />
            ))}
          </Stack>
          <ErrorBox error={list.error} />
          {list.data && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('{n} fonts', { n: formatNumber(matches.length) })}{matches.length > shown.length ? t(', showing the first {n}; keep typing to narrow it down', { n: shown.length }) : ''}
              {list.data.source === 'built-in' ? ` ${t('(popular fonts; the full Google list is loading on the live site)')}` : ''}
            </Typography>
          )}
          <Box role="listbox" aria-label={t('Fonts')} sx={{ maxHeight: 380, overflowY: 'auto', mx: -1 }}>
            {shown.map(f => <FontRow key={f.family} family={f.family} category={f.category} selected={f.family === current} onPick={() => onPick(f.family)} />)}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Close')}</Button></DialogActions>
    </Dialog>
  )
}

function FontRow({ family, category, selected, onPick }: { family: string; category: string; selected: boolean; onPick: () => void }) {
  useGoogleFont(family, `${family}Aa`)
  return (
    <Box role="option" aria-selected={selected} tabIndex={0} onClick={onPick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() } }}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 1.5, py: 1.1, borderRadius: '12px', cursor: 'pointer',
        bgcolor: selected ? tokens.roseSoft : 'transparent', '&:hover, &:focus-visible': { bgcolor: tokens.hover, outline: 'none' } }}>
      <Typography sx={{ fontFamily: `"${family}", system-ui, sans-serif`, fontSize: '1.3rem', minWidth: 0 }} noWrap>{family}</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{selected ? t('Current') : CATEGORY_NAMES[category] ? t(CATEGORY_NAMES[category]) : category}</Typography>
    </Box>
  )
}
