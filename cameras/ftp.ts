// A small FTP server for cameras (Reolink and others that upload by FTP), with FTPS (AUTH TLS) when
// it has a certificate. Only what cameras do: log in, make and change folders, upload files in
// passive mode, and the few questions they ask on the way (SIZE, LIST). Nothing is kept as a file
// tree: each upload is written to a temporary file and handed to `onFile`, which owns it from then
// on. Logins are checked by `login` (the app's Worker, through server.ts).
//
// Behind a proxy that adds a PROXY protocol header (Fly.io's proxy_proto), the header is read first
// and gives the camera's own address; a data connection then has to come from the same address as
// its control connection.
import { createServer, type Server, type Socket } from 'node:net'
import { TLSSocket, createSecureContext, type SecureContext } from 'node:tls'
import { Duplex } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface Login { user: string; [k: string]: unknown }

export interface Upload {
  login: Login
  /** The path the camera gave, from the root ("/Counter/2026/10/30/Counter_00_20261030101500.mp4"). */
  path: string
  /** The temporary file with its bytes; onFile removes it when it's done with it. */
  file: string
  size: number
  /** When the last byte arrived. */
  at: Date
}

export interface FtpOptions {
  /** The camera's username and password: who it is, or null to turn it away. */
  login: (user: string, password: string, from: string | null) => Promise<Login | null>
  onFile: (u: Upload) => void
  /** The address cameras reach the server at, for passive mode (dotted IPv4). */
  publicIp: () => string | null
  /** The ports for passive data connections, each listened on. */
  passivePorts: number[]
  tls?: { key: string | Buffer; cert: string | Buffer } | null
  /** Every connection starts with a PROXY protocol header (behind Fly.io's proxy_proto). */
  proxyProtocol?: boolean
  /** Largest upload taken (bytes): more is refused and dropped. */
  maxBytes: number
  /** Where uploads are written while they come in. */
  dir?: string
  greeting?: string
  log?: (line: string) => void
}

const IDLE_MS = 5 * 60_000
const DATA_WAIT_MS = 30_000
const PROXY_WAIT_MS = 5000
const MAX_LINE = 2048
/** Connections at once, every camera of every business together. */
const MAX_SESSIONS = 2000
/** Commands answered before logging in. */
const OPEN = new Set(['USER', 'PASS', 'AUTH', 'PBSZ', 'PROT', 'FEAT', 'SYST', 'QUIT', 'NOOP', 'OPTS', 'HELP'])

/** A PROXY protocol header (v1 text or v2 binary) at the start of a connection: the client's address. */
export function parseProxyHeader(buf: Buffer): { from: string | null; length: number } | 'more' | null {
  if (buf.length >= 6 && buf.subarray(0, 6).toString('latin1') === 'PROXY ') {
    const end = buf.indexOf('\r\n')
    if (end < 0) return buf.length > 107 ? null : 'more'
    const parts = buf.subarray(0, end).toString('latin1').split(' ')
    return { from: parts[1] === 'TCP4' || parts[1] === 'TCP6' ? parts[2] ?? null : null, length: end + 2 }
  }
  const SIG = Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a])
  const head = buf.subarray(0, Math.min(12, buf.length))
  if (!SIG.subarray(0, head.length).equals(head)) return null
  if (buf.length < 16) return 'more'
  const length = 16 + buf.readUInt16BE(14)
  if (buf.length < length) return 'more'
  const family = buf[13] >> 4
  if (family === 1 && length >= 28) return { from: [...buf.subarray(16, 20)].join('.'), length }
  if (family === 2 && length >= 52) {
    const words = [] as string[]
    for (let i = 0; i < 16; i += 2) words.push(buf.readUInt16BE(16 + i).toString(16))
    return { from: words.join(':'), length }
  }
  return { from: null, length }
}

/**
 * The client's address from the PROXY header the proxy sends before anything else (undefined: no
 * header came, so the connection is dropped). What came after the header is put back.
 */
