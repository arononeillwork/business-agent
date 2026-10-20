import { describe, expect, it } from 'vitest'
import {
  blocksEverything, businessIn, checkSite, consistency, hoursOf, pageSpeedOf, parsePage, sameAddress, samePhone, scoreOf, sitemapUrls, vitalLevel, type Expected,
} from './seo'

const GOOD = `<!doctype html><html lang="es"><head>
<title>Easy Beans Coffee · Specialty café in San Pedro</title>
<meta name="description" content="Specialty coffee, matcha and pastries in San Pedro de Alcántara, Marbella. Open every day from 8am, with a terrace and takeaway.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://www.easybeanscoffee.com/">
<meta property="og:title" content="Easy Beans Coffee"><meta property="og:description" content="Specialty coffee"><meta property="og:image" content="https://x/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":"CafeOrCoffeeShop","name":"Easy Beans Coffee",
 "telephone":"+34 695 415 335","address":{"@type":"PostalAddress","streetAddress":"C. Pizarro, 8","postalCode":"29670","addressLocality":"San Pedro de Alcántara"},
 "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"08:00","closes":"18:00"},
 {"dayOfWeek":"https://schema.org/Saturday","opens":"09:00","closes":"18:00"},{"dayOfWeek":"Sunday","opens":"09:00","closes":"16:00"}]}]}</script>
</head><body><!-- <h1>old</h1> --><h1>Easy Beans <em>Coffee</em></h1>
<img src="a.jpg" alt="Flat white"><img src="b.jpg" alt="">
<a href="/menu">Menu</a><a href="https://www.easybeanscoffee.com/shop#top">Shop</a><a href="https://instagram.com/x">IG</a><a href="tel:+34">Call</a><a href="/doc.pdf">PDF</a>
</body></html>`

const expected: Expected = {
  name: 'Easy Beans Coffee', phone: '+34 695 415 335', address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga',
  opening_hours: { mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
    thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' }, sun: { open: '09:00', close: '16:00' } },
}
const extra = { robots: 'User-agent: *\nAllow: /\nSitemap: https://www.easybeanscoffee.com/sitemap.xml', sitemap: '<urlset><url><loc>https://www.easybeanscoffee.com/</loc></url><url><loc>https://www.easybeanscoffee.com/menu</loc></url></urlset>', broken: [] }

describe('reading a page', () => {
  it('finds the title, description, headings, social tags, links and images', () => {
    const p = parsePage('https://www.easybeanscoffee.com/', GOOD)
    expect(p).toMatchObject({ title: 'Easy Beans Coffee · Specialty café in San Pedro', lang: 'es', viewport: true, canonical: 'https://www.easybeanscoffee.com/',
      h1: ['Easy Beans Coffee'], images: 2, imagesWithoutAlt: 0, noindex: false })
    expect(p.social['og:image']).toBe('https://x/og.jpg')
    expect(p.links.sort()).toEqual(['https://www.easybeanscoffee.com/menu', 'https://www.easybeanscoffee.com/shop'])
  })

  it('reads the business from JSON-LD, @graph and plain-text hours included', () => {
    const b = businessIn(GOOD)!
    expect(b).toMatchObject({ type: 'CafeOrCoffeeShop', name: 'Easy Beans Coffee', phone: '+34 695 415 335', address: 'C. Pizarro, 8, 29670, San Pedro de Alcántara' })
    expect(b.hours).toEqual(expected.opening_hours)
    expect(hoursOf({ openingHours: ['Mo-Fr 08:00-18:00', 'Sa 09:00-14:00'] })).toMatchObject({ mon: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '14:00' } })
    expect(businessIn('<script type="application/ld+json">{ broken</script>')).toBeNull()
  })

  it('reads sitemaps and robots.txt', () => {
    expect(sitemapUrls(extra.sitemap)).toHaveLength(2)
    expect(blocksEverything('User-agent: *\nDisallow: /')).toBe(true)
    expect(blocksEverything('User-agent: BadBot\nDisallow: /\nUser-agent: *\nDisallow: /admin')).toBe(false)
  })

  it('matches phones and addresses however they’re written', () => {
    expect(samePhone('695 41 53 35', '+34 695 415 335')).toBe(true)
    expect(samePhone('+34 600 000 000', '+34 695 415 335')).toBe(false)
    expect(sameAddress('Calle Pizarro 8, 29670 San Pedro', 'C. Pizarro, 8, 29670 San Pedro de Alcántara')).toBe(true)
    expect(sameAddress('C. Pizarro 8, 29680 Estepona', 'C. Pizarro, 8, 29670 San Pedro')).toBe(false)
  })
})

