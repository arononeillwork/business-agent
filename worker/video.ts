// The landing page's videos (public/video), served by the Worker so a browser can ask for part of one.
// Cloudflare's static assets answer a range request ("bytes=5000000-") with the whole file and a 200,
// so a browser couldn't go to a moment it hadn't downloaded yet (the video's slider snapped back)
// and every play downloaded all of it at once. Here the file is read from the assets and the part
// asked for is sent, with 206 Partial Content, as any video server does.

/** The bytes a Range header asks for, within a file of `size` bytes; null if it asks for none of it (416). Only a single range. */
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const m = header.trim().match(/^bytes=(\d*)-(\d*)$/i)
  if (!m || (m[1] === '' && m[2] === '') || size <= 0) return null
  if (m[1] === '') {
    // The last N bytes.
    const n = Number(m[2])
    if (n <= 0) return null
    return { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  if (start >= size || end < start) return null
  return { start, end }
}

/** A video from the static assets, whole or the part the Range header asks for. */
export async function serveVideo(assets: { fetch: (r: Request) => Promise<Response> }, req: Request): Promise<Response> {
  // The whole file from the assets (they ignore ranges, and a 304 would have no bytes to cut from).
  const headers = new Headers(req.headers)
  for (const h of ['range', 'if-range', 'if-none-match', 'if-modified-since']) headers.delete(h)
  const res = await assets.fetch(new Request(req.url, { method: 'GET', headers }))
  // A file that isn't there comes back as the app's page: a 404 here.
  if (!res.ok || res.headers.get('content-type')?.startsWith('text/html')) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const out = new Headers(res.headers)
  out.set('accept-ranges', 'bytes')
  const range = req.headers.get('range')
  if (!range) {
    return new Response(req.method === 'HEAD' ? null : res.body, { status: 200, headers: out })
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const part = byteRange(range, bytes.length)
  if (!part) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}`, 'accept-ranges': 'bytes' } })
  }
  out.set('content-range', `bytes ${part.start}-${part.end}/${bytes.length}`)
  out.set('content-length', String(part.end - part.start + 1))
  return new Response(req.method === 'HEAD' ? null : bytes.slice(part.start, part.end + 1), { status: 206, headers: out })
}
