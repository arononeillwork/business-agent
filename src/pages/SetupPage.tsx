import { Alert, Box, Button, Card, CardActionArea, Checkbox, LinearProgress, Stack, Typography } from '@mui/material'
import SparkIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckIcon from '@mui/icons-material/CheckRounded'
import BoltIcon from '@mui/icons-material/BoltRounded'
import GridIcon from '@mui/icons-material/DashboardCustomizeOutlined'
import CafeIcon from '@mui/icons-material/LocalCafeOutlined'
import RestaurantIcon from '@mui/icons-material/RestaurantOutlined'
import SalonIcon from '@mui/icons-material/ContentCutOutlined'
import AddIcon from '@mui/icons-material/AddRounded'
import DotIcon from '@mui/icons-material/FiberManualRecord'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { AgentMark, Wordmark } from './marketing/site'
import {
  CAN, ConnectorDialog, DOES, Logo, StatusChip, oneClick, optionStateOf, useConnect, useConnectResult, type OptionState,
} from '../components/Connectors'
import { PRESETS, SETUP_GROUPS, findApp, groupsOf, tick, type BusinessKind } from '../app/setupPresets'
import type { ConnectionGroup, ConnectionGroupInfo } from '../../shared/connections'
import type { IntegrationsState } from '../../shared/types'
import { fonts, tokens } from '../theme'
import { t, tn } from '../i18n'

type Step = 'welcome' | 'kind' | 'review' | 'categories' | 'apps' | 'connect' | 'done'

/** Where the guide is. Kept for the tab's session: each sign-in leaves the page and comes back to /setup. */
interface Guide {
  step: Step
  kind: BusinessKind | null
  /** The apps ticked (a ready-made setup, or a category's screen). */
  picked: string[]
  /** The categories chosen on "Choose my own apps", and which one is showing. */
  groups: ConnectionGroup[]
  at: number
  /** Apps waiting to be connected, one sign-in each, and how many there were. */
  queue: string[]
  total: number
  /** Where to go once the queue is empty. */
  after: Step
}

const START: Guide = { step: 'welcome', kind: null, picked: [], groups: [], at: 0, queue: [], total: 0, after: 'done' }
const KEY = 'eb-setup-guide'

function load(): Guide {
  try { return { ...START, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } } catch { return START }
}

/** A business just created: the guide opens with its kind chosen and that kind's apps ticked (Use a ready-made setup). */
export function startGuide(kind: BusinessKind | 'other' | null) {
  const preset = PRESETS.find(p => p.kind === kind)
  const guide: Guide = { ...START, kind: preset?.kind ?? null, picked: preset ? preset.apps.filter(a => a.on && findApp(a.id)).map(a => a.id) : [] }
  try { sessionStorage.setItem(KEY, JSON.stringify(guide)) } catch { /* storage unavailable: the guide starts from the top */ }
}

/** Connected, or chosen and waiting to be proven (a calendar, a Page to pick): done as far as the queue goes. */
const settled = (data: IntegrationsState | null, id: string) =>
  data?.integrations.some(i => i.provider === id && (i.status === 'connected' || i.status === 'pending')) ?? false

const STEPS = ['Start', 'Choose apps', 'Connect', 'Done'] as const
const stepIndex: Record<Step, number> = { welcome: 0, kind: 1, review: 1, categories: 1, apps: 2, connect: 2, done: 3 }
const KIND_ICON: Record<BusinessKind, ReactNode> = { cafe: <CafeIcon />, restaurant: <RestaurantIcon />, salon: <SalonIcon /> }
// A light, different tint behind each kind and category icon.
const TINTS = [tokens.roseSoft, tokens.roseWash, tokens.ubeSoft, tokens.matchaSoft, tokens.infoBg, tokens.surfaceAlt]

/**
 * The set-up guide for a new business: pick a ready-made setup (café, restaurant, salon) or choose
 * categories, tick the apps, and connect them one sign-in after another. Every step can be skipped.
 * Connecting is the Connections page's own (useConnect, ConnectorDialog), so it works the same.
 */
