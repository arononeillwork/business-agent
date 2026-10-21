import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import CloudIcon from '@mui/icons-material/CloudUploadOutlined'
import RemoveIcon from '@mui/icons-material/CloseOutlined'
import DrawIcon from '@mui/icons-material/CasinoOutlined'
import PasteIcon from '@mui/icons-material/ContentPasteOutlined'
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import GiftIcon from '@mui/icons-material/RedeemOutlined'
import SocialIcon from '@mui/icons-material/CampaignOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { downloadBlob, type ExportTable } from '../lib/export'
import { addDays, formatLocal, formatMoney, today } from '../../shared/time'
import { EMAIL, decodeCsv } from '../../shared/customers'
import {
  COMPETITION_CHANNELS, COMPETITION_KINDS, DEFAULT_RULES, basesLegales, entriesFromCsv, entryProblems, parseComments, phaseOf, suggest, termsSummary, winnerMessage,
  type Competition, type CompetitionEntry, type CompetitionIdea, type CompetitionInput, type CompetitionKind, type CompetitionChannel, type EntryInput, type Words,
} from '../../shared/competitions'
import type { Business, SocialNetwork } from '../../shared/types'
import { tokens } from '../theme'
import { locale, msg, t, tc, tn } from '../i18n'

type Draft = CompetitionInput & { steps_es?: string[] }
type Phase = ReturnType<typeof phaseOf>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (d: string | null | undefined) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '–')
/** An idea's text in the person's language, with its dates and amounts written out. */
const say = (x: Words) => t(x.text, Object.fromEntries(Object.entries(x.vars ?? {}).map(([k, v]) =>
  [k, typeof v === 'number' ? (k === 'amount' ? formatMoney(v) : v.toLocaleString(locale())) : ISO_DATE.test(v) ? day(v) : t(v)])))
