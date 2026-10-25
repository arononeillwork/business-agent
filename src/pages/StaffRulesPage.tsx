import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle, Tag } from '../components/common'
import { ExpandAllButton, ExpandableCard, useExpanded } from '../components/Expandable'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal } from '../../shared/time'
import { businessConfig } from '../../shared/business.config'
import {
  RULE_PRESETS, readState, rulesChangedAt, rulesFromLines, sectionProblem, sortSections,
  type ReadState, type RulePreset, type RuleSection, type RuleSectionInput,
} from '../../shared/staffRules'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const day = (iso: string) => formatLocal(iso, 'd MMM yyyy')
const READ_TONE: Record<ReadState, { fg: string; bg: string }> = {
  read: { fg: tokens.goodFg, bg: tokens.goodBg }, outdated: { fg: tokens.warnFg, bg: tokens.warnBg }, never: { fg: tokens.badFg, bg: tokens.badBg },
}

/**
 * Staff rules: the house rules everyone on the team follows, in sections that open (being on time,
 * uniform and hygiene, food safety, phones, breaks, customers, the till, safety, respect). Employees
 * confirm they've read them, and are asked again when a section is added or changed afterwards (those
 * sections are marked). Admins write them (or start from the usual ones), put them in order, and see
 * who has read them since the last change.
 */
