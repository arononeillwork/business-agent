import { describe, expect, it } from 'vitest'
import { MAX_SLIDES, type Slide } from './screens'
import { addToSlideshow, firstOnly, fromPost, moveInSlideshow, onNow, postSlide, postTitle, sameAs, setInSlideshow, show, showOnly } from './singleDisplay'

const slide = (p: Partial<Slide>): Slide => ({ id: 's', kind: 'image', url: 'https://x.es/a.jpg', design_id: null, title: null, seconds: null, live: false, active: false, ...p })
const POST = 'https://www.instagram.com/p/C9xYz12AbcD/'

describe('a single display', () => {
  const list = [
    slide({ id: 'a', active: true }),
    slide({ id: 'b', kind: 'menu', url: null, design_id: 'd-tv' }),
    slide({ id: 'c', kind: 'instagram', url: POST, post: POST }),
  ]

  it('shows one at a time: switching one on switches the rest off, and keeps them in the list', () => {
    expect(showOnly(list, 'c').map(s => [s.id, s.active])).toEqual([['a', false], ['b', false], ['c', true]])
    expect(onNow(showOnly(list, 'b')).map(s => s.id)).toEqual(['b'])
  })

  it('puts something new first, on its own; something it has shown before goes back on where it is', () => {
    const added = show(list, slide({ id: 'n', url: 'https://x.es/new.jpg' }))
    expect(added.map(s => [s.id, s.active])).toEqual([['n', true], ['a', false], ['b', false], ['c', false]])
    // The same menu, the same post, the same address: the one in the list.
    expect(show(list, slide({ id: 'x', kind: 'menu', url: null, design_id: 'd-tv' })).map(s => [s.id, s.active])).toEqual([['a', false], ['b', true], ['c', false]])
    expect(show(list, slide({ id: 'y', kind: 'image', url: 'https://cdn.x.es/kept.jpg', post: POST })).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(onNow(show(list, slide({ id: 'z', url: 'https://x.es/a.jpg' }))).map(s => s.id)).toEqual(['a'])
    expect(sameAs(list, { kind: 'video', url: 'https://x.es/a.jpg', design_id: null })).toBeUndefined()
  })

  it('makes room in a full list by letting the oldest go', () => {
    const full = Array.from({ length: MAX_SLIDES }, (_, i) => slide({ id: `s${i}`, url: `https://x.es/${i}.jpg` }))
    const added = show(full, slide({ id: 'new', url: 'https://x.es/new.jpg' }))
    expect(added).toHaveLength(MAX_SLIDES)
    expect(added[0].id).toBe('new')
    expect(added.at(-1)!.id).toBe(`s${MAX_SLIDES - 2}`)
  })

  it('names a post by its caption’s first line, without its hashtags', () => {
    expect(postTitle('Banana bread fresh from the oven 🍌 #bakery\nToday only!')).toBe('Banana bread fresh from the oven 🍌')
    expect(postTitle('#easybeans #latte\n\nMeet the team')).toBe('Meet the team')
    expect(postTitle('x'.repeat(100))).toHaveLength(80)
    expect(postTitle(null)).toBeNull()
    expect(postTitle(' #only #tags ')).toBeNull()
  })

  it('shows a post’s photo once it’s kept; else the post itself on Instagram, which also plays a reel', () => {
    const p = { caption: 'Sunny terrace', image_url: 'https://scontent.cdninstagram.com/x.jpg', permalink: POST }
    expect(postSlide(p, 'https://drive.example/kept.jpg', 'k')).toEqual(
      { id: 'k', kind: 'image', url: 'https://drive.example/kept.jpg', design_id: null, title: 'Sunny terrace', seconds: null, live: false, active: true, post: POST })
    expect(postSlide(p, null, 'k')).toMatchObject({ kind: 'instagram', url: POST, post: POST })
    expect(postSlide({ ...p, video: true }, 'https://drive.example/cover.jpg', 'k')).toMatchObject({ kind: 'instagram', url: POST })
    // A Facebook post with nowhere to keep its photo: the photo at its own address; a Facebook video: nothing to show.
    const fb = { caption: null, image_url: 'https://scontent.xx.fbcdn.net/y.jpg', permalink: 'https://www.facebook.com/easybeans/posts/1' }
    expect(postSlide(fb, null, 'k')).toMatchObject({ kind: 'image', url: fb.image_url, post: fb.permalink })
    expect(postSlide({ ...fb, video: true }, null, 'k')).toBeNull()
  })

  it('finds the one made from a post', () => {
    expect(fromPost(list, { permalink: POST })?.id).toBe('c')
    expect(fromPost(list, { permalink: null })).toBeUndefined()
  })
})

describe('a screen’s slideshow', () => {
  const ids = (slides: Slide[]) => slides.map(s => `${s.id}${s.active ? '+' : ''}`)
  // a and c take turns; b waits between them, as a single display may have left it.
  const list = [
    slide({ id: 'a', active: true }),
    slide({ id: 'b', kind: 'menu', url: null, design_id: 'd-tv' }),
    slide({ id: 'c', kind: 'instagram', url: POST, post: POST, active: true }),
  ]

  it('adds something new last to take its turn, and keeps the others on', () => {
    expect(ids(addToSlideshow(list, slide({ id: 'n', url: 'https://x.es/new.jpg' })))).toEqual(['a+', 'c+', 'n+', 'b'])
    // Something it has shown before: that one back in, not a second one.
    expect(ids(addToSlideshow(list, slide({ id: 'x', kind: 'menu', url: null, design_id: 'd-tv' })))).toEqual(['a+', 'c+', 'b+'])
    expect(ids(addToSlideshow(list, slide({ id: 'y', url: 'https://cdn.x.es/kept.jpg', post: POST })))).toEqual(['a+', 'c+', 'b'])
  })

  it('takes one out to the top of the rest, and puts one back in at the end', () => {
    expect(ids(setInSlideshow(list, 'a', false))).toEqual(['c+', 'a', 'b'])
    expect(ids(setInSlideshow(list, 'b', true))).toEqual(['a+', 'c+', 'b+'])
    expect(setInSlideshow(list, 'gone', true)).toBe(list)
  })

  it('moves one a turn earlier or later, only among those taking turns', () => {
    expect(ids(moveInSlideshow(list, 'c', -1))).toEqual(['c+', 'a+', 'b'])
    expect(ids(moveInSlideshow(list, 'a', 1))).toEqual(['c+', 'a+', 'b'])
    expect(moveInSlideshow(list, 'a', -1)).toBe(list)
    expect(moveInSlideshow(list, 'b', 1)).toBe(list)
  })

  it('goes back to one thing at a time with the first on, the rest kept in the list', () => {
    expect(ids(firstOnly(list))).toEqual(['a+', 'b', 'c'])
    const off = list.map(s => ({ ...s, active: false }))
    expect(firstOnly(off)).toBe(off)
  })

  it('makes room in a full list by letting the oldest that’s off go, never one taking its turn', () => {
    const full = Array.from({ length: MAX_SLIDES }, (_, i) => slide({ id: `s${i}`, url: `https://x.es/${i}.jpg`, active: i < 2 }))
    const added = addToSlideshow(full, slide({ id: 'new', url: 'https://x.es/new.jpg' }))
    expect(added).toHaveLength(MAX_SLIDES)
    expect(ids(added).slice(0, 4)).toEqual(['s0+', 's1+', 'new+', 's2'])
    expect(added.at(-1)!.id).toBe(`s${MAX_SLIDES - 2}`)
    // All taking turns: nothing goes, and the list is one too many (the save says so).
    const allOn = full.map(s => ({ ...s, active: true }))
    expect(addToSlideshow(allOn, slide({ id: 'new', url: 'https://x.es/new.jpg' }))).toHaveLength(MAX_SLIDES + 1)
  })
})
