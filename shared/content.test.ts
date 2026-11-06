import { describe, expect, it } from 'vitest'
import {
  NO_FILTER, albumCover, albumNameProblem, allTags, autoclose, cleanTags, contentProblem, downloadNames, extensionOf, filterContent, postFor, postable,
  titleFromFilename, type ContentAlbum, type ContentItem,
} from './content'
import { CONNECTION_FEATURE } from './plans'
import { GROUPS, groupOf, optionName } from './connections'

const item = (id: string, over: Partial<ContentItem> = {}): ContentItem => ({
  id, kind: 'photo', url: `https://app.test/media/g/1/${id}/sig.jpg`, title: null, source: 'upload', source_id: null, width: 1440, height: 1080,
  taken_at: null, tags: [], favourite: false, added_by: null, created_at: '2026-11-01T10:00:00.000Z', ...over,
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

describe('favourites and albums', () => {
  const items = [item('a', { favourite: true }), item('b'), item('c', { kind: 'video', url: 'https://app.test/media/c.mp4' }), item('d', { favourite: true })]
  const albums: ContentAlbum[] = [{ id: 'al-1', name: 'Terrace', created_at: '2026-11-01T10:00:00Z', item_ids: ['c', 'b', 'gone'] }]

  it('filter to the starred ones, or to an album’s', () => {
    expect(filterContent(items, { ...NO_FILTER, favourites: true }).map(i => i.id).sort()).toEqual(['a', 'd'])
    expect(filterContent(items, { ...NO_FILTER, album: 'al-1' }, albums).map(i => i.id).sort()).toEqual(['b', 'c'])
    expect(filterContent(items, { ...NO_FILTER, album: 'al-1', favourites: true }, albums)).toEqual([])
    // An album that isn't there shows nothing rather than everything.
    expect(filterContent(items, { ...NO_FILTER, album: 'nope' }, albums)).toEqual([])
  })

  it('an album’s picture is its first photo still on the page, else its first video', () => {
    expect(albumCover(albums[0], items)?.id).toBe('b')
    expect(albumCover({ item_ids: ['c'] }, items)?.id).toBe('c')
    expect(albumCover({ item_ids: ['gone'] }, items)).toBeNull()
  })

  it('album names: one, up to 60 characters, each once whatever the capitals', () => {
    expect(albumNameProblem('Latte art', albums)).toBeNull()
    expect(albumNameProblem(' ', albums)).toBe('Give the album a name')
    expect(albumNameProblem('x'.repeat(61), albums)).toBe('Keep the name to 60 characters')
    expect(albumNameProblem(' terrace ', albums)).toBe('There’s an album with that name already')
    expect(albumNameProblem('TERRACE', albums, 'al-1')).toBeNull()
  })
})

describe('downloadNames', () => {
  it('names each by its title and file type, each once', () => {
    expect(downloadNames([
      { title: 'Terrace', kind: 'photo', url: 'https://app.test/media/x.jpg' },
      { title: 'Terrace', kind: 'photo', url: 'https://app.test/media/y.jpg' },
      { title: null, kind: 'video', url: 'https://app.test/media/z.mp4' },
      { title: 'a/b: c?', kind: 'photo', url: 'data:image/svg+xml,…#flat-white.jpg' },
    ])).toEqual(['Terrace.jpg', 'Terrace (2).jpg', 'video.mp4', 'a-b- c-.jpg'])
  })
})