export function SetupPage() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const navigate = useNavigate()
  const data = useAsync('integrations', () => api.integrations(), [])
  const [g, setGuide] = useState<Guide>(load)
  const set = (patch: Partial<Guide>) => setGuide(prev => ({ ...prev, ...patch }))
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(g)) } catch { /* storage unavailable */ } }, [g])
  useConnectResult(data.reload)

  // Apps drop out of the queue once connected (back from their sign-in, or straight away in the demo).
  useEffect(() => {
    if (!data.data || !g.queue.length) return
    const left = g.queue.filter(id => !settled(data.data, id))
    if (left.length !== g.queue.length) set(left.length ? { queue: left } : { queue: [], step: g.after })
  }, [data.data])

  /** Connect these apps one after another (those already connected are left out), then go on. */
  const connectAll = (ids: string[], after: Step) => {
    const queue = ids.filter(id => findApp(id) && !settled(data.data, id))
    set(queue.length ? { queue, total: queue.length, after, step: 'connect' } : { step: after })
  }
  /** Finished or skipped: Today stops suggesting the guide. */
  const finish = (to: string) => run(async () => {
    await api.updateBusiness({ setup_completed_at: new Date().toISOString() })
    try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
    await refresh()
    navigate(to)
  })
  const preset = PRESETS.find(p => p.kind === g.kind) ?? null
  const toConnect = g.picked.filter(id => !settled(data.data, id))
  const group = SETUP_GROUPS.find(x => x.key === g.groups[g.at]) ?? null
  const nextCategory = () => (g.at + 1 < g.groups.length ? set({ at: g.at + 1, picked: [] }) : set({ step: 'done' }))

  const agent = {
    welcome: t('I’ll help with posts, reviews, emails and paperwork once I can reach the apps you already use.'),
    kind: t('Tell me what you do and I’ll suggest the apps to connect. You can change everything on the next screen.'),
    review: preset ? t(preset.agent) : '',
    categories: t('Pick the areas you’d like help with. I’ll show one short screen for each.'),
    apps: t('Connect one at a time, or tick several and connect them together. I only post or send what you approve.'),
    connect: t('Each app opens its own sign-in. When you’re done you come straight back here for the next one.'),
    done: t('That’s enough for me to get started. I’ll let you know if anything stops working.'),
  }[g.step]

  return (
    <Frame step={g.step} agent={agent} onSkip={() => finish('/')}>
      {g.step === 'welcome' && (
        <Stack spacing={3} sx={{ maxWidth: 760 }}>
          <Box>
            <Typography variant="h4" component="h1">{t('Hi {name}, I’m your Business Agent.', { name: me?.full_name.split(' ')[0] ?? '' })}</Typography>
            <Typography sx={{ color: 'text.secondary', mt: 1 }}>
              {t('Let’s connect the apps your business already uses. It takes about three minutes, and every step can be skipped.')}
            </Typography>
          </Box>
          <Choice icon={<BoltIcon />} tint={tokens.roseSoft} title={t('Use a ready-made setup')} badge={t('Recommended')} selected
            text={t('Café, restaurant or salon: pick your type and I’ll suggest the apps. Untick what you don’t use, then connect them all in one go.')}
            onClick={() => set({ step: 'kind' })} />
          <Choice icon={<GridIcon />} tint={tokens.ubeSoft} title={t('Choose my own apps')}
            text={t('Pick categories such as social media and file storage, then connect only what you need.')}
            onClick={() => set({ step: 'categories', groups: [], at: 0 })} />
          <Stack spacing={1}>
            {[t('Nothing is posted or sent without your approval'), t('You choose which accounts it can use'), t('Disconnect anything, any time')].map(x => (
              <Stack key={x} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CheckIcon sx={{ fontSize: 18, color: tokens.matchaDeep }} /><Typography variant="body2">{x}</Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}

      {g.step === 'kind' && (
        <Screen title={t('What kind of business are you?')} sub={t('I’ll suggest the apps businesses like yours connect first.')}
          footer={<>
            <Button onClick={() => set({ step: 'welcome' })}>{t('Back')}</Button>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => set({ step: 'categories', groups: [], at: 0 })}>{t('Skip, I’ll pick my own')}</Button>
              <Button variant="contained" disabled={!preset} onClick={() => set({ step: 'review' })}>{t('Next')}</Button>
            </Stack>
          </>}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
            {PRESETS.map((p, i) => {
              const ticked = p.apps.filter(a => a.on && findApp(a.id)).map(a => a.id)
              return (
                <Choice key={p.kind} icon={KIND_ICON[p.kind]} tint={TINTS[i]} title={t(p.name)} text={t(p.blurb)}
                  note={tn(ticked.length, '{n} suggested app', '{n} suggested apps')} selected={g.kind === p.kind} pressed={g.kind === p.kind}
                  onClick={() => set({ kind: p.kind, picked: ticked })} />
              )
            })}
            <Choice icon={<AddIcon />} tint={TINTS[3]} title={t('Something else')} text={t('Start from the categories and add apps yourself.')}
              onClick={() => set({ step: 'categories', kind: null, groups: [], at: 0 })} />
          </Box>
        </Screen>
      )}

      {g.step === 'review' && preset && (
        <Screen eyebrow={t(preset.name)} title={t('Your recommended setup')} sub={t('I’ve ticked the apps most businesses like yours connect first. Untick anything you don’t use.')}
          footer={<>
            <Button onClick={() => set({ step: 'kind' })}>{t('Back')}</Button>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => set({ step: 'categories', groups: groupsOf(g.picked), at: 0 })}>{t('Customise by category')}</Button>
              <Button variant="contained" onClick={() => connectAll(g.picked, 'done')}>
                {toConnect.length ? tn(toConnect.length, 'Connect {n} app', 'Connect {n} apps') : t('Next')}
              </Button>
            </Stack>
          </>}>
          <AppList ids={preset.apps.map(a => a.id)} picked={g.picked} data={data.data} reload={data.reload}
            onTick={id => set({ picked: tick(g.picked, id) })} />
        </Screen>
      )}

      {g.step === 'categories' && (
        <Screen title={t('What would you like to connect?')} sub={t('Choose as many as you like.')}
          footer={<>
            <Button onClick={() => set({ step: 'welcome' })}>{t('Back')}</Button>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1 }}>{tn(g.groups.length, '{n} chosen', '{n} chosen')}</Typography>
              <Button onClick={() => set({ step: 'done' })}>{t('Skip this step')}</Button>
              <Button variant="contained" disabled={!g.groups.length} onClick={() => set({ step: 'apps', at: 0, picked: [] })}>{t('Continue')}</Button>
            </Stack>
          </>}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {SETUP_GROUPS.map((x, i) => {
              const on = g.groups.includes(x.key)
              return (
                <Choice key={x.key} compact tint={TINTS[i % TINTS.length]} icon={<Box sx={{ '& svg': { width: 22, height: 22 } }}><Logo id={x.options[0].id} size={34} /></Box>}
                  title={t(x.title)} text={x.options.map(o => o.name).join(', ')} selected={on} pressed={on}
                  onClick={() => set({ groups: on ? g.groups.filter(k => k !== x.key) : SETUP_GROUPS.map(y => y.key).filter(k => k === x.key || g.groups.includes(k)) })} />
              )
            })}
          </Box>
        </Screen>
      )}

      {g.step === 'apps' && group && (
        <Screen eyebrow={t('Step {n} of {total}', { n: g.at + 1, total: g.groups.length })} title={t(group.title)}
          sub={group.pickOne ? t('Choose one: connecting another replaces it.') : t('Connect one, or tick several and connect them together.')}
          footer={<>
            <Button onClick={() => (g.at > 0 ? set({ at: g.at - 1, picked: [] }) : set({ step: 'categories' }))}>{t('Back')}</Button>
            <Stack direction="row" spacing={1}>
              {toConnect.length > 0 && <Button variant="outlined" onClick={() => connectAll(toConnect, 'apps')}>{tn(toConnect.length, 'Connect {n} selected', 'Connect {n} selected')}</Button>}
              <Button onClick={nextCategory}>{t('Skip this step')}</Button>
              <Button variant="contained" onClick={nextCategory}>{g.at + 1 < g.groups.length ? t('Next') : t('Finish')}</Button>
            </Stack>
          </>}>
          <AppList ids={group.options.map(o => o.id)} picked={g.picked} data={data.data} reload={data.reload} flat
            onTick={id => set({ picked: tick(g.picked, id) })} />
        </Screen>
      )}

      {g.step === 'connect' && g.queue[0] && (
        <Queue key={g.queue[0]} guide={g} data={data.data} reload={data.reload}
          onSkip={() => set(g.queue.length > 1 ? { queue: g.queue.slice(1) } : { queue: [], step: g.after })}
          onStop={() => set({ queue: [], step: g.after })} />
      )}

      {g.step === 'done' && (
        <Summary data={data.data} picked={g.picked}
          onMore={() => set({ step: 'categories', groups: [], at: 0 })}
          onConnections={() => finish('/connections')} onToday={() => finish('/')} />
      )}
    </Frame>
  )
}

