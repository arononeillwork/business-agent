import { describe, expect, it } from 'vitest'
import { filterReviews, guessLanguage, isLow, starsOf, suggestedReply, summarise, type Review } from './reviews'

const review = (p: Partial<Review>): Review => ({ id: p.id ?? 'r', source: 'google', rating: 5, text: null, reviewer: 'Lucía Pérez',
  created_at: '2026-09-10T10:00:00Z', reply: null, replied_at: null, language: 'es', url: null, ...p })

describe('reviews', () => {
  it('reads Google’s stars, as words or numbers', () => {
    expect(starsOf('FIVE')).toBe(5)
    expect(starsOf('two')).toBe(2)
    expect(starsOf(4)).toBe(4)
    expect(starsOf('STAR_RATING_UNSPECIFIED')).toBeNull()
    expect(starsOf(6)).toBeNull()
  })

  it('guesses Spanish or English from the words, accents included', () => {
    expect(guessLanguage('El mejor café de San Pedro, muy amable el personal')).toBe('es')
    expect(guessLanguage('¡Riquísimo!')).toBe('es')
    expect(guessLanguage('Lovely coffee and really friendly staff')).toBe('en')
    expect(guessLanguage('')).toBe('en')
    expect(guessLanguage(null)).toBe('en')
    // Words side by side each count; parts of longer words don't.
    expect(guessLanguage('que la con, the')).toBe('es')
    expect(guessLanguage('Hotel bella, great')).toBe('en')
  })

  it('sums up: average, stars, month by month, reply rate and how fast replies came', () => {
    const s = summarise([
      review({ id: 'a', rating: 5, created_at: '2026-08-02T10:00:00Z', reply: 'Gracias', replied_at: '2026-08-02T14:00:00Z' }),
      review({ id: 'b', rating: 4, created_at: '2026-09-01T10:00:00Z', reply: 'Thanks', replied_at: '2026-09-02T10:00:00Z' }),
      review({ id: 'c', rating: 2, created_at: '2026-09-20T10:00:00Z' }),
    ])
    expect(s).toMatchObject({ count: 3, average: 3.7, unanswered: 1, reply_hours: 14 })
    expect(s.reply_rate).toBeCloseTo(2 / 3)
    expect(s.stars).toEqual([{ rating: 5, count: 1 }, { rating: 4, count: 1 }, { rating: 3, count: 0 }, { rating: 2, count: 1 }, { rating: 1, count: 0 }])
    expect(s.months).toEqual([{ month: '2026-08', count: 1, average: 5 }, { month: '2026-09', count: 2, average: 3 }])
    expect(summarise([])).toMatchObject({ count: 0, average: null, reply_rate: null, reply_hours: null })
  })

  it('filters: no reply yet, 1 to 3 stars, 4 and 5 stars', () => {
    const list = [review({ id: 'a', rating: 5, reply: 'x' }), review({ id: 'b', rating: 3 }), review({ id: 'c', rating: 1, reply: 'y' })]
    expect(filterReviews(list, 'unanswered').map(r => r.id)).toEqual(['b'])
    expect(filterReviews(list, 'low').map(r => r.id)).toEqual(['b', 'c'])
    expect(filterReviews(list, 'high').map(r => r.id)).toEqual(['a'])
    expect(filterReviews(list, 'all')).toHaveLength(3)
    expect(isLow({ rating: 3 })).toBe(true)
    expect(isLow({ rating: 4 })).toBe(false)
  })

  it('suggests a reply in the review’s language: thanks for good ones, an apology and a way to talk for poor ones', () => {
    expect(suggestedReply({ rating: 5, reviewer: 'Lucía Pérez', language: 'es' }, 'Easy Beans Coffee')).toMatch(/^¡Hola, Lucía! Muchísimas gracias.*Easy Beans Coffee/)
    expect(suggestedReply({ rating: 5, reviewer: 'Tom', language: 'en' }, 'Easy Beans Coffee')).toMatch(/^Hi Tom, thank you so much/)
    expect(suggestedReply({ rating: 2, reviewer: 'Tom Hughes', language: 'en' }, 'Easy Beans', 'easybeanscafe@gmail.com')).toMatch(/very sorry.*easybeanscafe@gmail\.com/)
    expect(suggestedReply({ rating: 1, reviewer: '', language: 'es' }, 'Easy Beans')).toMatch(/^Hola\. Sentimos mucho/)
    expect(suggestedReply({ rating: 3, reviewer: 'Ana', language: 'es' }, 'Easy Beans')).toMatch(/otra oportunidad/)
  })
})
