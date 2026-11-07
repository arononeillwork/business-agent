// Everything a business keeps, out (Billing → Your data, owners only): one CSV file per table, in one zip.
// Used by the Worker (worker/account.ts) and the demo, so both make the same files. No library: a zip is
// a few headers around each file, compressed with the platform's own deflate (CompressionStream).

/** CSV as spreadsheets and other apps read it: commas, quotes where needed, a byte-order mark so accents survive. */
export function csvLine(values: readonly unknown[]): string {
  return values.map(csvField).join(',')
}

/**
 * A value as one CSV field: nothing for null, lists and objects as JSON, text quoted when it must be.
 * Text a spreadsheet would run as a formula (starting with =, +, -, @, a tab or a return: a customer's
 * name, a note, a phone number) gets a ' in front, so opening the export never runs anything.
 */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  const raw = typeof v === 'object' ? JSON.stringify(v) : String(v)
  const text = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A table as a CSV file: its columns, then a line per row (values read by column name). */
export function toCsvFile(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return '﻿' + [csvLine(columns), ...rows.map(r => csvLine(columns.map(c => r[c])))].join('\r\n') + '\r\n'
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Raw deflate (what a zip keeps), by the platform: browsers, Workers and Node all have it. */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream<BufferSource>({ start(c) { c.enqueue(data as Uint8Array<ArrayBuffer>); c.close() } })
  return new Uint8Array(await new Response(input.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
}

export interface ZipEntry { name: string; data: Uint8Array }

/** A zip of these files, each compressed (deflate), names in UTF-8, dated `at`. Up to 4 GB in all (no ZIP64). */
export async function zipFiles(files: readonly ZipEntry[], at = new Date()): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2)
  const date = (Math.max(0, at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const packed = await deflate(f.data)
    const crc = crc32(f.data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true)  // local file header
    head.setUint16(4, 20, true)          // version needed
    head.setUint16(6, 0x0800, true)      // names in UTF-8
    head.setUint16(8, 8, true)           // deflate
    head.setUint16(10, time, true)
    head.setUint16(12, date, true)
    head.setUint32(14, crc, true)
    head.setUint32(18, packed.length, true)
    head.setUint32(22, f.data.length, true)
    head.setUint16(26, name.length, true)
    parts.push(new Uint8Array(head.buffer), name, packed)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true) // central directory entry
    entry.setUint16(4, 20, true)         // made by
    entry.setUint16(6, 20, true)         // version needed
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, 8, true)
    entry.setUint16(12, time, true)
    entry.setUint16(14, date, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, packed.length, true)
    entry.setUint32(24, f.data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)    // where its local header is
    const row = new Uint8Array(46 + name.length)
    row.set(new Uint8Array(entry.buffer), 0)
    row.set(name, 46)
    central.push(row)
    offset += 30 + name.length + packed.length
  }
  const size = central.reduce((n, r) => n + r.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)     // end of central directory
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let pos = 0
  for (const p of all) { out.set(p, pos); pos += p.length }
  return out
}

/** What's in the export and what isn't, as the zip's README. */
export function exportReadme(business: string, at: Date, tables: readonly { name: string; rows: number }[]): string {
  return [
    `${business}: everything kept in The Business Agent, ${at.toISOString().slice(0, 10)}`,
    '',
    'One CSV file per table, the first line naming the columns. Dates and times are ISO 8601, with their time zone.',
    'Lists and details kept together (opening hours, settings) are written as JSON.',
    'Left out: passwords, PIN and access-key hashes, and sign-in tokens and keys for connected apps;',
    'and the app\'s own workings (messages waiting to be sent, push subscriptions, answers kept from other services).',
    'Photos, videos and documents kept in Google Drive or OneDrive stay there.',
    '',
    ...tables.map(t => `${t.name}.csv: ${t.rows} ${t.rows === 1 ? 'row' : 'rows'}`),
    '',
  ].join('\r\n')
}

/** The zip's name: the business and the day, e.g. "easy-beans-coffee-2026-11-07.zip". */
export function exportFileName(business: string, at: Date): string {
  const slug = business.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business'
  return `${slug}-${at.toISOString().slice(0, 10)}.zip`
}
