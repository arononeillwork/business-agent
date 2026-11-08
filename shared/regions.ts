// Spain's regions: its seventeen autonomous communities and the autonomous cities of Ceuta and Melilla.
// A business in Spain has one (business.region, the business_region migration), asked when it's added
// and on the Business page, and each night that region's public holidays go on its calendar with
// Spain's national ones (worker/holidays.ts). Codes are ISO 3166-2:ES's (ES-AN is Andalucía): keep the
// list in step with the check on business.region.
import { msg } from './i18n.ts'

export type SpanishRegion =
  | 'AN' | 'AR' | 'AS' | 'IB' | 'CN' | 'CB' | 'CM' | 'CL' | 'CT' | 'EX' | 'GA' | 'MD' | 'MC' | 'NC' | 'PV' | 'RI' | 'VC' | 'CE' | 'ML'

/** Each region: its code, its name in the app (Spanish in src/i18n/es/regions.ts) and as it's written in Spain, for its calendar rows. */
export const SPANISH_REGIONS: { code: SpanishRegion; name: string; local: string }[] = [
  { code: 'AN', name: msg('Andalusia'), local: 'Andalucía' },
  { code: 'AR', name: msg('Aragon'), local: 'Aragón' },
  { code: 'AS', name: msg('Asturias'), local: 'Asturias' },
  { code: 'IB', name: msg('Balearic Islands'), local: 'Islas Baleares' },
  { code: 'CN', name: msg('Canary Islands'), local: 'Canarias' },
  { code: 'CB', name: msg('Cantabria'), local: 'Cantabria' },
  { code: 'CM', name: msg('Castilla-La Mancha'), local: 'Castilla-La Mancha' },
  { code: 'CL', name: msg('Castile and León'), local: 'Castilla y León' },
  { code: 'CT', name: msg('Catalonia'), local: 'Cataluña' },
  { code: 'EX', name: msg('Extremadura'), local: 'Extremadura' },
  { code: 'GA', name: msg('Galicia'), local: 'Galicia' },
  { code: 'MD', name: msg('Madrid'), local: 'Comunidad de Madrid' },
  { code: 'MC', name: msg('Murcia'), local: 'Región de Murcia' },
  { code: 'NC', name: msg('Navarre'), local: 'Navarra' },
  { code: 'PV', name: msg('Basque Country'), local: 'País Vasco' },
  { code: 'RI', name: msg('La Rioja'), local: 'La Rioja' },
  { code: 'VC', name: msg('Valencian Community'), local: 'Comunidad Valenciana' },
  { code: 'CE', name: msg('Ceuta'), local: 'Ceuta' },
  { code: 'ML', name: msg('Melilla'), local: 'Melilla' },
]

export const SPANISH_REGION_CODES = SPANISH_REGIONS.map(r => r.code)
export const isSpanishRegion = (r: unknown): r is SpanishRegion => SPANISH_REGION_CODES.includes(r as SpanishRegion)
export const spanishRegion = (r: string | null | undefined) => SPANISH_REGIONS.find(x => x.code === r) ?? null
