// Spain's public holidays region by region: each autonomous community's, and Ceuta's and Melilla's, as
// the Ministry of Labour publishes them in the BOE each October for the year after ("Resolución … de la
// Dirección General de Trabajo, por la que se publica la relación de fiestas laborales para el año …").
// Each night a business in Spain with a region gets its region's (worker/holidays.ts).
//
// How the resolution reads. Its table has a row for each day and a column for each community, and marks
//   *    a national day no community can replace: Año Nuevo, Viernes Santo, Fiesta del Trabajo, Asunción,
//        Fiesta Nacional de España, Todos los Santos, Día de la Constitución, Inmaculada and Navidad;
//   **   a national day a community may replace with one of its own, marked where it's kept: Epifanía,
//        Jueves Santo, San José or Santiago (each community picks one of the two), and the Monday after a
//        national day that falls on a Sunday ("Día siguiente a Todos los Santos", "Lunes siguiente al Día
//        de la Constitución Española");
//   ***  the community's own: the days it put in place of those (Extremadura's "Sustitución 15 de agosto"
//        on 11 October 2027, instead of the Monday after the Assumption), and its own day moved off a
//        Sunday ("Lunes siguiente al Día de les Illes Balears").
// A national day on a Sunday isn't in the table at all, only its Monday where it's kept. So a community's
// column is its whole list for the year (12 days; Canarias 11, each island adding its own), and a national
// day missing from it is one the community replaced: its businesses don't get that day.
// Not in the table, so not here: each island's day in Canarias and Arán's in Cataluña (in the resolution's
// notes), and each town's two local days (in the community's or province's bulletin). The owner adds those
// on the Calendar.
//
// To add a year: copy the new resolution's table below, a row per line in its order, with its reference.
import type { SpanishRegion } from '../shared/regions.ts'
import type { Holiday } from './holidays.ts'

const ALL = 'ALL'
/** One row of a resolution's table: the day (MM-DD), its name as the BOE writes it, its mark, and the communities marked (ISO 3166-2:ES codes, or ALL). */
export type FiestaRow = readonly [day: string, title: string, mark: '*' | '**' | '***', regions: string]
export interface FiestasYear { boe: string; rows: readonly FiestaRow[] }