export function StaffRulesPage() {
  const { api, me, isAdmin, profiles, business } = useApp()
  const run = useAction()
  const [editing, setEditing] = useState<RuleSectionInput | null>(null)
  const data = useAsync('staff-rules', async () => {
    const [sections, read] = await Promise.all([api.ruleSections(), api.rulesRead()])
    return { sections, read }
  }, [])
  const sections = sortSections(data.data?.sections ?? [])
  const read = data.data?.read ?? []
  const changedAt = rulesChangedAt(sections)
  const myRead = read.find(r => r.profile_id === me?.id)
  const myState = readState(myRead, changedAt)
  const isNew = (s: RuleSection) => !isAdmin && myState === 'outdated' && !!myRead && Date.parse(s.updated_at) > Date.parse(myRead.read_at)
  const expanded = useExpanded(sections.map(s => s.id), id => sections.some(s => s.id === id && isNew(s)))
  const businessName = business?.name ?? businessConfig.name
  const employees = profiles.filter(p => p.active && p.role === 'employee')
  const readers = employees.map(p => ({ p, read: read.find(r => r.profile_id === p.id) })).map(x => ({ ...x, state: readState(x.read, changedAt) }))
  const upToDate = readers.filter(x => x.state === 'read').length
  const nextSort = sections.reduce((n, s) => Math.max(n, s.sort + 1), 0)

  const addPresets = (presets: RulePreset[]) => run(async () => {
    for (const [i, p] of presets.entries()) {
      await api.saveRuleSection({ title: t(p.title), intro: p.intro ? t(p.intro) : null, rules: p.rules.map(r => t(r)), sort: nextSort + i })
    }
  }, presets.length === 1 ? t('Section added') : t('Rules added'))
  /** Swap a section with the one above or below it (which asks nobody to read them again). */
  const move = (i: number, by: -1 | 1) => {
    const order = [...sections]
    ;[order[i], order[i + by]] = [order[i + by], order[i]]
    void run(() => Promise.all(order.map((s, j) => (s.sort === j ? null : api.saveRuleSection({ id: s.id, sort: j })))))
  }
  const confirm = () => run(() => api.readRules(), t('Thanks: you’ve confirmed you’ve read the rules'))

  const table = (): ExportTable => ({
    title: t('Staff rules'), filename: 'staff-rules',
    columns: [t('Section'), t('Rule')],
    rows: sections.flatMap(s => s.rules.map((r, i) => [i ? '' : s.title, r])),
  })

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Staff rules')} actions={<>
        <ExpandAllButton expanded={expanded} disabled={!sections.length} />
        {isAdmin && <ExportButton table={table} disabled={!sections.length} folder="Team" />}
        {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ title: '', rules: [], sort: nextSort })}>{t('Add a section')}</Button>}
      </>} />
      <ErrorBox error={data.error} />
      <Typography sx={{ mb: 2, maxWidth: 760 }}>
        {t('The house rules everyone at {business} follows. Open a section to read it.', { business: businessName })}
      </Typography>

      {!isAdmin && sections.length > 0 && (
        myState === 'read' && myRead
          ? <Alert severity="success" sx={{ mb: 3 }}>{t('You confirmed you’d read the rules on {date}.', { date: day(myRead.read_at) })}</Alert>
          : myState === 'outdated' && changedAt
            ? <Alert severity="warning" sx={{ mb: 3 }}>{t('The rules changed on {date}, after you last read them. What’s changed is open and marked: read it, then confirm at the bottom.', { date: day(changedAt) })}</Alert>
            : <Alert severity="info" sx={{ mb: 3 }}>{t('Please read every section, then confirm at the bottom that you’ve read them.')}</Alert>
      )}

      {data.data && sections.length === 0 && (
        <Card component="section" aria-label={t('No rules yet')} sx={{ mb: 3 }}>
          <CardContent>
            <Empty>
              <Typography sx={{ mb: isAdmin ? 1.5 : 0 }}>
                {isAdmin ? t('No rules yet. Start with the usual ones for a café in Spain, then change them to how you work.') : t('No rules have been written yet.')}
              </Typography>
              {isAdmin && <Button variant="contained" onClick={() => void addPresets(RULE_PRESETS)}>{t('Add the usual café rules')}</Button>}
            </Empty>
          </CardContent>
        </Card>
      )}

      <Box component="section" aria-label={t('Rules')} sx={{ mb: 3 }}>
        {sections.map((s, i) => (
          <ExpandableCard key={s.id} id={s.id} label={s.title} expanded={expanded} summary={
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{s.title}</Typography>
                {isNew(s) && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Changed')}</Tag>}
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(s.rules.length, '{n} rule', '{n} rules')}</Typography>
            </Box>
          }>
            {s.intro && <Typography variant="body2" sx={{ mb: 1.25, whiteSpace: 'pre-line' }}>{s.intro}</Typography>}
            <Box component="ol" sx={{ m: 0, pl: 3, '& li': { mb: 0.75 } }} aria-label={s.title}>
              {s.rules.map(r => <li key={r}><Typography variant="body2">{r}</Typography></li>)}
            </Box>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1.5 }}>
              {isAdmin && <>
                <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(s)} aria-label={t('Edit {name}', { name: s.title })}>{t('Edit')}</Button>
                <Tooltip title={t('Move up')}><span>
                  <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move {name} up', { name: s.title })}><UpIcon fontSize="small" /></IconButton>
                </span></Tooltip>
                <Tooltip title={t('Move down')}><span>
                  <IconButton size="small" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label={t('Move {name} down', { name: s.title })}><DownIcon fontSize="small" /></IconButton>
                </span></Tooltip>
              </>}
              <Typography variant="caption" sx={{ color: 'text.secondary', ml: isAdmin ? 'auto' : 0 }}>{t('Last changed on {date}', { date: day(s.updated_at) })}</Typography>
            </Stack>
          </ExpandableCard>
        ))}
      </Box>

      {!isAdmin && sections.length > 0 && (
        <Card component="section" aria-label={t('Confirm')} sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Typography>
                {myState === 'read' && myRead
                  ? t('You confirmed you’d read the rules on {date}. Thank you.', { date: day(myRead.read_at) })
                  : t('Read them all? Confirm it here, so {business} knows.', { business: businessName })}
              </Typography>
              {myState !== 'read' && <Button variant="contained" onClick={() => void confirm()} sx={{ flexShrink: 0 }}>{t('I’ve read the rules')}</Button>}
            </Stack>
          </CardContent>
        </Card>
      )}

      {isAdmin && sections.length > 0 && (
        <Card component="section" aria-label={t('Who’s read them')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Who’s read them')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {t('{n} of {total} employees have read them since they last changed, on {date}.', { n: upToDate, total: readers.length, date: changedAt ? day(changedAt) : '–' })}
            </Typography>
            {readers.length === 0 && <Empty>{t('No employees yet.')}</Empty>}
            <Stack>
              {readers.map(({ p, read: r, state }) => (
                <Stack key={p.id} direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                  <PersonAvatar name={p.full_name} colour={p.colour} size={28} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{p.full_name}</Typography>
                  <Tag {...READ_TONE[state]}>
                    {state === 'read' && r ? t('Read on {date}', { date: day(r.read_at) })
                      : state === 'outdated' && r ? t('Read on {date}, before the last change', { date: day(r.read_at) }) : t('Not yet')}
                  </Tag>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {editing && <SectionDialog section={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Admins: add a section or change one: its title, a line to introduce it, and its rules. */
function SectionDialog({ section, onClose }: { section: RuleSectionInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [title, setTitle] = useState(section.title ?? '')
  const [intro, setIntro] = useState(section.intro ?? '')
  const [lines, setLines] = useState((section.rules ?? []).join('\n'))
  const [deleting, setDeleting] = useState(false)
  const save = async () => {
    const rules = rulesFromLines(lines)
    const ok = await run(async () => {
      const problem = sectionProblem({ title, intro, rules })
      if (problem) throw new Error(t(problem))
      await api.saveRuleSection({ id: section.id, title: title.trim(), intro: intro.trim() || null, rules, ...(section.id ? {} : { sort: section.sort ?? 0 }) })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (section.id && await run(() => api.deleteRuleSection(section.id!), t('Section removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="section-title">
      <DialogTitle id="section-title">{section.id ? section.title : t('Add a section')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Title')} value={title} onChange={e => setTitle(e.target.value)} required slotProps={{ htmlInput: { maxLength: 120 } }} />
          <TextField label={t('Introduction (optional)')} value={intro} onChange={e => setIntro(e.target.value)} multiline minRows={2}
            slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <TextField label={t('Rules')} value={lines} onChange={e => setLines(e.target.value)} multiline minRows={6} required
            helperText={t('One rule per line. Changing them asks everyone to read the rules again.')} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {section.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Remove {name}?', { name: section.title ?? '' })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Remove')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Remove')}</Button>
        ))}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
