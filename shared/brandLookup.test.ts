// Reading a business's brand and details from its website (the set-up guide's "already open" step).
import { describe, expect, it } from 'vitest'
import {
  detailsFromLinks, fontFamily, foundAnything, googleFontsIn, hexOf, iconIn, instagramOf, logoIn, mergeReads, nameFromTitle, phoneOf,
  readFirecrawl, readHtml, siteAddress, uniqueColours, EMPTY_READ,
} from './brandLookup'

const SITE = 'https://www.cafelola.es/'
const HTML = `<!doctype html><html lang="es"><head>
  <title>Inicio | Café Lola – Specialty coffee in Marbella</title>
  <meta name="description" content="Specialty coffee, fresh bakes and brunch in San Pedro.">
  <meta name="theme-color" content="#2f5d50">
  <meta property="og:site_name" content="Café Lola">
  <link rel="icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&amp;family=Lato:wght@400&amp;display=swap" rel="stylesheet">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"Organization","logo":{"@type":"ImageObject","url":"/img/lola-logo.svg"},"sameAs":["https://www.instagram.com/cafelola.sp/"],"email":"hola@cafelola.es"},
    {"@type":"CafeOrCoffeeShop","name":"Café Lola","telephone":"+34 952 78 12 34",
     "address":{"@type":"PostalAddress","streetAddress":"Calle Marqués del Duero, 12","postalCode":"29670","addressLocality":"San Pedro de Alcántara"},
     "openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"08:00","closes":"18:00"}]}]}</script>
</head><body>
  <header><img class="site-logo" src="/img/header.png" alt="Café Lola"></header>
  <a href="tel:+34%20952%2078%2012%2034">Call us</a>
  <a href="mailto:reservas@cafelola.es?subject=Mesa">Book</a>
  <a href="https://www.instagram.com/p/C0abc/">A post</a>
</body></html>`