/** The page around every step: the light pink side panel (logo, steps, the agent's note) and the content. */
function Frame({ step, agent, onSkip, children }: { step: Step; agent: string; onSkip: () => void; children: ReactNode }) {
  const at = stepIndex[step]
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, bgcolor: tokens.bg, backgroundImage: tokens.backdrop }}>
      <Box component="aside" sx={{ width: { md: 300 }, flexShrink: 0, bgcolor: tokens.roseSoft, p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column',
        gap: { xs: 1.5, md: 4 }, position: { md: 'sticky' }, top: 0, height: { md: '100vh' }, boxSizing: 'border-box' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          {/* The product's own mark: the guide is Business Agent setting itself up, before any branding of the business. */}
          <AgentMark size={40} />
          <Box sx={{ flex: 1 }}><Wordmark size="1.4rem" /></Box>
          <Button size="small" onClick={onSkip} sx={{ display: { md: 'none' } }}>{t('Skip')}</Button>
        </Stack>
        <LinearProgress variant="determinate" value={(at / (STEPS.length - 1)) * 100} aria-label={t('Set-up steps')}
          sx={{ display: { md: 'none' }, height: 6, borderRadius: 3, bgcolor: tokens.surface }} />
        <Stack component="ol" aria-label={t('Set-up steps')} spacing={2.25} sx={{ display: { xs: 'none', md: 'flex' }, m: 0, p: 0, listStyle: 'none' }}>
          {STEPS.map((name, i) => (
            <Stack component="li" key={name} direction="row" spacing={1.5} sx={{ alignItems: 'center' }} aria-current={i === at ? 'step' : undefined}>
              <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                ...(i < at ? { bgcolor: tokens.matchaDeep, color: '#fff' } : i === at ? { bgcolor: tokens.rose, color: tokens.espresso, boxShadow: `0 0 0 4px ${tokens.glow}` }
                  : { border: `1.5px solid ${tokens.lineStrong}`, color: tokens.inkSoft }) }}>
                {i < at ? <CheckIcon sx={{ fontSize: 16 }} /> : i + 1}
              </Box>
              <Typography sx={{ fontWeight: i === at ? 600 : 400, color: i > at ? 'text.secondary' : 'text.primary' }}>{t(name)}</Typography>
            </Stack>
          ))}
        </Stack>
        <Stack spacing={1.5} sx={{ mt: 'auto', display: { xs: 'none', md: 'flex' } }}>
          {agent && (
            <Card sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: tokens.ube, display: 'grid', placeItems: 'center', color: tokens.espresso }}><SparkIcon sx={{ fontSize: 16 }} /></Box>
                <Typography variant="subtitle2">{t('Your agent')}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{agent}</Typography>
            </Card>
          )}
          {step !== 'done' && <Button onClick={onSkip} sx={{ alignSelf: 'flex-start' }}>{t('Skip setup for now')}</Button>}
        </Stack>
      </Box>
      <Box component="main" sx={{ flex: 1, minWidth: 0, px: { xs: 2, md: 7 }, py: { xs: 3, md: 6 } }}>{children}</Box>
    </Box>
  )
}

