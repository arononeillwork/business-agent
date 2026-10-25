import { Autocomplete, Box, Stack, TextField } from '@mui/material'
import { useMemo, useState } from 'react'
import { locale, t } from '../i18n'
import { CALLING_CODES, callingCode, flagEmoji, joinPhone, splitPhone } from '../../shared/phone'

interface Country { code: string; name: string; dial: string }

/** Every country, named in the person's language, alphabetically (Spain first: it's where the café is). */
function useCountries(): Country[] {
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null
    try { names = new Intl.DisplayNames([locale()], { type: 'region' }) } catch { /* older browser: codes only */ }
    const list = CALLING_CODES.map(([code, dial]) => ({ code, dial, name: names?.of(code) ?? code }))
    return list.sort((a, b) => (a.code === 'ES' ? -1 : b.code === 'ES' ? 1 : a.name.localeCompare(b.name, locale())))
  }, [])
}

/**
 * A phone number as two parts: the country code, picked from a list you can search (by country,
 * or by typing 44 or +44), and the number itself. Saves as "+34 600 000 000".
 */
export function PhoneField({ label, value, onChange, helperText, error }: {
  label: string; value: string; onChange: (value: string) => void; helperText?: string; error?: boolean
}) {
  const countries = useCountries()
  const [country, setCountry] = useState(() => splitPhone(value).country)
  // What's typed, spaces and all; follows the value when it changes from outside (Cancel).
  const [typed, setTyped] = useState(() => splitPhone(value).number)
  const number = joinPhone(country, typed) === value ? typed : splitPhone(value, country).number
  const picked = countries.find(c => c.code === country) ?? countries[0]
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Autocomplete
        options={countries} value={picked} disableClearable autoHighlight
        getOptionLabel={c => `${flagEmoji(c.code)} +${c.dial}`}
        isOptionEqualToValue={(a, b) => a.code === b.code}
        filterOptions={(list, { inputValue }) => {
          const q = inputValue.trim().toLowerCase().replace(/^\+/, '')
          // Typing in the box after picking shows its label ("🇪🇸 +34"): show the whole list then.
          if (!q || inputValue === `${flagEmoji(picked.code)} +${picked.dial}`) return list
          return list.filter(c => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.code.toLowerCase() === q)
        }}
        onChange={(_, c) => { setCountry(c.code); setTyped(number); onChange(joinPhone(c.code, number)) }}
        renderOption={({ key, ...props }, c) => (
          <Box component="li" key={key} {...props} sx={{ gap: 1.25 }}>
            <span aria-hidden>{flagEmoji(c.code)}</span>
            <Box component="span" sx={{ flex: 1 }}>{c.name}</Box>
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>+{c.dial}</Box>
          </Box>
        )}
        noOptionsText={t('No country found')}
        sx={{ width: 140, flexShrink: 0 }}
        slotProps={{ popper: { sx: { minWidth: 300 } } }}
        renderInput={params => <TextField {...params} label={t('Country code')} />}
      />
      <TextField label={label} type="tel" value={number} error={error} helperText={helperText} sx={{ flex: 1 }}
        placeholder={callingCode(country) === '34' ? '600 000 000' : ''}
        slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 18, autoComplete: 'tel-national' } }}
        onChange={e => { const v = e.target.value.replace(/[^\d ]/g, ''); setTyped(v); onChange(joinPhone(country, v)) }} />
    </Stack>
  )
}
