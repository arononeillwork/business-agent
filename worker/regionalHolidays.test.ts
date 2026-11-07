// Spain's regional holidays as the BOE lists them (BOE-A-2025-21667 for 2026, BOE-A-2026-21254 for 2027):
// a few communities checked day by day against the resolution, and every table checked for what a
// transcription slip would break.
import { describe, expect, it } from 'vitest'
import { SPANISH_REGION_CODES } from '../shared/regions'
import { spainNationalHolidays } from './holidays'
import { regionFiestas, SPAIN_FIESTAS } from './regionalHolidays'

const days = (region: Parameters<typeof regionFiestas>[0], year: number) => regionFiestas(region, year)!.map(h => `${h.date.slice(5)} ${h.title}`)

describe('regional holidays, from the BOE', () => {
  it('has 2026 and 2027, each with its resolution', () => {
    expect(Object.keys(SPAIN_FIESTAS)).toEqual(['2026', '2027'])
    expect(SPAIN_FIESTAS[2026].boe).toBe('BOE-A-2025-21667')
    expect(SPAIN_FIESTAS[2027].boe).toBe('BOE-A-2026-21254')
    expect(regionFiestas('AN', 2028)).toBeNull()
  })

  it('every table reads right: real dates, known communities, a national day for all, a day once per community, 12 each (Canarias 11, each island adding its own)', () => {
    for (const [year, { rows }] of Object.entries(SPAIN_FIESTAS)) {
      for (const [day, title, mark, regions] of rows) {
        const date = new Date(`${year}-${day}T12:00:00Z`)
        expect(date.toISOString().slice(0, 10), `${year} ${title}`).toBe(`${year}-${day}`)
        // A national day on a Sunday isn't in the table: only its Monday, where kept.
        expect(date.getUTCDay(), `${year} ${title} on a Sunday`).not.toBe(0)
        if (mark === '*') expect(regions, title).toBe('ALL')
        if (regions !== 'ALL') expect(regions.split(' ').every(r => SPANISH_REGION_CODES.includes(r as never)), title).toBe(true)
      }
      for (const region of SPANISH_REGION_CODES) {
        const dates = regionFiestas(region, Number(year))!.map(h => h.date)
        expect(new Set(dates).size, `${region} ${year}`).toBe(dates.length)
        expect(dates.length, `${region} ${year}`).toBe(region === 'CN' ? 11 : 12)
      }
    }
  })

  it('the national days the app gives every business are the ones every community keeps', () => {
    for (const year of [2026, 2027]) {
      const everywhere = SPAIN_FIESTAS[year].rows.filter(r => r[3] === 'ALL').map(([day, title]) => ({ date: `${year}-${day}`, title }))
      expect(spainNationalHolidays(year)).toEqual(everywhere)
    }
  })

  it('Andalucía 2026: Día de Andalucía on its Saturday, Jueves Santo, and the Mondays after All Saints and Constitution Day', () => {
    expect(days('AN', 2026)).toEqual([
      '01-01 Año Nuevo', '01-06 Epifanía del Señor', '02-28 Día de Andalucía', '04-02 Jueves Santo', '04-03 Viernes Santo',
      '05-01 Fiesta del Trabajo', '08-15 Asunción de la Virgen', '10-12 Fiesta Nacional de España', '11-02 Día siguiente a Todos los Santos',
      '12-07 Lunes siguiente al Día de la Constitución Española', '12-08 Inmaculada Concepción', '12-25 Natividad del Señor'])
  })

  it('Andalucía 2027: Día de Andalucía moved off its Sunday to 1 March, and the Monday after the Assumption', () => {
    expect(days('AN', 2027)).toEqual([
      '01-01 Año Nuevo', '01-06 Epifanía del Señor', '03-01 Día de Andalucía', '03-25 Jueves Santo', '03-26 Viernes Santo',
      '05-01 Fiesta del Trabajo', '08-16 Lunes siguiente a asunción de la Virgen', '10-12 Fiesta Nacional de España', '11-01 Todos los Santos',
      '12-06 Día de la Constitución Española', '12-08 Inmaculada Concepción', '12-25 Natividad del Señor'])
  })

  it('Cataluña 2026 replaces Jueves Santo and the two Mondays with Easter Monday, Sant Joan, the Diada and Sant Esteve', () => {
    expect(days('CT', 2026)).toEqual([
      '01-01 Año Nuevo', '01-06 Epifanía del Señor', '04-03 Viernes Santo', '04-06 Lunes de Pascua', '05-01 Fiesta del Trabajo',
      '06-24 San Juan', '08-15 Asunción de la Virgen', '09-11 Fiesta Nacional de Cataluña', '10-12 Fiesta Nacional de España',
      '12-08 Inmaculada Concepción', '12-25 Natividad del Señor', '12-26 San Esteban'])
  })

  it('Extremadura 2027 replaces the Monday after the Assumption with 11 October', () => {
    const ex = days('EX', 2027)
    expect(ex).toContain('10-11 Sustitución 15 de agosto')
    expect(ex.some(d => d.startsWith('08-16'))).toBe(false)
    expect(ex).toEqual([
      '01-01 Año Nuevo', '01-06 Epifanía del Señor', '03-25 Jueves Santo', '03-26 Viernes Santo', '05-01 Fiesta del Trabajo',
      '09-08 Día de Extremadura', '10-11 Sustitución 15 de agosto', '10-12 Fiesta Nacional de España', '11-01 Todos los Santos',
      '12-06 Día de la Constitución Española', '12-08 Inmaculada Concepción', '12-25 Natividad del Señor'])
  })

  it('Madrid, the Comunitat Valenciana, Canarias and Melilla, 2026 and 2027', () => {
    expect(days('MD', 2026).filter(d => !d.includes('Año Nuevo'))).toEqual([
      '01-06 Epifanía del Señor', '04-02 Jueves Santo', '04-03 Viernes Santo', '05-01 Fiesta del Trabajo', '05-02 Fiesta de la Comunidad de Madrid',
      '08-15 Asunción de la Virgen', '10-12 Fiesta Nacional de España', '11-02 Día siguiente a Todos los Santos',
      '12-07 Lunes siguiente al Día de la Constitución Española', '12-08 Inmaculada Concepción', '12-25 Natividad del Señor'])
    // Valencia keeps San José and Easter Monday instead of Jueves Santo.
    expect(days('VC', 2027).map(d => d.slice(0, 5))).toEqual(['01-01', '01-06', '03-19', '03-26', '03-29', '05-01', '10-09', '10-12', '11-01', '12-06', '12-08', '12-25'])
    expect(days('CN', 2026)).toContain('05-30 Día de Canarias')
    expect(days('ML', 2027)).toEqual(expect.arrayContaining(['03-10 Fiesta del Eid Fitr', '05-17 Fiesta Sacrificio-Aid Al Adha']))
  })
})
