// Tables out of the app: CSV, Excel (.xlsx), a printable page (save it as PDF) and tab-separated
// text for pasting into Google Sheets or Numbers. No library: an .xlsx is a few XML files in a zip.
import { currentLanguage } from '../i18n'

export type Cell = string | number | null | undefined
export interface ExportTable {
  /** Shown at the top of the PDF and used as the sheet name. */
  title: string
  /** File name without the extension. */
  filename: string
  columns: string[]
  rows: Cell[][]
  /** A last row in bold (totals). */
  footer?: Cell[]
  /** Columns (by position) holding money: the PDF shows them with the currency. */
  money?: number[]
  /** Rows (by position in `rows`) shown in bold: section headings and subtotals (Profit & loss). */
  bold?: number[]
}

const text = (c: Cell) => (c === null || c === undefined ? '' : String(c))

/** Spanish Excel's CSV: semicolons, decimal commas, and a byte-order mark so accents survive. */
export const toCsv = (rows: Cell[][]) =>
  rows.map(r => r.map(c => `"${(typeof c === 'number' ? String(c).replace('.', ',') : text(c)).replace(/"/g, '""')}"`).join(';')).join('\r\n')

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const allRows = (t: ExportTable) => [t.columns, ...t.rows, ...(t.footer ? [t.footer] : [])]

export const csvContent = (t: ExportTable) => '﻿' + toCsv(allRows(t))

export function exportCsv(t: ExportTable) {
  downloadBlob(`${t.filename}.csv`, new Blob([csvContent(t)], { type: 'text/csv;charset=utf-8' }))
}

export function exportXlsx(t: ExportTable) {
  downloadBlob(`${t.filename}.xlsx`, new Blob([xlsx(t)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

/** Tab-separated, which pastes into Google Sheets, Numbers or Excel as cells. */
export async function copyTsv(t: ExportTable) {
  await navigator.clipboard.writeText(allRows(t).map(r => r.map(c => text(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n'))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Opens the browser's print dialog on a clean copy of the table; "Save as PDF" makes the file. */
export function printPdf(t: ExportTable, money: (n: number) => string = n => n.toFixed(2)) {
  const num = (c: number, i: number) => (t.money?.includes(i) ? money(c) : c.toLocaleString(undefined, { maximumFractionDigits: 2 }))
  const cell = (c: Cell, tag: 'td' | 'th', i: number) =>
    `<${tag}${typeof c === 'number' ? ' class="n"' : ''}>${esc(typeof c === 'number' ? num(c, i) : text(c))}</${tag}>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title><style>
    body{font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2b2522;margin:24px}
    h1{font-size:18px;margin:0 0 4px}p{color:#6b625d;margin:0 0 16px}
    table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e6dfda}
    th{font-weight:600;background:#f6f2ef}.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td,tr.b td{font-weight:600}tfoot td{border-top:2px solid #2b2522}
    @page{margin:14mm}</style></head><body>
    <h1>${esc(t.title)}</h1><p>${esc(new Date().toLocaleDateString(currentLanguage() === 'es' ? 'es-ES' : undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
    <table><thead><tr>${t.columns.map((c, i) => cell(c, 'th', i)).join('')}</tr></thead>
    <tbody>${t.rows.map((r, ri) => `<tr${t.bold?.includes(ri) ? ' class="b"' : ''}>${r.map((c, i) => cell(c, 'td', i)).join('')}</tr>`).join('')}</tbody>
    ${t.footer ? `<tfoot><tr>${t.footer.map((c, i) => cell(c, 'td', i)).join('')}</tr></tfoot>` : ''}</table></body></html>`
  const frame = Object.assign(document.createElement('iframe'), { title: t.title })
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.append(frame)
  const doc = frame.contentDocument!
  doc.open(); doc.write(html); doc.close()
  setTimeout(() => {
    frame.contentWindow!.focus()
    frame.contentWindow!.print()
    setTimeout(() => frame.remove(), 1000)
  }, 50)
}

// ---------------------------------------------------------------------------------------------
// .xlsx: one sheet, inline strings, numbers as numbers (two decimals), bold header and total row.
// ---------------------------------------------------------------------------------------------

const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26))
const xml = (s: string) => esc(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

export function xlsxSheet(t: ExportTable) {
  const rows = allRows(t)
  const bold = (r: number) => r === 0 || (!!t.footer && r === rows.length - 1) || !!t.bold?.includes(r - 1)
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const ref = `${colName(ci)}${ri + 1}`
    if (typeof c === 'number' && Number.isFinite(c)) return `<c r="${ref}" s="${bold(ri) ? 3 : 2}"><v>${c}</v></c>`
    if (c === null || c === undefined || c === '') return ''
    return `<c r="${ref}" t="inlineStr"${bold(ri) ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(String(c))}</t></is></c>`
  }).join('')}</row>`).join('')
  const widths = t.columns.map((_, ci) => Math.min(60, Math.max(8, ...rows.map(r => text(r[ci]).length + 2))))
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${body}</sheetData></worksheet>`
}

function xlsx(t: ExportTable): Uint8Array<ArrayBuffer> {
  const sheet = t.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1'
  const ns = 'http://schemas.openxmlformats.org'
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zip({
    '[Content_Types].xml': `${head}<Types xmlns="${ns}/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': `${head}<Relationships xmlns="${ns}/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${head}<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships">`
      + `<sheets><sheet name="${xml(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${head}<Relationships xmlns="${ns}/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    // Styles: 0 plain, 1 bold, 2 number 0.00, 3 bold number 0.00.
    'xl/styles.xml': `${head}<styleSheet xmlns="${ns}/spreadsheetml/2006/main">`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
      + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': xlsxSheet(t),
  })
}

// A zip with every file stored as is (no compression): small spreadsheets don't need it.
const CRC = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name), data = enc.encode(content), crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true)
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true)
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true)
    local.push(new Uint8Array(h.buffer), n, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true)
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), n)
    offset += 30 + n.length + data.length
  }
  const size = central.reduce((s, b) => s + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  const count = Object.keys(files).length
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  const parts = [...local, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
