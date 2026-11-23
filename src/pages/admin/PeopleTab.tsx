import {
  Autocomplete, Box, Button, ButtonBase, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { Empty, ErrorBox, Loading, Tag } from '../../components/common'
import { orgChart, reportsInACircle, teamUnder, type AdminPerson, type PersonInput, type PersonKind, type PersonNode } from '../../../shared/adminArea'
import { useAdmin, useAdminQuery } from './shared'
import { fonts, tokens } from '../../theme'
import { t, tn } from '../../i18n'

const GAP = 20
const LINE = `1.5px solid ${tokens.inkFaint}`
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

/**
 * People: everyone involved in The Business Agent as a chart, from the CEO down, each with whom they
 * report to and their labels ("C TWO"); the investors above it, linked to the team by their investment;
 * and the substitutes bench below it, ready to step in. On a phone, the same
 * as an indented list (a chart that wide would open scrolled away from its top). Someone opens to be
 * changed (their name, what they do, whom they report to) or taken off (whoever reported to them then
 * reports to whom they reported to).
 */
export function PeopleTab() {
  const { api } = useApp()
  const people = useAdminQuery('people', tk => api.adminPeople(tk))
  const [editing, setEditing] = useState<PersonInput | null>(null)
  const wide = useMediaQuery(useTheme().breakpoints.up('md'))
  if (!people.data) return people.error ? <ErrorBox error={people.error} /> : <Loading />
  const all = people.data
  const chart = orgChart(all)
  const onTeam = all.filter(p => (p.kind ?? 'team') === 'team').length

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {[tn(onTeam, '{n} person on the team', '{n} people on the team'), chart.bench.length ? tn(chart.bench.length, '{n} on the bench', '{n} on the bench') : null,
            tn(chart.investors.length, '{n} investor', '{n} investors')].filter(Boolean).join(' · ')}
          {'. '}{t('Open someone to change what they do or whom they report to.')}
        </Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setEditing({ name: '', role: '', kind: 'team', reports_to: chart.team[0]?.person.id ?? null })}
          sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}>{t('Add someone')}</Button>
      </Stack>
      <ErrorBox error={people.error} />
      {all.length === 0 ? <Empty>{t('Nobody here yet. Add the CEO first, then whoever reports to them.')}</Empty> : wide ? (
        <Card variant="outlined">
          {/* Wider than the screen: it scrolls inside itself, not the page. */}
          <CardContent sx={{ overflowX: 'auto', py: 3 }}>
            <Box sx={{ width: 'max-content', minWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {chart.investors.length > 0 && (
                <>
                  <Typography variant="overline" component="h2" sx={{ color: 'text.secondary', lineHeight: 1.5, mb: 0.75 }}>{t('Investors')}</Typography>
                  <Stack component="ul" aria-label={t('Investors')} direction="row" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {chart.investors.map(p => (
                      <Box component="li" key={p.id} aria-label={p.name}><PersonCard person={p} look="investor" onOpen={() => setEditing(p)} /></Box>
                    ))}
                  </Stack>
                  {chart.team.length > 0 && <Investment />}
                </>
              )}
              {chart.team.length > 0 && (
                <Box component="ul" aria-label={t('The team')} sx={tree}>
                  {chart.team.map(n => <Branch key={n.person.id} node={n} onOpen={setEditing} />)}
                </Box>
              )}
              {chart.bench.length > 0 && (
                <Box sx={{ alignSelf: 'stretch', mt: 3, pt: 2.5, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Typography variant="overline" component="h2" sx={{ color: 'text.secondary', lineHeight: 1.5, mb: 0.75 }}>{t('Substitutes bench')}</Typography>
                  <Stack component="ul" aria-label={t('Substitutes bench')} direction="row" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {chart.bench.map(p => (
                      <Box component="li" key={p.id} aria-label={p.name}><PersonCard person={p} look="bench" onOpen={() => setEditing(p)} /></Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <CardContent>
            {chart.investors.length > 0 && (
              <>
                <Typography variant="overline" component="h2" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>{t('Investors')}</Typography>
                <Stack component="ul" aria-label={t('Investors')} spacing={1} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
                  {chart.investors.map(p => (
                    <Box component="li" key={p.id} aria-label={p.name}><PersonRow person={p} look="investor" onOpen={() => setEditing(p)} /></Box>
                  ))}
                </Stack>
                {chart.team.length > 0 && <Investment />}
              </>
            )}
            {chart.team.length > 0 && (
              <Box component="ul" aria-label={t('The team')} sx={outline}>
                {chart.team.map(n => <Branch key={n.person.id} node={n} onOpen={setEditing} compact />)}
              </Box>
            )}
            {chart.bench.length > 0 && (
              <Box sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="overline" component="h2" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>{t('Substitutes bench')}</Typography>
                <Stack component="ul" aria-label={t('Substitutes bench')} spacing={1} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
                  {chart.bench.map(p => (
                    <Box component="li" key={p.id} aria-label={p.name}><PersonRow person={p} look="bench" onOpen={() => setEditing(p)} /></Box>
                  ))}
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
      {editing && <PersonDialog start={editing} people={all} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

/**
 * The chart's lines: each list of reports hangs from a line down from their boss, with a line across
 * the top of them and one down to each; the top of the team has none above it.
 */
const tree = {
  display: 'flex', justifyContent: 'center', listStyle: 'none', m: 0, p: 0, position: 'relative',
  '& ul': {
    display: 'flex', justifyContent: 'center', listStyle: 'none', m: 0, p: 0, pt: `${GAP}px`, position: 'relative',
    '&::before': { content: '""', position: 'absolute', top: 0, left: '50%', height: GAP, borderLeft: LINE },
  },
  '& li': {
    display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', px: 0.75, pt: `${GAP}px`,
    '&::before, &::after': { content: '""', position: 'absolute', top: 0, right: '50%', width: '50%', height: GAP, borderTop: LINE },
    '&::after': { right: 'auto', left: '50%', borderLeft: LINE },
    '&:first-of-type::before, &:last-of-type::after': { border: 'none' },
    '&:last-of-type::before': { borderRight: LINE, borderTopRightRadius: 6 },
    '&:first-of-type::after': { borderTopLeftRadius: 6 },
    '&:only-of-type': { pt: 0 },
    '&:only-of-type::before, &:only-of-type::after': { display: 'none' },
  },
  // The top: no lines above it.
  '& > li': { pt: 0 },
  '& > li::before, & > li::after': { display: 'none' },
} as const

/**
 * On a phone: one person a row, those who report to them indented under them, joined by a line down
 * from their boss and across to each.
 */
const ROW_MIDDLE = 34
const outline = {
  listStyle: 'none', m: 0, p: 0,
  '& ul': { listStyle: 'none', m: 0, p: 0, pl: '18px', ml: '24px' },
  '& ul > li': {
    position: 'relative', pt: 1,
    '&::before': { content: '""', position: 'absolute', left: -18, top: 0, width: 14, height: ROW_MIDDLE, borderLeft: LINE, borderBottom: LINE,
      borderBottomLeftRadius: 8 },
    '&::after': { content: '""', position: 'absolute', left: -18, top: ROW_MIDDLE, bottom: 0, borderLeft: LINE },
    '&:last-of-type::after': { display: 'none' },
  },
} as const

/** Between the investors and the team: their investment. */
function Investment() {
  return (
    <Stack aria-hidden sx={{ alignItems: 'center', my: 0.5 }}>
      <Box sx={{ height: 14, borderLeft: `1.5px dashed ${tokens.ubeDeep}` }} />
      <Typography variant="caption" sx={{ px: 1, borderRadius: 999, color: tokens.ubeDeep, bgcolor: tokens.ubeSoft, fontWeight: 600 }}>{t('Investment')}</Typography>
      <Box sx={{ height: 14, borderLeft: `1.5px dashed ${tokens.ubeDeep}` }} />
    </Stack>
  )
}

function Branch({ node, onOpen, compact = false }: { node: PersonNode; onOpen: (p: AdminPerson) => void; compact?: boolean }) {
  const Face = compact ? PersonRow : PersonCard
  return (
    <Box component="li" aria-label={node.person.name}>
      <Face person={node.person} under={teamUnder(node)} onOpen={() => onOpen(node.person)} />
      {node.reports.length > 0 && (
        <Box component="ul" aria-label={t('Reporting to {name}', { name: node.person.name })}>
          {node.reports.map(r => <Branch key={r.person.id} node={r} onOpen={onOpen} compact={compact} />)}
        </Box>
      )}
    </Box>
  )
}

/** How someone looks: the team in rose; the investors in ube, dashed; the bench in grey, dashed (not in the team yet). */
type Look = 'team' | 'bench' | 'investor'
const LOOK: Record<Look, { border: string; style: string; fg: string; bg: string }> = {
  team: { border: tokens.line, style: 'solid', fg: tokens.roseDeep, bg: tokens.roseSoft },
  bench: { border: tokens.inkFaint, style: 'dashed', fg: tokens.neutralFg, bg: tokens.neutralBg },
  investor: { border: tokens.ubeDeep, style: 'dashed', fg: tokens.ubeDeep, bg: tokens.ubeSoft },
}
const face = (look: Look) => ({
  bgcolor: 'background.paper', border: 1, borderColor: LOOK[look].border, borderStyle: LOOK[look].style, borderRadius: '12px',
  '&:hover': { bgcolor: tokens.hover }, '&:focus-visible': { outline: `2px solid ${tokens.ink}`, outlineOffset: 2 },
})

function Initials({ name, look }: { name: string; look: Look }) {
  return (
    <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600,
      fontFamily: fonts.display, bgcolor: LOOK[look].bg, color: LOOK[look].fg }}>
      {initials(name)}
    </Box>
  )
}

/** Their labels, as tags. */
function Labels({ labels, center = false }: { labels?: string[]; center?: boolean }) {
  if (!labels?.length) return null
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', mt: 0.25 }}>
      {labels.map(l => <Tag key={l} fg={tokens.infoFg} bg={tokens.infoBg}>{l}</Tag>)}
    </Stack>
  )
}

/** Someone as a row (on a phone): their initials, name and what they do; how many are below them. */
function PersonRow({ person: p, under = 0, look = 'team', onOpen }: { person: AdminPerson; under?: number; look?: Look; onOpen: () => void }) {
  return (
    <ButtonBase onClick={onOpen} aria-label={t('Open {name}', { name: p.name })}
      sx={{ ...face(look), width: '100%', display: 'flex', alignItems: 'center', gap: 1.25, p: '8px 12px 8px 8px', textAlign: 'left', justifyContent: 'flex-start' }}>
      <Initials name={p.name} look={look} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.name}</Typography>
        {p.role && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.role}</Typography>}
        <Labels labels={p.labels} />
      </Box>
      {under > 0 && <Typography variant="caption" sx={{ color: tokens.inkFaint, flexShrink: 0 }}>{tn(under, '{n} below', '{n} below')}</Typography>}
    </ButtonBase>
  )
}

function PersonCard({ person: p, under = 0, look = 'team', onOpen }: { person: AdminPerson; under?: number; look?: Look; onOpen: () => void }) {
  return (
    <ButtonBase onClick={onOpen} aria-label={t('Open {name}', { name: p.name })}
      sx={{ ...face(look), width: 148, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, p: 1.25, textAlign: 'center' }}>
      <Initials name={p.name} look={look} />
      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.name}</Typography>
      {p.role && <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{p.role}</Typography>}
      <Labels labels={p.labels} center />
      {under > 0 && <Typography variant="caption" sx={{ color: tokens.inkFaint, lineHeight: 1.2 }}>{tn(under, '{n} below', '{n} below')}</Typography>}
    </ButtonBase>
  )
}

/** Someone added or changed: their name, what they do, on the team (whom they report to), on the bench or an investor; or taken off. */
function PersonDialog({ start, people, onClose }: { start: PersonInput; people: AdminPerson[]; onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const [p, setP] = useState<PersonInput>(start)
  const set = (patch: PersonInput) => setP(x => ({ ...x, ...patch }))
  // Whom they can report to: someone on the team who isn't them, nor below them.
  const bosses = people.filter(x => x.kind === 'team' && x.id !== p.id && !(p.id && reportsInACircle(people, p.id, x.id)))
  const beside = (p.kind ?? 'team') !== 'team'
  // Labels already in use, to pick from; or a new one typed.
  const used = [...new Set(people.flatMap(x => x.labels ?? []))].sort((a, b) => a.localeCompare(b))
  const save = async () => {
    const sent: PersonInput = { id: p.id, name: p.name, role: p.role ?? null, kind: p.kind ?? 'team', reports_to: beside ? null : p.reports_to ?? null,
      labels: p.labels ?? [] }
    if (await run(() => api.saveAdminPerson(token, sent), p.id ? t('{name} saved', { name: p.name?.trim() ?? '' }) : t('{name} is on the chart', { name: p.name?.trim() ?? '' }))) onClose()
  }
  const remove = async () => {
    if (await run(() => api.deleteAdminPerson(token, p.id!), t('{name} is off the chart', { name: start.name ?? '' }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{p.id ? t('Edit {name}', { name: start.name ?? '' }) : t('Add someone')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={p.name ?? ''} onChange={e => set({ name: e.target.value })} autoFocus={!p.id} />
          <TextField label={t('What they do')} value={p.role ?? ''} onChange={e => set({ role: e.target.value })} placeholder={t('CEO, Salesperson, Engineer')} />
          <Autocomplete multiple freeSolo options={used} value={p.labels ?? []} onChange={(_, v) => set({ labels: v.map(x => x.trim()).filter(Boolean) })}
            renderValue={(v, getItemProps) => v.map((x, i) => { const { key, ...rest } = getItemProps({ index: i }); return <Chip key={key} size="small" label={x} {...rest} /> })}
            renderInput={params => <TextField {...params} label={t('Labels')} helperText={t('Type a label and press Enter, as C TWO')} />} />
          <ToggleButtonGroup exclusive size="small" value={p.kind ?? 'team'} onChange={(_, v: PersonKind | null) => v && set({ kind: v })} aria-label={t('On the team, on the bench or an investor')}>
            <ToggleButton value="team">{t('On the team')}</ToggleButton>
            <ToggleButton value="bench">{t('On the bench')}</ToggleButton>
            <ToggleButton value="investor">{t('Investor')}</ToggleButton>
          </ToggleButtonGroup>
          {!beside && (
            <TextField select label={t('Reports to')} value={p.reports_to ?? ''} onChange={e => set({ reports_to: e.target.value || null })}>
              <MenuItem value="">{t('Nobody: the top')}</MenuItem>
              {bosses.map(x => <MenuItem key={x.id} value={x.id}>{x.role ? `${x.name} · ${x.role}` : x.name}</MenuItem>)}
            </TextField>
          )}
          {p.id && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {beside ? t('The bench and the investors are beside the team: whoever reported to them reports to whom they reported to.')
                : t('Taken off the chart, whoever reported to them reports to whom they reported to.')}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {p.id && <Button color="error" startIcon={<DeleteIcon />} onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Take off')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!p.name?.trim()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
