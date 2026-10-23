import {
  Alert, Box, Button, Card, CardActionArea, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Radio, RadioGroup, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import FullscreenIcon from '@mui/icons-material/FullscreenRounded'
import ScreenIcon from '@mui/icons-material/TvOutlined'
import PaperIcon from '@mui/icons-material/DescriptionOutlined'
import AiIcon from '@mui/icons-material/AutoAwesomeOutlined'
import LinkIcon from '@mui/icons-material/LinkRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { useAsync } from '../../app/hooks'
import { useAction } from '../../app/Notify'
import { Empty, Tag } from '../../components/common'
import { MenuBoard, boardBrand, type BoardBrand } from '../../components/MenuBoard'
import { HiggsfieldKeyDialog, useAiImages } from '../../components/AiImages'
import { ago } from '../../components/Freshness'
import { PhotoUpload } from './PhotoUpload'
import {
  AI_MODELS, MAX_PROMPT, MENU_STYLES, PROMPT_IDEAS, categoryOrder, designProblem, imageOf, isPortrait, isStrip, modelOf, newDesign, sizeOf, sizesFor, type AiModel,
  type MenuDesign, type MenuDesignInput, type MenuFormat, type MenuImage, type MenuItem as Item,
} from '../../../shared/menu'
import type { Brand } from '../../../shared/types'
import { tokens } from '../../theme'
import { t, tn } from '../../i18n'

const inputOf = ({ images: _images, updated_at: _updated, ...d }: MenuDesign): MenuDesignInput => d
const waitingOf = (i: MenuImage) => i.status === 'queued' || i.status === 'working'

/**
 * Menu design (admins): the printed menus (physical: A4, A3, A5) and the screens' menus (digital:
 * 16:9 or 9:16), each previewed as it will look, on paper or on a TV. A design's images are made
 * with AI through Higgsfield, uploaded or linked; the one in use goes behind the menu (the app writes
 * the items and prices over it) or is the whole menu.
 */
export function DesignView({ items, brand }: { items: Item[]; brand: Brand | null }) {
  const { api, business, settings } = useApp()
  const designs = useAsync('menu-designs', () => api.menuDesigns(), [])
  const ai = useAiImages()
  const [format, setFormat] = useState<MenuFormat>(() => (new URLSearchParams(location.search).get('format') === 'digital' ? 'digital' : 'physical'))
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const all = designs.data ?? []
  const list = all.filter(d => d.format === format)
  const current = list.find(d => d.id === selected) ?? list[0] ?? null
  const board = boardBrand(business?.name ?? '', brand)
  const order = settings?.menu_sections ?? []

  // While images are being made: ask Higgsfield how they're going every few seconds (the webhook
  // usually gets there first), then show what changed.
  const waiting = all.flatMap(d => d.images).filter(waitingOf).map(i => i.id).join(',')
  const reload = useRef(designs.reload)
  reload.current = designs.reload
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => {
      void Promise.all(waiting.split(',').slice(0, 4).map(i => api.checkMenuImage(i).catch(() => null))).then(() => reload.current())
    }, 3000)
    return () => clearInterval(id)
  }, [api, waiting])

  return (
    <>
      <AiStatus ai={ai} onConnect={() => setConnecting(true)} />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ width: { xs: '100%', md: 270 }, flexShrink: 0 }}>
          <ToggleButtonGroup exclusive fullWidth size="small" value={format} onChange={(_, v: MenuFormat | null) => v && setFormat(v)} aria-label={t('Kind of menu')}>
            <ToggleButton value="physical" sx={{ gap: 0.75 }}><PaperIcon fontSize="small" />{t('Physical')}</ToggleButton>
            <ToggleButton value="digital" sx={{ gap: 0.75 }}><ScreenIcon fontSize="small" />{t('Digital')}</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, mb: 1.5 }}>
            {format === 'physical' ? t('Printed menus: for the counter, the tables or the window.') : t('Menus for your screens: played on a TV or tablet from the Screens page.')}
          </Typography>
          <Stack spacing={1}>
            {list.map(d => <DesignCard key={d.id} design={d} items={items} brand={board} order={order} selected={d.id === current?.id} onClick={() => setSelected(d.id)} />)}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
              {format === 'physical' ? t('New printed menu') : t('New screen menu')}
            </Button>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          {current
            ? <DesignEditor key={current.id} design={current} items={items} brand={board} order={order} ai={ai} onConnect={() => setConnecting(true)} />
            : designs.data && (
              <Empty>
                <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                  {format === 'physical' ? t('Make a menu to print') : t('Make a menu for your screens')}
                </Typography>
                {t('Pick a size, then make its image with AI from a few words, upload one, or paste a link. Your items and prices are written on it from the menu, so they’re always right.')}
              </Empty>
            )}
        </Box>
      </Stack>
      {creating && <NewDesignDialog format={format} onClose={() => setCreating(false)} onMade={setSelected} />}
      {connecting && <HiggsfieldKeyDialog onClose={() => setConnecting(false)} onDone={ai.reload} />}
    </>
  )
}

