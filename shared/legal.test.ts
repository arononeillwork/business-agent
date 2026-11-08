// The legal notice says who runs the service with only the details that are filled in: until the
// company exists they're blank (shared/legal.ts), and a blank one must never show as an empty label.
import { describe, expect, it } from 'vitest'
import { LEGAL, companyDetails } from './legal'

const blank = { service: 'The Business Agent', operator: '', nif: '', address: '', registry: '' }

describe('who runs the service, on the legal notice', () => {
  it('shows only the name, the service’s own, while nothing else is filled in', () => {
    expect(companyDetails(blank)).toEqual([{ key: 'name', label: 'Name:', value: 'The Business Agent' }])
  })

  it('shows every detail once the company exists, in the usual order', () => {
    const company = { ...blank, operator: 'The Business Agent SL', nif: 'B12345678', address: 'Calle Ancha 1, 29670 San Pedro de Alcántara, Marbella',
      registry: 'Registro Mercantil de Málaga, tomo 1234, folio 56, hoja MA-78901' }
    expect(companyDetails(company).map(d => [d.key, d.value])).toEqual([
      ['name', 'The Business Agent SL'], ['nif', 'B12345678'], ['address', 'Calle Ancha 1, 29670 San Pedro de Alcántara, Marbella'],
      ['registry', 'Registro Mercantil de Málaga, tomo 1234, folio 56, hoja MA-78901'],
    ])
  })

  it('leaves out a detail that is only spaces, and shows the others', () => {
    expect(companyDetails({ ...blank, operator: '  ', nif: ' B12345678 ', registry: ' ' }).map(d => [d.key, d.value]))
      .toEqual([['name', 'The Business Agent'], ['nif', 'B12345678']])
  })

  it('reads the live details by default, with no empty value', () => {
    expect(companyDetails()).toEqual(companyDetails(LEGAL))
    expect(companyDetails().every(d => d.value !== '')).toBe(true)
  })
})