function proxied(socket: Socket): Promise<string | null | undefined> {
  return new Promise(resolve => {
    let buf = Buffer.alloc(0)
    const done = (from: string | null | undefined, rest: Buffer) => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.pause()
      if (rest.length) socket.unshift(rest)
      resolve(from)
    }
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const h = parseProxyHeader(buf)
      if (h === 'more') return
      if (h === null) return done(undefined, buf)
      done(h.from, buf.subarray(h.length))
    }
    const timer = setTimeout(() => done(undefined, buf), PROXY_WAIT_MS)
    socket.on('data', onData)
  })
}

/**
 * A socket as a plain stream, for TLS to read through: what was already read from it (put back
 * after a PROXY header) reaches the TLS handshake too, which it wouldn't if TLS took over the socket.
 */
class Through extends Duplex {
  private readonly s: Socket
  constructor(s: Socket) {
    super()
    this.s = s
    s.on('data', (d: Buffer) => { if (!this.push(d)) s.pause() })
    s.once('end', () => this.push(null))
    s.once('close', () => this.destroy())
    s.on('error', e => this.destroy(e))
  }
  _read() { this.s.resume() }
  _write(chunk: Buffer, _: BufferEncoding, done: (e?: Error | null) => void) { this.s.write(chunk, done) }
  _final(done: () => void) { this.s.end(done) }
  _destroy(e: Error | null, done: (e?: Error | null) => void) { this.s.destroy(); done(e) }
}
const secure = (s: Socket, context: SecureContext) => new TLSSocket(new Through(s), { isServer: true, secureContext: context })

const remote = (s: Socket) => s.remoteAddress?.replace(/^::ffff:/, '') ?? null

/** A path from the camera, made absolute and tidy ("..", repeated "/" and "\" taken care of). */
export function resolvePath(cwd: string, arg: string) {
  const a = arg.replace(/\\/g, '/') || '.'
  const p = posix.normalize(a.startsWith('/') ? a : posix.join(cwd, a))
  return (p.startsWith('/') ? p : `/${p}`).replace(/\/+$/, '') || '/'
}

interface Waiting { session: Session; until: number }

export class FtpServer {
  readonly control: Server
  private readonly data = new Map<number, Server>()
  private readonly waiting = new Map<number, Waiting>()
  private readonly context: SecureContext | null
  private next = 0
  private readonly sessions = new Set<Session>()
  readonly o: FtpOptions

  constructor(o: FtpOptions) {
    this.o = o
    this.context = o.tls ? createSecureContext({ key: o.tls.key, cert: o.tls.cert }) : null
    this.control = createServer(socket => { void this.connect(socket) })
    for (const port of o.passivePorts) {
      const s = createServer(socket => { void this.dataConnection(port, socket) })
      s.on('error', e => this.log(`passive port ${port}: ${e.message}`))
      this.data.set(port, s)
    }
  }

  get tls() { return this.context }
  log(line: string) { (this.o.log ?? console.log)(line) }

  async listen(port: number, host?: string) {
    await Promise.all([...this.data].map(([p, s]) => new Promise<void>((ok, fail) => { s.once('error', fail); s.listen(p, host, () => ok()) })))
    await new Promise<void>((ok, fail) => { this.control.once('error', fail); this.control.listen(port, host, () => ok()) })
  }

  async close() {
    for (const s of this.sessions) s.end()
    await Promise.all([this.control, ...this.data.values()].map(s => new Promise<void>(ok => s.close(() => ok()))))
  }

  /** Who's connecting: from the PROXY header behind a proxy (undefined: it didn't send one). */
  private async origin(socket: Socket) {
    if (!this.o.proxyProtocol) return remote(socket)
    const from = await proxied(socket)
    return from === undefined ? undefined : from ?? null
  }

  private async connect(socket: Socket) {
    socket.setNoDelay(true)
    socket.on('error', () => {})
    const from = await this.origin(socket)
    if (from === undefined) { socket.destroy(); return }
    if (this.sessions.size >= MAX_SESSIONS) { socket.end('421 Too busy just now; try again in a minute\r\n'); return }
    const session = new Session(this, socket, from)
    this.sessions.add(session)
    socket.once('close', () => { this.sessions.delete(session); session.closed() })
    session.start()
  }

