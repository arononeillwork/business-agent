import { describe, expect, it } from 'vitest'
import { cleanTags, expiresSoon, expiryOf, filterDocuments, linkedTo, sortEntries, type KeptDocument, type StorageEntry } from './documents'
import { cleanFolderPath } from './tax'

const doc = (p: Partial<KeptDocument>): KeptDocument => ({ id: p.name ?? 'x', name: 'x.pdf', kind: 'other', year: 2026, quarter: null, size: 10, sha256: null,
  storage: 'google_drive', file_id: 'f', folder: ['Documents'], link: null, notes: null, uploaded_by: null, uploaded_at: '2026-09-01T10:00:00Z', ...p })

describe('the documents hub', () => {
  it('says what each document belongs to: an invoice, a licence, the Tax page’s papers or nothing else', () => {
    expect(linkedTo(doc({ invoices: [{ id: 'i', number: 'F1', party_name: null }] }))).toBe('invoice')
    expect(linkedTo(doc({ licences: [{ id: 'l', name: 'SGAE', expires_on: null }] }))).toBe('licence')
    expect(linkedTo(doc({ folder: ['Tax', '2026', 'Q3', 'Payslips'] }))).toBe('tax')
    expect(linkedTo(doc({ folder: ['Documents', 'Contracts'] }))).toBe('none')
  })

  it('runs out: its own expiry, or its licence’s; soon is within 60 days (or already past)', () => {
    expect(expiryOf(doc({ expires_on: '2027-01-31' }))).toBe('2027-01-31')
    expect(expiryOf(doc({ licences: [{ id: 'l', name: 'RC', expires_on: '2026-10-15' }] }))).toBe('2026-10-15')
    expect(expiresSoon(doc({ expires_on: '2026-11-29' }), '2026-09-30')).toBe(true)
    expect(expiresSoon(doc({ expires_on: '2026-11-30' }), '2026-09-30')).toBe(false)
    expect(expiresSoon(doc({ expires_on: '2026-01-01' }), '2026-09-30')).toBe(true)
    expect(expiresSoon(doc({}), '2026-09-30')).toBe(false)
  })

  it('search finds words in the name, title, tags, notes, folder and what it belongs to; filters narrow it', () => {
    const list = [
      doc({ name: 'Contrato alquiler local.pdf', kind: 'contract', folder: ['Documents', 'Contracts'], tags: ['local'] }),
      doc({ name: 'F2026-0142.pdf', kind: 'purchase_invoice', folder: ['Tax', '2026', 'Q3', 'Purchase invoices'],
        invoices: [{ id: 'i', number: 'F2026-0142', party_name: null, supplier: { name: 'Tostadores del Sur' } }] }),
      doc({ name: 'poliza.pdf', kind: 'contract', year: 2025, title: 'Seguro RC Mapfre', folder: ['Documents', 'Seguros'] }),
    ]
    const all = { q: '', kind: 'all', year: 'all' as const, linked: 'all' as const }
    expect(filterDocuments(list, { ...all, q: 'tostadores' }).map(d => d.name)).toEqual(['F2026-0142.pdf'])
    expect(filterDocuments(list, { ...all, q: 'seguro mapfre' }).map(d => d.name)).toEqual(['poliza.pdf'])
    expect(filterDocuments(list, { ...all, q: 'contracts local' }).map(d => d.name)).toEqual(['Contrato alquiler local.pdf'])
    expect(filterDocuments(list, { ...all, kind: 'contract', year: 2026 }).map(d => d.name)).toEqual(['Contrato alquiler local.pdf'])
    expect(filterDocuments(list, { ...all, linked: 'invoice' })).toHaveLength(1)
  })

  it('tags are tidied, once each', () => {
    expect(cleanTags(' seguro, local , seguro,, 2026 ')).toEqual(['seguro', 'local', '2026'])
    expect(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20)
  })

  it('folders come first, then files, by name', () => {
    const e = (name: string, folder: boolean): StorageEntry => ({ id: name, name, folder, size: null, modified: null, type: null, link: null, kept_id: null })
    expect(sortEntries([e('b.pdf', false), e('Tax', true), e('a.pdf', false), e('Documents', true)]).map(x => x.name)).toEqual(['Documents', 'Tax', 'a.pdf', 'b.pdf'])
  })

  it('kept documents live under Tax or Documents; the Tax page stays Tax only', () => {
    expect(cleanFolderPath(['Documents', 'Seguros'], ['Tax', 'Documents'])).toEqual(['Documents', 'Seguros'])
    expect(cleanFolderPath(['Documents', 'Seguros'])).toBeNull()
    expect(cleanFolderPath(['Social', 'Posts'], ['Tax', 'Documents'])).toBeNull()
  })
})
