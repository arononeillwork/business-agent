import { Autocomplete, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { TZ, formatLocal, isTimeZone, zoneCity, zoneOffset } from '../../shared/time'
import { t } from '../i18n'

// Browsers without the full list still offer the zones people here are most likely to need.
const FALLBACK = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Europe/Rome', 'America/New_York', 'America/Los_Angeles', 'UTC']

function allZones() {
  const listed = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? FALLBACK
  return [...new Set([...listed, 'UTC'])].filter(isTimeZone)
}

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } }

/**
 * My account: the person's own time zone. Social posts are planned and shown in it (the café's
 * until they choose); it's saved at once, like the language.
 */
export function TimeZoneField() {
  const { api, me, refresh, business } = useApp()
  const run = useAction()
  const cafeTz = business?.timezone
  const cafe = isTimeZone(cafeTz) ? cafeTz : TZ
  const zones = useMemo(() => {
    const now = new Date()
    return allZones().map(tz => ({ tz, label: `${tz.replace(/_/g, ' ')} (${zoneOffset(tz, now)})` }))
  }, [])
  if (!me) return null
  const mine = me.preferences?.timeZone
  const chosen = isTimeZone(mine) ? mine : cafe
  const device = deviceZone()
  const value = zones.find(z => z.tz === chosen) ?? { tz: chosen, label: chosen.replace(/_/g, ' ') }
  const save = (tz: string) => run(async () => {
    await api.updateProfile(me.id, { preferences: { ...me.preferences, timeZone: tz } }); await refresh()
  }, t('Time zone set to {zone}', { zone: zoneCity(tz) }))

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 420 }}>
      <Autocomplete options={zones} value={value} disableClearable autoHighlight
        getOptionLabel={z => z.label} isOptionEqualToValue={(a, b) => a.tz === b.tz}
        onChange={(_, z) => { if (z.tz !== chosen) void save(z.tz) }}
        renderOption={({ key, ...props }, z) => (
          <Box component="li" key={key} {...props} sx={{ gap: 1 }}>
            <Box component="span" sx={{ flex: 1 }}>{z.tz.replace(/_/g, ' ')}</Box>
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{zoneOffset(z.tz)}</Box>
          </Box>
        )}
        noOptionsText={t('No time zone found')}
        renderInput={params => <TextField {...params} label={t('Time zone')}
          helperText={t('It’s {time} there now. Social posts are planned and shown in this time; shifts and timecards stay in the café’s ({cafe}).',
            { time: formatLocal(new Date(), 'HH:mm', chosen), cafe: zoneCity(cafe) })} />}
      />
      {device && isTimeZone(device) && device !== chosen && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('This device is set to {zone}.', { zone: device.replace(/_/g, ' ') })}</Typography>
          <Button size="small" onClick={() => void save(device)}>{t('Use {zone}', { zone: zoneCity(device) })}</Button>
        </Stack>
      )}
    </Stack>
  )
}
