import { describe, expect, it } from 'vitest'
import { cleanPin, pinProblem } from './squarePins'

describe('a Square PIN', () => {
  it('is typed with or without spaces', () => {
    expect(cleanPin(' 12 34 ')).toBe('1234')
  })

  it('is 4 to 6 digits', () => {
    expect(pinProblem('1234')).toBeNull()
    expect(pinProblem('0007')).toBeNull()
    expect(pinProblem('123456')).toBeNull()
    expect(pinProblem('12 34')).toBeNull()
    expect(pinProblem('123')).toMatch(/4 digits/)
    expect(pinProblem('1234567')).toMatch(/4 digits/)
    expect(pinProblem('12a4')).toMatch(/digits only/)
    expect(pinProblem('')).toMatch(/digits only/)
  })
})