type Ai = ReturnType<typeof useAiImages>

/** Higgsfield, connected or not, and where finished images are kept. */
function AiStatus({ ai, onConnect }: { ai: Ai; onConnect: () => void }) {
  if (!ai.loaded) return null
  if (!ai.connected) {
    return (
      <Alert severity={ai.broken ? 'error' : 'info'} icon={<AiIcon />} sx={{ mb: 2.5 }}
        action={<Button color="inherit" size="small" onClick={onConnect}>{ai.broken ? t('Connect again') : t('Connect Higgsfield')}</Button>}>
        {ai.broken ? (ai.error ?? t('Higgsfield stopped working.')) : t('Make menu images with AI: connect Higgsfield with its API key. You can also upload images or paste links without it.')}
      </Alert>
    )
  }
  if (!ai.storage) {
    return <Alert severity="warning" sx={{ mb: 2.5 }}>{t('Connect Google Drive or OneDrive on the Connections page to keep AI images for good. Until then they stay at Higgsfield for a week.')}</Alert>
  }
  return null
}

function DesignCard({ design: d, items, brand, order, selected, onClick }: {
  design: MenuDesign; items: Item[]; brand: BoardBrand; order: string[]; selected: boolean; onClick: () => void
}) {
  const making = d.images.filter(waitingOf).length
  return (
    <Card variant="outlined" sx={{ ...(selected ? { borderColor: tokens.rose, boxShadow: `0 0 0 1px ${tokens.rose}` } : {}) }}>
      <CardActionArea onClick={onClick} aria-pressed={selected} aria-label={d.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, p: 1 }}>
        <Box sx={{ width: isPortrait(d.size) ? 52 : 84, flexShrink: 0, borderRadius: 1, overflow: 'hidden', border: `1px solid ${tokens.line}` }}>
          <MenuBoard design={d} items={items} image={imageOf(d)?.url ?? null} brand={brand} order={order} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500 }} noWrap>{d.name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t(sizeOf(d.size).label)}</Typography>
          {making > 0 && <Typography variant="caption" sx={{ color: tokens.infoFg }}>{tn(making, '{n} image being made', '{n} images being made')}</Typography>}
        </Box>
      </CardActionArea>
    </Card>
  )
}

