import { describe, expect, it } from 'vitest'
import {
  cleanUrl, instagramCode, isOnline, kindOf, loopSeconds, musicEmbedUrl, musicKind, newScreen, playOrder, playUrl, screenProblem, slideProblem, slideSeconds, vimeoId, youtubeId,
  youtubeList, type Slide,
  HOME_BUSINESS, isShortLink, linkName, offersSlide, parseShortLink, playedSlides, shortLinkPath, withOfferPictures, type OfferPicture,
} from './screens'

const slide = (p: Partial<Slide>): Slide => ({ id: 's', kind: 'image', url: 'https://x.es/a.jpg', design_id: null, title: null, seconds: null, live: false, active: true, ...p })

describe('screens', () => {
  it('finds YouTube, Vimeo and Instagram ids in their usual addresses', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/abcdEFG1234')).toBe('abcdEFG1234')
    expect(youtubeId('https://www.youtube.com/live/abcdEFG1234?si=x')).toBe('abcdEFG1234')
    expect(youtubeList('https://www.youtube.com/playlist?list=PL123')).toBe('PL123')
    expect(youtubeId('https://example.com/watch?v=x')).toBeNull()
    expect(vimeoId('https://vimeo.com/76979871')).toBe('76979871')
    expect(instagramCode('https://www.instagram.com/p/C9xYz12AbcD/')).toBe('C9xYz12AbcD')
    expect(instagramCode('https://www.instagram.com/easy.beans.coffee/reel/C9xYz12AbcD/')).toBe('C9xYz12AbcD')
    expect(instagramCode('https://www.instagram.com/easy.beans.coffee/')).toBeNull()
  })

  it('tells what an address is from its look', () => {
    expect(kindOf('https://cdn.x.es/latte.JPG')).toBe('image')
    expect(kindOf('https://cdn.x.es/promo.mp4?token=1')).toBe('video')
    expect(kindOf('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(kindOf('https://vimeo.com/76979871')).toBe('vimeo')
    expect(kindOf('https://www.instagram.com/p/C9xYz12AbcD/')).toBe('instagram')
    expect(kindOf('https://www.easybeanscoffee.com/menu')).toBe('web')
  })

  it('tidies typed addresses', () => {
    expect(cleanUrl(' www.x.es/menu ')).toBe('https://www.x.es/menu')
    expect(cleanUrl('http://x.es')).toBe('http://x.es')
    expect(cleanUrl('  ')).toBeNull()
  })

  it('plays YouTube and Vimeo muted and looping unless videos have sound; live slides load fresh each time', () => {
    expect(playUrl(slide({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=dQw4w9WgXcQ')
    expect(playUrl(slide({ kind: 'youtube', url: 'https://www.youtube.com/playlist?list=PL1' }), { sound: true }))
      .toBe('https://www.youtube-nocookie.com/embed/videoseries?list=PL1&autoplay=1&mute=0&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1')
    expect(playUrl(slide({ kind: 'vimeo', url: 'https://vimeo.com/76979871' }))).toBe('https://player.vimeo.com/video/76979871?autoplay=1&muted=1&loop=1&background=1')
    expect(playUrl(slide({ kind: 'instagram', url: 'https://www.instagram.com/p/C9xYz12AbcD/' }))).toBe('https://www.instagram.com/p/C9xYz12AbcD/embed')
    expect(playUrl(slide({ url: 'https://cam.x.es/now.jpg', live: true }), { now: 42 })).toBe('https://cam.x.es/now.jpg?t=42')
    expect(playUrl(slide({ kind: 'web', url: 'https://x.es/?a=1', live: true }), { now: 42 })).toBe('https://x.es/?a=1&t=42')
    expect(playUrl(slide({ url: 'https://x.es/a.jpg' }))).toBe('https://x.es/a.jpg')
  })

  it('shows a slide for its own seconds or the screen’s; a video without its own plays to its end', () => {
    expect(slideSeconds(slide({ seconds: 20 }), { seconds: 10 })).toBe(20)
    expect(slideSeconds(slide({}), { seconds: 10 })).toBe(10)
    expect(slideSeconds(slide({ kind: 'video' }), { seconds: 10 })).toBeNull()
    expect(loopSeconds({ seconds: 10, slides: [slide({}), slide({ seconds: 30 }), slide({ kind: 'video' }), slide({ active: false })] })).toBe(50)
  })

  it('plays the switched-on slides, shuffled when asked', () => {
    const slides = [slide({ id: 'a' }), slide({ id: 'b', active: false }), slide({ id: 'c' }), slide({ id: 'd' })]
    expect(playOrder(slides, false).map(s => s.id)).toEqual(['a', 'c', 'd'])
    const shuffled = playOrder(slides, true, () => 0)
    expect(shuffled.map(s => s.id).sort()).toEqual(['a', 'c', 'd'])
    expect(shuffled.map(s => s.id)).not.toEqual(['a', 'c', 'd'])
  })

  it('checks slides and settings before saving', () => {
    expect(slideProblem(slide({ url: null }))).toMatch(/address/)
    expect(slideProblem(slide({ url: 'http://x.es/a.jpg' }))).toMatch(/https/)
    expect(slideProblem(slide({ url: 'data:image/svg+xml,<svg/>' }))).toBeNull() // the demo's drawings; the database says https only
    expect(slideProblem(slide({ kind: 'web', url: 'data:image/svg+xml,<svg/>' }))).toMatch(/https/)
    expect(slideProblem(slide({ seconds: 1 }))).toMatch(/3 seconds/)
    expect(slideProblem(slide({ kind: 'menu', url: null }))).toMatch(/menu/)
    expect(slideProblem(slide({ kind: 'menu', url: null, design_id: 'd1' }))).toBeNull()
    const s = newScreen('Counter TV')
    expect(screenProblem(s)).toBeNull()
    expect(screenProblem({ ...s, name: '' })).toMatch(/name/)
    expect(screenProblem({ ...s, music_url: 'http://radio.x/stream' })).toMatch(/music/)
    expect(screenProblem({ ...s, slides: [slide({ url: 'nope' })] })).toMatch(/https/)
  })

  it('is on when it asked for its slides in the last 3 minutes', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    expect(isOnline('2026-10-23T11:58:30Z', now)).toBe(true)
    expect(isOnline('2026-10-23T11:56:00Z', now)).toBe(false)
    expect(isOnline(null, now)).toBe(false)
  })

  it('plays YouTube music in a hidden player, anything else as audio', () => {
    expect(musicKind('https://www.youtube.com/watch?v=jfKfPfyJRdk')).toBe('youtube')
    expect(musicKind('https://stream.radio.es/live.mp3')).toBe('audio')
    expect(musicEmbedUrl('https://youtu.be/jfKfPfyJRdk')).toBe('https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&loop=1&controls=0&playsinline=1&playlist=jfKfPfyJRdk')
    expect(musicEmbedUrl('https://www.youtube.com/playlist?list=PL9')).toBe('https://www.youtube-nocookie.com/embed/videoseries?list=PL9&autoplay=1&loop=1&controls=0&playsinline=1')
    expect(musicEmbedUrl('https://stream.radio.es/live.mp3')).toBeNull()
  })
})

describe('short links', () => {
  it('makes a link name from a screen’s name, as the database does', () => {
    expect(linkName('Café TV')).toBe('cafe-tv')
    expect(linkName('  Counter TV!! ')).toBe('counter-tv')
    expect(linkName('Menú del día · Barra')).toBe('menu-del-dia-barra')
    expect(linkName('2x1 window')).toBe('screen-2x1-window')
    expect(linkName('€€')).toBe('')
    expect(linkName('a'.repeat(60))).toHaveLength(40)
  })

  it('needs no business number for Easy Beans, and its first screen opens at the bare /display-menu', () => {
    const tv = { slug: 'cafe-tv', kind: 'screen' as const }
    expect(shortLinkPath(tv, HOME_BUSINESS)).toBe('/display-menu/cafe-tv')
    expect(shortLinkPath(tv, HOME_BUSINESS, true)).toBe('/display-menu')
    expect(shortLinkPath(tv, 2)).toBe('/display-menu/2/cafe-tv')
    expect(shortLinkPath(tv, 2, true)).toBe('/display-menu/2')
    expect(shortLinkPath({ slug: 'window', kind: 'slideshow' }, HOME_BUSINESS, true)).toBe('/slideshow/window')
    expect(shortLinkPath({ slug: 'window', kind: 'slideshow' }, 7)).toBe('/slideshow/7/window')
  })

  it('reads a short link back: the business, the link name, and which kind without one', () => {
    expect(parseShortLink('/display-menu')).toEqual({ business: 1, name: null, kind: 'screen' })
    expect(parseShortLink('/display-menu/')).toEqual({ business: 1, name: null, kind: 'screen' })
    expect(parseShortLink('/display-menu/cafe-tv')).toEqual({ business: 1, name: 'cafe-tv', kind: 'screen' })
    expect(parseShortLink('/display-menu/2/bar-tv')).toEqual({ business: 2, name: 'bar-tv', kind: 'screen' })
    expect(parseShortLink('/display-menu/2')).toEqual({ business: 2, name: null, kind: 'screen' })
    expect(parseShortLink('/slideshow/window')).toEqual({ business: 1, name: 'window', kind: 'slideshow' })
    expect(parseShortLink('/slideshow')).toEqual({ business: 1, name: null, kind: 'slideshow' })
    for (const bad of ['/display-menu/0/tv', '/display-menu/2tv', '/display-menu/Cafe', '/display-menu/a/b', '/display-menus', '/display/cafe-tv', '/display-menu/tv-']) {
      expect(parseShortLink(bad), bad).toBeNull()
    }
    expect(isShortLink('/display-menu')).toBe(true)
    expect(isShortLink('/slideshow/window')).toBe(true)
    expect(isShortLink('/display/c0ffee00beef00c0ffee00beef00cafe')).toBe(false)
    expect(isShortLink('/display-menus')).toBe(false)
  })

  it('checks a typed link name', () => {
    const s = newScreen('Counter TV')
    expect(screenProblem({ ...s, slug: '' })).toBeNull()
    expect(screenProblem({ ...s, slug: 'counter-tv' })).toBeNull()
    expect(screenProblem({ ...s, slug: 'Counter TV' })).toMatch(/link name/)
    expect(screenProblem({ ...s, slug: '9-tv' })).toMatch(/link name/)
  })
})

describe('picture slideshows and the live offers’ pictures', () => {
  const at = Date.parse('2026-11-05T12:00:00Z')
  const pic = (id: string, starts: string, ends: string): OfferPicture => ({ id, title: `Offer ${id}`, image_url: `https://x.es/${id}.jpg`, starts_at: starts, ends_at: ends })
  const pictures = [
    pic('b', '2026-11-05T10:00:00Z', '2026-11-05T14:00:00Z'),
    pic('a', '2026-11-05T09:00:00Z', '2026-11-06T09:00:00Z'),
    pic('later', '2026-11-05T18:00:00Z', '2026-11-05T20:00:00Z'),
    pic('ended', '2026-11-04T09:00:00Z', '2026-11-05T11:00:00Z'),
  ]

  it('starts a new slideshow with the live offers’ pictures, shown whole, eight seconds each', () => {
    const s = newScreen('Window', 'slideshow')
    expect(s).toMatchObject({ kind: 'slideshow', slug: '', fit: 'contain', seconds: 8 })
    expect(s.slides.map(x => x.kind)).toEqual(['offers'])
    expect(newScreen('Counter TV')).toMatchObject({ kind: 'screen', slides: [] })
  })

  it('plays the picture of each offer on now, in the order they started, in the slide’s place and for its time', () => {
    const slides = playedSlides([slide({ id: 'p1' }), { ...offersSlide('o'), seconds: 12 }, slide({ id: 'p2' })], false)
    const shown = withOfferPictures(slides, pictures, at)
    expect(shown.map(x => x.id)).toEqual(['p1:en', 'o:en:a', 'o:en:b', 'p2:en'])
    expect(shown[1]).toMatchObject({ kind: 'image', url: 'https://x.es/a.jpg', title: 'Offer a', seconds: 12 })
    // None on now: the slide is skipped.
    expect(withOfferPictures(slides, [], at).map(x => x.id)).toEqual(['p1:en', 'p2:en'])
    // Switched off, it doesn't play.
    expect(withOfferPictures(playedSlides([{ ...offersSlide('o'), active: false }], false), pictures, at)).toEqual([])
  })

  it('needs no address, and plays once (the offers bring their own pictures and languages)', () => {
    expect(slideProblem(offersSlide())).toBeNull()
    expect(slideProblem({ ...offersSlide(), seconds: 1 })).toMatch(/between 3 seconds/)
    expect(playedSlides([offersSlide('o')], false).map(x => x.id)).toEqual(['o:en'])
  })
})
