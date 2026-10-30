// The camera upload server, with a camera played by curl (an FTP client like the cameras' own) and
// a stand-in for the app's Worker: logins, pictures kept for the Cameras page, video passed on (or
// dropped when nothing moved), tried again when the Worker can't take it, FTPS and the PROXY header.
import { execFile, execFileSync } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { connect } from 'node:net'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseProxyHeader, resolvePath } from './ftp'
import { keepVideo, moved, mp4Seconds } from './motion'
import { portList, start } from './server'

const has = (cmd: string, args: string[]) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true } catch { return false } }
const hasCurl = has('curl', ['--version'])
const hasFfmpeg = has('ffmpeg', ['-version'])
const hasOpenssl = has('openssl', ['version'])

/** An MP4's boxes: ftyp, then moov (with an mvhd saying how long it is) before or after mdat. */
function mp4(seconds: number, { moovLast = false, v1 = false } = {}) {
  const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]) }
  const mvhd = Buffer.alloc(v1 ? 112 : 100)
  mvhd[0] = v1 ? 1 : 0
  if (v1) { mvhd.writeUInt32BE(1000, 20); mvhd.writeBigUInt64BE(BigInt(seconds * 1000), 24) } else { mvhd.writeUInt32BE(600, 12); mvhd.writeUInt32BE(seconds * 600, 16) }
  const moov = box('moov', box('mvhd', mvhd))
  const parts = [box('ftyp', Buffer.from('isom0000')), box('mdat', Buffer.alloc(5000, 7))]
  return Buffer.concat(moovLast ? [...parts, moov] : [parts[0], moov, parts[1]])
}

describe('camera upload rules', () => {
  it('read the PROXY header a proxy puts first', () => {
    expect(parseProxyHeader(Buffer.from('PROXY TCP4 81.2.3.4 10.0.0.1 51000 21\r\nUSER x'))).toEqual({ from: '81.2.3.4', length: 39 })
    expect(parseProxyHeader(Buffer.from('PROXY TCP4 81.2'))).toBe('more')
    expect(parseProxyHeader(Buffer.from('USER cam'))).toBeNull()
    const v2 = Buffer.concat([Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a, 0x21, 0x11, 0x00, 0x0c]), Buffer.from([81, 2, 3, 4, 10, 0, 0, 1, 0xc7, 0x38, 0, 21])])
    expect(parseProxyHeader(v2)).toEqual({ from: '81.2.3.4', length: 28 })
  })

  it('keep paths inside the root', () => {
    expect(resolvePath('/', 'Counter/2026')).toBe('/Counter/2026')
    expect(resolvePath('/Counter', '../../..')).toBe('/')
    expect(resolvePath('/a', '\\b\\c.mp4')).toBe('/b/c.mp4')
    expect(portList('30000-30003,30010')).toEqual([30000, 30001, 30002, 30003, 30010])
  })

  it('see movement, not a change of light', () => {
    const still = new Uint8Array(64 * 36).fill(100)
    expect(moved(still, still)).toBe(false)
    expect(moved(still, new Uint8Array(64 * 36).fill(160))).toBe(false)
    const someone = still.slice()
    for (let i = 0; i < 40; i++) someone[600 + i] = 20
    expect(moved(still, someone)).toBe(true)
  })

  it('keep video with movement around it, or when the camera sends no pictures', () => {
    const t = 1_000_000
    expect(keepVideo([], t, t + 30_000)).toEqual({ keep: true, motion: true })
    expect(keepVideo([{ at: t + 5000, moved: false }, { at: t + 10_000, moved: false }], t, t + 30_000)).toEqual({ keep: false, motion: false })
    expect(keepVideo([{ at: t + 5000, moved: false }, { at: t + 35_000, moved: true }], t, t + 30_000).keep).toBe(true)
    expect(keepVideo([{ at: t - 50_000, moved: true }, { at: t + 5000, moved: false }], t, t + 30_000).keep).toBe(false)
  })

  it('read how long an MP4 is, wherever its header is', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp4-'))
    for (const [name, buf] of [['a', mp4(30)], ['b', mp4(45, { moovLast: true })], ['c', mp4(12, { v1: true })], ['d', Buffer.from('not a video')]] as const) {
      writeFileSync(join(dir, name), buf)
    }
    expect(await mp4Seconds(join(dir, 'a'))).toBe(30)
    expect(await mp4Seconds(join(dir, 'b'))).toBe(45)
    expect(await mp4Seconds(join(dir, 'c'))).toBe(12)
    expect(await mp4Seconds(join(dir, 'd'))).toBeNull()
  })
})