export const SPAIN_FIESTAS: Record<number, FiestasYear> = {
  // Resolución de 17 de octubre de 2025, de la Dirección General de Trabajo, por la que se publica la relación de
  // fiestas laborales para el año 2026: BOE-A-2025-21667, BOE núm. 259, de 28 de octubre de 2025.
  2026: { boe: 'BOE-A-2025-21667', rows: [
    ['01-01', 'Año Nuevo', '*', ALL],
    ['01-06', 'Epifanía del Señor', '**', ALL],
    ['02-28', 'Día de Andalucía', '***', 'AN'],
    ['03-02', 'Lunes siguiente al Día de les Illes Balears', '***', 'IB'],
    ['03-19', 'San José', '**', 'GA MC NC PV VC'],
    ['03-20', 'Fiesta del Eid Fitr', '***', 'ML'],
    ['04-02', 'Jueves Santo', '**', 'AN AR AS IB CN CB CM CL EX GA MD MC NC PV RI CE ML'],
    ['04-03', 'Viernes Santo', '*', ALL],
    ['04-06', 'Lunes de Pascua', '***', 'IB CM CT NC PV RI VC'],
    ['04-23', 'San Jorge/Día de Aragón', '***', 'AR'],
    ['04-23', 'Fiesta de Castilla y León', '***', 'CL'],
    ['05-01', 'Fiesta del Trabajo', '*', ALL],
    ['05-02', 'Fiesta de la Comunidad de Madrid', '***', 'MD'],
    ['05-27', 'Fiesta Sacrificio-Eidul Adha', '***', 'CE'],
    ['05-27', 'Fiesta Sacrificio-Aid al Adha', '***', 'ML'],
    ['05-30', 'Día de Canarias', '***', 'CN'],
    ['06-04', 'Corpus Christi', '***', 'CM'],
    ['06-09', 'Día de la Región de Murcia', '***', 'MC'],
    ['06-09', 'Día de la Rioja', '***', 'RI'],
    ['06-24', 'San Juan', '***', 'CT GA VC'],
    ['07-25', 'Santiago Apóstol/Día Nacional de Galicia', '**', 'GA PV'],
    ['07-28', 'Día de las Instituciones de Cantabria', '***', 'CB'],
    ['08-05', 'Nuestra Señora de África', '***', 'CE'],
    ['08-15', 'Asunción de la Virgen', '*', ALL],
    ['09-02', 'Día de Ceuta', '***', 'CE'],
    ['09-08', 'Día de Asturias', '***', 'AS'],
    ['09-08', 'Día de Extremadura', '***', 'EX'],
    ['09-11', 'Fiesta Nacional de Cataluña', '***', 'CT'],
    ['09-15', 'La Bien Aparecida', '***', 'CB'],
    ['10-09', 'Día de la Comunitat Valenciana', '***', 'VC'],
    ['10-12', 'Fiesta Nacional de España', '*', ALL],
    ['11-02', 'Día siguiente a Todos los Santos', '**', 'AN AR AS CN CM CL EX MD NC'],
    ['12-07', 'Lunes siguiente al Día de la Constitución Española', '**', 'AN AR AS CB CL EX MD MC RI ML'],
    ['12-08', 'Inmaculada Concepción', '*', ALL],
    ['12-25', 'Natividad del Señor', '*', ALL],
    ['12-26', 'San Esteban', '***', 'IB CT'],
  ] },
  // Resolución de 8 de octubre de 2026, de la Dirección General de Trabajo, por la que se publica relación de
  // fiestas laborales para el año 2027: BOE-A-2026-21254, BOE núm. 254, de 13 de octubre de 2026.
  2027: { boe: 'BOE-A-2026-21254', rows: [
    ['01-01', 'Año Nuevo', '*', ALL],
    ['01-06', 'Epifanía del Señor', '**', ALL],
    ['03-01', 'Día de Andalucía', '***', 'AN'],
    ['03-01', 'Día de les Illes Balears', '***', 'IB'],
    ['03-10', 'Fiesta del Eid Fitr', '***', 'ML'],
    ['03-19', 'San José', '**', 'GA MD MC NC VC'],
    ['03-25', 'Jueves Santo', '**', 'AN AR AS IB CN CB CM CL EX GA MD MC NC PV RI CE ML'],
    ['03-26', 'Viernes Santo', '*', ALL],
    ['03-29', 'Lunes de Pascua', '***', 'IB CT NC PV RI VC'],
    ['04-23', 'San Jorge/Día de Aragón', '***', 'AR'],
    ['04-23', 'Fiesta de Castilla y León', '***', 'CL'],
    ['05-01', 'Fiesta del Trabajo', '*', ALL],
    ['05-17', 'Día de las Letras Gallegas', '***', 'GA'],
    ['05-17', 'Eidul Adha-Fiesta Sacrificio', '***', 'CE'],
    ['05-17', 'Fiesta Sacrificio-Aid Al Adha', '***', 'ML'],
    ['05-27', 'Corpus Christi', '***', 'CM'],
    ['05-31', 'Día de Castilla-La Mancha', '***', 'CM'],
    ['06-09', 'Día de la Región de Murcia', '***', 'MC'],
    ['06-09', 'Día de La Rioja', '***', 'RI'],
    ['06-24', 'Día de San Juan', '***', 'CT'],
    ['07-28', 'Día de las Instituciones de Cantabria', '***', 'CB'],
    ['08-05', 'Nuestra Señora de África', '***', 'CE'],
    ['08-16', 'Lunes siguiente a asunción de la Virgen', '**', 'AN AR AS CN CL MD'],
    ['09-08', 'Día de Asturias', '***', 'AS'],
    ['09-08', 'Día de Extremadura', '***', 'EX'],
    ['09-11', 'Fiesta Nacional de Cataluña', '***', 'CT'],
    ['09-15', 'La Bien Aparecida', '***', 'CB'],
    ['10-07', 'Aniversario 1er Gobierno Euskadi', '***', 'PV'],
    ['10-09', 'Día de la Comunitat Valenciana', '***', 'VC'],
    ['10-11', 'Sustitución 15 de agosto', '***', 'EX'],
    ['10-12', 'Fiesta Nacional de España', '*', ALL],
    ['11-01', 'Todos los Santos', '*', ALL],
    ['12-06', 'Día de la Constitución Española', '*', ALL],
    ['12-08', 'Inmaculada Concepción', '*', ALL],
    ['12-25', 'Natividad del Señor', '*', ALL],
  ] },
}

/** A region's public holidays of a year, the national ones it keeps included, in date order; null when that year's resolution isn't in. */
export function regionFiestas(region: SpanishRegion, year: number, fiestas: Record<number, FiestasYear> = SPAIN_FIESTAS): Holiday[] | null {
  const table = fiestas[year]
  if (!table) return null
  return table.rows
    .filter(([, , , regions]) => regions === ALL || regions.split(' ').includes(region))
    .map(([day, title]) => ({ date: `${year}-${day}`, title }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
