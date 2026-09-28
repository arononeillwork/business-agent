import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, InputAdornment,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import UploadIcon from '@mui/icons-material/FileUploadOutlined'
import SearchIcon from '@mui/icons-material/Search'
import CopyIcon from '@mui/icons-material/ContentCopy'
import EditIcon from '@mui/icons-material/EditOutlined'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { ErrorBox, PageHeader, SectionTitle } from '../components/common'
import type { BrandColour } from '../../shared/types'
import logoUrl from '../assets/logo.png'
import { formatNumber } from '../../shared/time'
import { tokens } from '../theme'

const ROLES: Record<BrandColour['role'], string> = { primary: 'Primary', secondary: 'Secondary', accent: 'Accent', base: 'Background' }
const CATEGORIES = ['all', 'sans-serif', 'serif', 'display', 'handwriting', 'monospace'] as const

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
  if (file.size > 5_000_000) throw new Error('That file is over 5 MB. Use a smaller logo file.')
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read that file')); r.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml') {
    if (raw.length > 600_000) throw new Error('That SVG is too big. Try a simpler or smaller file.')
    return raw
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not an image we can read')); i.src = raw
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
      <PageHeader eyebrow="Café" title="Brand"
        subtitle="The logo, colours and fonts to use on menus, posts and signs. Everyone can see them; admins change them." />
      <ErrorBox error={brand.error} />
      {b && (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={2.5}>
              <LogoCard title="Logo" value={b.logo} fallback={logoUrl} canEdit={isAdmin}
                onChange={logo => save({ logo }, logo ? 'Logo updated' : 'Logo removed')} />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Stack spacing={2.5}>
              <Card component="section" aria-label="Colours">
                <CardContent>
                  <SectionTitle action={isAdmin && <Button size="small" startIcon={<AddIcon />}
                    onClick={() => setEditing({ index: null, colour: { name: '', hex: '#F79BA4', role: 'accent' } })}>Add colour</Button>}>Colours</SectionTitle>
                  <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' } }}>
                    {b.colours.map((c, i) => <Swatch key={`${c.name}-${i}`} colour={c} canEdit={isAdmin} onEdit={() => setEditing({ index: i, colour: c })} />)}
                  </Box>
                </CardContent>
              </Card>

              <Card component="section" aria-label="Fonts">
                <CardContent>
                  <SectionTitle>Fonts</SectionTitle>
                  <Stack spacing={1.5}>
                    {([['heading_font', 'Headings', 'Easy Beans Coffee', 600, '2rem'], ['body_font', 'Body text', 'Specialty coffee, matcha and fresh bakes in San Pedro. Open every day from 8.', 400, '1.05rem']] as const)
                      .map(([key, label, sample, weight, size]) => (
                        <Box key={key} sx={{ p: 2, borderRadius: '14px', bgcolor: tokens.surfaceAlt }}>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{label} · {b[key]}</Typography>
                            {isAdmin && <Button size="small" onClick={() => setPicking(key)}>Change</Button>}
                          </Stack>
                          <Typography sx={{ fontFamily: `"${b[key]}", system-ui, sans-serif`, fontWeight: weight, fontSize: size, lineHeight: 1.3 }}>{sample}</Typography>
                        </Box>
                      ))}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                    All free from Google Fonts: <a href={`https://fonts.google.com/specimen/${b.heading_font.replace(/ /g, '+')}`} target="_blank" rel="noreferrer">{b.heading_font}</a>
                    {' · '}<a href={`https://fonts.google.com/specimen/${b.body_font.replace(/ /g, '+')}`} target="_blank" rel="noreferrer">{b.body_font}</a>
                  </Typography>
                </CardContent>
              </Card>

              <Card component="section" aria-label="How to use the brand">
                <CardContent>
                  <SectionTitle action={isAdmin && notes === null && <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setNotes(b.notes ?? '')}>Edit</Button>}>How to use it</SectionTitle>
                  {notes === null
                    ? <Typography sx={{ whiteSpace: 'pre-wrap', color: b.notes ? 'text.primary' : 'text.secondary' }}>{b.notes || 'No notes yet.'}</Typography>
                    : (
                      <Stack spacing={1}>
                        <TextField multiline minRows={3} value={notes} onChange={e => setNotes(e.target.value)} label="Rules for using the brand" />
                        <Stack direction="row" spacing={1}>
                          <Button variant="contained" onClick={async () => { if (await save({ notes: notes.trim() || null }, 'Saved')) setNotes(null) }}>Save</Button>
                          <Button onClick={() => setNotes(null)}>Cancel</Button>
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
          onRemove={() => { save({ colours: b.colours.filter((_, i) => i !== editing.index) }, 'Colour removed'); setEditing(null) }}
          onSave={async c => {
            const colours = editing.index === null ? [...b.colours, c] : b.colours.map((x, i) => (i === editing.index ? c : x))
            if (await save({ colours }, 'Colour saved')) setEditing(null)
          }} />
      )}
      {picking && b && (
        <FontPicker current={b[picking]} title={picking === 'heading_font' ? 'Heading font' : 'Body font'} onClose={() => setPicking(null)}
          onPick={async family => { if (await save({ [picking]: family }, `${picking === 'heading_font' ? 'Heading' : 'Body'} font: ${family}`)) setPicking(null) }} />
      )}
    </>
  )
}

