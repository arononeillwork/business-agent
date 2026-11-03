// Slides in English and Spanish: each switched-on version plays, English first; a version with
// nothing to show is skipped; one go round counts every version; and the Spanish address is checked
// like the English one.
import { describe, expect, it } from 'vitest'
import { hasVersion, loopSeconds, playedSlides, slideProblem, slideVersions, versionOn, type Slide } from './screens'

const slide = (p: Partial<Slide>): Slide => ({ id: 's', kind: 'image', url: 'https://x.es/en.jpg', design_id: null, title: null, seconds: null, live: false, active: true, ...p })

describe('slides in English and Spanish', () => {
  it('plays the English version, then the Spanish one, each with its own address', () => {
    const versions = slideVersions(slide({ url_es: 'https://x.es/es.jpg' }))
    expect(versions.map(v => [v.id, v.lang, v.url, v.slide_id])).toEqual([
      ['s:en', 'en', 'https://x.es/en.jpg', 's'],
      ['s:es', 'es', 'https://x.es/es.jpg', 's'],
    ])
  })

  it('skips a version that is switched off or has nothing to show; slides from before versions play as they were', () => {
    expect(slideVersions(slide({ url_es: 'https://x.es/es.jpg', show_en: false })).map(v => v.lang)).toEqual(['es'])
    expect(slideVersions(slide({ url_es: 'https://x.es/es.jpg', show_es: false })).map(v => v.lang)).toEqual(['en'])
    expect(slideVersions(slide({ url: null, url_es: 'https://x.es/es.jpg' })).map(v => v.lang)).toEqual(['es'])
    expect(slideVersions(slide({ show_es: true })).map(v => v.lang)).toEqual(['en'])
    expect(slideVersions(slide({})).map(v => v.lang)).toEqual(['en'])
    expect(slideVersions(slide({ show_en: false }))).toEqual([])
    expect(versionOn(slide({}), 'es')).toBe(true)
    expect(hasVersion(slide({}), 'es')).toBe(false)
  })

  it('shows a digital menu in Spanish from its own design', () => {
    const versions = slideVersions(slide({ kind: 'menu', url: null, design_id: 'd-en', design_id_es: 'd-es' }))
    expect(versions.map(v => [v.lang, v.design_id])).toEqual([['en', 'd-en'], ['es', 'd-es']])
  })

  it('plays the switched-on slides in their versions, and counts each version once round', () => {
    const slides = [
      slide({ id: 'menu', url: 'https://x.es/menu', kind: 'web', active: false }),
      slide({ id: 'offer', url_es: 'https://x.es/es.jpg', seconds: 15 }),
      slide({ id: 'photo', seconds: 8 }),
    ]
    expect(playedSlides(slides, false).map(v => v.id)).toEqual(['offer:en', 'offer:es', 'photo:en'])
    expect(loopSeconds({ seconds: 10, slides })).toBe(15 + 15 + 8)
  })

  it('checks the Spanish address like the English one, and needs at least one', () => {
    expect(slideProblem(slide({ url_es: 'https://x.es/es.jpg' }))).toBeNull()
    expect(slideProblem(slide({ url: null, url_es: 'https://x.es/es.jpg' }))).toBeNull()
    expect(slideProblem(slide({ url_es: 'http://x.es/es.jpg' }))).toMatch(/https:\/\//)
    expect(slideProblem(slide({ url: null, url_es: null }))).toMatch(/Paste the address/)
    expect(slideProblem(slide({ kind: 'menu', url: null, design_id: null, design_id_es: 'd-es' }))).toBeNull()
    expect(slideProblem(slide({ kind: 'menu', url: null, design_id: null }))).toMatch(/digital menu/)
  })
})
