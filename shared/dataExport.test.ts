// The export's files (shared/dataExport.ts): CSV any spreadsheet reads, and a zip any unzip opens.
import { crc32, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { csvField, csvLine, exportFileName, toCsvFile, zipFiles } from './dataExport'

describe('CSV', () => {
  it('quotes only what needs it, and keeps lists and details as JSON', () => {
    expect(csvLine([1, 'Café', null, undefined, true, 2.5])).toBe('1,Café,,,true,2.5')
    expect(csvField('Calle Mayor, 1')).toBe('"Calle Mayor, 1"')
    expect(csvField('say "hola"')).toBe('"say ""hola"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(' padded')).toBe('" padded"')
    // Text a spreadsheet would run as a formula is kept as text; numbers stay numbers.
    expect(csvField('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"')
    expect(csvField('+34 600 000 000')).toBe("'+34 600 000 000")
    expect(csvField('@sum')).toBe("'@sum")
    expect(csvField(-5)).toBe('-5')
    expect(csvField(['a', 'b'])).toBe('"[""a"",""b""]"')
    expect(csvField({ open: '08:00' })).toBe('"{""open"":""08:00""}"')
  })

  it('a file: a byte-order mark, the columns, a line per row read by column', () => {
    expect(toCsvFile(['id', 'name'], [{ name: 'Lola', id: 2, extra: 'x' }, { id: 3 }])).toBe('﻿id,name\r\n2,Lola\r\n3,\r\n')
  })
})

describe('zip', () => {
  it('each file compressed, with its name (accents and all), size and CRC, as unzip reads it', async () => {
    const big = new TextEncoder().encode('id,name\r\n'.repeat(2000))
    const zip = await zipFiles([{ name: 'README.txt', data: new TextEncoder().encode('hola') }, { name: 'time_entries ñ.csv', data: big }], new Date(2026, 10, 7, 9, 30, 10))
    const view = new DataView(zip.buffer)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    let at = view.getUint32(end + 16, true)
    const back: { name: string; text: string; crc: number }[] = []
    for (let i = 0; i < 2; i++) {
      expect(view.getUint32(at, true)).toBe(0x02014b50)
      expect(view.getUint16(at + 10, true)).toBe(8)
      expect(view.getUint16(at + 14, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 7)
      const packed = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true)
      expect(view.getUint32(local, true)).toBe(0x04034b50)
      const start = local + 30 + view.getUint16(local + 26, true)
      back.push({ name: new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength)),
        text: new TextDecoder().decode(inflateRawSync(zip.slice(start, start + packed))), crc: view.getUint32(at + 16, true) })
      at += 46 + nameLength
    }
    expect(back.map(f => f.name)).toEqual(['README.txt', 'time_entries ñ.csv'])
    expect(back[0]).toMatchObject({ text: 'hola', crc: crc32('hola') })
    expect(back[1].crc).toBe(crc32(big))
    expect(back[1].text).toBe('id,name\r\n'.repeat(2000))
    expect(zip.length).toBeLessThan(big.length / 10)
  })
})

it('names the zip after the business and the day', () => {
  expect(exportFileName('Easy Beans Coffee', new Date('2026-11-07T12:00:00Z'))).toBe('easy-beans-coffee-2026-11-07.zip')
  expect(exportFileName('Café Ñandú, S.L.', new Date('2026-11-07T12:00:00Z'))).toBe('cafe-nandu-s-l-2026-11-07.zip')
  expect(exportFileName('☕', new Date('2026-11-07T12:00:00Z'))).toBe('business-2026-11-07.zip')
})
