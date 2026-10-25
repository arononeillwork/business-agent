import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RenderError, checkJob, frames, holdFrames, musicChain, readProbe, slideshowList, videoArgs } from './ffmpeg'

const job = (patch: Record<string, unknown> = {}) => ({
  kind: 'story', source: { url: 'https://x.test/media/p.jpg', type: 'image' }, track: { url: 'https://x.test/media/t.mp3', start: 12 },
  seconds: 15, music_volume: 80, original_volume: 100, fade_in: true, fade_out: true, ...patch,
})

describe('render jobs', () => {
  it('are checked, with plain reasons', () => {
    expect(checkJob(job())).toMatchObject({ kind: 'story', seconds: 15, track: { start: 12 } })
    expect(() => checkJob(job({ kind: 'post' }))).toThrow(RenderError)
    expect(() => checkJob(job({ seconds: 61 }))).toThrow('seconds must be between 3 and 60')
    expect(() => checkJob(job({ source: { url: 'file:///etc/passwd', type: 'image' } }))).toThrow('needs a web address')
    expect(() => checkJob(job({ music_volume: 120 }))).toThrow('music_volume')
    // Reels: a video up to 15 minutes, photos up to 3.
    expect(checkJob(job({ kind: 'reel', source: { url: 'https://x.test/v.mp4', type: 'video' }, seconds: 900 })).seconds).toBe(900)
    expect(() => checkJob(job({ kind: 'reel', seconds: 300 }))).toThrow('between 3 and 180')
  })

  it('cut photos in order, inside the length', () => {
    const photos = ['https://x.test/a.jpg', 'https://x.test/b.jpg', 'https://x.test/c.jpg']
    expect(checkJob(job({ kind: 'reel', photos, seconds: 9 })).cuts).toEqual([0, 3, 6])
    expect(() => checkJob(job({ kind: 'reel', photos, cuts: [0, 4, 2], seconds: 9 }))).toThrow('cuts')
    expect(() => checkJob(job({ kind: 'reel', photos: photos.slice(0, 1), seconds: 9 }))).toThrow('2 to 10 photos')
  })

  it('keep labels short', () => {
    expect(checkJob(job({ label: `  ♫ ${'x'.repeat(200)}` })).label).toHaveLength(80)
    expect(checkJob(job({ label: '   ' })).label).toBeUndefined()
  })

  it('fade the music in and out inside the clip', () => {
    expect(musicChain({ music_volume: 80, fade_in: true, fade_out: true }, 15))
      .toBe('volume=0.8,afade=t=in:st=0:d=0.8,afade=t=out:st=13.5:d=1.5,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo')
    expect(musicChain({ music_volume: 100, fade_in: false, fade_out: true }, 3)).toContain('afade=t=out:st=2:d=1')
  })

  it('hold each photo for whole frames that add up to the length', () => {
    expect(frames(60)).toBe(1800)
    const counts = holdFrames([0, 2.03, 4.5], 7)
    expect(counts).toEqual([61, 74, 75])
    expect(counts.reduce((a, b) => a + b)).toBe(frames(7))
    expect(slideshowList(['/t/a.mp4', '/t/b.mp4'])).toBe("ffconcat version 1.0\nfile '/t/a.mp4'\nfile '/t/b.mp4'\n")
  })

  it('copy an H.264 video and mix its sound with the music; re-encode anything else', () => {
    const j = checkJob(job({ kind: 'reel', source: { url: 'https://x.test/v.mp4', type: 'video' }, seconds: 900, original_volume: 40 }))
    const h264 = { duration: 12, codec: 'h264', pixFmt: 'yuv420p', width: 1080, height: 1920, hasAudio: true }
    const args = videoArgs('v', h264, 't', j, 'o')
    expect(args.join(' ')).toContain('-c:v copy')
    expect(args.join(' ')).toContain('[0:a:0]volume=0.4')
    expect(args.join(' ')).toContain('amix=inputs=2:duration=first')
    expect(args[args.indexOf('-t') + 1]).toBe('12')
    // What iPhones record: copied, tagged for Apple and Instagram; silent, so just the music.
    const iphone = videoArgs('v', { ...h264, codec: 'hevc', hasAudio: false }, 't', j, 'o').join(' ')
    expect(iphone).toContain('-c:v copy -tag:v hvc1')
    expect(iphone).not.toContain('amix')
    expect(videoArgs('v', { ...h264, codec: 'mpeg4' }, 't', j, 'o').join(' ')).toContain('-c:v libx264')
    expect(() => videoArgs('v', { ...h264, duration: 2 }, 't', j, 'o')).toThrow('too short')
  })

  it('read what ffprobe says', () => {
    const p = readProbe(JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 720, height: 1280 }, { codec_type: 'audio' }], format: { duration: '8.04' } }))
    expect(p).toEqual({ duration: 8.04, codec: 'h264', pixFmt: 'yuv420p', width: 720, height: 1280, hasAudio: true })
    expect(() => readProbe(JSON.stringify({ streams: [{ codec_type: 'audio' }] }))).toThrow('no video')
  })
})