/** A step with a title and its buttons along the bottom. */
function Screen({ eyebrow, title, sub, footer, children }: { eyebrow?: string; title: string; sub?: string; footer: ReactNode; children: ReactNode }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 1040 }}>
      <Box>
        {eyebrow && <Typography variant="overline" sx={{ color: tokens.roseDeep }}>{eyebrow}</Typography>}
        <Typography variant="h4" component="h1">{title}</Typography>
        {sub && <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>{sub}</Typography>}
      </Box>
      {children}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, pt: 2, borderTop: `1px solid ${tokens.line}` }}>
        {footer}
      </Stack>
    </Stack>
  )
}

/** A big choice card (a way to start, a kind of business, a category). */
function Choice({ icon, tint, title, text, note, badge, selected, pressed, compact, onClick }: {
  icon: ReactNode; tint: string; title: string; text: string; note?: string; badge?: string; selected?: boolean; pressed?: boolean; compact?: boolean; onClick: () => void
}) {
  return (
    <Card sx={{ border: `2px solid ${selected ? tokens.roseDeep : tokens.line}`, bgcolor: selected ? tokens.today : tokens.surface, height: '100%' }}>
      <CardActionArea onClick={onClick} aria-pressed={pressed} sx={{ p: compact ? 2 : 2.75, height: '100%', display: 'flex', alignItems: compact ? 'center' : 'flex-start',
        flexDirection: compact ? 'row' : 'column', justifyContent: 'flex-start', gap: compact ? 1.75 : 1.25 }}>
        <Box sx={{ width: compact ? 46 : 52, height: compact ? 46 : 52, borderRadius: '14px', bgcolor: tint, display: 'grid', placeItems: 'center', flexShrink: 0, color: tokens.ink }}>{icon}</Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: compact ? '1rem' : '1.2rem' }}>{title}</Typography>
            {badge && <Box component="span" sx={{ fontSize: 12, fontWeight: 600, px: 1, py: 0.25, borderRadius: 99, bgcolor: tokens.goodBg, color: tokens.goodFg }}>{badge}</Box>}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{text}</Typography>
          {note && <Typography variant="body2" sx={{ color: tokens.roseDeep, fontWeight: 600, mt: 0.75 }}>{note}</Typography>}
        </Box>
        {/* Only a picture of the tick: the card itself is the toggle button (aria-pressed). */}
        {compact && <Box aria-hidden sx={{ width: 22, height: 22, borderRadius: '7px', flexShrink: 0, display: 'grid', placeItems: 'center',
          ...(selected ? { bgcolor: tokens.roseDeep, color: '#fff' } : { border: `2px solid ${tokens.lineStrong}` }) }}>
          {selected && <CheckIcon sx={{ fontSize: 16 }} />}
        </Box>}
      </CardActionArea>
    </Card>
  )
}

