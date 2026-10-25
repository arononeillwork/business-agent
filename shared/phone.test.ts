import { describe, expect, it } from 'vitest'
import { CALLING_CODES, joinPhone, splitPhone } from './phone'

describe('phone numbers', () => {
  it('splits a saved number into its country and the rest', () => {
    expect(splitPhone('+34 600 000 000')).toEqual({ country: 'ES', number: '600 000 000' })
    expect(splitPhone('+353 87 123 4567')).toEqual({ country: 'IE', number: '87 123 4567' })
    expect(splitPhone('+447700900123')).toEqual({ country: 'GB', number: '7700900123' })
    expect(splitPhone('+1 415 555 0100')).toEqual({ country: 'US', number: '415 555 0100' })
  })
  it('takes a number without a code as Spanish, and an empty one as empty', () => {
    expect(splitPhone('600 111 222')).toEqual({ country: 'ES', number: '600 111 222' })
    expect(splitPhone(null)).toEqual({ country: 'ES', number: '' })
  })
  it('joins the picked code and the typed number', () => {
    expect(joinPhone('ES', ' 600-111 222 ')).toBe('+34 600111 222')
    expect(joinPhone('GB', '7700 900123')).toBe('+44 7700 900123')
    expect(joinPhone('ES', '')).toBe('')
  })
  it('lists each country once', () => {
    const ids = CALLING_CODES.map(([c]) => c)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
