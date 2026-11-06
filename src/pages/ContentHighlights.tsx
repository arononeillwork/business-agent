// Instagram highlights on the Content page (shared/highlights.ts): the circles as Instagram shows them under
// the profile, each with how many stories are up and still to add to it in the Instagram app; Add to highlight
// for the photos and videos chosen (one story each, posting now or later, or reminders); and a highlight
// opened: its stories, where each is, Open in Instagram and Mark added, rename and delete.
import {
  Alert, Badge, Box, Button, ButtonBase, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/AddRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { siInstagram } from 'simple-icons'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { Brand } from '../components/Connectors'
import { postable, type ContentItem } from '../../shared/content'
import {
  MAX_HIGHLIGHT_BATCH, highlightNameProblem, tidyHighlightName, toAdd, type HighlightStory, type InstagramHighlight, type StoryState,
} from '../../shared/highlights'
import { formatLocal, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

/** A highlight's circle as Instagram draws it: a thin ring, its picture (or first letter) inside. */
function Circle({ name, cover, size, selected = false, plus = false }: { name: string; cover: string | null; size: number; selected?: boolean; plus?: boolean }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: '50%', p: '3px', flexShrink: 0, border: `1px solid ${tokens.lineStrong}`,
      boxShadow: selected ? `0 0 0 2px ${tokens.roseDeep}` : 'none', transition: 'box-shadow .15s' }}>
      <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center' }}>
        {plus ? <AddIcon sx={{ fontSize: size * 0.5, color: 'text.secondary' }} />
          : cover ? <Box component="img" src={cover} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <Typography sx={{ fontSize: size * 0.36, fontWeight: 500, color: 'text.secondary' }}>{[...name][0]?.toUpperCase()}</Typography>}
      </Box>
    </Box>
  )
}

