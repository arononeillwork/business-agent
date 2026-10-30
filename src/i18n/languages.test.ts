import { describe, expect, it } from 'vitest'
import { chosenLanguages, preferredLanguage } from '.'

describe('languages', () => {
  it('everyone has the team’s languages (an admin’s pick) besides their own, and keeps their own choice', () => {
    expect(chosenLanguages({ languages: ['en'] })).toEqual(['en'])
    expect(chosenLanguages({ languages: ['en'] }, ['es', 'en'])).toEqual(['en', 'es'])
    expect(chosenLanguages({}, ['es'])).toEqual(['es'])
    expect(preferredLanguage({ language: 'es' }, ['en', 'es'])).toBe('es')
    expect(preferredLanguage({ language: 'es', languages: ['en'] })).toBe('en') // no longer one of theirs
  })
})