const kindLabel = (k: CompetitionKind) => t(COMPETITION_KINDS.find(x => x.id === k)!.label)
const channelLabel = (c: CompetitionChannel) => t(COMPETITION_CHANNELS.find(x => x.id === c)!.label)
const who = (e: Pick<CompetitionEntry, 'name' | 'handle' | 'email' | 'phone'>) => e.name ?? (e.handle ? `@${e.handle}` : e.email ?? e.phone ?? '')
const SOURCE_LABEL: Record<CompetitionEntry['source'], string> = {
  manual: msg('Added by hand'), instagram_paste: msg('Instagram comment'), customers: msg('Customer'), csv: msg('Sign-up list'), in_cafe: msg('In the café'),
}
const PHASE: Record<Phase, { label: string; fg: string; bg: string }> = {
  draft: { label: msg('Draft'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  upcoming: { label: msg('Coming up'), fg: tokens.infoFg, bg: tokens.infoBg },
  live: { label: msg('Live'), fg: tokens.goodFg, bg: tokens.goodBg },
  to_draw: { label: msg('To draw'), fg: tokens.warnFg, bg: tokens.warnBg },
  drawn: { label: msg('Drawn'), fg: tokens.infoFg, bg: tokens.infoBg },
  closed: { label: msg('Closed'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const FOLDER = 'Marketing/Competitions'

/** What basesLegales() and entryProblems() need, from a draft being written. */
const full = (d: Draft) => ({
  name: d.name, kind: d.kind ?? 'custom', channels: d.channels ?? [], starts_on: d.starts_on ?? null, ends_on: d.ends_on ?? null, draw_on: d.draw_on ?? null,
  prize: d.prize ?? null, prize_value: d.prize_value ?? null, winners: d.winners ?? 1, reserves: d.reserves ?? 0,
  how_to_enter: d.how_to_enter ?? [], rules: { ...DEFAULT_RULES, ...d.rules },
})
const legal = (b: Business | null) => ({ name: b?.name ?? '', tax_id: b?.tax_id, address: b?.address, email: b?.email, website: b?.website })

/**
 * Competitions (Marketing): ideas worked out from the calendar, the quiet days, the big matches and
 * the shop's stock, or one of your own; the bases legales a promotion in Spain needs and the
 * captions; the entries (pasted Instagram comments, customers who said yes, a sign-up list) and
 * the draw, with the winners' messages and the prize taken off the stock. Admins only.
 */
export function CompetitionsPage() {
  const { api, isAdmin, business } = useApp()
  const list = useAsync('competitions', () => (isAdmin ? api.competitions() : Promise.resolve([])), [isAdmin])
  const stock = useAsync('competitions-stock', () => (isAdmin ? api.stockItems() : Promise.resolve([])), [isAdmin])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (!isAdmin) {
    return <>
      <PageHeader eyebrow={t('Marketing')} title={tc('marketing', 'Competitions')} />
      <Alert severity="info">{t('Competitions are only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const all = list.data ?? []
  const live = all.filter(c => phaseOf(c, now) === 'live')
  const month = now.slice(0, 7)
  const thisMonth = all.filter(c => c.status !== 'draft' && (c.starts_on ?? '') <= `${month}-31` && (c.ends_on ?? '9999') >= `${month}-01`)
  const nextDraw = all.filter(c => !c.drawn_at && c.status !== 'draft' && c.status !== 'closed' && c.draw_on && c.draw_on >= now)
    .sort((a, b) => a.draw_on!.localeCompare(b.draw_on!))[0]
  const given = all.filter(c => c.prize_given_at?.slice(0, 4) === now.slice(0, 4))
  // Open the one running (or waiting for its draw) until another is chosen.
  const opened = all.find(c => c.id === (openId ?? all.find(x => ['live', 'to_draw'].includes(phaseOf(x, now)))?.id)) ?? null

  const blank = (): Draft => ({ name: '', kind: 'custom', channels: ['instagram'], status: 'draft', starts_on: now, ends_on: addDays(now, 14), draw_on: addDays(now, 15),
    prize: '', prize_value: null, prize_item_id: null, winners: 1, reserves: 2, how_to_enter: [''], rules: { ...DEFAULT_RULES } })
  const fromIdea = (i: CompetitionIdea): Draft => {
    const d: Draft = { name: say(i.title), kind: i.kind, channels: i.channels, status: 'draft', starts_on: i.starts_on, ends_on: i.ends_on, draw_on: i.draw_on,
      prize: say(i.prize), prize_value: i.prize_value, prize_item_id: i.prize_item_id, winners: 1, reserves: 2, how_to_enter: i.how_to_enter.map(say),
      rules: { ...DEFAULT_RULES, marketing_signup: i.kind === 'email_draw' }, caption: i.caption, caption_es: i.caption_es, steps_es: i.how_to_enter_es }
    // The terms are published in Spanish: written from the idea's Spanish steps and prize.
    return { ...d, terms: basesLegales({ ...full(d), prize: i.prize_es, how_to_enter: i.how_to_enter_es }, legal(business)) }
  }

  const table = (): ExportTable => ({
    title: tc('marketing', 'Competitions'), filename: `competitions-${now}`,
    columns: [t('Competition'), t('Kind'), t('Status'), t('Starts'), t('Entries close'), t('Draw'), t('Prize'), t('Prize value'), t('Winners'), t('Entries'), t('Prize given')],
    rows: all.map(c => [c.name, kindLabel(c.kind), t(PHASE[phaseOf(c, now)].label), c.starts_on ?? '', c.ends_on ?? '', c.draw_on ?? '', c.prize ?? '',
      c.prize_value, c.winners, c.entries ?? 0, c.prize_given_at?.slice(0, 10) ?? '']),
    money: [7],
  })

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={tc('marketing', 'Competitions')} actions={<>
        <ExportButton table={table} disabled={!all.length} folder="Marketing" />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDraft(blank())}>{t('Start your own')}</Button>
      </>} />
      <ErrorBox error={list.error} />

      <StatGrid>
        <StatTile label={t('Live now')} value={list.data ? live.length : '–'} note={live.length ? live.map(c => c.name).join(', ') : t('None running')} />
        <StatTile label={t('Entries this month')} value={list.data ? thisMonth.reduce((s, c) => s + (c.entries ?? 0), 0) : '–'}
          note={tn(thisMonth.length, 'In {n} competition', 'In {n} competitions')} />
        <StatTile label={t('Next draw')} value={nextDraw ? day(nextDraw.draw_on) : '–'} note={nextDraw?.name ?? t('Nothing to draw')} />
        <StatTile label={t('Prizes given this year')} value={list.data ? given.reduce((s, c) => s + c.winners, 0) : '–'}
          note={t('Worth {amount}', { amount: formatMoney(given.reduce((s, c) => s + (c.prize_value ?? 0) * c.winners, 0)) })} />
      </StatGrid>

      <Ideas existing={all} onUse={i => setDraft(fromIdea(i))} />

      <Card component="section" aria-label={t('Your competitions')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Your competitions')}</SectionTitle>
          {all.length === 0
            ? <Empty>{list.data ? t('No competitions yet. Use an idea above, or start your own.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Competition')}</TableCell><TableCell>{t('Dates')}</TableCell><TableCell>{t('Prize')}</TableCell>
                    <TableCell align="right">{t('Entries')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {all.map(c => {
                      const p = PHASE[phaseOf(c, now)]
                      return (
                        <TableRow key={c.id} hover selected={opened?.id === c.id}>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.name}</Typography>
                            <Stack direction="row" spacing={0.75} sx={{ mt: 0.25, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Tag fg={p.fg} bg={p.bg}>{t(p.label)}</Tag>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{kindLabel(c.kind)}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {t('{from} to {to}', { from: day(c.starts_on), to: day(c.ends_on) })}
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Draw: {date}', { date: day(c.draw_on) })}</Typography>
                          </TableCell>
                          <TableCell>{c.prize ?? ''}{c.prize_value ? ` · ${formatMoney(c.prize_value)}` : ''}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.entries ?? 0}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            <Button size="small" onClick={() => setOpenId(c.id)} aria-label={t('Open {name}', { name: c.name })}>{t('Open')}</Button>
                            <IconButton size="small" aria-label={t('Edit {name}', { name: c.name })} onClick={() => setDraft(c)}><EditIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {opened && <CompetitionDetail key={opened.id} c={opened} stock={stock.data ?? []} onEdit={() => setDraft(opened)} />}

      {draft && <CompetitionDialog draft={draft} stock={stock.data ?? []} onClose={() => setDraft(null)} onSaved={id => { setDraft(null); setOpenId(id) }} />}
    </>
  )
}

/** Ideas worked out from what the app knows: the calendar, the big matches, the quiet days, the shop's stock. */
function Ideas({ existing, onUse }: { existing: Competition[]; onUse: (i: CompetitionIdea) => void }) {
  const { api, business } = useApp()
  const now = today()
  const soft = <T,>(p: Promise<T>) => p.catch(() => null)
  const links = useAsync('integrations', () => api.integrations(), [])
  const connected = (p: string) => !!links.data?.integrations.some(i => i.provider === p && i.status === 'connected')
  const data = useAsync('competition-ideas', async () => {
    const [events, matches, sales, stock, customers] = await Promise.all([
      soft(api.events(now, addDays(now, 60))),
      business?.sports_enabled ? soft(api.sportsEvents(`${now}T00:00:00Z`, `${addDays(now, 21)}T23:59:59Z`)) : null,
      soft(api.sales(addDays(now, -35), addDays(now, -1))),
      soft(api.stockItems()),
      soft(api.customers()),
    ])
    return { events, matches, sales, stock, customers }
  }, [now, business?.sports_enabled])
  const followers = useAsync('competition-followers', () => (connected('instagram') ? soft(api.instagramProfile()) : Promise.resolve(null)), [connected('instagram')])
  if (!data.data) return null
  const d = data.data
  const ideas = suggest({
    today: now, business: { name: business?.name ?? '', instagram: business?.instagram },
    events: d.events ?? [], bigMatches: (d.matches ?? []).filter(m => m.big), takings: d.sales?.days ?? [],
    stock: d.stock ?? [], followers: followers.data?.followers_count ?? null,
    consenting: (d.customers ?? []).filter(c => c.marketing_consent).length, loyalty: connected('square'), existing,
  }).slice(0, 6)
  if (!ideas.length) return null
  return (
    <Card component="section" aria-label={t('Ideas for you')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Ideas for you')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('From your calendar, takings, big matches and shop stock. Use one as it is, or change anything.')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {ideas.map(i => (
            <Box key={i.key} role="article" aria-label={say(i.title)} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" component="h3">{say(i.title)}</Typography>
                <Tag>{kindLabel(i.kind)}</Tag>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{say(i.why)}</Typography>
              <Typography variant="caption">
                {t('{from} to {to} · drawn {draw}', { from: day(i.starts_on), to: day(i.ends_on), draw: day(i.draw_on) })}
              </Typography>
              <Typography variant="caption">{t('Prize: {prize}', { prize: say(i.prize) })}</Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>{i.channels.map(c => <Tag key={c}>{channelLabel(c)}</Tag>)}</Stack>
              <Box sx={{ mt: 'auto', pt: 0.5 }}>
                <Button size="small" variant="outlined" onClick={() => onUse(i)} aria-label={t('Use this idea: {title}', { title: say(i.title) })}>{t('Use this idea')}</Button>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

/** Setting one up: what it is, when, the prize, how to enter, who can, the terms and the captions. */
function CompetitionDialog({ draft, stock, onClose, onSaved }: {
  draft: Draft; stock: { id: string; name: string; retail: boolean; active: boolean; sell_price: number | null }[]; onClose: () => void; onSaved: (id: string) => void
}) {
  const { api, business } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [d, setD] = useState<Draft>(draft)
  const [sure, setSure] = useState(false)
  const links = useAsync('integrations', () => api.integrations(), [])
  const storage = links.data?.integrations.find(i => (i.provider === 'google_drive' || i.provider === 'onedrive') && i.status === 'connected')
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }))
  const steps = d.how_to_enter?.length ? d.how_to_enter : ['']
  // Changing the steps by hand: the terms are written from them, not the idea's Spanish.
  const setStep = (i: number, v: string) => set({ how_to_enter: steps.map((s, j) => (j === i ? v : s)), steps_es: undefined })
  const rules = { ...DEFAULT_RULES, ...d.rules }
  const problems = entryProblems(full(d))
  const drawn = !!(draft as Competition).drawn_at
  const termsFile = `Bases legales - ${(d.name || 'competition').replace(/[\\/:*?"<>|]/g, '-')}.txt`
  const writeTerms = () => set({ terms: basesLegales({ ...full(d), how_to_enter: d.steps_es ?? steps }, legal(business)) })

  const save = async () => {
    let id = d.id ?? ''
    const ok = await run(async () => {
      if (!d.name.trim()) throw new Error(t('Give it a name'))
      if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) throw new Error(t('It closes before it starts.'))
      if (d.ends_on && d.draw_on && d.draw_on < d.ends_on) throw new Error(t('The draw is before entries close.'))
      const { steps_es: _s, ...row } = d
      id = await api.saveCompetition({ ...row, name: d.name.trim(), how_to_enter: steps.map(s => s.trim()).filter(Boolean),
        prize_item_id: d.prize_item_id || null, prize: d.prize?.trim() || null })
    }, t('Saved'))
    if (ok) onSaved(id)
  }
  const remove = async () => { if (d.id && await run(() => api.deleteCompetition(d.id!), t('Competition deleted'))) onClose() }
  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); notify(done, 'success') } catch { notify(t('Couldn’t copy: select the text and copy it'), 'error') }
  }
  const toDrive = () => run(async () => {
    const r = await api.saveFile({ folder: FOLDER, name: termsFile, content: d.terms ?? '', type: 'text/plain;charset=utf-8' })
    window.open(r.link, '_blank', 'noopener')
  }, t('Saved to {where} › Business Agent › {folder}', { where: storage?.provider === 'onedrive' ? 'OneDrive' : 'Drive', folder: FOLDER.replace('/', ' › ') }))
  const toPlanner = () => run(async () => {
    const caption = [d.caption_es, d.caption].map(x => x?.trim()).filter(Boolean).join('\n\n')
    if (!caption) throw new Error(t('Write a caption first'))
    const targets = (d.channels ?? []).filter((x): x is SocialNetwork & CompetitionChannel => x === 'instagram' || x === 'facebook' || x === 'tiktok')
    await api.saveSocialPost({ kind: 'post', caption, targets: targets.length ? targets : ['instagram'], status: 'draft' })
  }, t('Draft saved in the Social planner'))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="competition-title">
      <DialogTitle id="competition-title">{d.id ? d.name || t('Competition') : t('New competition')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Name')} value={d.name} onChange={e => set({ name: e.target.value })} required sx={{ flex: 2 }} />
            <TextField select label={t('Kind')} value={d.kind ?? 'custom'} onChange={e => set({ kind: e.target.value as CompetitionKind })} sx={{ flex: 1 }}>
              {COMPETITION_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            {!drawn && (
              <TextField select label={t('Status')} value={d.status ?? 'draft'} onChange={e => set({ status: e.target.value as Draft['status'] })} sx={{ flex: 1 }}>
                <MenuItem value="draft">{t('Draft')}</MenuItem>
                <MenuItem value="scheduled">{t('Scheduled')}</MenuItem>
                <MenuItem value="live">{t('Live')}</MenuItem>
                <MenuItem value="closed">{t('Closed')}</MenuItem>
              </TextField>
            )}
          </Stack>
          <Box role="group" aria-label={t('Where it runs')}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('Where it runs')}</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {COMPETITION_CHANNELS.map(c => {
                const on = (d.channels ?? []).includes(c.id)
                return <Chip key={c.id} label={channelLabel(c.id)} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} aria-pressed={on}
                  onClick={() => set({ channels: on ? (d.channels ?? []).filter(x => x !== c.id) : [...(d.channels ?? []), c.id] })} />
              })}
            </Stack>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Starts')} type="date" value={d.starts_on ?? ''} onChange={e => set({ starts_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Entries close')} type="date" value={d.ends_on ?? ''} onChange={e => set({ ends_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Draw on')} type="date" value={d.draw_on ?? ''} onChange={e => set({ draw_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Prize')} value={d.prize ?? ''} onChange={e => set({ prize: e.target.value })} sx={{ flex: 2 }} />
            <TextField label={t('Worth (each, IVA included)')} type="number" value={d.prize_value ?? ''} onChange={e => set({ prize_value: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('From the stock')} value={d.prize_item_id ?? ''} onChange={e => {
              const item = stock.find(i => i.id === e.target.value)
              set({ prize_item_id: e.target.value || null, ...(item && !d.prize?.trim() ? { prize: item.name } : {}), ...(item?.sell_price && d.prize_value == null ? { prize_value: item.sell_price } : {}) })
            }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} helperText={t('Giving it takes one per winner off the stock')} sx={{ flex: 2 }}>
              <MenuItem value="">{t('Not from the stock')}</MenuItem>
              {stock.filter(i => i.active).sort((a, b) => Number(b.retail) - Number(a.retail) || a.name.localeCompare(b.name)).map(i => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
            </TextField>
            <TextField label={t('Winners')} type="number" value={d.winners ?? 1} disabled={drawn} onChange={e => set({ winners: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} sx={{ flex: 1 }} />
            <TextField label={t('Reserves')} type="number" value={d.reserves ?? 0} disabled={drawn} onChange={e => set({ reserves: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} sx={{ flex: 1 }}
              helperText={t('If a winner doesn’t answer')} />
          </Stack>

          <Box role="group" aria-label={t('How to enter')}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>{t('How to enter')}</Typography>
            <Stack spacing={1}>
              {steps.map((s, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField size="small" fullWidth label={t('Step {n}', { n: i + 1 })} value={s} onChange={e => setStep(i, e.target.value)} />
                  <IconButton size="small" aria-label={t('Remove step {n}', { n: i + 1 })} disabled={steps.length === 1}
                    onClick={() => set({ how_to_enter: steps.filter((_, j) => j !== i), steps_es: undefined })}><RemoveIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Box><Button size="small" startIcon={<AddIcon />} disabled={steps.length >= 10} onClick={() => set({ how_to_enter: [...steps, ''], steps_es: undefined })}>{t('Add a step')}</Button></Box>
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
            <TextField label={t('Minimum age')} type="number" value={rules.min_age} onChange={e => set({ rules: { ...rules, min_age: Math.max(0, Math.min(99, Number(e.target.value) || 0)) } })} sx={{ width: { sm: 140 } }} />
            <FormControlLabel control={<Switch checked={rules.spain_only} onChange={e => set({ rules: { ...rules, spain_only: e.target.checked } })} />} label={t('Living in Spain only')} />
            <FormControlLabel control={<Switch checked={rules.one_entry_per_person} onChange={e => set({ rules: { ...rules, one_entry_per_person: e.target.checked } })} />} label={t('One entry each')} />
            <FormControlLabel control={<Switch checked={rules.marketing_signup} onChange={e => set({ rules: { ...rules, marketing_signup: e.target.checked } })} />} label={t('Entering signs them up for news')} />
          </Stack>

          {problems.length > 0 && (
            <Alert severity="warning" role="status" aria-label={t('Check before it goes out')}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>{t('Check before it goes out')}</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{problems.map(p => <li key={p.text}>{say(p)}</li>)}</Box>
            </Alert>
          )}

          <Box component="section" aria-label={t('Bases legales')}>
            <SectionTitle action={<Button size="small" onClick={writeTerms}>{d.terms ? t('Write them again from the details') : t('Write the terms from the details')}</Button>}>
              {t('Bases legales')}
            </SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              {t('The terms a promotion in Spain needs, in Spanish. A careful draft, not legal advice: read them through, and ask your gestoría if anything is unusual.')}
            </Typography>
            <TextField label={t('Terms')} value={d.terms ?? ''} onChange={e => set({ terms: e.target.value })} multiline minRows={6} maxRows={18} fullWidth />
            {d.terms && (
              <>
                <Box component="ul" aria-label={t('What they say')} sx={{ m: 0, mt: 1, pl: 2.5, color: 'text.secondary', typography: 'caption' }}>
                  {termsSummary(full(d)).map(x => <li key={x.text}>{say(x)}</li>)}
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                  <Button size="small" startIcon={<CopyIcon />} onClick={() => void copy(d.terms!, t('Terms copied'))}>{t('Copy')}</Button>
                  <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadBlob(termsFile, new Blob([d.terms!], { type: 'text/plain;charset=utf-8' }))}>{t('Download')}</Button>
                  {storage && <Button size="small" startIcon={<CloudIcon />} onClick={() => void toDrive()}>{t('Save to {where}', { where: storage.provider === 'onedrive' ? 'OneDrive' : 'Drive' })}</Button>}
                </Stack>
              </>
            )}
          </Box>

          <Box component="section" aria-label={t('The post')}>
            <SectionTitle action={<Button size="small" startIcon={<SocialIcon />} onClick={() => void toPlanner()}>{t('Make a Social planner draft')}</Button>}>{t('The post')}</SectionTitle>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label={t('Caption in Spanish')} value={d.caption_es ?? ''} onChange={e => set({ caption_es: e.target.value })} multiline minRows={3} fullWidth
                helperText={t('{n} of 2,200', { n: (d.caption_es ?? '').length })} />
              <TextField label={t('Caption in English')} value={d.caption ?? ''} onChange={e => set({ caption: e.target.value })} multiline minRows={3} fullWidth
                helperText={t('{n} of 2,200', { n: (d.caption ?? '').length })} />
            </Stack>
          </Box>
          <TextField label={t('Notes')} value={d.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2} />
          {sure && (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void remove()}>{t('Delete')}</Button>}>
              {t('Delete it and its entries? The people’s details go with it.')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {d.id && <Button color="error" onClick={() => setSure(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** One competition: its entries (added by hand, pasted from Instagram, customers, a sign-up list), the draw and the winners. */
function CompetitionDetail({ c, stock, onEdit }: { c: Competition; stock: { id: string; name: string }[]; onEdit: () => void }) {
  const { api, business } = useApp()
  const run = useAction()
  const notify = useNotify()
  const entries = useAsync('competition-entries', () => api.competitionEntries(c.id), [c.id])
  const [adding, setAdding] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [leaving, setLeaving] = useState<CompetitionEntry | null>(null)
  const [showAll, setShowAll] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const now = today()
  const all = entries.data ?? []
  const valid = all.filter(e => e.valid)
  const ranked = all.filter(e => e.rank !== null).sort((a, b) => a.rank! - b.rank!)
  const drawn = !!c.drawn_at
  const prizeItem = c.prize_item_id ? stock.find(i => i.id === c.prize_item_id) : undefined
  const p = PHASE[phaseOf(c, now)]
  const shown = showAll ? all : all.slice(0, 50)

  const added = (r: { added: number; skipped: number }) => notify([tn(r.added, '{n} entry added', '{n} entries added'), ...(r.skipped ? [t('{n} already in', { n: r.skipped })] : [])].join(' · '), 'success')
  const add = (rows: EntryInput[]) => run(async () => added(await api.addEntries(c.id, rows)))
  const addCustomers = () => run(async () => {
    const yes = (await api.customers()).filter(x => x.marketing_consent)
    if (!yes.length) throw new Error(t('No customers have said yes to news and offers yet'))
    added(await api.addEntries(c.id, yes.map(x => ({ name: [x.first_name, x.last_name].filter(Boolean).join(' ') || null, email: x.email, phone: x.phone,
      handle: x.instagram, customer_id: x.id, source: 'customers' as const }))))
  })
  const importCsv = (f: File) => run(async () => {
    const rows = entriesFromCsv(decodeCsv(new Uint8Array(await f.arrayBuffer())))
    if (!rows) throw new Error(t('No name, email, phone or Instagram column found in that file'))
    added(await api.addEntries(c.id, rows))
  })
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(t('Message copied: paste it into their DMs'), 'success') } catch { notify(t('Couldn’t copy: select the text and copy it'), 'error') }
  }
  const entriesTable = (): ExportTable => ({
    title: c.name, filename: `${c.name.replace(/[\\/:*?"<>|]/g, '-')} - ${now}`,
    columns: [t('Name'), t('Instagram'), t('Email'), t('Phone'), t('Source'), t('In the draw'), t('Note'), t('Drawn')],
    rows: all.map(e => [e.name ?? '', e.handle ? `@${e.handle}` : '', e.email ?? '', e.phone ?? '', t(SOURCE_LABEL[e.source]), e.valid ? t('Yes') : t('No'), e.note ?? '',
      e.rank === null ? '' : e.rank <= c.winners ? t('Winner {n}', { n: e.rank }) : t('Reserve {n}', { n: e.rank - c.winners })]),
  })

  return (
    <Card component="section" aria-label={c.name} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Stack direction="row" spacing={1}>
          <ExportButton table={entriesTable} disabled={!all.length} folder={FOLDER} />
          <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>{t('Edit')}</Button>
          {drawn && c.status !== 'closed' && c.prize_given_at && (
            <Button size="small" onClick={() => void run(() => api.saveCompetition({ id: c.id, name: c.name, status: 'closed' }), t('Closed'))}>{t('Close it')}</Button>
          )}
        </Stack>}>{c.name}</SectionTitle>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          <Tag fg={p.fg} bg={p.bg}>{t(p.label)}</Tag>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[kindLabel(c.kind), t('{from} to {to}', { from: day(c.starts_on), to: day(c.ends_on) }), t('Draw: {date}', { date: day(c.draw_on) }),
              c.prize && t('Prize: {prize}', { prize: c.prize })].filter(Boolean).join(' · ')}
          </Typography>
        </Stack>

        {drawn ? (
          <Box component="section" aria-label={t('Winners')} sx={{ mb: 2 }}>
            <Alert severity="success" sx={{ mb: 1.5 }}>
              {t('Drawn on {date} from {n} valid entries.', { date: formatLocal(c.drawn_at!, 'd MMM yyyy, HH:mm'), n: c.entry_count ?? valid.length })}
              {' '}{t('Instagram only lets you message someone who wrote first: copy the message and send it from the app, or reply to their comment.')}
            </Alert>
            <Stack spacing={1} role="list">
              {ranked.map(e => {
                const winner = e.rank! <= c.winners
                return (
                  <Stack key={e.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} role="listitem" aria-label={winner ? t('Winner {n}', { n: e.rank! }) : t('Reserve {n}', { n: e.rank! - c.winners })}
                    sx={{ alignItems: { sm: 'center' }, p: 1.25, borderRadius: 2, bgcolor: winner ? tokens.goodBg : 'action.hover' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {winner ? t('Winner {n}', { n: e.rank! }) : t('Reserve {n}', { n: e.rank! - c.winners })}: {who(e)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[e.handle && `@${e.handle}`, e.email, e.phone].filter(Boolean).join(' · ')}</Typography>
                      {!e.valid && <Box><Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Left out')}{e.note ? `: ${e.note}` : ''}</Tag></Box>}
                    </Box>
                    <Button size="small" startIcon={<CopyIcon />} onClick={() => void copy(winnerMessage(e, c, business?.name ?? '', 'es'))}
                      aria-label={t('Copy the message for {name}', { name: who(e) })}>{t('Message')}</Button>
                    <Button size="small" onClick={() => void copy(winnerMessage(e, c, business?.name ?? '', 'en'))}
                      aria-label={t('Copy the message in English for {name}', { name: who(e) })}>{t('In English')}</Button>
                  </Stack>
                )
              })}
            </Stack>
            <Box sx={{ mt: 1.5 }}>
              {c.prize_given_at
                ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Prize given on {date}', { date: formatLocal(c.prize_given_at, 'd MMM yyyy') })}</Tag>
                : <Button variant="contained" startIcon={<GiftIcon />} onClick={() => void run(() => api.givePrize(c.id),
                    prizeItem ? t('Prize given: {n} × {item} taken off the stock', { n: c.winners, item: prizeItem.name }) : t('Prize given'))}>{t('Mark prize given')}</Button>}
            </Box>
          </Box>
        ) : (
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>{t('Add an entry')}</Button>
            <Button size="small" variant="outlined" startIcon={<PasteIcon />} onClick={() => setPasting(true)}>{t('Paste comments')}</Button>
            <Button size="small" variant="outlined" startIcon={<PeopleIcon />} onClick={() => void addCustomers()}>{t('Add customers who said yes')}</Button>
            <Button size="small" variant="outlined" startIcon={<UploadIcon />} onClick={() => file.current?.click()}>{t('Import a CSV')}</Button>
            <input ref={file} type="file" accept=".csv,text/csv,text/plain" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }} />
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<DrawIcon />} disabled={!valid.length} onClick={() => setDrawing(true)}>{t('Draw winners')}</Button>
          </Stack>
        )}

        <ErrorBox error={entries.error} />
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          {t('Entries')} · {tn(valid.length, '{n} in the draw', '{n} in the draw')}{all.length > valid.length ? ` · ${t('{n} left out', { n: all.length - valid.length })}` : ''}
        </Typography>
        {all.length === 0
          ? <Empty>{entries.data ? t('No entries yet.') : t('Loading…')}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('Entries')}>
                <TableHead><TableRow>
                  <TableCell>{t('Who')}</TableCell><TableCell>{t('Source')}</TableCell><TableCell>{t('Added')}</TableCell><TableCell>{t('In the draw')}</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {shown.map(e => (
                    <TableRow key={e.id}>
                      <TableCell sx={{ minWidth: 180 }}>
                        <Typography variant="body2">{who(e)}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[e.name && e.handle && `@${e.handle}`, e.name && e.email].filter(Boolean).join(' · ')}</Typography>
                        {!e.valid && e.note && <Typography variant="caption" sx={{ display: 'block', color: tokens.badFg }}>{e.note}</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(SOURCE_LABEL[e.source])}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatLocal(e.created_at, 'd MMM')}</TableCell>
                      <TableCell>
                        <Switch size="small" checked={e.valid} slotProps={{ input: { 'aria-label': t('{name} is in the draw', { name: who(e) }) } }}
                          onChange={(_, on) => (on ? void run(() => api.updateEntry(e.id, { valid: true, note: null })) : setLeaving(e))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {all.length > shown.length && <Button size="small" onClick={() => setShowAll(true)}>{t('Show all {n}', { n: all.length })}</Button>}
            </Box>}
      </CardContent>

      {adding && <AddEntryDialog onClose={() => setAdding(false)} onAdd={async row => {
        if (row.email?.trim() && !EMAIL.test(row.email.trim())) { notify(t('Enter a full email address'), 'error'); return }
        if (await add([row])) setAdding(false)
      }} />}
      {pasting && <PasteDialog own={business?.instagram} onClose={() => setPasting(false)} onAdd={async handles => {
        if (await add(handles.map(handle => ({ handle, source: 'instagram_paste' as const })))) setPasting(false)
      }} />}
      {leaving && <LeaveOutDialog entry={leaving} onClose={() => setLeaving(null)} onSave={async note => {
        if (await run(() => api.updateEntry(leaving.id, { valid: false, note: note.trim() || null }), t('Left out of the draw'))) setLeaving(null)
      }} />}
      <Dialog open={drawing} onClose={() => setDrawing(false)} aria-labelledby="draw-title">
        <DialogTitle id="draw-title">{t('Draw the winners?')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Picks {winners} winner(s) and {reserves} reserve(s) at random from the {n} valid entries. It’s drawn once: it can’t be drawn again.',
              { winners: c.winners, reserves: c.reserves, n: valid.length })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrawing(false)}>{t('Cancel')}</Button>
          <Button variant="contained" onClick={() => void run(async () => { setDrawing(false); const n = await api.drawCompetition(c.id); notify(t('Drawn: {n} picked', { n }), 'success') })}>{t('Draw now')}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

function AddEntryDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (row: EntryInput) => Promise<void> }) {
  const [e, setE] = useState<EntryInput>({ name: '', handle: '', email: '', phone: '', source: 'manual' })
  const set = (p: Partial<EntryInput>) => setE(x => ({ ...x, ...p }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="entry-title">
      <DialogTitle id="entry-title">{t('Add an entry')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={e.name ?? ''} onChange={x => set({ name: x.target.value })} autoFocus />
          <TextField label={t('Instagram')} value={e.handle ?? ''} onChange={x => set({ handle: x.target.value })} placeholder={'@'} />
          <TextField label={t('Email')} type="email" value={e.email ?? ''} onChange={x => set({ email: x.target.value })} />
          <TextField label={t('Phone')} value={e.phone ?? ''} onChange={x => set({ phone: x.target.value })} />
          <TextField select label={t('Source')} value={e.source ?? 'manual'} onChange={x => set({ source: x.target.value as EntryInput['source'] })}>
            <MenuItem value="manual">{t(SOURCE_LABEL.manual)}</MenuItem>
            <MenuItem value="in_cafe">{t(SOURCE_LABEL.in_cafe)}</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={![e.name, e.handle, e.email, e.phone].some(x => x?.trim())} onClick={() => void onAdd(e)}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Comments copied off Instagram: the usernames found, to check (and take any out) before they're added. */
function PasteDialog({ own, onClose, onAdd }: { own?: string | null; onClose: () => void; onAdd: (handles: string[]) => Promise<void> }) {
  const [text, setText] = useState('')
  const [out, setOut] = useState<Set<string>>(new Set())
  const found = parseComments(text, own)
  const handles = found.filter(h => !out.has(h))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="paste-title">
      <DialogTitle id="paste-title">{t('Paste comments')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('On the post in Instagram, select the comments and copy them, or paste a list of usernames. Who they tagged doesn’t count, and nobody is added twice.')}
        </Typography>
        <TextField label={t('Comments')} value={text} onChange={e => setText(e.target.value)} multiline minRows={6} maxRows={14} fullWidth autoFocus />
        {found.length > 0 && (
          <Box role="group" aria-label={t('Usernames found')} sx={{ mt: 1.5 }}>
            <Typography variant="body2" sx={{ mb: 0.75 }}>{tn(handles.length, '{n} username found: take out any that aren’t', '{n} usernames found: take out any that aren’t')}</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {found.map(h => out.has(h)
                ? <Chip key={h} label={`@${h}`} variant="outlined" size="small" onClick={() => setOut(s => { const n = new Set(s); n.delete(h); return n })} aria-label={t('Put back @{handle}', { handle: h })} />
                : <Chip key={h} label={`@${h}`} size="small" onDelete={() => setOut(s => new Set(s).add(h))} aria-label={`@${h}`} />)}
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!handles.length} onClick={() => void onAdd(handles)}>{tn(handles.length, 'Add {n} entry', 'Add {n} entries')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function LeaveOutDialog({ entry, onClose, onSave }: { entry: CompetitionEntry; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="leave-title">
      <DialogTitle id="leave-title">{t('Leave {name} out of the draw?', { name: who(entry) })}</DialogTitle>
      <DialogContent>
        <TextField label={t('Why')} value={note} onChange={e => setNote(e.target.value)} fullWidth autoFocus sx={{ mt: 1 }}
          helperText={t('A second account, a rule not met… kept with the entry')} slotProps={{ htmlInput: { maxLength: 300 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void onSave(note)}>{t('Leave out')}</Button>
      </DialogActions>
    </Dialog>
  )
}