describe.skipIf(!hasCurl)('the camera upload server, with curl as the camera', () => {
  const KEY = 'test-key'
  const USER = 'cam0a1b2c3d'
  const PASSWORD = '0123456789abcdef'
  const dir = mkdtempSync(join(tmpdir(), 'cam-'))
  const clips: { headers: IncomingMessage['headers']; body: Buffer }[] = []
  const settings = { keep_video: 'all', failNext: 0 }
  let app: Server
  let s: ReturnType<typeof start>
  let ftpPort = 0
  let tlsServer: ReturnType<typeof start> | null = null
  let tlsPort = 0

  beforeAll(async () => {
    app = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = Buffer.concat(chunks)
      if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401).end(); return }
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/camera-uploads/login') {
        const { user, password } = JSON.parse(body.toString()) as { user: string; password: string }
        if (user !== USER || password !== PASSWORD) { res.writeHead(401).end('{"error":"no"}'); return }
        res.end(JSON.stringify({ camera: { keep_video: settings.keep_video } }))
      } else if (req.url === '/api/camera-uploads/clip') {
        if (settings.failNext > 0) { settings.failNext--; res.writeHead(503).end('{"error":"Google Drive is busy"}'); return }
        clips.push({ headers: req.headers, body })
        res.end('{"ok":true}')
      } else res.end('{"ok":true}')
    })
    await new Promise<void>(ok => app.listen(0, () => ok()))
    const appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
    const base = 42000 + Math.floor(Math.random() * 2000) * 4
    s = start({ appUrl, key: KEY, ftpPort: 0, httpPort: 0, passivePorts: [base, base + 1], publicIp: '127.0.0.1', retryMs: 50, aroundMs: 300, log: () => {} })
    await s.ready
    ftpPort = (s.ftp.control.address() as AddressInfo).port
    if (hasOpenssl) {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
        '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
      tlsServer = start({ appUrl, key: KEY, ftpPort: 0, httpPort: 0, passivePorts: [base + 2, base + 3], publicIp: '127.0.0.1', aroundMs: 300, log: () => {},
        tls: { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) } })
      await tlsServer.ready
      tlsPort = (tlsServer.ftp.control.address() as AddressInfo).port
    }
  })
  afterAll(async () => {
    await s?.close()
    await tlsServer?.close()
    app?.close()
  })

  const curl = (args: string[]) => new Promise<{ code: number; err: string }>(resolve => {
    execFile('curl', ['-sS', '--max-time', '20', ...args], (e, _out, err) => resolve({ code: e ? (e as { code?: number }).code ?? 1 : 0, err }))
  })
  const upload = (file: string, { port = ftpPort, password = PASSWORD, extra = [] as string[] } = {}) =>
    curl(['-T', file, `ftp://127.0.0.1:${port}/Counter/2026/10/30/`, '--user', `${USER}:${password}`, '--ftp-create-dirs', ...extra])
  const http = (path: string, key = KEY) => fetch(`http://127.0.0.1:${(s.http.address() as AddressInfo).port}${path}`, { headers: { authorization: `Bearer ${key}` } })
  const until = async (check: () => boolean, ms = 5000) => {
    for (const end = Date.now() + ms; !check() && Date.now() < end;) await new Promise(r => setTimeout(r, 25))
    return check()
  }

  it('turns away a wrong password', async () => {
    writeFileSync(join(dir, 'x.jpg'), 'x')
    expect((await upload(join(dir, 'x.jpg'), { password: 'wrong' })).code).not.toBe(0)
  })

  it('keeps the latest picture for the Cameras page, for the key only', async () => {
    writeFileSync(join(dir, 'Counter_00_20261030101500.jpg'), Buffer.from('first picture'))
    expect(await upload(join(dir, 'Counter_00_20261030101500.jpg'))).toMatchObject({ code: 0 })
    writeFileSync(join(dir, 'Counter_00_20261030101505.jpg'), Buffer.from('second picture'))
    // Passive mode the old way (PASV) as well as EPSV.
    expect(await upload(join(dir, 'Counter_00_20261030101505.jpg'), { extra: ['--disable-epsv'] })).toMatchObject({ code: 0 })
    expect(await until(() => s.cameras.get(USER)?.picture?.bytes.length === 14)).toBe(true)
    const res = await http(`/picture/${USER}`)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('second picture')
    expect(res.headers.get('x-taken-at')).toBeTruthy()
    expect((await http(`/picture/${USER}`, 'wrong')).status).toBe(401)
    expect((await http('/picture/cam00000000')).status).toBe(404)
    const status = await (await http(`/status?users=${USER},cam00000000`)).json() as { cameras: Record<string, { picture_at: string }> }
    expect(Object.keys(status.cameras)).toEqual([USER])
  })

  it('passes video on to the app, tried again when the app can’t take it', async () => {
    settings.keep_video = 'all'
    settings.failNext = 1
    const video = mp4(20)
    writeFileSync(join(dir, 'Counter_00_20261030101510.mp4'), video)
    expect(await upload(join(dir, 'Counter_00_20261030101510.mp4'))).toMatchObject({ code: 0 })
    expect(await until(() => clips.length === 1)).toBe(true)
    expect(settings.failNext).toBe(0)
    const [clip] = clips
    expect(clip.body.equals(video)).toBe(true)
    expect(clip.headers).toMatchObject({ 'x-camera': USER, 'x-file-name': 'Counter_00_20261030101510.mp4', 'x-seconds': '20', 'content-type': 'video/mp4' })
    expect(Date.parse(String(clip.headers['x-ended-at']))).toBeGreaterThan(Date.now() - 60_000)
  })

  it.skipIf(!hasFfmpeg)('drops video in which nothing moved, when the camera keeps movement only', async () => {
    settings.keep_video = 'motion'
    // The camera's settings changed: its login is asked again.
    s.cameras.delete(USER)
    s.forgetLogins()
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=320x180', '-frames:v', '1', join(dir, 'still.jpg')])
    const before = clips.length
    expect(await upload(join(dir, 'still.jpg'))).toMatchObject({ code: 0 })
    await new Promise(r => setTimeout(r, 400))
    expect(await upload(join(dir, 'still.jpg'))).toMatchObject({ code: 0 })
    expect(await until(() => (s.cameras.get(USER)?.seen.length ?? 0) === 2)).toBe(true)
    expect(s.cameras.get(USER)!.seen[1].moved).toBe(false)
    writeFileSync(join(dir, 'still.mp4'), mp4(0))
    expect(await upload(join(dir, 'still.mp4'))).toMatchObject({ code: 0 })
    expect(await until(() => s.cameras.get(USER)!.skipped === 1)).toBe(true)
    expect(clips.length).toBe(before)
  })

  it.skipIf(!hasOpenssl)('takes uploads over FTPS', { timeout: 30_000 }, async () => {
    writeFileSync(join(dir, 'tls.jpg'), Buffer.from('encrypted picture'))
    expect(await upload(join(dir, 'tls.jpg'), { port: tlsPort, extra: ['--ssl-reqd', '-k'] })).toMatchObject({ code: 0 })
    expect(await until(() => Buffer.from(tlsServer!.cameras.get(USER)?.picture?.bytes ?? []).toString() === 'encrypted picture')).toBe(true)
  })

  it('behind a proxy, needs its header first', async () => {
    const p = start({ appUrl: 'http://127.0.0.1:9', key: KEY, ftpPort: 0, httpPort: 0, passivePorts: [], proxyProtocol: true, log: () => {} })
    await p.ready
    const port = (p.ftp.control.address() as AddressInfo).port
    const greet = (first?: string) => new Promise<string>(resolve => {
      const sock = connect(port, '127.0.0.1', () => { if (first) sock.write(first) })
      let got = ''
      sock.on('data', d => { got += d; if (got.includes('\r\n')) { sock.destroy(); resolve(got) } })
      sock.on('close', () => resolve(got))
    })
    expect(await greet('PROXY TCP4 81.2.3.4 10.0.0.1 51000 21\r\n')).toMatch(/^220 /)
    expect(await greet('USER cam0a1b2c3d\r\n')).toBe('')
    await p.close()
  }, 15_000)
})