describe('reading a website for its brand', () => {
  it('takes only public websites', () => {
    expect(siteAddress('cafelola.es')).toBe('https://cafelola.es/')
    expect(siteAddress(' https://www.cafelola.es/menu#top ')).toBe('https://www.cafelola.es/menu')
    for (const bad of ['', 'localhost:8787', 'http://127.0.0.1', 'https://10.0.0.1/', 'ftp://cafelola.es', 'https://user:pw@cafelola.es', 'intranet', 'https://router.local'])
      expect(siteAddress(bad), bad).toBeNull()
  })

  it('reads colours as #RRGGBB, and leaves see-through ones out', () => {
    expect(hexOf('#2f5d50')).toBe('#2F5D50')
    expect(hexOf('abc')).toBe('#AABBCC')
    expect(hexOf('rgb(47, 93, 80)')).toBe('#2F5D50')
    expect(hexOf('rgba(47 93 80 / 0.2)')).toBeNull()
    expect(hexOf('#2F5D5010')).toBeNull()
    expect(hexOf('transparent')).toBeNull()
    expect(uniqueColours([{ name: 'A', hex: '#111111', role: 'primary' }, { name: 'B', hex: '#111111', role: 'accent' }])).toHaveLength(1)
  })

  it('keeps brand fonts, not the system’s', () => {
    expect(fontFamily(`'Playfair Display', Georgia, serif`)).toBe('Playfair Display')
    expect(fontFamily('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')).toBeNull()
    expect(googleFontsIn(HTML)).toEqual(['Playfair Display', 'Lato'])
    expect(googleFontsIn('<link href="https://fonts.googleapis.com/css?family=Open+Sans:400,700|Roboto+Slab">')).toEqual(['Open Sans', 'Roboto Slab'])
  })

  it('finds the name, Instagram, phone and email', () => {
    expect(nameFromTitle('Inicio | Café Lola – Specialty coffee in Marbella')).toBe('Café Lola')
    expect(nameFromTitle('Bar Bea')).toBe('Bar Bea')
    expect(instagramOf('https://www.instagram.com/cafelola.sp/?hl=es')).toBe('cafelola.sp')
    expect(instagramOf('https://instagram.com/p/C0abc/')).toBeNull()
    expect(phoneOf('tel:+34%20952%2078%2012%2034')).toBe('+34 952 78 12 34')
    expect(detailsFromLinks(['mailto:Hola@CafeLola.es?subject=x', 'https://instagram.com/explore', 'https://instagram.com/cafelola'])).toEqual({ email: 'hola@cafelola.es', phone: null, instagram: 'cafelola' })
  })

  it('picks the touch icon over a tiny .ico, and the structured data’s logo over an <img>', () => {
    expect(iconIn(HTML, SITE)).toBe('https://www.cafelola.es/apple-touch-icon.png')
    expect(iconIn('<link rel="icon" href="/favicon.ico"><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="icon" type="image/png" sizes="192x192" href="/i.png">', SITE)).toBe('https://www.cafelola.es/icon.svg')
    expect(logoIn(HTML, SITE, '/img/lola-logo.svg')).toBe('https://www.cafelola.es/img/lola-logo.svg')
    expect(logoIn(HTML, SITE, null)).toBe('https://www.cafelola.es/img/header.png')
    expect(logoIn('<img src="/hero.jpg" alt="Our terrace">', SITE, null)).toBeNull()
  })

  it('reads everything the HTML says', () => {
    expect(readHtml(SITE, HTML)).toEqual({
      name: 'Café Lola',
      description: 'Specialty coffee, fresh bakes and brunch in San Pedro.',
      logo_url: 'https://www.cafelola.es/img/lola-logo.svg',
      icon_url: 'https://www.cafelola.es/apple-touch-icon.png',
      colours: [{ name: 'Primary', hex: '#2F5D50', role: 'primary' }],
      heading_font: 'Playfair Display',
      body_font: 'Lato',
      phone: '+34 952 78 12 34',
      email: 'hola@cafelola.es',
      address: 'Calle Marqués del Duero, 12, 29670, San Pedro de Alcántara',
      instagram: 'cafelola.sp',
      hours: { mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
        thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' } },
    })
  })

  it('reads Firecrawl’s branding, and the HTML fills what it didn’t find', () => {
    const fc = readFirecrawl({
      branding: {
        logo: 'https://cdn.cafelola.es/logo.png',
        colors: { primary: '#2F5D50', secondary: '#E8C07D', accent: '#2f5d50', background: 'rgb(251, 247, 240)', textPrimary: '#2B2522' },
        fonts: [{ family: 'Lato' }, { family: 'Playfair Display' }],
        typography: { fontFamilies: { primary: 'Lato, sans-serif', heading: '"Playfair Display", serif' } },
        images: { logo: null, favicon: 'https://www.cafelola.es/favicon.ico' },
      },
      links: ['https://www.cafelola.es/menu', 'https://instagram.com/cafelola.sp', 'mailto:hola@cafelola.es'],
      metadata: { title: 'Café Lola | Coffee', description: 'Brunch in San Pedro', statusCode: 200 },
    }, SITE)
    expect(fc).toMatchObject({
      name: 'Café Lola', logo_url: 'https://cdn.cafelola.es/logo.png', icon_url: null, heading_font: 'Playfair Display', body_font: 'Lato',
      instagram: 'cafelola.sp', email: 'hola@cafelola.es', phone: null,
    })
    // The accent was the primary again: each colour once.
    expect(fc.colours.map(c => [c.name, c.hex, c.role])).toEqual([
      ['Primary', '#2F5D50', 'primary'], ['Secondary', '#E8C07D', 'secondary'], ['Background', '#FBF7F0', 'base'], ['Text', '#2B2522', 'base'],
    ])
    const both = mergeReads(fc, readHtml(SITE, HTML))
    expect(both).toMatchObject({ logo_url: 'https://cdn.cafelola.es/logo.png', icon_url: 'https://www.cafelola.es/apple-touch-icon.png', phone: '+34 952 78 12 34' })
    expect(both.colours).toHaveLength(4)
    expect(both.hours?.mon).toEqual({ open: '08:00', close: '18:00' })
    expect(mergeReads(null, null)).toEqual(EMPTY_READ)
  })

  it('reads Firecrawl’s real answer (Monmouth Coffee, 7 November 2026: one credit)', () => {
    // Trimmed to what's read here, as Firecrawl's /v2/scrape sent it (formats branding and links).
    const real = {
      branding: {
        colorScheme: 'light',
        fonts: [{ family: 'Fresco Sans Std', role: 'heading' }, { family: 'Fresco Sans Pro', role: 'body' }],
        colors: { primary: '#958E09', accent: '#7F54B3', background: '#FFFFFF', textPrimary: '#1A1A1A', link: '#7F54B3' },
        images: {
          logo: 'https://www.monmouthcoffee.co.uk/wp-content/themes/monmouth-coffee/assets/images/logo.svg',
          favicon: 'https://www.monmouthcoffee.co.uk/wp-content/uploads/2025/10/favicon-32.png',
          ogImage: 'https://www.monmouthcoffee.co.uk/wp-content/uploads/2026/09/Santa-Ines-New-Trees.jpg',
          logoHref: 'https://www.monmouthcoffee.co.uk/', logoAlt: 'Monmouth Coffee Company',
        },
        brandName: 'Monmouth Coffee Company',
        logo: 'https://www.monmouthcoffee.co.uk/wp-content/themes/monmouth-coffee/assets/images/logo.svg',
        typography: { fontFamilies: { primary: 'Fresco Sans Pro', heading: 'Fresco Sans Std' } },
      },
      links: ['tel:+442072323010', 'mailto:beans@monmouthcoffee.co.uk', 'https://instagram.com/monmouthcoffee', 'https://www.monmouthcoffee.co.uk/'],
      metadata: { title: 'Home - Monmouth Coffee Company', ogSiteName: 'Monmouth Coffee Company', url: 'https://www.monmouthcoffee.co.uk/',
        sourceURL: 'https://www.monmouthcoffee.co.uk/', statusCode: 200, creditsUsed: 1 },
    }
    expect(readFirecrawl(real, real.metadata.url)).toEqual({
      name: 'Monmouth Coffee Company',
      description: null,
      logo_url: 'https://www.monmouthcoffee.co.uk/wp-content/themes/monmouth-coffee/assets/images/logo.svg',
      icon_url: 'https://www.monmouthcoffee.co.uk/wp-content/uploads/2025/10/favicon-32.png',
      colours: [
        { name: 'Primary', hex: '#958E09', role: 'primary' }, { name: 'Accent', hex: '#7F54B3', role: 'accent' },
        { name: 'Background', hex: '#FFFFFF', role: 'base' }, { name: 'Text', hex: '#1A1A1A', role: 'base', use: 'Text' },
      ],
      // Not Google Fonts: the guide leaves them out.
      heading_font: 'Fresco Sans Std',
      body_font: 'Fresco Sans Pro',
      phone: '+442072323010',
      email: 'beans@monmouthcoffee.co.uk',
      address: null,
      instagram: 'monmouthcoffee',
      hours: null,
    })
    // No site name or title in the metadata: Firecrawl's own brand name.
    expect(readFirecrawl({ ...real, metadata: { ...real.metadata, ogSiteName: undefined, title: undefined } }, real.metadata.url).name).toBe('Monmouth Coffee Company')
  })

  it('knows when a site told nothing', () => {
    const none = { logo: null, icon: null, colours: [], heading_font: null, name: null, phone: null, email: null, address: null, instagram: null }
    expect(foundAnything(none)).toBe(false)
    expect(foundAnything({ ...none, phone: '+34 600 000 000' })).toBe(true)
  })
})
