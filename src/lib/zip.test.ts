import { describe, expect, it } from 'vitest'
import { crc32, zipStore } from './zip'

/** The files in a stored ZIP, read back from its central directory (as any unzip would). */
async function unzip(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(buf.buffer)
  const end = buf.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out: { name: string; data: Uint8Array; crc: number }[] = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true), size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(buf.slice(at + 46, at + 46 + nameLength))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true)
    out.push({ name, data: buf.slice(start, start + size), crc })
    at += 46 + nameLength
  }
  return out
}

describe('crc32', () => {
  it('is the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('zipStore', () => {
  it('keeps each file as it is, with its name (accents and all) and its CRC', async () => {
    const files = [
      { name: 'Iced oat latte.jpg', data: new Uint8Array([1, 2, 3, 4]) },
      { name: 'Café terrace (2).mp4', data: new TextEncoder().encode('a video') },
    ]
    const back = await unzip(zipStore(files))
    expect(back.map(f => f.name)).toEqual(['Iced oat latte.jpg', 'Café terrace (2).mp4'])
    expect(back.map(f => [...f.data])).toEqual(files.map(f => [...f.data]))
    expect(back.map(f => f.crc)).toEqual(files.map(f => crc32(f.data)))
  })

  it('makes an empty ZIP of nothing', async () => {
    expect(await unzip(zipStore([]))).toEqual([])
  })
})