  /** A passive port for this session to connect its data to (a free one, round the pool). */
  reserve(session: Session): number | null {
    const ports = this.o.passivePorts
    const now = Date.now()
    for (const [p, w] of this.waiting) if (w.until < now || w.session === session) this.waiting.delete(p)
    for (let i = 0; i < ports.length; i++) {
      const p = ports[(this.next + i) % ports.length]
      if (!this.waiting.has(p)) {
        this.next = (this.next + i + 1) % ports.length
        this.waiting.set(p, { session, until: now + DATA_WAIT_MS })
        return p
      }
    }
    return null
  }

  private async dataConnection(port: number, socket: Socket) {
    socket.on('error', () => {})
    const from = await this.origin(socket)
    if (from === undefined) { socket.destroy(); return }
    const w = this.waiting.get(port)
    this.waiting.delete(port)
    // Nobody waiting on that port, or it's someone else's connection.
    if (!w || w.until < Date.now() || (from && w.session.from && from !== w.session.from)) { socket.destroy(); return }
    w.session.dataArrived(socket)
  }
}

class Session {
  private stream: Socket | TLSSocket
  private decoder = new StringDecoder('utf8')
  private buffer = ''
  private cwd = '/'
  private user: string | null = null
  private login: Login | null = null
  private failures = 0
  private secureData = false
  private dataSocket: Socket | TLSSocket | null = null
  private dataWaiter: ((s: Socket | TLSSocket) => void) | null = null
  private busy: Promise<void> = Promise.resolve()
  private renameFrom: string | null = null
  /** What this session uploaded, for a camera that asks the size back. */
  private sizes = new Map<string, number>()
  private idle: NodeJS.Timeout | null = null
  private ended = false
  private readonly server: FtpServer
  private readonly socket: Socket
  readonly from: string | null

  constructor(server: FtpServer, socket: Socket, from: string | null) {
    this.server = server
    this.socket = socket
    this.from = from
    this.stream = socket
  }

  start() {
    this.listen(this.socket)
    this.socket.resume()
    this.reply(220, this.server.o.greeting ?? 'Business Agent camera uploads')
  }

  private listen(s: Socket | TLSSocket) {
    this.decoder = new StringDecoder('utf8')
    s.on('data', (chunk: Buffer) => this.received(this.decoder.write(chunk)))
  }

