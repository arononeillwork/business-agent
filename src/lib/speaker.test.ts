// Connect a speaker: the steps shown fit the device in hand, and the test chime is a proper WAV file.
import { describe, expect, it } from 'vitest'
import { chimeWav, platformOf } from './speaker'

describe('connect a speaker', () => {
  it('tells the device apart from its browser, an iPad included (its Safari says it is a Mac)', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1')).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 5)).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 0)).toBe('mac')
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/131.0 Safari/537.36')).toBe('android')
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('windows')
    expect(platformOf('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36')).toBe('other')
  })

  it('makes the chime as a 16-bit mono WAV that never clips', () => {
    const wav = chimeWav(8000)
    const view = new DataView(wav.buffer)
    const text = (at: number, n: number) => String.fromCharCode(...wav.slice(at, at + n))
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(8000)
    expect(view.getUint16(34, true)).toBe(16)
    const bytes = view.getUint32(40, true)
    expect(wav.length).toBe(44 + bytes)
    expect(bytes / 2 / 8000).toBeCloseTo(1.76, 2) // the three notes, the last left to ring
    let peak = 0
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)))
    expect(peak).toBeGreaterThan(0x7fff * 0.2) // loud enough to hear
    expect(peak).toBeLessThan(0x7fff) // and not clipped
    expect(Math.abs(view.getInt16(wav.length - 2, true))).toBeLessThan(0x7fff * 0.01) // rung out by the end
  })
})
