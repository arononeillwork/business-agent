import { describe, expect, it } from 'vitest'
import { coverOf, highlightNameProblem, storyState, storyTimes, tidyHighlightName, toAdd, type HighlightStory } from './highlights'

describe('storyState', () => {
  it('follows its post on the Social planner, as the database does', () => {
    expect(storyState({ status: 'scheduled', results: {} }, null)).toBe('waiting')
    expect(storyState({ status: 'publishing', results: { instagram: { status: 'queued' } } }, null)).toBe('waiting')
    expect(storyState({ status: 'due', results: {} }, null)).toBe('due')
    expect(storyState({ status: 'published', results: { instagram: { status: 'published', id: 'm1' } } }, null)).toBe('up')
    // A reminder marked posted, as the app marks it.
    expect(storyState({ status: 'published', results: {} }, null)).toBe('up')
    expect(storyState({ status: 'failed', results: { instagram: { status: 'failed', error: 'No' } } }, null)).toBe('failed')
    expect(storyState({ status: 'partly', results: { instagram: { status: 'failed' }, facebook: { status: 'published' } } }, null)).toBe('failed')
  })

  it('is added once marked so', () => {
    expect(storyState({ status: 'published', results: { instagram: { status: 'published' } } }, '2026-11-06T10:00:00Z')).toBe('added')
  })
})

describe('toAdd', () => {
  it('counts the stories that are up and not added yet', () => {
    const s = (state: HighlightStory['state']) => ({ state }) as HighlightStory
    expect(toAdd({ stories: [s('up'), s('added'), s('waiting'), s('up'), s('failed'), s('due')] })).toBe(2)
    expect(toAdd({ stories: [] })).toBe(0)
  })
})

describe('highlight names', () => {
  const others = [{ id: 'h1', name: 'Reviews ⭐' }, { id: 'h2', name: 'Doggos' }]

  it('are tidied', () => {
    expect(tidyHighlightName('  New   menu ')).toBe('New menu')
  })

  it('need a name of up to 30 characters, each once whatever the capitals', () => {
    expect(highlightNameProblem('Menu', others)).toBeNull()
    expect(highlightNameProblem('  ', others)).toBe('Give the highlight a name')
    expect(highlightNameProblem('x'.repeat(31), others)).toBe('Keep the name to 30 characters')
    // An emoji counts as one, as in the database.
    expect(highlightNameProblem('⭐'.repeat(30), others)).toBeNull()
    expect(highlightNameProblem(' doggos ', others)).toBe('There’s a highlight with that name already')
    // Its own name is fine (renaming it).
    expect(highlightNameProblem('DOGGOS', others, 'h2')).toBeNull()
  })
})

describe('storyTimes', () => {
  it('puts several a second apart, in order', () => {
    expect(storyTimes('2026-11-06T10:00:00.000Z', 3)).toEqual(['2026-11-06T10:00:00.000Z', '2026-11-06T10:00:01.000Z', '2026-11-06T10:00:02.000Z'])
  })
})

describe('coverOf', () => {
  it('is the first photo', () => {
    expect(coverOf([{ url: 'https://x/a.mp4', type: 'video' }, { url: 'https://x/b.jpg', type: 'image' }])).toBe('https://x/b.jpg')
    expect(coverOf([{ url: 'https://x/a.mp4', type: 'video' }])).toBeNull()
  })
})
