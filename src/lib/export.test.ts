import { describe, expect, it } from 'vitest'
import { toCsv, xlsxSheet, zip } from './export'

describe('export', () => {
  it('writes CSV the way Spanish Excel reads it: semicolons, decimal commas, quotes escaped', () => {
    expect(toCsv([['Rent', 1530.5, 'the "big" one'], ['Water', null, '']])).toBe('"Rent";"1530,5";"the ""big"" one"\r\n"Water";"";""')
  })

  it('keeps numbers as numbers in the sheet, and the header and total in bold', () => {
    const xml = xlsxSheet({ title: 't', filename: 'f', columns: ['Expense', 'Per month'], rows: [['Rent & rates', 1530]], footer: ['Total', 1530] })
    expect(xml).toContain('<c r="B2" s="2"><v>1530</v></c>')
    expect(xml).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Expense</t></is></c>')
    expect(xml).toContain('Rent &amp; rates')
    expect(xml).toContain('<c r="B3" s="3"><v>1530</v></c>')
  })

  it('rows asked for in bold are bold (headings and subtotals); the others stay plain', () => {
    const xml = xlsxSheet({ title: 't', filename: 'f', columns: ['Line', 'Jul'], rows: [['Income', null], ['Takings', 900], ['Total income', 900]], bold: [0, 2] })
    expect(xml).toContain('<c r="A2" t="inlineStr" s="1">')
    expect(xml).toContain('<c r="A3" t="inlineStr"><is>')
    expect(xml).toContain('<c r="B3" s="2"><v>900</v></c>')
    expect(xml).toContain('<c r="B4" s="3"><v>900</v></c>')
  })

  it('makes a valid zip: local headers, a central directory and the end record', () => {
    const z = zip({ 'a.txt': 'hello', 'b/c.xml': '<x/>' })
    const view = new DataView(z.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(14, true)).toBe(0x3610a686) // crc32("hello")
    const end = z.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50)
  })
})
