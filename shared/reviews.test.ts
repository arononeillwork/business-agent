import { describe, expect, it } from 'vitest'
import { filterReviews, googleTranslation, guessLanguage, isLow, originalWords, sortReviews, starsOf, suggestedReply, summarise, toTranslate, translationOf, wordsIn, type Review } from './reviews'

const review = (p: Partial<Review>): Review => ({ id: p.id ?? 'r', source: 'google', rating: 5, text: null, reviewer: 'Lucía Pérez',
  created_at: '2026-09-10T10:00:00Z', reply: null, replied_at: null, language: 'es', url: null, photos: [], ...p })

describe('reviews', () => {
  it('reads Google’s stars, as words or numbers', () => {
    expect(starsOf('FIVE')).toBe(5)
    expect(starsOf('two')).toBe(2)
    expect(starsOf(4)).toBe(4)
    expect(starsOf('STAR_RATING_UNSPECIFIED')).toBeNull()
    expect(starsOf(6)).toBeNull()
  })

  it('keeps the reviewer’s own words, without Google’s translation, whichever way round Google sends them', () => {
    // The review first, then Google's translation.
    expect(originalWords('Lovely coffee\n\n(Translated by Google)\nCafé precioso')).toBe('Lovely coffee')
    // Google's translation first, then the review: the way Spanish reviews come to an English profile.
    expect(originalWords('(Translated by Google) The best coffee in San Pedro\n\n(Original)\nEl mejor café de San Pedro')).toBe('El mejor café de San Pedro')
    expect(originalWords('(Traducido por Google) El mejor café\n\n(Original)\nThe best coffee')).toBe('The best coffee')
    // Only a translation: better than nothing.
    expect(originalWords('(Translated by Google) Great coffee')).toBe('Great coffee')
    expect(originalWords('  Riquísimo  ')).toBe('Riquísimo')
    expect(originalWords('')).toBeNull()
    expect(originalWords(undefined)).toBeNull()
    expect(originalWords('(Translated by Google)\n\n(Original)\n')).toBeNull()
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

  it('filters: no reply yet, 1 to 3 stars, 4 and 5 stars, with photos', () => {
    const list = [review({ id: 'a', rating: 5, reply: 'x' }), review({ id: 'b', rating: 3, photos: [{ url: 'https://lh3.googleusercontent.com/p/1', thumb: null }] }),
      review({ id: 'c', rating: 1, reply: 'y' })]
    expect(filterReviews(list, 'unanswered').map(r => r.id)).toEqual(['b'])
    expect(filterReviews(list, 'photos').map(r => r.id)).toEqual(['b'])
    expect(filterReviews(list, 'low').map(r => r.id)).toEqual(['b', 'c'])
    expect(filterReviews(list, 'high').map(r => r.id)).toEqual(['a'])
    expect(filterReviews(list, 'all')).toHaveLength(3)
    expect(isLow({ rating: 3 })).toBe(true)
    expect(isLow({ rating: 4 })).toBe(false)
  })

  it('sorts: most recent, oldest, best or worst first (newest first among the same stars), leaving the list as it was', () => {
    const list = [
      review({ id: 'a', rating: 4, created_at: '2026-09-01T10:00:00Z' }), review({ id: 'b', rating: 1, created_at: '2026-09-20T10:00:00Z' }),
      review({ id: 'c', rating: 5, created_at: '2026-08-15T10:00:00Z' }), review({ id: 'd', rating: 4, created_at: '2026-09-10T10:00:00Z' }),
    ]
    const ids = (s: Parameters<typeof sortReviews>[1]) => sortReviews(list, s).map(r => r.id)
    expect(ids('newest')).toEqual(['b', 'd', 'a', 'c'])
    expect(ids('oldest')).toEqual(['c', 'a', 'd', 'b'])
    expect(ids('best')).toEqual(['c', 'd', 'a', 'b'])
    expect(ids('worst')).toEqual(['b', 'd', 'a', 'c'])
    expect(list.map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('suggests a reply in the review’s language: thanks for good ones, an apology and a way to talk for poor ones', () => {
    expect(suggestedReply({ rating: 5, reviewer: 'Lucía Pérez', language: 'es' }, 'Easy Beans Coffee')).toMatch(/^¡Hola, Lucía! Muchísimas gracias.*Easy Beans Coffee/)
    expect(suggestedReply({ rating: 5, reviewer: 'Tom', language: 'en' }, 'Easy Beans Coffee')).toMatch(/^Hi Tom, thank you so much/)
    expect(suggestedReply({ rating: 2, reviewer: 'Tom Hughes', language: 'en' }, 'Easy Beans', 'hola@example.com')).toMatch(/very sorry.*hola@example\.com/)
    expect(suggestedReply({ rating: 1, reviewer: '', language: 'es' }, 'Easy Beans')).toMatch(/^Hola\. Sentimos mucho/)
    expect(suggestedReply({ rating: 3, reviewer: 'Ana', language: 'es' }, 'Easy Beans')).toMatch(/otra oportunidad/)
  })
})

describe('reviews in the app’s language', () => {
  it('keeps Google’s translation of a review, whichever way round Google sends it', () => {
    expect(googleTranslation('Great coffee and lovely staff\n\n(Translated by Google)\nGran café y un personal encantador')).toBe('Gran café y un personal encantador')
    expect(googleTranslation('(Translated by Google) Very good coffee\n\n(Original)\nMuy buen café')).toBe('Very good coffee')
    expect(googleTranslation('(Traducido por Google) Muy buen café\n\n(Original)\nVery good coffee')).toBe('Muy buen café')
    expect(googleTranslation('Just the review')).toBeNull()
    expect(googleTranslation(null)).toBeNull()
  })

  it('keeps a translation by its language, only when it’s the other one', () => {
    expect(translationOf('en', 'El café está muy bueno y el personal es muy amable')).toEqual({ es: 'El café está muy bueno y el personal es muy amable' })
    expect(translationOf('en', 'The coffee was great')).toEqual({})
    expect(translationOf('es', null)).toEqual({})
  })

  it('shows a review in the language asked for when there’s a translation, its own words otherwise', () => {
    const r = { text: 'Riquísimo todo. Volveremos.', language: 'es' as const, translations: { en: 'Everything was delicious. We’ll be back.' } }
    expect(wordsIn(r, 'en')).toEqual({ text: 'Everything was delicious. We’ll be back.', translated: true })
    expect(wordsIn(r, 'es')).toEqual({ text: 'Riquísimo todo. Volveremos.', translated: false })
    expect(wordsIn({ ...r, translations: {} }, 'en')).toEqual({ text: 'Riquísimo todo. Volveremos.', translated: false })
    // Stars only: nothing to show in any language.
    expect(wordsIn({ text: null, language: 'en', translations: { es: 'x' } }, 'es')).toEqual({ text: null, translated: false })
  })

  it('translates only the reviews with words in the other language and no translation yet', () => {
    const list = [
      { id: 'a', text: 'Muy buen café', language: 'es' as const, translations: {} },
      { id: 'b', text: 'Great coffee', language: 'en' as const, translations: {} },
      { id: 'c', text: 'Riquísimo', language: 'es' as const, translations: { en: 'Delicious' } },
      { id: 'd', text: null, language: 'es' as const },
    ]
    expect(toTranslate(list, 'en').map(r => r.id)).toEqual(['a'])
    expect(toTranslate(list, 'es').map(r => r.id)).toEqual(['b'])
  })
})