  private touch() {
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => { this.reply(421, 'Idle for too long'); this.end() }, IDLE_MS)
  }

  private received(chunk: string) {
    this.touch()
    this.buffer += chunk
    if (this.buffer.length > MAX_LINE && !this.buffer.includes('\n')) { this.reply(500, 'Line too long'); this.end(); return }
    let i: number
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).replace(/\r$/, '')
      this.buffer = this.buffer.slice(i + 1)
      // One command at a time, in order (an upload finishes before the next is answered).
      this.busy = this.busy.then(() => this.command(line)).catch(e => {
        this.server.log(`ftp ${this.user ?? '-'}: ${e instanceof Error ? e.message : String(e)}`)
        this.reply(451, 'Something went wrong here; try again')
      })
    }
  }

  reply(code: number, text: string) {
    if (this.ended || this.stream.destroyed) return
    const lines = text.split('\n')
    this.stream.write(lines.length === 1 ? `${code} ${text}\r\n`
      : `${lines.map((l, i) => (i === lines.length - 1 ? `${code} ${l}` : i === 0 ? `${code}-${l}` : ` ${l}`)).join('\r\n')}\r\n`)
  }

  end() {
    if (this.ended) return
    this.ended = true
    this.dataSocket?.destroy()
    this.stream.end()
    setTimeout(() => this.socket.destroy(), 1000).unref()
  }

  closed() {
    this.ended = true
    if (this.idle) clearTimeout(this.idle)
    this.dataSocket?.destroy()
  }

  dataArrived(socket: Socket) {
    const ready = (s: Socket | TLSSocket) => {
      this.dataSocket?.destroy()
      this.dataSocket = s
      const w = this.dataWaiter
      this.dataWaiter = null
      w?.(s)
    }
    if (this.secureData && this.server.tls) {
      const t = secure(socket, this.server.tls)
      t.on('error', () => socket.destroy())
      t.once('secure', () => ready(t))
    } else ready(socket)
  }

  /** The data connection for the command just given (it may already be there). */
  private takeData(): Promise<Socket | TLSSocket> {
    if (this.dataSocket && !this.dataSocket.destroyed) {
      const s = this.dataSocket
      this.dataSocket = null
      return Promise.resolve(s)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.dataWaiter = null; reject(new Error('no data connection')) }, DATA_WAIT_MS)
      this.dataWaiter = s => { clearTimeout(timer); this.dataSocket = null; resolve(s) }
    })
  }

  private async command(line: string) {
    if (this.ended) return
    const space = line.indexOf(' ')
    const cmd = (space < 0 ? line : line.slice(0, space)).toUpperCase()
    const arg = space < 0 ? '' : line.slice(space + 1).trim()
    if (!cmd) return
    if (!this.login && !OPEN.has(cmd)) return this.reply(530, 'Log in first')
    switch (cmd) {
      case 'AUTH': {
        if (!this.server.tls || !/^(TLS|SSL|TLS-C)$/i.test(arg)) return this.reply(504, 'Only AUTH TLS is offered')
        if (this.stream instanceof TLSSocket) return this.reply(503, 'Already encrypted')
        this.reply(234, 'Go ahead with TLS')
        this.socket.pause()
        this.socket.removeAllListeners('data')
        const t = secure(this.socket, this.server.tls)
        t.on('error', () => this.socket.destroy())
        this.stream = t
        this.buffer = ''
        this.listen(t)
        return
      }
      case 'PBSZ': return this.reply(200, 'PBSZ=0')
      case 'PROT':
        if (/^P$/i.test(arg) && this.server.tls) { this.secureData = true; return this.reply(200, 'Data connections encrypted') }
        if (/^C$/i.test(arg)) { this.secureData = false; return this.reply(200, 'Data connections in the clear') }
        return this.reply(536, 'Protection level not offered')
      case 'USER':
        this.user = arg
        this.login = null
        return this.reply(331, 'Password, please')
      case 'PASS': {
        if (!this.user) return this.reply(503, 'Send USER first')
        const who = await this.server.o.login(this.user, arg, this.from).catch(e => {
          this.server.log(`login check failed: ${e instanceof Error ? e.message : String(e)}`)
          return undefined
        })
        if (who === undefined) return this.reply(421, 'Can’t check logins just now; try again in a minute')
        if (!who) {
          this.failures++
          await new Promise(r => setTimeout(r, 1000))
          this.reply(530, 'Username or password not right')
          if (this.failures >= 3) this.end()
          return
        }
        this.login = who
        return this.reply(230, 'Logged in')
      }
      case 'SYST': return this.reply(215, 'UNIX Type: L8')
      case 'FEAT': return this.reply(211, ['Features:', ...(this.server.tls ? ['AUTH TLS', 'PBSZ', 'PROT'] : []), 'EPSV', 'PASV', 'SIZE', 'UTF8', 'End'].join('\n'))
      case 'OPTS': return this.reply(200, 'OK')
      case 'HELP': return this.reply(214, 'Cameras upload here')
      case 'NOOP': return this.reply(200, 'OK')
      case 'QUIT': this.reply(221, 'Bye'); return this.end()
      case 'PWD': case 'XPWD': return this.reply(257, `"${this.cwd.replace(/"/g, '""')}" is the current folder`)
      case 'CWD': case 'XCWD': this.cwd = resolvePath(this.cwd, arg); return this.reply(250, 'OK')
      case 'CDUP': case 'XCUP': this.cwd = resolvePath(this.cwd, '..'); return this.reply(250, 'OK')
      case 'MKD': case 'XMKD': return this.reply(257, `"${resolvePath(this.cwd, arg).replace(/"/g, '""')}" made`)
      case 'RMD': case 'XRMD': case 'DELE': return this.reply(250, 'OK')
      case 'TYPE': case 'MODE': case 'STRU': return this.reply(200, 'OK')
      case 'ALLO': return this.reply(202, 'No need')
      case 'REST': return this.reply(arg === '0' ? 350 : 504, arg === '0' ? 'From the start' : 'Uploads start from the beginning')
      case 'RNFR': this.renameFrom = resolvePath(this.cwd, arg); return this.reply(350, 'And the new name?')
      case 'RNTO': {
        if (!this.renameFrom) return this.reply(503, 'Send RNFR first')
        const size = this.sizes.get(this.renameFrom)
        if (size !== undefined) this.sizes.set(resolvePath(this.cwd, arg), size)
        this.renameFrom = null
        return this.reply(250, 'OK')
      }
      case 'SIZE': {
        const size = this.sizes.get(resolvePath(this.cwd, arg))
        return size === undefined ? this.reply(550, 'No such file') : this.reply(213, String(size))
      }
      case 'MDTM': return this.reply(550, 'No such file')
      case 'PASV': case 'EPSV': {
        const ip = this.server.o.publicIp() ?? this.socket.localAddress?.replace(/^::ffff:/, '') ?? '127.0.0.1'
        const port = this.server.reserve(this)
        if (port === null) return this.reply(421, 'Busy; try again in a moment')
        if (cmd === 'EPSV') return this.reply(229, `Extended passive mode (|||${port}|)`)
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return this.reply(522, 'Use EPSV')
        return this.reply(227, `Passive mode (${ip.split('.').join(',')},${port >> 8},${port & 255})`)
      }
      case 'PORT': case 'EPRT': return this.reply(502, 'Use passive mode (PASV)')
      case 'LIST': case 'NLST': case 'MLSD': {
        const data = await this.takeData().catch(() => null)
        if (!data) return this.reply(425, 'No data connection')
        this.reply(150, 'Here it is')
        data.end()
        return this.reply(226, 'Done')
      }
      case 'STOR': case 'APPE': case 'STOU': return this.store(cmd === 'STOU' ? `${randomUUID()}.bin` : arg)
      case 'ABOR': return this.reply(226, 'OK')
      case 'STAT': return this.reply(211, 'OK')
      default: return this.reply(502, `${cmd} isn’t offered here`)
    }
  }

  private async store(arg: string) {
    if (!arg) return this.reply(501, 'Which file?')
    const path = resolvePath(this.cwd, arg)
    const data = await this.takeData().catch(() => null)
    if (!data) return this.reply(425, 'No data connection')
    this.reply(150, 'Send it')
    const file = join(this.server.o.dir ?? tmpdir(), `ftp-${randomUUID()}`)
    const out = createWriteStream(file)
    let size = 0
    let tooBig = false
    const ok = await new Promise<boolean>(resolve => {
      data.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > this.server.o.maxBytes) { tooBig = true; data.destroy(); return }
        if (!out.write(chunk)) { data.pause(); out.once('drain', () => data.resume()) }
      })
      data.once('end', () => resolve(true))
      data.once('close', () => resolve(!tooBig && data.readableEnded))
      data.once('error', () => resolve(false))
    })
    await new Promise<void>(r => out.end(() => r()))
    if (!ok || tooBig || !this.login) {
      await rm(file, { force: true })
      return tooBig ? this.reply(552, `Too big: up to ${Math.floor(this.server.o.maxBytes / 1024 / 1024)} MB a file (lower the camera’s Max File Size)`)
        : this.reply(426, 'The upload stopped part-way')
    }
    this.sizes.set(path, size)
    if (this.sizes.size > 200) this.sizes.delete(this.sizes.keys().next().value!)
    this.reply(226, 'Received')
    try {
      this.server.o.onFile({ login: this.login, path, file, size, at: new Date() })
    } catch (e) {
      this.server.log(`upload handling failed: ${e instanceof Error ? e.message : String(e)}`)
      await rm(file, { force: true })
    }
  }
}
