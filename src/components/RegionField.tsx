import { TextField } from '@mui/material'
import { t } from '../i18n'
import { SPANISH_REGIONS, type SpanishRegion } from '../../shared/regions'

/** A Spanish business's region: one of the communities, Ceuta or Melilla, in the device's own list, or not set. */
export function RegionField({ value, onChange, helperText }: {
  value: SpanishRegion | null | undefined; onChange: (region: SpanishRegion | null) => void; helperText?: string
}) {
  const regions = [...SPANISH_REGIONS].sort((a, b) => t(a.name).localeCompare(t(b.name)))
  return (
    // The label stays above: "Not set" is a choice shown in the box, not an empty one.
    <TextField select fullWidth label={t('Region')} value={value ?? ''} helperText={helperText}
      onChange={e => onChange((e.target.value || null) as SpanishRegion | null)}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
      <option value="">{t('Not set')}</option>
      {regions.map(r => <option key={r.code} value={r.code}>{t(r.name)}</option>)}
    </TextField>
  )
}
