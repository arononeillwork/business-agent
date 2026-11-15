import { describe, expect, it } from 'vitest'
import { OWN_URL, embedCode, newScreen, screenProblem } from './screens'

describe('a screen’s own address', () => {
  it('is an https page with a host, as the database takes it', () => {
    expect(OWN_URL.test('https://easybeanscoffee.com/display-menu')).toBe(true)
    expect(OWN_URL.test('https://www.easybeanscoffee.com/display-menu?tv=1')).toBe(true)
    expect(OWN_URL.test('http://easybeanscoffee.com/display-menu')).toBe(false)
    expect(OWN_URL.test('https://localhost/display-menu')).toBe(false)
    expect(screenProblem({ ...newScreen('Café TV'), own_url: 'http://easybeanscoffee.com/display-menu' })).toBe('Your own address should start with https://')
    expect(screenProblem({ ...newScreen('Café TV'), own_url: 'https://easybeanscoffee.com/display-menu' })).toBeNull()
    expect(screenProblem({ ...newScreen('Café TV'), own_url: null })).toBeNull()
  })

  it('gets the code that shows the screen’s link, filling the page', () => {
    const code = embedCode('https://businesssagent.com/display-menu')
    expect(code).toMatch(/^<iframe src="https:\/\/businesssagent\.com\/display-menu" /)
    expect(code).toContain('allow="autoplay; fullscreen"')
    expect(code).toContain('position:fixed;inset:0;width:100%;height:100%;border:0')
    expect(embedCode('https://x.es/display-menu?a="b"')).toContain('src="https://x.es/display-menu?a=&quot;b&quot;"')
  })
})
