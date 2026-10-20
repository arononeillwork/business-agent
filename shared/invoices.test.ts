import { describe, expect, it } from 'vitest'
import { bySupplier, dueFrom, isOverdue, matchSupplier, numberFromName, readFacturae, termDays, type Invoice } from './invoices'

const suppliers = [
  { id: 'roaster', name: 'Tostadores del Sur', kind: 'Coffee roaster', email: 'pedidos@tostadoresdelsur.es', website: 'https://www.tostadoresdelsur.es', active: true, tax_id: 'B29123456' },
  { id: 'bakery', name: 'By Eric', kind: 'Bakery', email: 'info@by-eric.es', website: null, active: true, tax_id: null },
  { id: 'dairy', name: 'Lácteos Ronda', kind: 'Dairy', email: 'lacteosronda@gmail.com', website: null, active: true, tax_id: null },
  { id: 'old', name: 'Old supplier', kind: null, email: 'facturas@old.es', website: null, active: false, tax_id: null },
]

describe('matching an invoice to its supplier', () => {
  it('by the same email, then tax number, then the company domain', () => {
    expect(matchSupplier(suppliers, { email: 'Info@By-Eric.es' })).toBe('bakery')
    expect(matchSupplier(suppliers, { email: 'facturacion@tostadoresdelsur.es' })).toBe('roaster') // same domain as their email
    expect(matchSupplier(suppliers, { email: 'admin@mail.tostadoresdelsur.es' })).toBeNull() // another domain
    expect(matchSupplier(suppliers, { email: 'x@nowhere.es', tax_id: 'b-29.123.456' })).toBe('roaster')
    expect(matchSupplier(suppliers, { email: 'lacteosronda@gmail.com' })).toBe('dairy') // the exact address
  })

  it('never by a shared email provider’s domain, nor an archived supplier', () => {
    expect(matchSupplier(suppliers, { email: 'someone.else@gmail.com' })).toBeNull()
    expect(matchSupplier(suppliers, { email: 'facturas@old.es' })).toBeNull()
  })
})

describe('when it’s due', () => {
  it('reads the days to pay in a supplier’s terms', () => {
    expect(termDays('30 días')).toBe(30)
    expect(termDays('Transferencia a 60 dias')).toBe(60)
    expect(termDays('Net 15')).toBe(15)
    expect(termDays('Al contado')).toBe(0)
    expect(termDays('Domiciliación')).toBeNull()
    expect(dueFrom('2026-09-14', '30 días')).toBe('2026-10-14')
    expect(dueFrom(null, '30 días')).toBeNull()
  })

  it('overdue: still to pay after its due day', () => {
    expect(isOverdue({ direction: 'in', status: 'to_pay', due_on: '2026-09-29' }, '2026-09-30')).toBe(true)
    expect(isOverdue({ direction: 'in', status: 'paid', due_on: '2026-09-29' }, '2026-09-30')).toBe(false)
    expect(isOverdue({ direction: 'in', status: 'to_pay', due_on: '2026-09-30' }, '2026-09-30')).toBe(false)
    expect(isOverdue({ direction: 'in', status: 'to_pay', due_on: null }, '2026-09-30')).toBe(false)
  })
})

describe('invoice numbers and e-invoices', () => {
  it('finds the number in a file name', () => {
    expect(numberFromName('Factura F2026-0142.pdf')).toBe('F2026-0142')
    expect(numberFromName('invoice_INV-88.pdf')).toBe('INV-88')
    expect(numberFromName('Fra. 2026/311 Makro.pdf')).toBe('2026/311')
    expect(numberFromName('scan.pdf')).toBeNull()
  })

  it('reads a Facturae XML: number, days, totals and the seller', () => {
    const xml = `<?xml version="1.0"?><fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml">
      <Parties><SellerParty><TaxIdentification><TaxIdentificationNumber>B29123456</TaxIdentificationNumber></TaxIdentification>
        <LegalEntity><CorporateName>Tostadores del Sur SL</CorporateName></LegalEntity></SellerParty>
        <BuyerParty><TaxIdentification><TaxIdentificationNumber>B12345674</TaxIdentificationNumber></TaxIdentification></BuyerParty></Parties>
      <Invoices><Invoice><InvoiceHeader><InvoiceNumber>0142</InvoiceNumber><InvoiceSeriesCode>F2026</InvoiceSeriesCode></InvoiceHeader>
        <InvoiceIssueData><IssueDate>2026-09-14</IssueDate><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode></InvoiceIssueData>
        <InvoiceTotals><TotalGrossAmountBeforeTaxes>250.00</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>25.00</TotalTaxOutputs><InvoiceTotal>275.00</InvoiceTotal></InvoiceTotals>
        <PaymentDetails><Installment><InstallmentDueDate>2026-10-14</InstallmentDueDate></Installment></PaymentDetails></Invoice></Invoices></fe:Facturae>`
    expect(readFacturae(xml)).toEqual({ number: 'F2026-0142', issued_on: '2026-09-14', due_on: '2026-10-14', net: 250, vat: 25, total: 275,
      seller_tax_id: 'B29123456', seller_name: 'Tostadores del Sur SL', currency: 'EUR' })
    expect(readFacturae('<html><body>Not an invoice</body></html>')).toBeNull()
  })
})

describe('totals by supplier', () => {
  const inv = (p: Partial<Invoice>): Invoice => ({ id: crypto.randomUUID(), direction: 'in', supplier_id: null, party_name: null, party_email: null, party_tax_id: null,
    number: null, issued_on: '2026-09-01', due_on: null, net: null, vat: null, total: 0, currency: 'EUR', category: null, status: 'to_pay', paid_on: null,
    document_id: null, source: 'manual', email_id: null, email_from: null, email_subject: null, email_at: null, notes: null, created_at: '', ...p })
  it('adds up what each supplier invoiced and what’s still to pay; cancelled and sales invoices are left out', () => {
    const rows = bySupplier([
      inv({ supplier_id: 'roaster', total: 275, status: 'paid' }), inv({ supplier_id: 'roaster', total: 300 }),
      inv({ supplier_id: 'bakery', total: 120 }), inv({ supplier_id: 'bakery', total: 999, status: 'cancelled' }),
      inv({ party_name: 'Makro', total: 80.5 }), inv({ direction: 'out', total: 5000, status: 'sent' }),
    ], suppliers)
    expect(rows.map(r => [r.name, r.count, r.total, r.open])).toEqual([['Tostadores del Sur', 2, 575, 300], ['By Eric', 1, 120, 120], ['Makro', 1, 80.5, 80.5]])
    expect(rows[0].kind).toBe('Coffee roaster')
  })
})