/** A circle with its name under it, to press. */
function CircleButton({ name, cover, label, badge = 0, plus, selected, radio, onClick, size = 68 }: {
  name: string; cover: string | null; label: string; badge?: number; plus?: boolean; selected?: boolean; radio?: boolean; onClick: () => void; size?: number
}) {
  return (
    <ButtonBase onClick={onClick} aria-label={label} disableRipple {...(radio ? { role: 'radio', 'aria-checked': !!selected } : {})}
      sx={{ flexDirection: 'column', gap: 0.75, width: size + 20, flexShrink: 0, borderRadius: 2, py: 0.5, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}` } }}>
      <Badge badgeContent={badge} color="primary" overlap="circular" invisible={!badge} max={99}>
        <Circle name={name} cover={cover} size={size} selected={selected} plus={plus} />
      </Badge>
      <Typography variant="caption" noWrap title={name} sx={{ maxWidth: size + 16, fontWeight: 500, color: 'text.primary' }}>{name}</Typography>
    </ButtonBase>
  )
}

/** The highlights in a row, as under the Instagram profile, and New at the end. */
export function HighlightsRow({ highlights, onOpen, onNew }: { highlights: InstagramHighlight[]; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <Box component="section" aria-label={t('Instagram highlights')} sx={{ mb: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1, '& svg': { width: 18, height: 18 } }}>
        <Brand icon={siInstagram} />
        <Typography variant="subtitle2">{t('Instagram highlights')}</Typography>
      </Stack>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mx: -0.5 }}>
        {highlights.map(h => {
          const n = toAdd(h)
          return (
            <CircleButton key={h.id} name={h.name} cover={h.cover_url} badge={n} onClick={() => onOpen(h.id)}
              label={n ? tn(n, '{name}: {n} story to add in Instagram', '{name}: {n} stories to add in Instagram', { name: h.name }) : h.name} />
          )
        })}
        <CircleButton name={t('New')} cover={null} plus label={t('New highlight')} onClick={onNew} />
      </Box>
    </Box>
  )
}

/** A highlight's name: a new one's, or a new name for one. */
export function HighlightNameDialog({ title, initial = '', others, id, onSave, onClose }: {
  title: string; initial?: string; others: InstagramHighlight[]; id?: string; onSave: (name: string) => Promise<unknown>; onClose: () => void
}) {
  const run = useAction()
  const [name, setName] = useState(initial)
  const problem = name.trim() ? highlightNameProblem(name, others, id) : null
  const save = () => run(async () => { await onSave(tidyHighlightName(name)); onClose() })
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} autoFocus fullWidth placeholder={t('e.g. Reviews ⭐')}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !problem) void save() }}
          helperText={problem ? t(problem) : t('As it is on Instagram, emoji and all.')} error={!!problem} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim() || !!problem} onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Small squares of what's chosen. */
function Thumbs({ items }: { items: ContentItem[] }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5 }}>
      {items.map(i => (
        <Box key={i.id} sx={{ width: 52, height: 52, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: tokens.surfaceAlt }}>
          {i.kind === 'video'
            ? <Box component="video" src={i.url} muted playsInline preload="metadata" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <Box component="img" src={i.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </Box>
      ))}
    </Box>
  )
}

/**
 * The photos and videos chosen, into a highlight: which one (or a new one), now or later. Each goes up as a
 * story of its own; `auto`: they post themselves (else each is a reminder on the Social planner).
 */
export function AddToHighlightDialog({ items, highlights, auto, onClose, onAdded }: {
  items: ContentItem[]; highlights: InstagramHighlight[]; auto: boolean; onClose: () => void; onAdded: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const ok = items.filter(postable)
  const n = ok.length
  const [pick, setPick] = useState<string | null>(highlights.length ? null : 'new')
  const [name, setName] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('10:00')
  const chosen = highlights.find(h => h.id === pick)
  const target = pick === 'new' ? tidyHighlightName(name) : chosen?.name ?? ''
  const nameProblem = pick === 'new' && name.trim() ? highlightNameProblem(name, highlights) : null
  const ready = n > 0 && n <= MAX_HIGHLIGHT_BATCH && (pick === 'new' ? !!name.trim() && !nameProblem : !!chosen)
  const vars = { name: target }

  const add = () => run(async () => {
    const at = when === 'now' ? new Date().toISOString() : zonedIso(date, time)
    if (when === 'later' && Date.parse(at) < Date.now() - 60_000) throw new Error(t('That time has passed. Pick a later one, or choose Now.'))
    await api.addToHighlight({ highlight: pick === 'new' ? { name } : { id: pick! }, at, auto,
      media: ok.map(i => ({ url: i.url, type: i.kind === 'video' ? 'video' as const : 'image' as const })) })
    onAdded()
  }, !auto ? tn(n, '{n} reminder set for {name}', '{n} reminders set for {name}', vars)
    : when === 'now' ? tn(n, 'Posting {n} story for {name}', 'Posting {n} stories for {name}', vars)
    : tn(n, '{n} story scheduled for {name}', '{n} stories scheduled for {name}', vars))

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={phone}>
      <DialogTitle>{t('Add to a highlight')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box>
            <Thumbs items={ok} />
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {tn(n, '{n} story on Instagram', '{n} stories on Instagram, one after another')}
            </Typography>
          </Box>
          {items.length > n && (
            <Alert severity="warning">{tn(items.length - n, '{n} left out: stories take JPEG photos and MP4 or MOV videos.', '{n} left out: stories take JPEG photos and MP4 or MOV videos.')}</Alert>
          )}
          {n > MAX_HIGHLIGHT_BATCH && <Alert severity="error">{t('Up to {max} at a time: choose fewer.', { max: MAX_HIGHLIGHT_BATCH })}</Alert>}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Which highlight')}</Typography>
            <Box role="radiogroup" aria-label={t('Which highlight')} sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mx: -0.5 }}>
              {highlights.map(h => (
                <CircleButton key={h.id} radio selected={pick === h.id} name={h.name} cover={h.cover_url} label={h.name} size={60} onClick={() => setPick(h.id)} />
              ))}
              <CircleButton radio selected={pick === 'new'} name={t('New')} cover={null} plus label={t('New highlight')} size={60} onClick={() => setPick('new')} />
            </Box>
            {pick === 'new' && (
              <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} autoFocus fullWidth placeholder={t('e.g. Reviews ⭐')}
                helperText={nameProblem ? t(nameProblem) : t('As it is on Instagram, emoji and all.')} error={!!nameProblem} sx={{ mt: 1.5 }} />
            )}
          </Box>

          <Box>
            <ToggleButtonGroup size="small" exclusive value={when} onChange={(_, v) => v && setWhen(v)} aria-label={t('When')}>
              <ToggleButton value="now">{t('Now')}</ToggleButton>
              <ToggleButton value="later">{t('Later')}</ToggleButton>
            </ToggleButtonGroup>
            {when === 'later' && (
              <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                <TextField type="date" label={t('Date')} value={date} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="time" label={t('Time')} value={time} onChange={e => setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            )}
          </Box>

          {auto
            ? <Alert severity="info">{t('Instagram doesn’t let apps add to highlights, so once each story is up you’ll get a reminder to add it to {name}: in the Instagram app, open the story, tap Highlight and choose {name}.', { name: target || t('the highlight') })}</Alert>
            : <Alert severity="warning">{t('Each story is a reminder on the Social planner (connect Instagram, and Google Drive or OneDrive, for them to post themselves): post it yourself when it’s time and mark it posted. Then you’ll get a reminder to add it to {name} in Instagram.', { name: target || t('the highlight') })}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ready} onClick={() => void add()}>
          {!auto ? tn(n, 'Set {n} reminder', 'Set {n} reminders') : when === 'now' ? tn(n, 'Post {n} story', 'Post {n} stories') : tn(n, 'Schedule {n} story', 'Schedule {n} stories')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const STATE: Record<StoryState, { label: string; fg: string; bg: string }> = {
  waiting: { label: msg('Scheduled'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  due: { label: msg('Your turn to post'), fg: tokens.warnFg, bg: tokens.warnBg },
  up: { label: msg('To add in Instagram'), fg: tokens.infoFg, bg: tokens.infoBg },
  added: { label: msg('Added'), fg: tokens.goodFg, bg: tokens.goodBg },
  failed: { label: msg('Didn’t go up'), fg: tokens.badFg, bg: tokens.badBg },
}

/** What to say about one of a highlight's stories. */
function storyLine(s: HighlightStory) {
  const at = (iso: string | null) => (iso ? formatLocal(iso, 'EEE d MMM, HH:mm') : '')
  switch (s.state) {
    case 'waiting': return t('Goes up {when}', { when: at(s.scheduled_at) })
    case 'due': return t('A reminder: post it yourself, then mark it posted on the Social planner.')
    case 'up': return t('Up on Instagram since {when}', { when: at(s.published_at ?? s.scheduled_at) })
    case 'added': return t('Added to the highlight {when}', { when: at(s.added_at) })
    case 'failed': return t('It didn’t go up: the Social planner says why.')
  }
}

/** One highlight opened: its stories, where each is, and what to do in Instagram. */
export function HighlightDialog({ highlight: h, others, onClose }: { highlight: InstagramHighlight; others: InstagramHighlight[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const up = toAdd(h)
  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={phone} aria-labelledby="highlight-title">
        <DialogTitle id="highlight-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Circle name={h.name} cover={h.cover_url} size={44} />
          {h.name}
        </DialogTitle>
        <DialogContent>
          {deleting ? (
            <Typography variant="body2">{t('Delete {name} here? Its stories stay on Instagram and on the Social planner, and so does the highlight on Instagram.', { name: h.name })}</Typography>
          ) : (
            <Stack spacing={2}>
              {up > 0 && (
                <Alert severity="info">
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {tn(up, '{n} story is up: add it to {name} in Instagram', '{n} stories are up: add them to {name} in Instagram', { name: h.name })}
                  </Typography>
                  {t('Instagram doesn’t let apps do this. In the Instagram app, open the story (tap your profile picture, or Open in Instagram here), tap Highlight and choose {name}. Then mark it added here.', { name: h.name })}
                </Alert>
              )}
              {!h.stories.length ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing in it yet. Choose photos and videos on the Content page, then Add to highlight.')}</Typography>
              ) : (
                <Stack role="list" aria-label={t('Stories')} spacing={1.5}>
                  {h.stories.map(s => (
                    <Stack key={s.id} role="listitem" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Box sx={{ width: 54, height: 96, flexShrink: 0, borderRadius: 1.5, overflow: 'hidden', bgcolor: tokens.surfaceAlt }}>
                        {s.media.type === 'video'
                          ? <Box component="video" src={s.media.url} muted playsInline preload="metadata" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <Box component="img" src={s.media.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Chip size="small" label={t(STATE[s.state].label)} sx={{ color: STATE[s.state].fg, bgcolor: STATE[s.state].bg, fontWeight: 600, mb: 0.5 }} />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{storyLine(s)}</Typography>
                        <Stack direction="row" sx={{ gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                          {s.state === 'up' && s.url && (
                            <Button size="small" variant="outlined" href={s.url} target="_blank" rel="noreferrer" startIcon={<OpenIcon />}>{t('Open in Instagram')}</Button>
                          )}
                          {s.state === 'up' && (
                            <Button size="small" variant="contained" onClick={() => void run(() => api.markStoryAdded(s.id, true), t('Marked added to {name}', { name: h.name }))}>
                              {t('Mark added')}
                            </Button>
                          )}
                          {s.state === 'added' && <Button size="small" onClick={() => void run(() => api.markStoryAdded(s.id, false))}>{t('Not added after all')}</Button>}
                          {(s.state === 'due' || s.state === 'failed') && <Button size="small" component={RouterLink} to="/social">{t('Social planner')}</Button>}
                        </Stack>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {deleting ? (
            <>
              <Button onClick={() => setDeleting(false)}>{t('Keep')}</Button>
              <Button variant="contained" color="error" onClick={() => void run(async () => { await api.deleteHighlight(h.id); onClose() })}>{t('Delete')}</Button>
            </>
          ) : (
            <>
              <Button color="error" onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>
              <Button onClick={() => setRenaming(true)}>{t('Rename')}</Button>
              <Button variant="contained" onClick={onClose}>{t('Done')}</Button>
            </>
          )}
        </DialogActions>
      </Dialog>
      {renaming && (
        <HighlightNameDialog title={t('Rename {name}', { name: h.name })} initial={h.name} others={others} id={h.id}
          onSave={name => api.renameHighlight(h.id, name)} onClose={() => setRenaming(false)} />
      )}
    </>
  )
}