function LogoCard({ title, hint, value, fallback, canEdit, onChange }: {
  title: string; hint?: string; value: string | null; fallback?: string; canEdit: boolean; onChange: (v: string | null) => unknown
}) {
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const src = value ?? fallback ?? null
  return (
    <Card component="section" aria-label={title}>
      <CardContent>
        <SectionTitle action={src && <Button size="small" startIcon={<DownloadIcon fontSize="small" />} component="a" href={src} download={`easy-beans-${title.toLowerCase().replace(/\W+/g, '-')}.png`}>Download</Button>}>{title}</SectionTitle>
        {hint && <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>{hint}</Typography>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: canEdit ? 1.5 : 0 }}>
          {['#FFFFFF', '#2B2522'].map(bg => (
            <Box key={bg} sx={{ height: 140, borderRadius: '14px', bgcolor: bg, border: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, overflow: 'hidden' }}>
              {src ? <Box component="img" src={src} alt={`${title} on ${bg === '#FFFFFF' ? 'white' : 'dark'}`} sx={{ display: 'block', maxWidth: '100%', maxHeight: 108, objectFit: 'contain' }} />
                : <Typography variant="body2" sx={{ color: bg === '#FFFFFF' ? '#8E877F' : '#958C84' }}>No file yet</Typography>}
            </Box>
          ))}
        </Box>
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={`Upload ${title.toLowerCase()}`}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                try { await onChange(await readLogo(f)) } catch (err) { notify(err instanceof Error ? err.message : String(err), 'error') }
              }} />
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => input.current?.click()}>{value ? 'Replace' : 'Upload'}</Button>
            {value && <Button color="error" onClick={() => onChange(null)}>Remove</Button>}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

function Swatch({ colour: c, canEdit, onEdit }: { colour: BrandColour; canEdit: boolean; onEdit: () => void }) {
  const notify = useNotify()
  return (
    <Box sx={{ borderRadius: '14px', overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: tokens.surface }}>
      <Box sx={{ height: 76, bgcolor: c.hex, color: inkOn(c.hex), p: 1.25, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Chip size="small" label={ROLES[c.role]} sx={{ bgcolor: 'rgba(255,255,255,0.75)', color: '#2B2522' }} />
        {canEdit && <IconButton size="small" aria-label={`Edit ${c.name}`} onClick={onEdit} sx={{ color: 'inherit' }}><EditIcon fontSize="small" /></IconButton>}
      </Box>
      <Box sx={{ p: 1.25 }}>
        <Typography sx={{ fontWeight: 500 }} noWrap>{c.name}</Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>{c.hex.toUpperCase()}</Typography>
          <Tooltip title="Copy">
            <IconButton size="small" aria-label={`Copy ${c.hex}`} onClick={() => navigator.clipboard?.writeText(c.hex.toUpperCase()).then(() => notify(`Copied ${c.hex.toUpperCase()}`, 'success'), () => {})}>
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
      <DialogTitle>{isNew ? 'Add a colour' : `Edit ${value.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} autoFocus />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box component="input" type="color" aria-label="Pick a colour" value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#000000'}
              onChange={e => setC({ ...c, hex: e.target.value.toUpperCase() })}
              sx={{ width: 52, height: 40, p: 0, border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'transparent', cursor: 'pointer' }} />
            <TextField label="Hex code" value={c.hex} onChange={e => setC({ ...c, hex: e.target.value.trim() })}
              error={!/^#[0-9a-fA-F]{6}$/.test(c.hex)} helperText="Like #F79BA4" />
          </Stack>
          <TextField select label="Role" value={c.role} onChange={e => setC({ ...c, role: e.target.value as BrandColour['role'] })}>
            {Object.entries(ROLES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField label="Where to use it (optional)" value={c.use ?? ''} onChange={e => setC({ ...c, use: e.target.value || undefined })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {!isNew && <Button color="error" sx={{ mr: 'auto' }} onClick={onRemove}>Remove</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid} onClick={() => onSave({ ...c, name: c.name.trim(), hex: c.hex.toUpperCase() })}>Save</Button>
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
          <TextField autoFocus placeholder="Search Google Fonts" value={q} onChange={e => setQ(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Search fonts' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
            {CATEGORIES.map(k => (
              <Chip key={k} label={k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)} clickable size="small"
                color={cat === k ? 'primary' : 'default'} variant={cat === k ? 'filled' : 'outlined'} onClick={() => setCat(k)} aria-pressed={cat === k} />
            ))}
          </Stack>
          <ErrorBox error={list.error} />
          {list.data && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatNumber(matches.length)} fonts{matches.length > shown.length ? `, showing the first ${shown.length}; keep typing to narrow it down` : ''}
              {list.data.source === 'built-in' ? ' (popular fonts; the full Google list is loading on the live site)' : ''}
            </Typography>
          )}
          <Box role="listbox" aria-label="Fonts" sx={{ maxHeight: 380, overflowY: 'auto', mx: -1 }}>
            {shown.map(f => <FontRow key={f.family} family={f.family} category={f.category} selected={f.family === current} onPick={() => onPick(f.family)} />)}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
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
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{selected ? 'Current' : category}</Typography>
    </Box>
  )
}