/** One design: its preview (on paper or on a TV), its settings and its images. */
function DesignEditor({ design, items, brand, order, ai, onConnect }: { design: MenuDesign; items: Item[]; brand: BoardBrand; order: string[]; ai: Ai; onConnect: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const navigate = useNavigate()
  const saved = inputOf(design)
  const [d, setD] = useState<MenuDesignInput>(saved)
  const [deleting, setDeleting] = useState(false)
  const [asking, setAsking] = useState<{ edit: MenuImage | null } | null>(null)
  const [linking, setLinking] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  // An image finished or picked: the preview follows without counting as an unsaved change.
  useEffect(() => setD(x => ({ ...x, image_id: design.image_id })), [design.image_id])
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const set = (patch: Partial<MenuDesignInput>) => setD(x => ({ ...x, ...patch }))
  const image = imageOf({ image_id: d.image_id, images: design.images })
  const z = sizeOf(d.size)
  const portrait = isPortrait(d.size)
  const physical = design.format === 'physical'
  const categories = categoryOrder(items.map(i => i.category), order).filter((c): c is string => !!c)
  const strip = isStrip(d)

  const save = () => run(async () => {
    const problem = designProblem(d)
    if (problem) throw new Error(t(problem))
    await api.saveMenuDesign(d)
  }, t('Saved'))
  const remove = () => run(() => api.deleteMenuDesign(design.id), t('Deleted {name}', { name: design.name }))
  const use = (img: MenuImage) => run(() => api.saveMenuDesign({ ...saved, image_id: img.id }), t('Now in use'))
  const removeImage = (img: MenuImage) => run(() => api.deleteMenuImage(img.id), t('Image deleted'))
  const retry = (img: MenuImage) => run(() => api.generateMenuImage({ design_id: design.id, prompt: img.prompt ?? '', model: img.model ?? 'ideogram', edit_of: img.edit_of }),
    t('Asked Higgsfield again'))
  const ask = (edit: MenuImage | null) => (ai.connected ? setAsking({ edit }) : onConnect())

  const preview = <MenuBoard design={d} items={items} image={image?.url ?? null} brand={brand} order={order} />
  return (
    <Stack spacing={2.5}>
      <Card>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 2, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
          <Box sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="h6" component="h2">{d.name || design.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {physical ? t('Physical menu') : t('Digital menu')}{` · ${t(z.label)}`}{dirty ? ` · ${t('Unsaved changes')}` : ''}
            </Typography>
          </Box>
          {physical ? (
            <Tooltip title={dirty ? t('Save your changes first') : ''}>
              <span>
                <Button variant="outlined" startIcon={<PrintIcon />} disabled={dirty} onClick={() => window.open(`/menu/print/${design.id}`, '_blank')}>{t('Print')}</Button>
              </span>
            </Tooltip>
          ) : <>
            <Button variant="outlined" startIcon={<FullscreenIcon />} onClick={() => void frame.current?.requestFullscreen?.()}>{t('Full screen')}</Button>
            <Tooltip title={dirty ? t('Save your changes first') : ''}>
              <span><Button variant="outlined" startIcon={<ScreenIcon />} disabled={dirty} onClick={() => navigate(`/screens?menu=${design.id}`)}>{t('Show on a screen')}</Button></span>
            </Tooltip>
          </>}
        </Stack>
        {/* As it will look: a sheet of paper, or the menu on a TV. */}
        <Box sx={{ bgcolor: tokens.surfaceAlt, p: { xs: 2, md: 4 }, display: 'grid', placeItems: 'center' }}>
          {physical ? (
            <Box aria-label={t('Preview of the printed menu')} role="img" sx={{ width: '100%', maxWidth: portrait ? 430 : 640, boxShadow: '0 12px 34px rgba(60,40,30,0.22)', bgcolor: '#fff' }}>
              {preview}
            </Box>
          ) : (
            <Box sx={{ width: '100%', maxWidth: portrait ? 300 : 760 }}>
              <Box ref={frame} aria-label={t('Preview of the screen menu')} role="img" sx={{ bgcolor: '#111', p: '1.4%', borderRadius: '14px', boxShadow: '0 14px 36px rgba(0,0,0,0.3)',
                '&:fullscreen': { display: 'grid', placeItems: 'center', p: 0, borderRadius: 0, bgcolor: '#000' },
                '&:fullscreen > .board': { width: `min(100vw, calc(100vh * ${z.width / z.height}))` } }}>
                <Box className="board">{preview}</Box>
              </Box>
              <Box aria-hidden sx={{ width: '16%', height: 14, mx: 'auto', bgcolor: '#2a2a2a', borderRadius: '0 0 10px 10px' }} />
            </Box>
          )}
        </Box>
      </Card>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
        <Card sx={{ p: 2, width: { xs: '100%', lg: 380 }, flexShrink: 0 }}>
          <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>{t('Settings')}</Typography>
          <Stack spacing={2}>
            <TextField label={t('Name')} value={d.name} onChange={e => set({ name: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField select label={t('Size')} value={d.size} onChange={e => set({ size: e.target.value as MenuDesignInput['size'] })}>
              {sizesFor(design.format).map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
            <Box>
              <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('The image')}</Typography>
              <RadioGroup value={d.mode} onChange={e => set({ mode: e.target.value as MenuDesignInput['mode'] })}>
                <FormControlLabel value="background" control={<Radio size="small" />}
                  label={<Typography variant="body2">{t('Behind the menu: your items and prices are written over it, always up to date')}</Typography>} />
                <FormControlLabel value="full" control={<Radio size="small" />}
                  label={<Typography variant="body2">{t('The whole menu: the image is the menu (made with its words in, or designed elsewhere)')}</Typography>} />
              </RadioGroup>
            </Box>
            <Box>
              <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Sections on it')}</Typography>
              <Box role="group" aria-label={t('Sections on it')} sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {categories.map(c => {
                  const on = d.categories.includes(c)
                  return <Chip key={c} size="small" label={t(c)} clickable aria-pressed={on} variant={on ? 'filled' : 'outlined'} color={on ? 'primary' : 'default'}
                    onClick={() => set({ categories: on ? d.categories.filter(x => x !== c) : [...d.categories, c] })} />
                })}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.categories.length ? t('Only the sections picked.') : t('None picked: every section.')}</Typography>
            </Box>
            <TextField label={t('Heading')} placeholder={brand.name} value={d.title ?? ''} onChange={e => set({ title: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField label={t('Line under the heading')} value={d.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField label={t('Line at the bottom')} value={d.footer ?? ''} onChange={e => set({ footer: e.target.value || null })} multiline slotProps={{ htmlInput: { maxLength: 300 } }} />
            {d.mode === 'background' && <>
              <TextField select label={t('Layout')} value={d.style} onChange={e => set({ style: e.target.value as MenuDesignInput['style'] })}
                helperText={d.style === 'boxed' ? t('Each section in a box, hot and iced prices side by side, and the image as a strip of illustrations along the bottom.') : undefined}>
                {MENU_STYLES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
              </TextField>
              <ToggleButtonGroup exclusive size="small" value={d.text_tone} onChange={(_, v: MenuDesignInput['text_tone'] | null) => v && set({ text_tone: v })} aria-label={t('Writing')}>
                <ToggleButton value="dark">{t('Dark writing')}</ToggleButton>
                <ToggleButton value="light">{t('Light writing')}</ToggleButton>
              </ToggleButtonGroup>
              {d.style === 'classic' && <FormControlLabel control={<Switch checked={d.panel} onChange={e => set({ panel: e.target.checked })} />} label={t('A soft panel behind the writing')} />}
              <FormControlLabel control={<Switch checked={d.show_descriptions} onChange={e => set({ show_descriptions: e.target.checked })} />} label={t('Descriptions')} />
              <FormControlLabel control={<Switch checked={d.show_allergens} onChange={e => set({ show_allergens: e.target.checked })} />} label={d.style === 'boxed' ? t('Allergen letters and key') : t('Allergen numbers and key')} />
            </>}
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="contained" disabled={!dirty} onClick={save}>{t('Save changes')}</Button>
              {dirty && <Button onClick={() => setD(saved)}>{t('Undo changes')}</Button>}
              <Box sx={{ flex: 1 }} />
              {deleting ? <>
                <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
                <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
              </> : <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete design')}</Button>}
            </Stack>
          </Stack>
        </Card>

        <Card sx={{ p: 2, flex: 1, minWidth: 0, width: '100%' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 160 }}>
              <Typography variant="h6" component="h3">{t('Images')}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {strip ? t('Illustrations for the strip along the bottom. The one in use shows in the preview.')
                  : d.mode === 'background' ? t('Artwork for behind the menu. The one in use shows in the preview.') : t('Pictures of the whole menu. The one in use is the menu.')}
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<AiIcon />} onClick={() => ask(null)}>{t('Create with AI')}</Button>
            <PhotoUpload maxWidth={2480} onDone={async url => { await api.addMenuImage(design.id, url, 'upload') }} />
            <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinking(true)}>{t('Paste a link')}</Button>
          </Stack>
          {!design.images.length ? (
            <Empty>{t('No images yet. Create one with AI, upload one, or paste a link.')}</Empty>
          ) : (
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
              {design.images.map(img => (
                <ImageTile key={img.id} image={img} ratio={strip ? '4 / 1' : `${z.width} / ${z.height}`} inUse={img.id === design.image_id} canEdit={ai.connected}
                  onUse={() => use(img)} onEdit={() => ask(img)} onRetry={() => retry(img)} onDelete={() => removeImage(img)} />
              ))}
            </Box>
          )}
        </Card>
      </Stack>
      {asking && <AiDialog design={{ ...saved, id: design.id }} edit={asking.edit} onClose={() => setAsking(null)} />}
      {linking && <LinkDialog onClose={() => setLinking(false)} onAdd={url => api.addMenuImage(design.id, url, 'link')} />}
    </Stack>
  )
}

function ImageTile({ image: img, ratio, inUse, canEdit, onUse, onEdit, onRetry, onDelete }: {
  image: MenuImage; ratio: string; inUse: boolean; canEdit: boolean; onUse: () => void; onEdit: () => void; onRetry: () => void; onDelete: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const ready = img.status === 'ready' && !!img.url
  const source = img.source === 'ai' ? `${modelOf(img.model).name}${img.edit_of ? ` · ${t('changed')}` : ''}` : img.source === 'upload' ? t('Uploaded') : t('Link')
  return (
    <Card variant="outlined" component="article" aria-label={img.prompt ?? source} sx={{ display: 'flex', flexDirection: 'column', ...(inUse ? { borderColor: tokens.matcha } : {}) }}>
      <Box sx={{ position: 'relative', aspectRatio: ratio, bgcolor: tokens.surfaceAlt, overflow: 'hidden' }}>
        {img.url && <Box component="img" src={img.url} alt="" sx={{ width: '100%', height: '100%', objectFit: ratio === '4 / 1' ? 'contain' : 'cover', display: 'block' }} />}
        {waitingOf(img) && (
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 1, p: 1, textAlign: 'center', color: tokens.inkSoft }}>
            <CircularProgress size={22} />
            <Typography variant="caption">{img.status === 'queued' ? t('Waiting at Higgsfield…') : t('Being made…')}</Typography>
          </Stack>
        )}
        {img.status === 'failed' && (
          <Box sx={{ position: 'absolute', inset: 0, p: 1.25, display: 'grid', placeItems: 'center', textAlign: 'center', bgcolor: tokens.badBg, color: tokens.badFg }}>
            <Typography variant="caption">{img.error ?? t('It couldn’t be made.')}</Typography>
          </Box>
        )}
        {inUse && <Chip size="small" icon={<CheckIcon />} label={t('In use')} sx={{ position: 'absolute', top: 6, left: 6, bgcolor: tokens.goodBg, color: tokens.goodFg, '& svg': { color: `${tokens.goodFg} !important` } }} />}
      </Box>
      <Box sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{`${source} · ${ago(img.created_at)}`}</Typography>
        {img.prompt && <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{img.prompt}</Typography>}
        {ready && img.source === 'ai' && !img.stored && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('At Higgsfield for 7 days')}</Tag>}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, flexWrap: 'wrap' }}>
          {deleting ? <>
            <Button size="small" color="error" onClick={onDelete}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </> : <>
            {ready && !inUse && <Button size="small" onClick={onUse}>{t('Use this')}</Button>}
            {ready && canEdit && <Tooltip title={t('Change with AI')}><IconButton size="small" aria-label={t('Change with AI')} onClick={onEdit}><AiIcon fontSize="small" /></IconButton></Tooltip>}
            {img.status === 'failed' && img.source === 'ai' && <Button size="small" onClick={onRetry}>{t('Try again')}</Button>}
            {ready && <Tooltip title={t('Open the image')}><IconButton size="small" component="a" href={img.url!} target="_blank" rel="noopener" aria-label={t('Open the image')}><OpenIcon fontSize="small" /></IconButton></Tooltip>}
            <Box sx={{ flex: 1 }} />
            {!waitingOf(img) && <Tooltip title={t('Delete image')}><IconButton size="small" aria-label={t('Delete image')} onClick={() => setDeleting(true)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>}
          </>}
        </Stack>
      </Box>
    </Card>
  )
}

/** Ask Higgsfield for an image for this design, or a change to one of its images. */
function AiDialog({ design, edit, onClose }: { design: MenuDesignInput & { id: string }; edit: MenuImage | null; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [model, setModel] = useState<AiModel>(edit ? (edit.model === 'ideogram' ? 'ideogram' : 'qwen') : design.mode === 'full' ? 'ideogram' : 'recraft')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const models = edit ? AI_MODELS.filter(m => m.id !== 'recraft') : AI_MODELS
  const send = async () => {
    setBusy(true)
    const ok = await run(() => api.generateMenuImage({ design_id: design.id, prompt, model, edit_of: edit?.id ?? null }),
      t('Higgsfield is making it. It shows here when it’s ready, usually within a minute.'))
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{edit ? t('Change this image with AI') : t('Create an image with AI')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {edit?.url && <Box component="img" src={edit.url} alt="" sx={{ width: 140, borderRadius: 1, border: `1px solid ${tokens.line}` }} />}
          <TextField select label={t('Model')} value={model} onChange={e => setModel(e.target.value as AiModel)}
            helperText={t(modelOf(model).does)}>
            {models.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
          </TextField>
          <TextField autoFocus multiline minRows={3} label={edit ? t('What to change') : t('Describe the look')} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={edit ? t('e.g. Make it warmer, add olive branches in the corners') : t('Colours, style, what’s in it')}
            helperText={`${prompt.length}/${MAX_PROMPT}`} slotProps={{ htmlInput: { maxLength: MAX_PROMPT } }} />
          {!edit && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {PROMPT_IDEAS[isStrip(design) ? 'strip' : design.mode].map(idea => <Chip key={idea} size="small" label={t(idea)} onClick={() => setPrompt(t(idea))} />)}
            </Box>
          )}
          <Alert severity={design.mode === 'full' && !edit ? 'warning' : 'info'}>
            {edit ? t('The change is made to a copy: the image you have stays as it is.')
              : design.mode === 'full'
                ? t('Your heading, every section’s items and their prices go to the AI with your words. AI can still misspell: check every name and price before you print it or show it.')
                : isStrip(design) ? t('The illustrations are made without words, as a wide strip for the bottom of the menu: the app writes your menu above them.')
                  : t('The artwork is made without words, with room in the middle: the app writes your menu over it, so names and prices are always right.')}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" startIcon={busy ? <CircularProgress size={14} /> : <AiIcon />} disabled={busy || (!prompt.trim() && (!!edit || design.mode === 'background'))} onClick={send}>
          {edit ? t('Make the change') : t('Create')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** An image already online (the café's website, Canva, Drive): its address. */
function LinkDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (url: string) => Promise<unknown> }) {
  const run = useAction()
  const [url, setUrl] = useState('')
  const add = async () => {
    const ok = await run(async () => {
      if (!/^https:\/\/\S+$/i.test(url.trim())) throw new Error(t('The picture’s address should start with https://'))
      await onAdd(url.trim())
    }, t('Image added'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Paste a link to an image')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label={t('Image address')} placeholder={'https://…'} value={url} onChange={e => setUrl(e.target.value)} sx={{ mt: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') void add() }} helperText={t('A JPEG, PNG or WebP that anyone with the link can open.')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!url.trim()} onClick={add}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function NewDesignDialog({ format, onClose, onMade }: { format: MenuFormat; onClose: () => void; onMade: (id: string) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [size, setSize] = useState(sizesFor(format)[0].id)
  const make = async () => {
    const start = newDesign(format, name.trim())
    let id = ''
    const ok = await run(async () => {
      const problem = designProblem({ ...start, size })
      if (problem) throw new Error(t(problem))
      id = await api.saveMenuDesign({ ...start, size, footer: start.footer && t(start.footer) })
    }, t('Added {name}', { name: name.trim() }))
    if (ok) { onMade(id); onClose() }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{format === 'physical' ? t('New printed menu') : t('New screen menu')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus label={t('Name')} placeholder={format === 'physical' ? t('e.g. Counter menu') : t('e.g. TV menu board')} value={name}
            onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <TextField select label={t('Size')} value={size} onChange={e => setSize(e.target.value as typeof size)}>
            {sizesFor(format).map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={make}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
