// CSV out of the app in the business's country's style: Spain's Excel (semicolons, decimal commas), as it
// always was, and Ireland's (commas, decimal points, dates day first), with the person's own decimal mark.
import { afterEach, describe, expect, it } from 'vitest'
import { setCountry } from '../../shared/country'
import { csvContent, csvStyle, toCsv, type ExportTable } from './export'

afterEach(() => setCountry('ES'))

const table: ExportTable = {
  title: 'Competitions', filename: 'competitions', columns: ['Competition', 'Starts', 'Prize value', 'Note'],
  rows: [['Halloween giveaway', '2026-10-09', 12.5, 'the "big" one'], ['Christmas, St Stephen’s', '2026-12-01', 1530, null]],
  footer: ['Total', '', 1542.5, 'clocked 2026-10-21 08:30'],
}

describe('CSV for a business in Spain', () => {
  it('semicolons, decimal commas, dates as kept, and the byte-order mark: as before, whatever the person’s decimal mark', () => {
    setCountry('ES')
    const spanish = '﻿"Competition";"Starts";"Prize value";"Note"\r\n"Halloween giveaway";"2026-10-09";"12,5";"the ""big"" one"\r\n'
      + '"Christmas, St Stephen’s";"2026-12-01";"1530";""\r\n"Total";"";"1542,5";"clocked 2026-10-21 08:30"'
    expect(csvContent(table)).toBe(spanish)
    expect(csvContent(table, csvStyle('ES', 'point'))).toBe(spanish)
    expect(csvStyle()).toEqual({ separator: ';', decimal: ',', dayFirst: false })
  })
})

describe('CSV for a business in Ireland', () => {
  it('commas, decimal points and dates day first, as Excel in Ireland reads them; the byte-order mark kept', () => {
    setCountry('IE')
    expect(csvContent(table)).toBe('﻿"Competition","Starts","Prize value","Note"\r\n"Halloween giveaway","09/10/2026","12.5","the ""big"" one"\r\n'
      + '"Christmas, St Stephen’s","01/12/2026","1530",""\r\n"Total","","1542.5","clocked 2026-10-21 08:30"')
    expect(csvStyle()).toEqual({ separator: ',', decimal: '.', dayFirst: true })
  })

  it('a date and time goes day first too; a timestamp with its zone, or text with a date in it, stays as it is', () => {
    const ie = csvStyle('IE')
    expect(toCsv([['2026-10-21 08:30', '2026-10-21T08:30:15', '2026-10-21T08:30:00Z', 'from 2026-10-21']], ie))
      .toBe('"21/10/2026 08:30","21/10/2026 08:30:15","2026-10-21T08:30:00Z","from 2026-10-21"')
  })

  it('someone who chose the decimal comma gets semicolons with it, dates still day first', () => {
    expect(csvStyle('IE', 'comma')).toEqual({ separator: ';', decimal: ',', dayFirst: true })
    expect(csvStyle('IE', 'point')).toEqual(csvStyle('IE'))
    expect(toCsv([['Rent', 1530.5, '2026-11-01']], csvStyle('IE', 'comma'))).toBe('"Rent";"1530,5";"01/11/2026"')
  })
})