// The real thing, where ffmpeg is installed (the render deploy installs it; skipped elsewhere).
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

describe.skipIf(!hasFfmpeg)('the render service, with ffmpeg', () => {
  let dir: string
  let files: Server
  let render: Server
  let base: string
  let url: string

  const ff = (...args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
  const probe = (file: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries',
    'stream=codec_type,codec_name,width,height,nb_read_packets:format=duration', '-of', 'json', file]).toString()) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; nb_read_packets: string }[]; format: { duration: string } }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'render-test-'))
    ff('-f', 'lavfi', '-i', 'testsrc2=size=1200x1600', '-frames:v', '1', join(dir, 'photo.jpg'))
    ff('-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'video.mp4'))
    ff('-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '10', '-c:a', 'libmp3lame', join(dir, 'track.mp3'))
    files = createServer((req, res) => {
      try { res.end(readFileSync(join(dir, (req.url ?? '').slice(1)))) } catch { res.statusCode = 404; res.end() }
    }).listen(0)
    base = `http://127.0.0.1:${(files.address() as AddressInfo).port}`
    process.env.RENDER_LISTEN = '0'
    render = (await import('./server')).server.listen(0)
    url = `http://127.0.0.1:${(render.address() as AddressInfo).port}/render`
  }, 60_000)

  afterAll(() => {
    files?.close()
    render?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  const post = async (j: Record<string, unknown>, name: string) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(j) })
    if (!res.ok) return { status: res.status, error: (await res.json() as { error: string }).error }
    writeFileSync(join(dir, name), Buffer.from(await res.arrayBuffer()))
    return { status: res.status, probe: probe(join(dir, name)) }
  }

  it('makes a photo story: 1080×1920, H.264 and AAC, exactly as long as asked', async () => {
    const r = await post(job({ source: { url: `${base}/photo.jpg`, type: 'image' }, track: { url: `${base}/track.mp3`, start: 2 }, seconds: 6, label: '♫ Test · Café' }), 'story.mp4')
    expect(r.status).toBe(200)
    const v = r.probe!.streams.find(s => s.codec_type === 'video')!
    expect([v.codec_name, v.width, v.height, Number(v.nb_read_packets)]).toEqual(['h264', 1080, 1920, 180])
    expect(r.probe!.streams.find(s => s.codec_type === 'audio')?.codec_name).toBe('aac')
    expect(Number(r.probe!.format.duration)).toBeCloseTo(6, 1)
  }, 60_000)

  it('mixes music into a video, keeping its picture and length', async () => {
    const r = await post(job({ kind: 'reel', source: { url: `${base}/video.mp4`, type: 'video' }, track: { url: `${base}/track.mp3`, start: 0 }, seconds: 900, original_volume: 30 }), 'reel.mp4')
    expect(r.status).toBe(200)
    expect(r.probe!.streams.map(s => s.codec_type).sort()).toEqual(['audio', 'video'])
    expect(Number(r.probe!.format.duration)).toBeCloseTo(4, 0)
  }, 60_000)

  it('makes a reel from photos, cut where asked', async () => {
    const photo = `${base}/photo.jpg`
    const r = await post(job({ kind: 'reel', photos: [photo, photo, photo], cuts: [0, 1.5, 3], track: { url: `${base}/track.mp3`, start: 0 }, seconds: 5 }), 'slides.mp4')
    expect(r.status).toBe(200)
    expect(Number(r.probe!.streams.find(s => s.codec_type === 'video')!.nb_read_packets)).toBe(150)
  }, 60_000)

  it('says plainly when a file is missing', async () => {
    expect(await post(job({ source: { url: `${base}/nope.jpg`, type: 'image' }, track: { url: `${base}/track.mp3`, start: 0 } }), 'x.mp4'))
      .toEqual({ status: 400, error: 'Couldn’t fetch nope.jpg (404)' })
  })
})
