import { Box, ButtonBase, Card, CardContent, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import LightIcon from '@mui/icons-material/LightModeOutlined'
import DarkIcon from '@mui/icons-material/DarkModeOutlined'
import AutoIcon from '@mui/icons-material/BrightnessAutoOutlined'
import CheckIcon from '@mui/icons-material/CheckCircle'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { TEXT_SIZES, applyPreferences } from '../app/Appearance'
import type { Preferences } from '../../shared/types'
import { fonts, tokens } from '../theme'

/** Each person's own look: theme, text size and accessibility options. Saved to their account. */
export function AppearancePage() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  // The page keeps its own copy so quick changes in a row never overwrite each other.
  const [prefs, setPrefs] = useState<Preferences>(me?.preferences ?? {})
  if (!me) return null
  const save = (patch: Preferences, note?: string) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    applyPreferences(next) // feel it straight away
    run(async () => { await api.updateProfile(me.id, { preferences: next }); await refresh() }, note ?? 'Saved')
  }

  return (
    <>
      <PageHeader eyebrow="You" title="Appearance"
        subtitle="How the app looks for you. Saved to your account, so it's the same on your phone, the café tablet and any computer." />
      <Stack spacing={2.5} sx={{ maxWidth: 860 }}>
        <Card component="section" aria-label="Theme">
          <CardContent>
            <SectionTitle>Theme</SectionTitle>
            <Box role="radiogroup" aria-label="Theme" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              <Choice selected={(prefs.theme ?? 'system') === 'system'} onClick={() => save({ theme: 'system' }, 'Theme: match this device')}
                icon={<AutoIcon />} label="Match my device" preview={<Preview split />} />
              <Choice selected={prefs.theme === 'light'} onClick={() => save({ theme: 'light' }, 'Theme: light')}
                icon={<LightIcon />} label="Light" preview={<Preview />} />
              <Choice selected={prefs.theme === 'dark'} onClick={() => save({ theme: 'dark' }, 'Theme: dark')}
                icon={<DarkIcon />} label="Dark" preview={<Preview dark />} />
            </Box>
          </CardContent>
        </Card>

        <Card component="section" aria-label="Text size">
          <CardContent>
            <SectionTitle>Text size</SectionTitle>
            <Box role="radiogroup" aria-label="Text size" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' } }}>
              {(Object.keys(TEXT_SIZES) as (keyof typeof TEXT_SIZES)[]).map(k => (
                <Choice key={k} selected={(prefs.textSize ?? 'default') === k} onClick={() => save({ textSize: k }, `Text size: ${TEXT_SIZES[k].label.toLowerCase()}`)}
                  label={TEXT_SIZES[k].label}
                  preview={<Typography aria-hidden sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: `calc(1.6rem * ${parseFloat(TEXT_SIZES[k].scale) / 100})`, lineHeight: 1 }}>Aa</Typography>} />
              ))}
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
              Makes all text and buttons bigger or smaller across the app.
            </Typography>
          </CardContent>
        </Card>

        <Card component="section" aria-label="Accessibility">
          <CardContent>
            <SectionTitle>Accessibility</SectionTitle>
            <Stack spacing={1.5}>
              <Toggle checked={prefs.contrast === 'high'} onChange={on => save({ contrast: on ? 'high' : 'normal' }, on ? 'Higher contrast on' : 'Higher contrast off')}
                label="Higher contrast" detail="Darker text and firmer lines, easier to read in bright light." />
              <Toggle checked={prefs.font === 'readable'} onChange={on => save({ font: on ? 'readable' : 'default' }, on ? 'Easy-read font on' : 'Easy-read font off')}
                label="Easy-read font" detail="Atkinson Hyperlegible: letters that are harder to mix up (I l 1, O 0). Helps with low vision and dyslexia." />
              <Toggle checked={prefs.motion === 'reduce'} onChange={on => save({ motion: on ? 'reduce' : 'system' }, on ? 'Less motion on' : 'Less motion off')}
                label="Less motion" detail="Turns off animations and slides. (Already off if your device asks for reduced motion.)" />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </>
  )
}

function Choice({ selected, onClick, icon, label, preview }: { selected: boolean; onClick: () => void; icon?: ReactNode; label: string; preview: ReactNode }) {
  return (
    <ButtonBase role="radio" aria-checked={selected} aria-label={label} onClick={onClick}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', gap: 1, p: 1.25, borderRadius: '16px',
        border: 2, borderColor: selected ? tokens.rose : tokens.line, bgcolor: selected ? tokens.roseSoft : tokens.surface,
        transition: 'border-color .15s, background .15s', '&:hover': { borderColor: selected ? tokens.rose : tokens.lineStrong } }}>
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 64, borderRadius: '10px', bgcolor: tokens.surfaceAlt, overflow: 'hidden' }}>{preview}</Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5 }}>
        {icon && <Box sx={{ color: tokens.inkSoft, display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>}
        <Typography sx={{ fontWeight: 500, flex: 1 }}>{label}</Typography>
        {selected && <CheckIcon sx={{ color: tokens.roseDeep, fontSize: 18 }} />}
      </Stack>
    </ButtonBase>
  )
}

/** A tiny sketch of the app in light, dark or both. */
function Preview({ dark, split }: { dark?: boolean; split?: boolean }) {
  const pane = (d: boolean) => (
    <Box sx={{ flex: 1, height: 64, bgcolor: d ? '#1A1614' : '#FBF8F4', display: 'flex', gap: 0.5, p: 0.75 }}>
      <Box sx={{ width: 14, borderRadius: '4px', bgcolor: d ? '#2B2320' : '#FFFFFF', border: d ? 'none' : '1px solid #EFE9E4' }} />
      <Box sx={{ flex: 1, display: 'grid', gap: 0.5, alignContent: 'start' }}>
        <Box sx={{ height: 6, width: '60%', borderRadius: 2, bgcolor: d ? '#F3EEE9' : '#2B2522' }} />
        <Box sx={{ height: 18, borderRadius: '4px', bgcolor: d ? '#24201D' : '#fff', border: `1px solid ${d ? '#38312D' : '#EFE9E4'}` }} />
        <Box sx={{ height: 6, width: '35%', borderRadius: 2, bgcolor: '#F79BA4' }} />
      </Box>
    </Box>
  )
  return <Box sx={{ display: 'flex', width: '100%' }}>{split ? <>{pane(false)}{pane(true)}</> : pane(!!dark)}</Box>
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (on: boolean) => void; label: string; detail: string }) {
  return (
    <FormControlLabel sx={{ alignItems: 'flex-start', m: 0, gap: 1 }}
      control={<Switch checked={checked} onChange={e => onChange(e.target.checked)} sx={{ mt: -0.5 }} />}
      label={<Box><Typography sx={{ fontWeight: 500 }}>{label}</Typography><Typography variant="body2" sx={{ color: 'text.secondary' }}>{detail}</Typography></Box>} />
  )
}