describe('the checks', () => {
  it('a good page passes everything', () => {
    const items = checkSite(parsePage('https://www.easybeanscoffee.com/', GOOD), [], extra, expected)
    expect(items.filter(i => i.level !== 'pass')).toEqual([])
    expect(scoreOf(items).fail).toBe(0)
  })

  it('a bare page fails what matters, with a fix for each, problems first', () => {
    const bare = parsePage('http://easybeans.test/', '<html><body><h1>a</h1><h1>b</h1><img src="x.jpg"><meta name="robots" content="noindex"></body></html>')
    const items = checkSite(bare, [], { robots: 'User-agent: *\nDisallow: /', sitemap: null, broken: [{ url: 'http://easybeans.test/old', status: 404 }] }, expected)
    const level = (id: string) => items.find(i => i.id === id)?.level
    expect(level('https')).toBe('fail')
    expect(level('title')).toBe('fail')
    expect(level('description')).toBe('fail')
    expect(level('viewport')).toBe('fail')
    expect(level('business')).toBe('fail')
    expect(level('noindex')).toBe('fail')
    expect(level('robots')).toBe('fail')
    expect(level('broken')).toBe('fail')
    expect(level('h1')).toBe('warn')
    expect(level('alt')).toBe('warn')
    expect(level('sitemap')).toBe('warn')
    expect(items.every(i => i.level === 'pass' || i.fix)).toBe(true)
    expect(items[0].level).toBe('fail')
    expect(items.find(i => i.id === 'broken')!.pages).toEqual(['http://easybeans.test/old (404)'])
  })

  it('flags a phone or hours on the website that differ from the app', () => {
    const html = GOOD.replace('+34 695 415 335', '+34 600 111 222').replace('"opens":"09:00","closes":"16:00"', '"opens":"10:00","closes":"16:00"')
    const items = checkSite(parsePage('https://www.easybeanscoffee.com/', html), [], extra, expected)
    expect(items.find(i => i.id === 'business_phone')).toMatchObject({ level: 'warn', vars: { site: '+34 600 111 222', app: '+34 695 415 335' } })
    expect(items.find(i => i.id === 'business_hours')).toMatchObject({ level: 'warn', vars: { days: 'sun' } })
  })

  it('other pages without a title or description are listed', () => {
    const other = parsePage('https://www.easybeanscoffee.com/menu', '<html><head><title>Menu</title></head></html>')
    const items = checkSite(parsePage('https://www.easybeanscoffee.com/', GOOD), [other], extra, expected)
    expect(items.find(i => i.id === 'pages_description')).toMatchObject({ level: 'warn', pages: ['https://www.easybeanscoffee.com/menu'] })
    expect(items.find(i => i.id === 'pages_title')).toBeUndefined()
  })
})

describe('consistency', () => {
  it('compares the app with the website and Google, and says nothing when there’s nothing to compare', () => {
    const rows = consistency(expected, businessIn(GOOD), { name: 'Easy Beans Coffee', phone: '600 000 000', address: null, hours: null })
    expect(rows.find(r => r.field === 'name')!.matches).toBe(true)
    expect(rows.find(r => r.field === 'phone')!.matches).toBe(false)
    expect(rows.find(r => r.field === 'hours')!.matches).toBe(true)
    expect(consistency(expected, null, null).every(r => r.matches === null)).toBe(true)
  })
})

describe('PageSpeed', () => {
  it('takes the four scores, real visitors’ vitals when there are some, and the biggest savings', () => {
    const p = pageSpeedOf({
      lighthouseResult: { categories: { performance: { score: 0.62 }, accessibility: { score: 0.91 }, 'best-practices': { score: 1 }, seo: { score: 0.85 } },
        audits: { 'render-blocking-resources': { title: 'Eliminate render-blocking resources', details: { type: 'opportunity', overallSavingsMs: 900 } },
          'uses-webp-images': { title: 'Serve images in modern formats', details: { type: 'opportunity', overallSavingsMs: 1500 } },
          tiny: { title: 'Tiny', details: { type: 'opportunity', overallSavingsMs: 50 } } } },
      loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 }, INTERACTION_TO_NEXT_PAINT: { percentile: 180 } } },
    }, 'mobile', '2026-10-20T10:00:00Z')
    expect(p.scores).toEqual({ performance: 62, accessibility: 91, best_practices: 100, seo: 85 })
    expect(p.vitals).toEqual({ lcp_ms: 3100, cls: 0.05, inp_ms: 180, field: true })
    expect(p.opportunities).toEqual(['Serve images in modern formats', 'Eliminate render-blocking resources'])
    expect(vitalLevel('lcp_ms', 3100)).toBe('warn')
    expect(vitalLevel('cls', 0.05)).toBe('pass')
    expect(vitalLevel('inp_ms', 600)).toBe('fail')
  })
})
