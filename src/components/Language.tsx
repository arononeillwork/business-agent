import { Box, Checkbox, ListItemIcon, ListItemText, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { useEffect, useId, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
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
  const { me, settings } = useApp()
  const current = useLanguage()
  const pick = useSwitch()
  const mine = always || !me ? LANGUAGES.map(l => l.code) : chosenLanguages(me.preferences, settings?.languages)
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

/**
 * My account → Language: tick one or both; with both, the flags at the top switch between them.
 * Ticks show at once (the account saves behind); the last one can't be unticked, and says why.
 */
export function LanguagePicker() {
  const { api, me, refresh, settings } = useApp()
  const current = useLanguage()
  // The team's languages (an admin's pick) are everyone's, ticked and kept.
  const team = settings?.languages ?? []
  const saved = chosenLanguages(me?.preferences, team)
  const [picked, setPicked] = useState<Language[]>(saved)
  const [lastOne, setLastOne] = useState(false)
  // Follows the account when it changes elsewhere (the flags, another device).
  const key = saved.join()
  useEffect(() => setPicked(key.split(',') as Language[]), [key])
  if (!me) return null
  const save = (next: Language[]) => {
    if (!next.length) { setLastOne(true); return }
    setLastOne(false)
    const ordered = LANGUAGES.map(l => l.code).filter(c => next.includes(c) || team.includes(c))
    const language = ordered.includes(current) ? current : ordered[0]
    setPicked(ordered)
    void setLanguage(language)
    void api.updateProfile(me.id, { preferences: { ...me.preferences, languages: ordered, language } }).then(refresh)
  }
  return (
    <TextField select fullWidth label={t('Languages')} value={picked} error={lastOne}
      helperText={lastOne ? t('Keep at least one. To change language, tick the other one first, then untick this one.')
        : team.length > 1 ? t('The team uses both: switch between them with the flags at the top right, and the app keeps yours.')
        : picked.length > 1 ? t('Switch between them with the flags at the top right.') : undefined}
      slotProps={{ select: {
        multiple: true,
        onChange: e => save(e.target.value as unknown as Language[]),
        onClose: () => setLastOne(false),
        renderValue: v => (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            {(v as Language[]).map(code => (
              <Stack key={code} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Flag code={code} /><span lang={code}>{nameOf(code)}</span></Stack>
            ))}
          </Stack>
        ),
      } }}>
      {LANGUAGES.map(({ code, name }) => (
        <MenuItem key={code} value={code} lang={code} disabled={team.includes(code)}>
          <Checkbox size="small" checked={picked.includes(code)} sx={{ ml: -1, mr: 0.5 }} />
          <ListItemIcon sx={{ minWidth: 32 }}><Flag code={code} /></ListItemIcon>
          <ListItemText primary={name} />
        </MenuItem>
      ))}
    </TextField>
  )
}

/**
 * Admins, on My account: the languages the team uses. With two, everyone gets the flags at the top to
 * switch between them, and the app keeps each person's own choice.
 */
export function TeamLanguages() {
  const { api, settings, refresh } = useApp()
  const run = useAction()
  const team = (settings?.languages ?? []) as Language[]
  const save = (next: Language[]) =>
    void run(async () => { await api.updateSettings({ languages: LANGUAGES.map(l => l.code).filter(c => next.includes(c)) }); await refresh() }, t('Saved'))
  return (
    <TextField select fullWidth label={t('The team’s languages')} value={team}
      helperText={team.length > 1 ? t('Everyone can switch between them with the flags at the top right; each person’s choice is kept.')
        : t('Pick both and everyone gets the flags to switch, each in their own.')}
      slotProps={{ select: {
        multiple: true, displayEmpty: true,
        onChange: e => save(e.target.value as unknown as Language[]),
        renderValue: v => (v as Language[]).length ? (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            {(v as Language[]).map(code => (
              <Stack key={code} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Flag code={code} /><span lang={code}>{nameOf(code)}</span></Stack>
            ))}
          </Stack>
        ) : t('Each person picks their own'),
      }, inputLabel: { shrink: true } }}>
      {LANGUAGES.map(({ code, name }) => (
        <MenuItem key={code} value={code} lang={code}>
          <Checkbox size="small" checked={team.includes(code)} sx={{ ml: -1, mr: 0.5 }} />
          <ListItemIcon sx={{ minWidth: 32 }}><Flag code={code} /></ListItemIcon>
          <ListItemText primary={name} />
        </MenuItem>
      ))}
    </TextField>
  )
}
