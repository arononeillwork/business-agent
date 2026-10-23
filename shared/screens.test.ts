import { describe, expect, it } from 'vitest'
import {
  cleanUrl, instagramCode, isOnline, kindOf, loopSeconds, musicEmbedUrl, musicKind, newScreen, playOrder, playUrl, screenProblem, slideProblem, slideSeconds, vimeoId, youtubeId,
  youtubeList, type Slide,
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
