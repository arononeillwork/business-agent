// Connecting a speaker (the Music page's "Connect a speaker", src/components/SpeakerSetup.tsx): which
// kind of device this is, for the steps that fit it, and a short chime to check the sound comes out of
// the speaker. A browser can't pair a Bluetooth speaker itself (Web Bluetooth only reaches small
// low-energy gadgets, never audio), so the device that plays the music pairs it in its own settings, once.

export type SpeakerPlatform = 'ios' | 'android' | 'windows' | 'mac' | 'other'

/** The kind of device, from its browser's user agent. An iPad's Safari says it's a Mac, but has a touch screen. */
export function platformOf(userAgent: string, touchPoints = 0): SpeakerPlatform {
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Windows/i.test(userAgent)) return 'windows'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'mac'
  return 'other'
}

/** This device's kind. */
export const thisPlatform = (): SpeakerPlatform =>
  typeof navigator === 'undefined' ? 'other' : platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0)

/** The chime's notes (C, E and G), one after another, each left to ring. */
const NOTES = [523.25, 659.25, 783.99]
const STEP = 0.18
const RING = 1.4

/** A soft three-note chime as a WAV file (16-bit mono), made here so there's nothing to download. */
export function chimeWav(sampleRate = 22050): Uint8Array<ArrayBuffer> {
  const length = Math.round(sampleRate * (STEP * (NOTES.length - 1) + RING))
  const samples = new Float32Array(length)
  NOTES.forEach((hz, i) => {
    const start = Math.round(i * STEP * sampleRate)
    for (let n = 0; start + n < length; n++) {
      const s = n / sampleRate
      // A quick start (no click), then fading away; a quieter octave above makes it a bell rather than a beep.
      const level = Math.min(1, s / 0.005) * Math.exp(-s * 4)
      samples[start + n] += level * 0.25 * (Math.sin(2 * Math.PI * hz * s) + 0.3 * Math.sin(4 * Math.PI * hz * s))
    }
  })
  const bytes = length * 2
  const wav = new DataView(new ArrayBuffer(44 + bytes))
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(at + i, s.charCodeAt(i)) }
  text(0, 'RIFF'); wav.setUint32(4, 36 + bytes, true); text(8, 'WAVE')
  text(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true)
  wav.setUint32(24, sampleRate, true); wav.setUint32(28, sampleRate * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true)
  text(36, 'data'); wav.setUint32(40, bytes, true)
  for (let i = 0; i < length; i++) wav.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff), true)
  return new Uint8Array(wav.buffer)
}

/**
 * Plays the chime wherever this device plays sound: its own speaker, or the Bluetooth or AirPlay speaker
 * it's connected to. An audio element rather than Web Audio, so an iPhone plays it with the ringer off too,
 * as it does the music. Done when it has finished.
 */
export async function playChime(): Promise<void> {
  const url = URL.createObjectURL(new Blob([chimeWav()], { type: 'audio/wav' }))
  const audio = new Audio(url)
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('The test sound didn’t play'))
      audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
