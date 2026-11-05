import { describe, expect, it } from 'vitest'
import { NO_FILTER, allTags, autoclose, cleanTags, contentProblem, extensionOf, filterContent, postFor, postable, titleFromFilename, type ContentItem } from './content'
import { CONNECTION_FEATURE } from './plans'
import { GROUPS, groupOf, optionName } from './connections'

const item = (id: string, over: Partial<ContentItem> = {}): ContentItem => ({
  id, kind: 'photo', url: `https://app.test/media/g/1/${id}/sig.jpg`, title: null, source: 'upload', source_id: null, width: 1440, height: 1080,
  taken_at: null, tags: [], added_by: null, created_at: '2026-11-01T10:00:00.000Z', ...over,
})

describe('tags', () => {
  it('are trimmed, lower case and each once, in the order typed', () => {
    expect(cleanTags('Terrace, latte  art,  terrace, , #Summer')).toEqual(['terrace', 'latte art', 'summer'])
    expect(cleanTags(['  Coffee ', 'coffee', 'Team'])).toEqual(['coffee', 'team'])
  })

  it('and the title have limits, as the database has', () => {
    expect(contentProblem({ title: 'Flat white', tags: ['coffee'] })).toBeNull()
    expect(contentProblem({ title: 'x'.repeat(201), tags: [] })).toMatch(/200/)
    expect(contentProblem({ title: null, tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })).toMatch(/12/)
    expect(contentProblem({ title: null, tags: ['y'.repeat(31)] })).toMatch(/30/)
  })
})

describe('a title from the file name', () => {
  it('drops the file type and reads dashes as spaces', () => {
    expect(titleFromFilename('IMG_2041.HEIC')).toBe('IMG_2041')
    expect(titleFromFilename('terrace-sunset.jpg')).toBe('terrace sunset')
    expect(titleFromFilename('')).toBeNull()
    expect(titleFromFilename(undefined)).toBeNull()
  })
})

describe('the page’s filters', () => {
  const items = [
    item('a', { title: 'Iced oat latte', tags: ['drinks', 'summer'], created_at: '2026-11-03T10:00:00.000Z' }),
    item('b', { kind: 'video', url: 'https://app.test/media/b.mp4', title: 'Pour over', source: 'google_photos', source_id: 'gp-b', taken_at: '2026-10-01T09:00:00.000Z' }),
    item('c', { title: 'Terrace', tags: ['terrace', 'summer'], source: 'google_photos', source_id: 'gp-c', taken_at: '2026-11-04T08:00:00.000Z' }),
  ]

  it('shows the newest first, by when it was taken, else when it was added', () => {
    expect(filterContent(items, NO_FILTER).map(i => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('narrows to photos or videos, where they came from, a tag and words in the title or tags', () => {
    expect(filterContent(items, { ...NO_FILTER, kind: 'video' }).map(i => i.id)).toEqual(['b'])
    expect(filterContent(items, { ...NO_FILTER, source: 'google_photos' }).map(i => i.id)).toEqual(['c', 'b'])
    expect(filterContent(items, { ...NO_FILTER, tag: 'summer' }).map(i => i.id)).toEqual(['c', 'a'])
    expect(filterContent(items, { ...NO_FILTER, search: 'OAT drinks' }).map(i => i.id)).toEqual(['a'])
    expect(filterContent(items, { ...NO_FILTER, search: 'nothing like it' })).toEqual([])
  })

  it('lists the tags in use, the most used first', () => {
    expect(allTags(items)).toEqual([{ tag: 'summer', count: 2 }, { tag: 'drinks', count: 1 }, { tag: 'terrace', count: 1 }])
  })
})

describe('making a post', () => {
  it('takes JPEG photos and MP4 or MOV videos only', () => {
    expect(extensionOf('https://x.test/media/g/1/abc/sig.jpg')).toBe('jpg')
    expect(extensionOf('data:image/svg+xml,%3Csvg%3E#terrace.jpg')).toBe('jpg')
    expect(postable(item('a'))).toBe(true)
    expect(postable(item('p', { url: 'https://x.test/media/p.png' }))).toBe(false)
    expect(postable(item('v', { kind: 'video', url: 'https://x.test/media/v.mov' }))).toBe(true)
  })

  it('is a post for one photo, a reel for one video and a carousel for two to ten', () => {
    expect(postFor([item('a')])).toEqual({ kind: 'post', media: [{ url: item('a').url, type: 'image' }] })
    expect(postFor([item('v', { kind: 'video', url: 'https://x.test/v.mp4' })])?.kind).toBe('reel')
    expect(postFor([item('a'), item('v', { kind: 'video', url: 'https://x.test/v.mp4' })])?.kind).toBe('carousel')
    expect(postFor(Array.from({ length: 11 }, (_, i) => item(`i${i}`)))).toBeNull()
    expect(postFor([item('p', { url: 'https://x.test/media/p.webp' })])).toBeNull()
  })
})

describe('Google Photos as a connection', () => {
  it('is in its own group that takes any number, and needs the apps part of the plan like Google Drive', () => {
    const photos = GROUPS.find(g => g.key === 'photos')!
    expect(photos.options.map(o => o.id)).toEqual(['google_photos'])
    expect(photos.pickOne).toBe(false)
    expect(groupOf('google_photos')).toBeNull()
    expect(optionName('google_photos')).toBe('Google Photos')
    expect(CONNECTION_FEATURE.google_photos).toBe(CONNECTION_FEATURE.google_drive)
  })

  it('opens Google’s picker so that it closes itself once the admin is done', () => {
    expect(autoclose('https://photos.google.com/picker/abc')).toBe('https://photos.google.com/picker/abc/autoclose')
    expect(autoclose('https://photos.google.com/picker/abc/')).toBe('https://photos.google.com/picker/abc/autoclose')
  })
})
