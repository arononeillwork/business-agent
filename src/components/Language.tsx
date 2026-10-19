import { Box, Checkbox, ListItemIcon, ListItemText, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { useId } from 'react'
import { useApp } from '../app/AppContext'
import { LANGUAGES, chosenLanguages, setLanguage, t, useLanguage, type Language } from '../i18n'
import { tokens } from '../theme'

/** A small flag, drawn here so it looks the same on every device (Windows shows flag emoji as letters). */
export function Flag({ code, size = 20 }: { code: Language; size?: number }) {
  const id = useId()
  const h = Math.round(size * 2 / 3)
  return (
    <Box component="svg" viewBox="0 0 60 40" width={size} height={h} aria-hidden preserveAspectRatio="xMidYMid slice"
      sx={{ display: 'block', flexShrink: 0, borderRadius: '3px', boxShadow: `0 0 0 1px ${tokens.line}` }}>
      {code === 'es' ? <>
        <rect width="60" height="40" fill="#AA151B" />
        <rect y="10" width="60" height="20" fill="#F1BF00" />
      </> : <>
        <clipPath id={`${id}t`}><path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" /></clipPath>
        <rect width="60" height="40" fill="#012169" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
        <path d="M0,0 L60,40 M60,0 L0,40" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="5" />
        <path d="M30,0 v40 M0,20 h60" stroke="#fff" strokeWidth="12" />
        <path d="M30,0 v40 M0,20 h60" stroke="#C8102E" strokeWidth="7" />
      </>}
    </Box>
  )
}

const nameOf = (code: Language) => LANGUAGES.find(l => l.code === code)!.name

/** Switch to a language now and remember it on the person's account (when signed in). */
function useSwitch() {
  const { api, me, refresh } = useApp()
  return (code: Language) => {
    void setLanguage(code)
    if (me && me.preferences?.language !== code) {
      api.updateProfile(me.id, { preferences: { ...me.preferences, language: code } }).then(refresh).catch(() => { /* shown now; saves next time */ })
    }
  }
}

/**
 * Flags at the top right for switching language in one press. Signed in, it only shows when the
 * person picked more than one language; on the public pages it always shows.
 */
export function LanguageToggle({ always }: { always?: boolean }) {
  const { me } = useApp()
  const current = useLanguage()
  const pick = useSwitch()
  const mine = always || !me ? LANGUAGES.map(l => l.code) : chosenLanguages(me.preferences)
  if (mine.length < 2) return null
  return (
    <ToggleButtonGroup size="small" exclusive value={current} aria-label={t('Language')}
      onChange={(_, v: Language | null) => { if (v) pick(v) }}
      sx={{ '& .MuiToggleButton-root': { px: 0.9, py: 0.6, border: `1px solid ${tokens.line}`, opacity: 0.55,
        '&.Mui-selected': { opacity: 1, bgcolor: tokens.surface }, '&:hover': { opacity: 1 } } }}>
      {mine.map(code => (
        <Tooltip key={code} title={nameOf(code)}>
          <ToggleButton value={code} aria-label={nameOf(code)} lang={code}><Flag code={code} /></ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  )
}

/** My account → Language: tick one or both; with both, the flags at the top switch between them. */
export function LanguagePicker() {
  const { api, me, refresh } = useApp()
  const current = useLanguage()
  if (!me) return null
  const mine = chosenLanguages(me.preferences)
  const save = (next: Language[]) => {
    if (!next.length) return // always at least one
    const ordered = LANGUAGES.map(l => l.code).filter(c => next.includes(c))
    const language = ordered.includes(current) ? current : ordered[0]
    void setLanguage(language)
    void api.updateProfile(me.id, { preferences: { ...me.preferences, languages: ordered, language } }).then(refresh)
  }
  return (
    <TextField select fullWidth label={t('Languages')} value={mine}
      helperText={mine.length > 1 ? t('Switch between them with the flags at the top right.') : t('Pick both to switch with a flag at the top right.')}
      slotProps={{ select: {
        multiple: true,
        onChange: e => save(e.target.value as unknown as Language[]),
        renderValue: v => (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            {(v as Language[]).map(code => (
              <Stack key={code} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Flag code={code} /><span lang={code}>{nameOf(code)}</span></Stack>
            ))}
          </Stack>
        ),
      } }}>
      {LANGUAGES.map(({ code, name }) => (
        <MenuItem key={code} value={code} lang={code}>
          <Checkbox size="small" checked={mine.includes(code)} disabled={mine.length === 1 && mine.includes(code)} sx={{ ml: -1, mr: 0.5 }} />
          <ListItemIcon sx={{ minWidth: 32 }}><Flag code={code} /></ListItemIcon>
          <ListItemText primary={name} />
        </MenuItem>
      ))}
    </TextField>
  )
}