/** Apps to tick, by group (or as one list on a category's own screen), each with its own Connect too. */
function AppList({ ids, picked, data, reload, onTick, flat }: {
  ids: string[]; picked: string[]; data: IntegrationsState | null; reload: () => Promise<void>; onTick: (id: string) => void; flat?: boolean
}) {
  const apps = ids.map(findApp).filter(x => !!x)
  const groups: ConnectionGroupInfo[] = []
  for (const { g } of apps) if (!groups.some(x => x.key === g.key)) groups.push(g)
  return (
    <Stack spacing={2}>
      {groups.map(g => (
        <Card key={g.key} component="section" aria-label={t(g.title)}>
          {!flat && <Typography variant="overline" component="h2" sx={{ display: 'block', px: 2.5, pt: 1.25, color: 'text.secondary' }}>{t(g.title)}</Typography>}
          {apps.filter(a => a.g.key === g.key).map(({ o }) => (
            <AppRow key={o.id} s={optionStateOf(o, g, data)} picked={picked.includes(o.id)} loading={!data} reload={reload} onTick={() => onTick(o.id)} />
          ))}
        </Card>
      ))}
    </Stack>
  )
}

function AppRow({ s, picked, loading, reload, onTick }: { s: OptionState; picked: boolean; loading: boolean; reload: () => Promise<void>; onTick: () => void }) {
  const [open, setOpen] = useState(false)
  const connect = useConnect(s, 'setup', reload, () => setOpen(true))
  const done = s.status === 'connected' || s.status === 'pending'
  return (
    <Box component="article" aria-label={s.o.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 1.5, sm: 2.5 }, py: 1.25, flexWrap: { xs: 'wrap', sm: 'nowrap' },
      borderTop: `1px solid ${tokens.line}`, bgcolor: picked ? tokens.today : 'transparent' }}>
      <Checkbox checked={picked && !done} disabled={done || loading} onChange={onTick} slotProps={{ input: { 'aria-label': t('Choose {app}', { app: s.o.name }) } }} sx={{ p: 0.5 }} />
      <Logo id={s.o.id} size={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ lineHeight: 1.35 }}>{s.o.name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {done && s.row?.account_label ? s.row.account_label : DOES[s.o.id] && t(DOES[s.o.id]!)}
        </Typography>
      </Box>
      {!loading && (
        // On a phone the buttons take their own line under the app, so nothing squeezes its name.
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexShrink: 0, justifyContent: 'flex-end', width: { xs: '100%', sm: 'auto' } }}>
          <StatusChip s={s} />
          {oneClick(s) && !s.current && <Button size="small" variant="contained" onClick={connect} aria-label={t('Connect {app}', { app: s.o.name })}>{t('Connect')}</Button>}
          {!oneClick(s) && !done && s.status !== 'error' && <Button size="small" onClick={() => setOpen(true)} aria-label={t('Set up {app}', { app: s.o.name })}>{t('Details')}</Button>}
          {(done || s.status === 'error' || (oneClick(s) && s.current)) && <Button size="small" onClick={() => setOpen(true)} aria-label={t('Manage {app}', { app: s.o.name })}>{t('Manage')}</Button>}
        </Stack>
      )}
      {open && <ConnectorDialog s={s} back="setup" reload={reload} onClose={() => setOpen(false)} />}
    </Box>
  )
}

