import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAX_SETTINGS, autoFolder, cleanFolderPath, filingsFor, guessKind, guessPeriod, nextWorkingDay, overdue, safeFileName,
  taxFileProblem, taxFileType, upcoming, type FilingRecord,
} from './tax'

const due = (year: number, model: string, period: string, s = DEFAULT_TAX_SETTINGS) =>
  filingsFor(year, s).find(f => f.model === model && f.period === period)?.due

describe('the tax calendar for an SL', () => {
  it('quarterly returns fall due on the 20th after the quarter; the last quarter’s VAT on 30 January', () => {
    expect(due(2026, '303', '1T')).toBe('2026-04-20')
    expect(due(2026, '303', '2T')).toBe('2026-07-20')
    expect(due(2026, '303', '3T')).toBe('2026-10-20')
    expect(due(2026, '303', '4T')).toBe('2027-02-01') // 30 Jan 2027 is a Saturday
    expect(due(2026, '111', '4T')).toBe('2027-01-20')
    expect(due(2026, '115', '3T')).toBe('2026-10-20')
  })

  it('a last day on a weekend moves to the Monday', () => {
    expect(nextWorkingDay('2025-07-20')).toBe('2025-07-21') // Sunday
    expect(nextWorkingDay('2026-06-20')).toBe('2026-06-22') // Saturday
    expect(nextWorkingDay('2026-10-20')).toBe('2026-10-20') // Tuesday
    expect(due(2025, '303', '2T')).toBe('2025-07-21')
  })

  it('the year’s summaries, corporate tax and the accounts come the following year', () => {
    expect(due(2026, '390', '0A')).toBe('2027-02-01')
    expect(due(2026, '190', '0A')).toBe('2027-02-01') // 31 Jan 2027 is a Sunday
    expect(due(2027, '347', '0A')).toBe('2028-02-29') // leap year
    expect(due(2026, '200', '0A')).toBe('2027-07-26') // 25 July 2027 is a Sunday
    expect(due(2026, 'CCAA', '0A')).toBe('2027-07-30')
  })

  it('only the returns the business files: no staff or freelancers, no rent, no EU trade, no instalments', () => {
    const models = (s: Partial<typeof DEFAULT_TAX_SETTINGS>) => [...new Set(filingsFor(2026, { ...DEFAULT_TAX_SETTINGS, ...s }).map(f => f.model))].sort()
    expect(models({ withholding: false, rent: false })).toEqual(['200', '303', '347', '390', 'CCAA'])
    expect(models({})).toEqual(['111', '115', '180', '190', '200', '303', '347', '390', 'CCAA'])
    expect(models({ intra_eu: true, instalments: true })).toContain('349')
    expect(filingsFor(2026, { ...DEFAULT_TAX_SETTINGS, instalments: true }).filter(f => f.model === '202').map(f => f.due))
      .toEqual(['2026-04-20', '2026-10-20', '2026-12-21'])
  })

  it('what’s coming leaves out what was filed; what’s overdue is past its last day and not filed', () => {
    const all = filingsFor(2026, DEFAULT_TAX_SETTINGS)
    const filed: FilingRecord[] = [{ model: '303', year: 2026, period: '3T', status: 'filed', amount: 812.4, filed_on: '2026-10-15', reference: null, notes: null }]
    const next = upcoming(all, filed, '2026-10-16')
    expect(next[0]).toMatchObject({ model: '111', period: '3T', due: '2026-10-20' })
    expect(next.some(f => f.model === '303' && f.period === '3T')).toBe(false)
    expect(overdue(all, filed, '2026-10-21').map(f => `${f.model} ${f.period}`)).toEqual(
      ['111 1T', '115 1T', '303 1T', '111 2T', '115 2T', '303 2T', '111 3T', '115 3T'])
  })
})

describe('documents', () => {
  it('guesses the kind from the name, in Spanish or English', () => {
    expect(guessKind('Factura Makro 2026-10-03.pdf')).toBe('purchase_invoice')
    expect(guessKind('factura emitida 12.pdf')).toBe('sales_invoice')
    expect(guessKind('Nómina Julio octubre.pdf')).toBe('payslip')
    expect(guessKind('Extracto BBVA septiembre.pdf')).toBe('bank_statement')
    expect(guessKind('Modelo 303 3T 2026 justificante.pdf')).toBe('tax_return')
    expect(guessKind('ticket gasolina.jpg')).toBe('receipt')
    expect(guessKind('contrato alquiler local.pdf')).toBe('contract')
    expect(guessKind('IMG_2041.HEIC')).toBe('purchase_invoice')
  })

  it('guesses the quarter from a date or quarter in the name, else the file’s date', () => {
    const oct = Date.parse('2026-10-20T10:00:00Z')
    expect(guessPeriod('Factura 2026-05-14.pdf', oct)).toEqual({ year: 2026, quarter: 2 })
    expect(guessPeriod('fra 14-08-2026.pdf', oct)).toEqual({ year: 2026, quarter: 3 })
    expect(guessPeriod('scan20260102.pdf', oct)).toEqual({ year: 2026, quarter: 1 })
    expect(guessPeriod('Modelo 303 3T 2026.pdf', oct)).toEqual({ year: 2026, quarter: 3 })
    expect(guessPeriod('IVA Q2-2026.pdf', oct)).toEqual({ year: 2026, quarter: 2 })
    expect(guessPeriod('receipt.jpg', oct)).toEqual({ year: 2026, quarter: 4 })
    expect(guessPeriod('pedido 99999999.pdf', oct)).toEqual({ year: 2026, quarter: 4 }) // not a date
  })

  it('sorted automatically: Tax/<year>/Q<n>/<kind>, or the whole year', () => {
    expect(autoFolder('purchase_invoice', 2026, 4)).toEqual(['Tax', '2026', 'Q4', 'Purchase invoices'])
    expect(autoFolder('contract', 2026, null)).toEqual(['Tax', '2026', 'Whole year', 'Contracts'])
  })

  it('takes PDFs, photos, spreadsheets, documents and e-invoices up to 25 MB', () => {
    expect(taxFileType('a.PDF')).toBe('application/pdf')
    expect(taxFileType('scan.heic')).toBe('image/heic')
    expect(taxFileType('facturae.xsig')).toBe('application/xml')
    expect(taxFileType('virus.exe')).toBeNull()
    expect(taxFileProblem('a.pdf', 1000)).toBeNull()
    expect(taxFileProblem('a.zip', 1000)).toMatch(/Use a PDF/)
    expect(taxFileProblem('a.pdf', 0)).toBe('That file is empty')
    expect(taxFileProblem('a.pdf', 26 * 1024 * 1024)).toBe('Files can be up to 25 MB')
  })

  it('names and folders are made safe for Drive and OneDrive', () => {
    expect(safeFileName('a/b:c?.pdf')).toBe('a-b-c-.pdf')
    expect(safeFileName(`${'x'.repeat(300)}.pdf`)).toHaveLength(180)
    expect(safeFileName(`${'x'.repeat(300)}.pdf`).endsWith('.pdf')).toBe(true)
    expect(cleanFolderPath(['Tax', ' 2026 ', 'Gestoría'])).toEqual(['Tax', '2026', 'Gestoría'])
    expect(cleanFolderPath(['Social', 'Posts'])).toBeNull()
    expect(cleanFolderPath(['Tax', '..'])).toBeNull()
    expect(cleanFolderPath(['Tax', 'a/b'])).toEqual(['Tax', 'a b'])
    expect(cleanFolderPath('Tax')).toBeNull()
  })
})
