import { Box, FormControlLabel, MenuItem, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material'
import LangIcon from '@mui/icons-material/TranslateOutlined'
import { useState } from 'react'
import { Tag } from '../components/common'
import { SLIDE_LANGS, cleanUrl, hasVersion, kindOf, slideVersions, versionOn, type Slide, type SlideLang } from '../../shared/screens'
import type { MenuDesign } from '../../shared/menu'
import { tokens } from '../theme'
import { t } from '../i18n'

/**
 * A slide's English and Spanish versions, a tab each (Screens → Slides): the address (or the digital
 * menu) for that language and whether it shows. The screen plays the English version, then the
 * Spanish one; a version that's switched off, or has nothing to show, is skipped.
 */
export function SlideVersions({ slide: sl, name, designs, onChange }: {
  slide: Slide; name: string; designs: MenuDesign[]; onChange: (patch: Partial<Slide>) => void
}) {
  const [tab, setTab] = useState<SlideLang>('en')
  const menu = sl.kind === 'menu'
  const field = tab === 'en' ? (menu ? 'design_id' : 'url') : (menu ? 'design_id_es' : 'url_es')
  const value = (sl[field] as string | null | undefined) ?? ''
  const [typed, setTyped] = useState<Record<string, string>>({})
  const shown = typed[field] ?? value
  const has = hasVersion(sl, tab)
  const on = versionOn(sl, tab)
  const plays = slideVersions(sl).map(v => v.lang)
  const status = (lang: SlideLang) => (!hasVersion(sl, lang) ? { label: t('None'), fg: tokens.neutralFg, bg: tokens.neutralBg }
    : versionOn(sl, lang) ? { label: t('On'), fg: tokens.goodFg, bg: tokens.goodBg } : { label: t('Off'), fg: tokens.warnFg, bg: tokens.warnBg })
  // An address as typed, tidied when the field is left; the English one says what kind of slide it is.
  const commit = () => {
    if (typed[field] === undefined) return
    const url = cleanUrl(typed[field])
    onChange(tab === 'en' && url ? { url, kind: kindOf(url) } : { [field]: url })
    setTyped(({ [field]: _done, ...rest }) => rest)
  }
  return (
    <Box sx={{ borderRadius: 2.5, border: `1px solid ${tokens.line}`, overflow: 'hidden' }}>
      <Tabs value={tab} onChange={(_, v: SlideLang) => setTab(v)} aria-label={t('Versions of {name}', { name })}
        sx={{ minHeight: 42, px: 1, bgcolor: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.line}` }}>
        {SLIDE_LANGS.map(l => {
          const st = status(l.id)
          return (
            <Tab key={l.id} value={l.id} sx={{ minHeight: 42, py: 0.75, px: 1.5, textTransform: 'none', fontWeight: 500 }}
              label={<Stack direction="row" sx={{ gap: 0.75, alignItems: 'center' }}>{t(l.label)}<Tag fg={st.fg} bg={st.bg}>{st.label}</Tag></Stack>} />
          )
        })}
      </Tabs>
      <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gap: 1.25 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: { xs: 1, sm: 2 }, alignItems: { sm: 'center' } }}>
          {menu ? (
            <TextField select size="small" sx={{ flex: 1 }} label={tab === 'en' ? t('Digital menu in English') : t('Digital menu in Spanish')} value={value}
              onChange={e => onChange({ [field]: e.target.value || null })}>
              {tab === 'es' && <MenuItem value="">{t('None')}</MenuItem>}
              {designs.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </TextField>
          ) : (
            <TextField size="small" sx={{ flex: 1 }} label={tab === 'en' ? t('Address in English') : t('Address in Spanish')} placeholder={'https://…'} value={shown}
              onChange={e => setTyped(x => ({ ...x, [field]: e.target.value }))} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }}
              slotProps={{ htmlInput: { style: { fontSize: '0.9rem' } } }} />
          )}
          <FormControlLabel sx={{ mr: 0, ml: { xs: -1, sm: 0 }, whiteSpace: 'nowrap' }} control={<Switch size="small" checked={has && on} disabled={!has}
            onChange={e => onChange(tab === 'en' ? { show_en: e.target.checked } : { show_es: e.target.checked })}
            slotProps={{ input: { 'aria-label': t('Show {name} in {lang}', { name, lang: t(SLIDE_LANGS.find(l => l.id === tab)!.label) }) } }} />}
            label={<Typography variant="body2">{!has ? t('Nothing to show yet') : on ? t('Shows on screen') : t('Hidden')}</Typography>} />
        </Stack>
        {tab === 'es' && !menu && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The same kind of slide in Spanish: the poster, page or video in Spanish')}</Typography>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <LangIcon sx={{ fontSize: 16 }} />
          {plays.length === 2 ? t('Plays in English, then in Spanish') : plays[0] === 'en' ? t('Plays in English only') : plays[0] === 'es' ? t('Plays in Spanish only')
            : t('Nothing to play: add an address and switch a version on')}
        </Typography>
      </Box>
    </Box>
  )
}
