import { describe, expect, it } from 'vitest'
import { checkTaxId, normaliseTaxId } from './taxId'

describe('Spanish tax numbers', () => {
  it('tidies what people type', () => {
    expect(normaliseTaxId(' b-12.345 678 ')).toBe('B12345678')
  })

  it('accepts valid CIF, NIF and NIE numbers', () => {
    expect(checkTaxId('B12345674')).toEqual({ ok: true, value: 'B12345674', kind: 'CIF' })
    expect(checkTaxId('Q2826000H')).toMatchObject({ ok: true, kind: 'CIF' })
    expect(checkTaxId('12345678z')).toEqual({ ok: true, value: '12345678Z', kind: 'NIF' })
    expect(checkTaxId('X1234567L')).toMatchObject({ ok: true, kind: 'NIE' })
  })

  it('catches typos in the control character', () => {
    expect(checkTaxId('B12345678')).toMatchObject({ ok: false })
    expect(checkTaxId('12345678A')).toMatchObject({ ok: false, error: expect.stringMatching(/NIF letter/) })
    expect(checkTaxId('hello')).toMatchObject({ ok: false, error: expect.stringMatching(/Spanish CIF/) })
  })
})
