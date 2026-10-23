import { describe, expect, it } from 'vitest'
import { STARTER, aiPrompt, aiSeconds, audioName, beatCuts, clampStart, formatTime, namesArtist, occasionsIn, parseTime, renderKey, suggest, usesFor, type Rankable, type SuggestContext } from './music'

const track = (id: string, moods: string[], patch: Partial<Rankable> = {}): Rankable =>
  ({ id, title: id, duration_s: 40, moods, energy: 3, vocals: false, saved: false, source: 'starter', ...patch })
const ctx = (patch: Partial<SuggestContext> = {}): SuggestContext =>
  ({ kind: 'story', seconds: 15, caption: '', hour: null, sound: { moods: [], avoid: [] }, recent: [], ...patch })

describe('suggestions', () => {
  const library = [
    track('acoustic', ['acoustic', 'chill', 'cosy'], { energy: 2 }),
    track('latin', ['latin', 'summer', 'upbeat'], { energy: 4 }),
    track('rock', ['energetic', 'upbeat'], { energy: 5 }),
    track('lofi', ['lofi', 'cosy'], { energy: 1 }),
  ]

  it('follow the caption, in English and Spanish', () => {
    expect(suggest(library, ctx({ caption: 'Gran partido esta noche ⚽ ¡Vamos!' }))[0].track.id).toBe('rock')
    // A match on the terrace: the terrace's summer sound wins it.
    expect(suggest(library, ctx({ caption: 'Gran partido esta noche en la terraza ⚽' }))[0].track.id).toBe('latin')
    expect(suggest(library, ctx({ caption: 'Brunch is back this Sunday' }))[0].track.id).toBe('acoustic')
    expect(suggest(library, ctx({ caption: 'Llega el verano: granizados en la terraza' }))[0].track.id).toBe('latin')
    expect(suggest(library, ctx({ caption: 'Día de lluvia, chocolate caliente' }))[0].track.id).toBe('lofi')
    expect(occasionsIn('#christmas brunch').map(o => o.id)).toEqual(['morning', 'festive'])
  })

  it('follow the brand\'s sound, and never suggest a mood it avoids', () => {
    const s = suggest(library, ctx({ sound: { moods: ['latin'], avoid: ['energetic'] } }))
    expect(s[0]).toMatchObject({ track: { id: 'latin' }, reasons: expect.arrayContaining(['sound']) })
    expect(s.map(x => x.track.id)).not.toContain('rock')
  })

  it('calmer in the morning, livelier at night; what the business made or saved first; recent ones later', () => {
    expect(suggest(library, ctx({ hour: 9 })).at(-1)!.track.id).toBe('rock')
    expect(suggest([library[0], library[2]], ctx({ hour: 21 }))[0].track.id).toBe('rock')
    const own = track('own', ['jazz'], { source: 'ai', saved: true })
    expect(suggest([...library, own], ctx())[0]).toMatchObject({ track: { id: 'own' }, reasons: ['saved', 'own'] })
    expect(suggest([own, track('other', ['jazz'], { source: 'ai', saved: true })], ctx({ recent: ['own'] }))[0].track.id).toBe('other')
  })

  it('learn from what did well on Instagram', () => {
    const s = suggest([track('a', ['jazz']), track('b', ['jazz'])], ctx({ engagement: { b: 40, a: 5 } }))
    expect(s[0]).toMatchObject({ track: { id: 'b' }, reasons: ['worked'] })
  })

  it('prefer a track long enough for the clip', () => {
    expect(suggest([track('short', ['jazz'], { duration_s: 10 }), track('long', ['jazz'])], ctx({ seconds: 30 }))[0].track.id).toBe('long')
  })
})

describe('AI prompts', () => {
  it('say the moods, instruments, energy and the post in English, instrumental unless asked', () => {
    expect(aiPrompt({ moods: ['acoustic', 'chill', 'not-a-mood'], instruments: ['spanish_guitar', 'piano'], energy: 2, kind: 'story',
      business: 'a specialty café in Marbella', describe: 'coffee being poured on a sunny morning!' }))
      .toBe('Gentle, acoustic, relaxed, laid-back instrumental background music with Spanish guitar and piano for a social media story from a specialty café in Marbella. coffee being poured on a sunny morning. Around 86 bpm. No vocals.')
    expect(aiPrompt({ moods: [], instruments: [], energy: 9, kind: 'reel', vocals: true })).toBe('High-energy song. Around 126 bpm.')
    expect(aiPrompt({ moods: ['jazz'], instruments: [], energy: 3, kind: 'reel', describe: 'x'.repeat(900) })).toHaveLength(600)
  })

  it('refuse to copy an artist or a song', () => {
    expect(namesArtist('Something in the style of Rosalía')).toBe(true)
    expect(namesArtist('al estilo de Bad Bunny')).toBe(true)
    expect(namesArtist('Sounds like the Beatles')).toBe(true)
    expect(namesArtist('Warm acoustic morning')).toBe(false)
  })

  it('are a little longer than the clip, and a use covers a started minute', () => {
    expect(aiSeconds(15)).toBe(17)
    expect(aiSeconds(1)).toBe(3)
    expect(aiSeconds(900)).toBe(600)
    expect([usesFor(17), usesFor(60), usesFor(61), usesFor(125)]).toEqual([1, 1, 2, 3])
  })
})

describe('parts and times', () => {
  it('keep the part inside the track', () => {
    expect(clampStart(50, 40, 15)).toBe(25)
    expect(clampStart(-3, 40, 15)).toBe(0)
    expect(clampStart(12.345, 40, 15)).toBe(12.3)
    expect(clampStart(5, 10, 15)).toBe(0) // shorter than the clip: from the start, looped
  })

  it('read and write minutes and seconds', () => {
    expect([formatTime(45), formatTime(125.4), formatTime(0)]).toEqual(['0:45', '2:05', '0:00'])
    expect([parseTime('0:45'), parseTime('1:05'), parseTime('45'), parseTime(''), parseTime('1:75'), parseTime('abc')]).toEqual([45, 65, 45, 0, null, null])
  })

  it('cut photos on the beat, each on screen at least ~1.2 s', () => {
    expect(beatCuts(120, 3, 6)).toEqual([0, 2, 4])
    expect(beatCuts(120, 4, 6)).toEqual([0, 1.5, 3, 4.5])
    expect(beatCuts(null, 4, 10)).toEqual([0, 2.5, 5, 7.5])
    expect(beatCuts(180, 10, 8)).toEqual([0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4, 7.2]) // too many for the pace: even
    expect(beatCuts(100, 1, 5)).toEqual([0])
  })

  it('fingerprint the choices that make the file', () => {
    const c = { url: 'u', start: 1, seconds: 15, music_volume: 80, original_volume: 100, fade_in: true, fade_out: true, sources: ['a'] }
    expect(renderKey(c)).toBe(renderKey({ ...c }))
    expect(renderKey(c)).not.toBe(renderKey({ ...c, start: 1.5 }))
    expect(renderKey(c)).not.toBe(renderKey({ ...c, sources: ['b'] }))
  })

  it('name the reel\'s sound after the business', () => {
    expect(audioName(' Easy Beans ', 'Sunday Morning')).toBe('Easy Beans · Sunday Morning')
  })
})

it('the starter pack has unique keys and every track tagged', () => {
  expect(new Set(STARTER.map(s => s.key)).size).toBe(STARTER.length)
  for (const s of STARTER) expect(s.moods.length).toBeGreaterThan(0)
})
