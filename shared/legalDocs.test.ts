import { describe, expect, it } from 'vitest'
import { byKind, guessKind, matchesSearch, previewOf, type LegalDocument } from './legalDocs'

const doc = (p: Partial<LegalDocument> & { title: string }): LegalDocument => ({
  id: p.title, kind: 'other', storage: 'google_drive', file_id: p.title, file_name: `${p.title}.pdf`, mime_type: 'application/pdf', size: 1,
  modified_at: null, link: null, location: null, notes: null, added_by: null, added_at: '2026-10-23T10:00:00Z', ...p,
})

describe('legal documents', () => {
  it('guesses what a document is from its file name, in Spanish or English', () => {
    expect(guessKind('Contrato_arrendamiento-local.pdf')).toBe('lease')
    expect(guessKind('lease1.jpg')).toBe('lease')
    expect(guessKind('escritura_SL.pdf')).toBe('company')
    expect(guessKind('036 final.pdf')).toBe('company')
    expect(guessKind('Póliza Mapfre RC.pdf')).toBe('insurance')
    expect(guessKind('Licencia de apertura.pdf')).toBe('licence')
    expect(guessKind('Contrato de trabajo Julio.pdf')).toBe('employment')
    expect(guessKind('Política de privacidad.docx')).toBe('policy')
    expect(guessKind('Contrato mantenimiento cafetera.pdf')).toBe('contract')
    expect(guessKind('Easy_Beans_Roles_and_Responsibilities.pdf')).toBe('other')
  })

  it('shows PDFs and pictures in the page; Google’s own documents and Office files as PDFs the storage makes', () => {
    expect(previewOf({ storage: 'google_drive', mime_type: 'application/pdf', file_name: 'a.pdf' })).toEqual({ as: 'pdf', convert: false })
    expect(previewOf({ storage: 'onedrive', mime_type: null, file_name: 'a.PDF' })).toEqual({ as: 'pdf', convert: false })
    expect(previewOf({ storage: 'google_drive', mime_type: 'image/jpeg', file_name: 'lease1.jpg' })).toEqual({ as: 'image', convert: false })
    expect(previewOf({ storage: 'google_drive', mime_type: 'application/vnd.google-apps.document', file_name: 'Manual' })).toEqual({ as: 'pdf', convert: true })
    expect(previewOf({ storage: 'onedrive', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_name: 'Contrato.docx' }))
      .toEqual({ as: 'pdf', convert: true })
    // A Word file in Google Drive isn't something Drive turns into a PDF: it opens in Drive.
    expect(previewOf({ storage: 'google_drive', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_name: 'Contrato.docx' })).toBeNull()
    expect(previewOf({ storage: 'google_drive', mime_type: 'application/zip', file_name: 'x.zip' })).toBeNull()
  })

  it('groups by kind in the page’s order, and searches title, file name, folder and notes without accents', () => {
    const docs = [doc({ title: 'Seguro RC', kind: 'insurance' }), doc({ title: 'Arrendamiento', kind: 'lease', location: 'Documents/Lease' }),
      doc({ title: 'Anexo', kind: 'lease', notes: 'Cláusula de renovación' })]
    expect(byKind(docs).map(g => [g.id, g.docs.map(d => d.title)])).toEqual([['lease', ['Anexo', 'Arrendamiento']], ['insurance', ['Seguro RC']]])
    expect(docs.filter(d => matchesSearch(d, 'clausula')).map(d => d.title)).toEqual(['Anexo'])
    expect(docs.filter(d => matchesSearch(d, 'documents/lease')).map(d => d.title)).toEqual(['Arrendamiento'])
    expect(docs.filter(d => matchesSearch(d, '  ')).length).toBe(3)
  })
})
