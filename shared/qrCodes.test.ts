import { describe, expect, it } from 'vitest'
import {
  QUIET_ZONE, brandDark, cleanUrl, colourProblem, contrastRatio, logoBox, onWebsite, qrCaption, qrColours, qrFileName, qrMissing, qrModules, qrPayload,
  qrProblem, qrSuggestions, qrSvg, sortQrCodes, wifiEscape, wifiPayload, type QrCode,
} from './qrCodes'

const code = (p: Partial<QrCode>): QrCode => ({ id: 'q', name: 'Menu', kind: 'link', url: null, content: null, wifi_ssid: null, wifi_password: null,
  wifi_security: 'WPA', wifi_hidden: false, used_where: null, caption: null, dark_colour: null, light_colour: null, logo: false, sort: 0,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...p })

/** The error correction level the code was made with, read back from its format bits beside the top-left finder. */
function levelOf(m: boolean[][]) {
  const n = m.length
  let bits = 0
  for (let i = 0; i < 15; i++) {
    const row = i < 6 ? i : i < 8 ? i + 1 : n - 15 + i
    if (m[row][8]) bits |= 1 << i
  }
  return (['M', 'L', 'H', 'Q'] as const)[((bits ^ 0x5412) >> 13) & 3]
}

describe('QR codes', () => {
  it('writes a Wi-Fi network the way phones read it, escaping \\ ; , : and "', () => {
    expect(wifiPayload({ ssid: 'EasyBeans-Guest', password: 'flatwhite2026', security: 'WPA' })).toBe('WIFI:T:WPA;S:EasyBeans-Guest;P:flatwhite2026;H:false;;')
    expect(wifiEscape('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f')
    expect(wifiPayload({ ssid: 'Café; "Easy"', password: 'p:a,s\\s', security: 'WEP', hidden: true }))
      .toBe('WIFI:T:WEP;S:Café\\; \\"Easy\\";P:p\\:a\\,s\\\\s;H:true;;')
    expect(wifiPayload({ ssid: 'Open', password: 'ignored', security: 'nopass' })).toBe('WIFI:T:nopass;S:Open;H:false;;')
  })

  it('says what a code still needs, and gives nothing to scan until it has it', () => {
    const wifi = code({ name: 'Wi-Fi', kind: 'wifi' })
    expect(qrMissing(wifi)).toBe('Add the network name and password')
    expect(qrPayload(wifi)).toBeNull()
    expect(qrMissing({ ...wifi, wifi_ssid: 'EasyBeans' })).toBe('Add the password')
    expect(qrMissing({ ...wifi, wifi_password: 'secret123' })).toBe('Add the network name')
    expect(qrMissing({ ...wifi, wifi_security: 'nopass' })).toBe('Add the network name')
    expect(qrPayload({ ...wifi, wifi_ssid: ' EasyBeans ', wifi_password: 'secret123' })).toBe('WIFI:T:WPA;S:EasyBeans;P:secret123;H:false;;')
    expect(qrMissing(code({}))).toBe('Add the link it opens')
    expect(qrPayload(code({ url: 'easybeanscoffee.com/menu' }))).toBe('https://easybeanscoffee.com/menu')
    expect(qrMissing(code({ kind: 'text' }))).toBe('Add the text it shows')
    expect(qrPayload(code({ kind: 'text', content: '  Table 4  ' }))).toBe('Table 4')
  })

  it('checks a code before it is saved', () => {
    expect(qrProblem({ name: '  ' })).toBe('Give the code a name')
    expect(qrProblem({ name: 'Menu', kind: 'link', url: 'https://easybeanscoffee.com/menu' })).toBeNull()
    expect(qrProblem({ name: 'Menu', kind: 'link', url: null })).toBeNull() // waits for its link
    expect(qrProblem({ name: 'Menu', kind: 'link', url: 'not a link' })).toMatch(/web address/)
    expect(qrProblem({ name: 'Wi-Fi', kind: 'wifi', wifi_ssid: 'x', wifi_password: 'short' })).toBe('A WPA password is at least 8 characters')
    expect(qrProblem({ name: 'Wi-Fi', kind: 'wifi', wifi_ssid: 'x', wifi_password: 'short', wifi_security: 'WEP' })).toBeNull()
    expect(qrProblem({ name: 'Wi-Fi', kind: 'wifi', wifi_ssid: 'ñ'.repeat(17) })).toBe('A network name is at most 32 characters') // 34 bytes
    expect(qrProblem({ name: 'Menu', dark_colour: 'black' })).toBe('Pick the colours from the colour picker')
    expect(cleanUrl(' http://example.com ')).toBe('http://example.com')
    expect(cleanUrl('')).toBeNull()
  })

  it('makes a sturdy code: error correction M, or H with a logo in the middle', () => {
    const plain = qrModules('https://easybeanscoffee.com/menu')
    expect(plain).toHaveLength(29) // version 3
    expect(levelOf(plain)).toBe('M')
    const withLogo = qrModules('https://easybeanscoffee.com/menu', true)
    expect(withLogo).toHaveLength(33) // version 4: more room to lose the middle
    expect(levelOf(withLogo)).toBe('H')
    // The three finders' dark corners.
    for (const [r, c] of [[0, 0], [0, 28], [28, 0]]) expect(plain[r][c]).toBe(true)
    expect(() => qrModules('x'.repeat(3000))).toThrow('too long')
  })

  it('reads names with accents as UTF-8, as phones do', () => {
    // 26 letters fill a version 2 code at M; with the ñ they're 27 bytes, which need version 3.
    expect(qrModules('EasyBeans-Senor-Guest-Wifi')).toHaveLength(25)
    expect(qrModules('EasyBeans-Señor-Guest-Wifi')).toHaveLength(29)
  })

  it('draws an SVG with the quiet zone, in its colours, with the logo on a light square', () => {
    const svg = qrSvg('https://easybeanscoffee.com/menu', { dark: '#2B2522', light: '#FFFFFF', title: 'Menu' })
    expect(svg).toContain(`viewBox="0 0 ${29 + 2 * QUIET_ZONE} ${29 + 2 * QUIET_ZONE}"`)
    expect(svg).toContain('<title>Menu</title>')
    expect(svg).toContain('fill="#2B2522"')
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    // The finder's top row is one run of seven, inside the quiet zone.
    expect(svg).toContain(`M${QUIET_ZONE} ${QUIET_ZONE}h7v1h-7z`)
    expect(svg).not.toContain('<image')
    const logo = qrSvg('https://easybeanscoffee.com/menu', { dark: '#000000', light: '#FFFFFF', logo: 'data:image/png;base64,AAAA', px: 512 })
    expect(logo).toContain('<image href="data:image/png;base64,AAAA"')
    expect(logo).toContain('width="512" height="512"')
    const box = logoBox(33)
    expect(box.side).toBeGreaterThan(5)
    expect((33 - box.side) % 2).toBe(0)
  })

  it('picks colours that scan: the brand’s darkest when it’s dark enough, else black', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
    // Easy Beans' palette is light: rose, limewash, lilac, matcha.
    expect(brandDark([{ hex: '#F79BA4' }, { hex: '#C6C2BB' }, { hex: '#B7A3D8' }, { hex: '#6B8E4E' }])).toBe('#000000')
    expect(brandDark([{ hex: '#F79BA4' }, { hex: '#2b2522' }, { hex: '#3A5A40' }])).toBe('#2B2522')
    expect(qrColours({ dark_colour: null, light_colour: null }, [{ hex: '#3A5A40' }])).toEqual({ dark: '#3A5A40', light: '#FFFFFF' })
    expect(qrColours({ dark_colour: '#112233', light_colour: '#FFF8F0' }, [])).toEqual({ dark: '#112233', light: '#FFF8F0' })
    expect(colourProblem('#000000', '#FFFFFF')).toBeNull()
    expect(colourProblem('#FFFFFF', '#000000')).toMatch(/darker than its background/)
    expect(colourProblem('#F79BA4', '#FFFFFF')).toMatch(/too alike/)
  })

  it('suggests the usual codes a business starts with, less the ones it has', () => {
    const all = qrSuggestions([], { website: 'https://www.easybeanscoffee.com/', placeId: 'ChIJ123' })
    expect(all.map(s => s.key)).toEqual(['menu', 'competition', 'wifi', 'review'])
    expect(all[0].code).toMatchObject({ name: 'Menu', kind: 'link', url: 'https://www.easybeanscoffee.com/menu', used_where: 'On the tables', caption: 'Scan for the menu' })
    expect(all[3].code.url).toBe('https://search.google.com/local/writereview?placeid=ChIJ123')
    // No website: the link is asked for. No Google place: no review code.
    const bare = qrSuggestions([], {})
    expect(bare.map(s => s.key)).toEqual(['menu', 'competition', 'wifi'])
    expect(bare[0].code.url).toBeNull()
    const some = qrSuggestions([code({ name: 'menú' }), code({ name: 'Guest network', kind: 'wifi' })], { translate: s => (s === 'Menu' ? 'Menú' : s) })
    expect(some.map(s => s.key)).toEqual(['competition'])
    expect(onWebsite('easybeanscoffee.com', 'menu')).toBe('https://easybeanscoffee.com/menu')
  })

  it('orders, names files and captions them', () => {
    expect(sortQrCodes([code({ id: 'b', name: 'B', sort: 2 }), code({ id: 'a', name: 'A', sort: 1 })]).map(c => c.id)).toEqual(['a', 'b'])
    expect(qrFileName('Wi-Fi del café')).toBe('wi-fi-del-cafe-qr-code')
    expect(qrFileName('🎉')).toBe('qr-qr-code')
    expect(qrCaption(code({ kind: 'wifi' }))).toBe('Scan to join the Wi-Fi')
    expect(qrCaption(code({ caption: ' Scan for the menu ' }))).toBe('Scan for the menu')
  })
})