/** Connecting several apps: one sign-in at a time, with the rest waiting their turn. */
function Queue({ guide, data, reload, onSkip, onStop }: { guide: Guide; data: IntegrationsState | null; reload: () => Promise<void>; onSkip: () => void; onStop: () => void }) {
  const app = findApp(guide.queue[0])!
  const s = optionStateOf(app.o, app.g, data)
  const [open, setOpen] = useState(false)
  const connect = useConnect(s, 'setup', reload, () => setOpen(true))
  const n = guide.total - guide.queue.length + 1
  return (
    <Stack spacing={3} sx={{ maxWidth: 820 }}>
      <Box>
        <Typography variant="overline" sx={{ color: tokens.roseDeep }}>{t('Connecting {n} of {total}', { n, total: guide.total })}</Typography>
        <LinearProgress variant="determinate" value={((n - 1) / guide.total) * 100} aria-hidden sx={{ height: 6, borderRadius: 3, mt: 0.5, bgcolor: tokens.roseSoft }} />
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
        <Card component="section" aria-label={t('Waiting to connect')} sx={{ width: { md: 240 }, flexShrink: 0, p: 1.5, bgcolor: tokens.roseSoft }}>
          {guide.queue.map((id, i) => (
            <Stack key={id} direction="row" spacing={1.25} sx={{ alignItems: 'center', p: 1, borderRadius: '12px', bgcolor: i === 0 ? tokens.surface : 'transparent' }}>
              <Logo id={id as OptionState['o']['id']} size={32} />
              <Typography sx={{ flex: 1, fontWeight: 500 }}>{findApp(id)?.o.name}</Typography>
              <Typography variant="caption" sx={{ color: i === 0 ? tokens.roseDeep : 'text.secondary', fontWeight: 600 }}>{i === 0 ? t('Now') : t('Next')}</Typography>
            </Stack>
          ))}
        </Card>
        <Card sx={{ flex: 1, p: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
            <Logo id={s.o.id} size={52} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" component="h1">{t('Connect {app}', { app: s.o.name })}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('by {company}', { company: s.o.by })}</Typography>
            </Box>
            <StatusChip s={s} />
          </Stack>
          {DOES[s.o.id] && <Typography sx={{ color: 'text.secondary' }}>{t(DOES[s.o.id]!)}</Typography>}
          {CAN[s.o.id] && <>
            <Typography variant="overline" component="h2" sx={{ display: 'block', color: 'text.secondary', mt: 2 }}>{t('When you connect, it can')}</Typography>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {CAN[s.o.id]!.map(c => <Stack component="li" key={c} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <DotIcon sx={{ fontSize: 8, mt: 1, color: tokens.inkFaint }} /><Typography variant="body2">{t(c)}</Typography>
              </Stack>)}
            </Stack>
          </>}
          {s.row?.last_error && <Alert severity="error" sx={{ mt: 2 }}>{s.row.last_error}</Alert>}
          {!s.configured && <Alert severity="warning" sx={{ mt: 2 }}>{t('{app} isn’t set up for Business Agent yet. Skip it for now; it stays on the Connections page.', { app: s.o.name })}</Alert>}
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 3, alignItems: 'center' }}>
            {oneClick(s) && <Button variant="contained" onClick={connect}>{t('Continue to {app}', { app: s.o.name })}</Button>}
            {!oneClick(s) && s.configured && <Button variant="contained" onClick={() => setOpen(true)}>{t('Set up {app}', { app: s.o.name })}</Button>}
            <Button onClick={onSkip}>{t('Skip {app}', { app: s.o.name })}</Button>
            <Button onClick={onStop} sx={{ ml: 'auto' }}>{t('Stop connecting')}</Button>
          </Stack>
        </Card>
      </Stack>
      {open && <ConnectorDialog s={s} back="setup" reload={reload} onClose={() => setOpen(false)} />}
    </Stack>
  )
}

