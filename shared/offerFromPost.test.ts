// Reading the offer in one of the business's own posts: its name, price and usual price, the details
// without hashtags, how long it runs, and which of the latest posts is the one with an offer.
import { describe, expect, it } from 'vitest'
import { latestOfferPost, offerFromCaption, offerFromPost, postOfferEnd, type SourcePost } from './offerFromPost'

const TZ = 'Europe/Madrid'
const STRUCK = (s: string) => [...s].map(c => `${c}\u{336}`).join('')

describe('offerFromCaption', () => {
  it('takes the first line as the name, the price and what it usually costs, and the rest without hashtags', () => {
    const idea = offerFromCaption('☕️ Iced latte + banana bread ☕️\nNow just €5.50 (usually €7) all week long!\n\n#easybeans #sanpedro #coffee')
    expect(idea).toEqual({
      title: 'Iced latte + banana bread', details: 'Now just €5.50 (usually €7) all week long!',
      price: '€5.50', was_price: '€7', length: 'week', found: true,
    })
  })

  it('reads euros written the Spanish way and the old price after "antes"', () => {
    expect(offerFromCaption('Tostada con aguacate\nSolo hoy 4,50€ (antes 6€)')).toMatchObject({ price: '€4.50', was_price: '€6', length: 'today' })
    expect(offerFromCaption('Café con leche de 2 € a 1,50 €')).toMatchObject({ price: '€1.50', was_price: '€2' })
    expect(offerFromCaption('Flat white €4 → €3')).toMatchObject({ price: '€3', was_price: '€4' })
  })

  it('takes a crossed-out price as what it usually costs', () => {
    expect(offerFromCaption(`Matcha latte ${STRUCK('€4.80')} €3.90`)).toMatchObject({ price: '€3.90', was_price: '€4.80' })
  })

  it('reads deals: 2x1, 3 for €5, % off, half price, buy one get one', () => {
    expect(offerFromCaption('2x1 en cafés esta tarde').price).toBe('2 for 1')
    expect(offerFromCaption('Cookies: 3 for €5 this weekend')).toMatchObject({ price: '3 for €5', length: 'weekend' })
    expect(offerFromCaption('20% off all cakes').price).toBe('20% off')
    expect(offerFromCaption('Pasteles -30% hasta cerrar').price).toBe('30% off')
    expect(offerFromCaption('Half price smoothies today only').price).toBe('Half price')
    expect(offerFromCaption('Buy one get one free on brownies').price).toBe('2 for 1')
    // Not offers: what's in it, or a number of hours.
    expect(offerFromCaption('Our 70% cacao hot chocolate is back').price).toBeNull()
    expect(offerFromCaption('Open 7 days a week').price).toBeNull()
  })

  it('knows an offer by its words when there is no price, and a plain post when there is none', () => {
    expect(offerFromCaption('Happy hour is back! Every afternoon from 4').found).toBe(true)
    expect(offerFromCaption('Oferta especial para los vecinos').found).toBe(true)
    const plain = offerFromCaption('The benefits of Acai Berry are endless. Try it at Easy Health! 💚')
    expect(plain).toMatchObject({ found: false, price: null, was_price: null })
  })

  it('cuts a long first line at its first sentence and keeps the details under 300 characters', () => {
    const idea = offerFromCaption(`Pumpkin spice is here and it is better than ever. Come and try it with oat milk for no extra charge, ${'all day long '.repeat(30)}`)
    expect(idea.title).toBe('Pumpkin spice is here and it is better than ever')
    expect(idea.details!.length).toBeLessThanOrEqual(300)
    expect(idea.details!.endsWith('…')).toBe(true)
  })

  it('says how long it runs: today, the weekend, the month, else a week', () => {
    expect(offerFromCaption('Solo hoy: croissant + café 3€').length).toBe('today')
    expect(offerFromCaption('Este fin de semana, brunch 12€').length).toBe('weekend')
    expect(offerFromCaption('All month: 10% off for students').length).toBe('month')
    expect(offerFromCaption('Iced lattes €3').length).toBe('week')
  })
})

describe('postOfferEnd', () => {
  const tue = '2026-11-03T10:15:00Z' // Tuesday 11:15 in Madrid
  it('ends today at 23:59, on Sunday at 23:59, at the end of the month, or a week later', () => {
    expect(postOfferEnd(tue, 'today', TZ)).toBe('2026-11-03T22:59:00.000Z')
    expect(postOfferEnd(tue, 'weekend', TZ)).toBe('2026-11-08T22:59:00.000Z')
    expect(postOfferEnd('2026-11-08T10:00:00Z', 'weekend', TZ)).toBe('2026-11-08T22:59:00.000Z')
    expect(postOfferEnd(tue, 'month', TZ)).toBe('2026-11-30T22:59:00.000Z')
    expect(postOfferEnd(tue, 'week', TZ)).toBe('2026-11-10T10:15:00.000Z')
  })
})

describe('offerFromPost and latestOfferPost', () => {
  const posts: SourcePost[] = [
    { id: 'p3', source: 'instagram', caption: 'Sunset on the terrace 🌅', image_url: 'https://scontent.cdninstagram.com/sunset.jpg', permalink: 'https://www.instagram.com/p/C3/', posted_at: '2026-11-03T08:00:00Z' },
    { id: 'p2', source: 'instagram', caption: '2x1 iced lattes this weekend!\nTag a friend 👯 #easybeans', image_url: 'https://scontent.cdninstagram.com/latte.jpg', permalink: 'https://www.instagram.com/p/C2/', posted_at: '2026-11-02T08:00:00Z' },
    { id: 'p1', source: 'instagram', caption: 'Pumpkin spice latte €3.80', image_url: null, permalink: null, posted_at: '2026-10-20T08:00:00Z' },
  ]

  it('picks the newest post with an offer, passing over the ones without', () => {
    expect(latestOfferPost(posts)?.id).toBe('p2')
    expect(latestOfferPost([posts[0]])).toBeNull()
  })

  it('makes an offer from now, on the screens given, with the post’s photo', () => {
    const o = offerFromPost(posts[1], ['s-tv'], TZ, Date.parse('2026-11-03T10:15:42Z'))
    expect(o).toMatchObject({
      title: '2x1 iced lattes this weekend', details: 'Tag a friend', price: '2 for 1', was_price: null,
      image_url: 'https://scontent.cdninstagram.com/latte.jpg', starts_at: '2026-11-03T10:15:00.000Z', ends_at: '2026-11-08T22:59:00.000Z',
      screen_ids: ['s-tv'], screen_mode: 'turns', seconds: 15, active: true, found: true,
    })
  })

  it('names a post with no words after where it came from', () => {
    expect(offerFromPost({ ...posts[0], caption: '🌅🌅' }, [], TZ).title).toBe('Our Instagram special')
  })
})
