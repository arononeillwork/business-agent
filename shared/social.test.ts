import { describe, expect, it } from 'vitest'
import { feedCrop, kindInfo, matchesMedia, mediaOf, monthWeeks, postProblem, shiftMonth } from './social'
import type { PostMedia } from './types'

const img = (n = 1): PostMedia[] => Array.from({ length: n }, (_, i) => ({ url: `https://x.test/${i}.jpg`, type: 'image' }))
const vid = (n = 1): PostMedia[] => Array.from({ length: n }, (_, i) => ({ url: `https://x.test/${i}.mp4`, type: 'video' }))
const post = (p: Partial<Parameters<typeof postProblem>[0]>) =>
  postProblem({ kind: 'post', caption: '', media: [], targets: ['instagram'], auto: true, status: 'scheduled', ...p })

describe('What each kind of post holds, and where it goes', () => {
  it('a post is one photo; videos are reels; more photos are a carousel', () => {
    expect(post({ media: img() })).toBeNull()
    expect(post({ media: vid() })).toBe('Videos go out as reels: choose Reel')
    expect(post({ media: img(2) })).toBe('A post has one photo. Choose Carousel for more')
  })
  it('a carousel is 2 to 10 photos or videos, mixed', () => {
    expect(post({ kind: 'carousel', media: [...img(1), ...vid(1)] })).toBeNull()
    expect(post({ kind: 'carousel', media: img(1) })).toBe('A carousel needs at least 2 photos or videos')
    expect(post({ kind: 'carousel', media: img(11) })).toBe('A post can have up to 10 photos or videos')
  })
  it('a reel is one video; a story one photo or video', () => {
    expect(post({ kind: 'reel', media: vid() })).toBeNull()
    expect(post({ kind: 'reel', media: img() })).toBe('A reel is one video')
    expect(post({ kind: 'reel' })).toBe('Add the reel’s video')
    expect(post({ kind: 'story', media: vid() })).toBeNull()
    expect(post({ kind: 'story' })).toBe('Add the story’s photo or video')
  })
  it('carousels, reels and stories go to Instagram only (for now); posts anywhere', () => {
    expect(post({ kind: 'story', media: img(), targets: ['instagram', 'facebook'] })).toBe('Stories go to Instagram only for now')
    expect(post({ media: img(), targets: ['instagram', 'facebook', 'google'], caption: 'Hi' })).toBeNull()
    expect(kindInfo('carousel').folder).toBe('Carousels')
  })
  it('a reminder needs no photo (you post it yourself); posting by itself does', () => {
    expect(post({ caption: 'Feria!' })).toBe('Instagram and TikTok posts need a photo')
    expect(post({ caption: 'Feria!', auto: false })).toBeNull()
    expect(post({ kind: 'story', caption: 'poll sticker', auto: false })).toBeNull()
    expect(post({ kind: 'story', auto: false })).toBe('Add the photo or video for the story')
    expect(post({ caption: '', targets: ['facebook'] })).toBe('Write a caption or add a photo')
  })
  it('drafts can be unfinished; the network rules still apply', () => {
    expect(post({ status: 'draft', kind: 'reel' })).toBeNull()
    expect(post({ status: 'draft', kind: 'reel', targets: ['tiktok'] })).toBe('Reels go to Instagram only for now')
  })
  it('TikTok takes JPEG photos; Google Maps 1500 characters', () => {
    expect(post({ media: [{ url: 'https://x.test/a.png', type: 'image' }], targets: ['tiktok'] })).toBe('TikTok only takes JPEG photos')
    expect(post({ caption: 'x'.repeat(1501), targets: ['google'] })).toBe('Google Maps posts are limited to 1500 characters')
  })
})

describe('Planner views', () => {
  it('photos, videos or both', () => {
    expect(mediaOf({ media: [] })).toBe('none')
    expect(mediaOf({ media: [...img(), ...vid()] })).toBe('mixed')
    expect(matchesMedia({ media: vid() }, 'video')).toBe(true)
    expect(matchesMedia({ media: img() }, 'video')).toBe(false)
    expect(matchesMedia({ media: [...img(), ...vid()] }, 'image')).toBe(true)
    expect(matchesMedia({ media: [] }, 'all')).toBe(true)
  })
  it('a month as weeks from Monday, with the days around it', () => {
    const weeks = monthWeeks('2026-10')
    expect(weeks[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks.at(-1)![6]).toBe('2026-11-01')
    expect(weeks).toHaveLength(5)
    expect(monthWeeks('2026-02')).toHaveLength(4 + 1) // Feb 2026 starts on a Sunday
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it('feed photos are cropped to between 4:5 and 1.91:1', () => {
    expect(feedCrop(1000, 2000)).toEqual({ width: 1000, height: 1250 })
    expect(feedCrop(3000, 1000)).toEqual({ width: 1910, height: 1000 })
    expect(feedCrop(1080, 1080)).toEqual({ width: 1080, height: 1080 })
  })
})
