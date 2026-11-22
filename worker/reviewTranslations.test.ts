import { describe, expect, it, vi } from 'vitest'
import { translateReviews, TRANSLATE_AT_ONCE, type Claude } from './reviewTranslations'

/** A stand-in for Claude that answers with this text (or a refusal). */
const claudeSaying = (text: string, stop_reason = 'end_turn') => {
  const create = vi.fn(async () => ({ stop_reason, content: [{ type: 'text', text }] }))
  return { claude: { create } as unknown as Claude, create }
}

describe('translating reviews', () => {
  const reviews = [{ id: 'r1', text: 'Muy buen café' }, { id: 'r2', text: 'Riquísimo todo. Volveremos.' }, { id: 'r3', text: null }]

  it('asks once, for the reviews with words, and keeps each translation by its review', async () => {
    const { claude, create } = claudeSaying(JSON.stringify({ translations: [
      { id: 'r1', text: 'Very good coffee' }, { id: 'r2', text: ' Everything was delicious. We’ll be back. ' }, { id: 'someone-else', text: 'x' },
    ] }))
    const done = await translateReviews(claude, reviews, 'en')
    expect([...done]).toEqual([['r1', 'Very good coffee'], ['r2', 'Everything was delicious. We’ll be back.']])
    expect(create).toHaveBeenCalledOnce()
    const asked = (create.mock.calls[0] as unknown[])[0] as { model: string; system: string; messages: { content: string }[]; output_config: { format: { type: string } } }
    expect(asked.model).toBe('claude-opus-5-5')
    expect(asked.system).toContain('into English')
    expect(asked.output_config.format.type).toBe('json_schema')
    expect(JSON.parse(asked.messages[0].content)).toEqual([{ id: 'r1', text: 'Muy buen café' }, { id: 'r2', text: 'Riquísimo todo. Volveremos.' }])
  })

  it('gets nothing from a refusal or an answer it can’t read, and asks nothing without words', async () => {
    expect((await translateReviews(claudeSaying('', 'refusal').claude, reviews, 'es')).size).toBe(0)
    expect((await translateReviews(claudeSaying('not json').claude, reviews, 'es')).size).toBe(0)
    const { claude, create } = claudeSaying('{}')
    expect((await translateReviews(claude, [{ id: 'r3', text: null }], 'es')).size).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('asks for at most TRANSLATE_AT_ONCE at a time', async () => {
    const many = Array.from({ length: TRANSLATE_AT_ONCE + 5 }, (_, i) => ({ id: `r${i}`, text: `Reseña ${i}` }))
    const { claude, create } = claudeSaying(JSON.stringify({ translations: [] }))
    await translateReviews(claude, many, 'en')
    expect(JSON.parse(((create.mock.calls[0] as unknown[])[0] as { messages: { content: string }[] }).messages[0].content)).toHaveLength(TRANSLATE_AT_ONCE)
  })
})