/** The end: what's connected, what needs a look, what was skipped. */
function Summary({ data, picked, onMore, onConnections, onToday }: {
  data: IntegrationsState | null; picked: string[]; onMore: () => void; onConnections: () => void; onToday: () => void
}) {
  const rows = data?.integrations ?? []
  const connected = rows.filter(i => i.status === 'connected' && findApp(i.provider))
  const attention = rows.filter(i => (i.status === 'error' || i.status === 'pending') && findApp(i.provider))
  const skipped = picked.filter(id => findApp(id) && !rows.some(i => i.provider === id && i.status !== 'disconnected'))
  return (
    <Stack spacing={3} sx={{ maxWidth: 1040 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: tokens.goodBg, color: tokens.goodFg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><CheckIcon /></Box>
        <Box>
          <Typography variant="h4" component="h1">{tn(connected.length, 'You’re all set: {n} app connected', 'You’re all set: {n} apps connected')}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{t('Add, remove or reconnect apps any time in Settings → Connections.')}</Typography>
        </Box>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
        <Card component="section" aria-label={t('Connected')} sx={{ p: 2.5 }}>
          <Typography variant="overline" component="h2" sx={{ color: tokens.goodFg }}>{t('Connected')}</Typography>
          {connected.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing yet.')}</Typography>}
          {connected.map(i => (
            <Stack key={i.provider} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1, borderTop: `1px solid ${tokens.line}` }}>
              <Logo id={i.provider} size={34} />
              <Typography sx={{ flex: 1 }}>{findApp(i.provider)?.o.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{i.account_label ?? ''}</Typography>
            </Stack>
          ))}
        </Card>
        <Stack spacing={2}>
          {attention.length > 0 && (
            <Card component="section" aria-label={t('Needs a look')} sx={{ p: 2.5 }}>
              <Typography variant="overline" component="h2" sx={{ color: tokens.warnFg }}>{t('Needs a look')}</Typography>
              {attention.map(i => (
                <Stack key={i.provider} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1, borderTop: `1px solid ${tokens.line}` }}>
                  <Logo id={i.provider} size={34} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography>{findApp(i.provider)?.o.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{i.last_error ?? t('Waiting to be finished on the Connections page')}</Typography>
                  </Box>
                </Stack>
              ))}
            </Card>
          )}
          {skipped.length > 0 && (
            <Card component="section" aria-label={t('Skipped')} sx={{ p: 2.5 }}>
              <Typography variant="overline" component="h2" sx={{ color: 'text.secondary' }}>{t('Skipped')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{skipped.map(id => findApp(id)?.o.name).join(', ')}</Typography>
            </Card>
          )}
          <Card sx={{ p: 2.5, bgcolor: tokens.ubeSoft }}>
            <Typography variant="subtitle1">{t('Try your agent now')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Ask it to draft a post for today’s special, or to find last month’s invoices.')}</Typography>
          </Card>
        </Stack>
      </Box>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Button onClick={onMore}>{t('Connect more apps')}</Button>
        <Button variant="outlined" onClick={onConnections}>{t('Manage connections')}</Button>
        <Button variant="contained" onClick={onToday}>{t('Go to Today')}</Button>
      </Stack>
    </Stack>
  )
}
