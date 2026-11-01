import { describe, expect, it } from 'vitest'
import { declineAnswer, installWay, phoneOrTablet, shouldOffer, type Device } from './install'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85',
  iphoneGoogleApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.783 Mobile/15E148 Safari/604.1',
  // iPadOS asks for desktop sites: it says it's a Mac.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
}

const device = (ua: string, more: Partial<Device> = {}): Device => ({
  ua, platform: /Macintosh/.test(ua) ? 'MacIntel' : /Windows/.test(ua) ? 'Win32' : 'Linux armv8l',
  touchPoints: 0, touchOnly: /iPhone|Android/.test(ua), standalone: false, ...more,
})

describe('which devices are offered the app', () => {
  it('phones and tablets, an iPad that says it is a Mac included', () => {
    expect(phoneOrTablet(device(UA.iphoneSafari))).toBe(true)
    expect(phoneOrTablet(device(UA.androidChrome))).toBe(true)
    expect(phoneOrTablet(device(UA.androidTablet))).toBe(true)
    expect(phoneOrTablet(device(UA.ipad, { touchPoints: 5, touchOnly: true }))).toBe(true)
  })

  it('never a computer, touch screen or not', () => {
    expect(phoneOrTablet(device(UA.macSafari))).toBe(false)
    expect(phoneOrTablet(device(UA.windowsChrome))).toBe(false)
    expect(phoneOrTablet(device(UA.windowsChrome, { touchPoints: 10 }))).toBe(false) // a touch-screen laptop has a trackpad too
    expect(phoneOrTablet(device(UA.linuxFirefox))).toBe(false)
    expect(installWay(device(UA.windowsChrome), true)).toBeNull() // even when Chrome offers to install
  })
})

describe('how it is added', () => {
  it("Android's Chrome, Edge or Samsung Internet: the browser's own Install, once it offers it", () => {
    expect(installWay(device(UA.androidChrome), true)).toBe('prompt')
    // Not offered: the app is on this phone already (or this browser can't), so nothing to show.
    expect(installWay(device(UA.androidChrome), false)).toBeNull()
  })

  it('iPhone and iPad: the Share steps, in Safari and the other browsers, not in an app’s own browser', () => {
    expect(installWay(device(UA.iphoneSafari), false)).toBe('ios')
    expect(installWay(device(UA.iphoneChrome), false)).toBe('ios')
    expect(installWay(device(UA.ipad, { touchPoints: 5, touchOnly: true }), false)).toBe('ios')
    expect(installWay(device(UA.iphoneInstagram), false)).toBeNull()
    expect(installWay(device(UA.iphoneGoogleApp), false)).toBeNull()
  })

  it("Firefox on Android: its menu's Install", () => {
    expect(installWay(device(UA.androidFirefox), false)).toBe('menu')
  })

  it('nothing once opened as the app', () => {
    expect(installWay(device(UA.iphoneSafari, { standalone: true }), false)).toBeNull()
    expect(installWay(device(UA.androidChrome, { standalone: true }), true)).toBeNull()
  })
})

describe('the person decides', () => {
  const now = Date.parse('2026-11-01T10:00:00Z')
  const days = (n: number) => now + n * 24 * 3600_000

  it('offered to start with', () => expect(shouldOffer({}, now)).toBe(true))

  it('"Not now" waits two weeks; a second "Not now" and it stops coming up', () => {
    const once = declineAnswer({}, now)
    expect(shouldOffer(once, days(13))).toBe(false)
    expect(shouldOffer(once, days(14))).toBe(true)
    const twice = declineAnswer(once, days(14))
    expect(shouldOffer(twice, days(400))).toBe(false)
  })

  it('added, or shown how: not again', () => expect(shouldOffer({ done: true }, days(400))).toBe(false))
})
