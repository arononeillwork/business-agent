// The pieces the owner video's scenes share: its recordings' logs, the chapter pill ("1 of 4 · Opening
// hours"), labels that point at what the camera is looking at, the advisor's findings drawn as the app
// shows them, the café's TV, and the "changed everywhere" layout (the change at the top, a line to each
// place it shows).
import type { CSSProperties, ReactNode } from 'react'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Card, Tick, cameraAt, ease, useEnter, type CamKey } from '../kit'
import { Arrive } from '../places'
import { BA, text } from '../theme'
import { WIN } from '../timeline'
import type { ClipMeta } from '../clips'
import today from '../../public/clips/owner-today.json'
import hours from '../../public/clips/owner-hours.json'
import price from '../../public/clips/owner-price.json'
import offer from '../../public/clips/owner-offer.json'
import reviews from '../../public/clips/owner-reviews.json'

export const CLIPS = { today, hours, price, offer, reviews } as unknown as Record<'today' | 'hours' | 'price' | 'offer' | 'reviews', ClipMeta>

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The chapter, top right: "2 of 4 · Prices". */
export function Step({ n, of = 4, label, at = 0, out }: { n: number; of?: number; label: string; at?: number; out?: number }) {
  const frame = useCurrentFrame()
  const p = useEnter(at, 200)
  const gone = out === undefined ? 1 : interpolate(frame, [out - 10, out], [1, 0], clamp)
  return (
    <div style={{ position: 'absolute', right: WIN.x, top: 76, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 24px 10px 12px', borderRadius: 999,
      background: '#fff', boxShadow: '0 10px 30px rgba(60,40,30,0.10)', fontFamily: text, fontWeight: 600, fontSize: 28, color: BA.ink,
      opacity: p * gone, translate: `0 ${interpolate(p, [0, 1], [-14, 0])}px` }}>
      <span style={{ width: 40, height: 40, borderRadius: 20, background: BA.roseDeep, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24 }}>{n}</span>
      <span style={{ color: BA.faint, fontWeight: 500 }}>of {of}</span>
      <span>{label}</span>
    </div>
  )
}

/** Where a point of the recording (its own CSS pixels) is on screen, through the camera's zoom (as Zoomed puts it). */
export function project(frame: number, keys: CamKey[], x: number, y: number, vw = 1440, vh = 900) {
  const cam = cameraAt(frame, keys)
  const k = WIN.w / vw
  const s = cam.s
  let tx = WIN.w / 2 - cam.fx * k * s
  let ty = WIN.h / 2 - cam.fy * k * s
  tx = Math.min(0, Math.max(WIN.w - WIN.w * s, tx))
  ty = Math.min(0, Math.max(WIN.h - vh * k * s, ty))
  return { x: WIN.x + tx + x * k * s, y: WIN.y + 46 + ty + y * k * s }
}

/**
 * A label on the window, pointing at a logged element: it appears at `at`, sits beside the element as the
 * camera has it, and goes at `out`.
 */
export function Callout({ meta, label, keys, at, out, children, side = 'right', from = 0 }: {
  meta: ClipMeta; label: string; keys: CamKey[]; at: number; out: number; children: ReactNode; side?: 'right' | 'left' | 'below' | 'above'; from?: number
}) {
  const frame = useCurrentFrame()
  const e = meta.events.find(x => x.label === label)
  const p = useEnter(at, 14)
  const gone = interpolate(frame, [out - 8, out], [1, 0], clamp)
  if (!e?.box || frame < at || frame > out) return null
  const b = e.box
  const anchor = side === 'right' ? project(frame - from, keys, b.x + b.width, b.y + b.height / 2)
    : side === 'left' ? project(frame - from, keys, b.x, b.y + b.height / 2)
      : side === 'above' ? project(frame - from, keys, b.x, b.y)
        : project(frame - from, keys, b.x + b.width / 2, b.y + b.height)
  const style: CSSProperties = side === 'right' ? { left: anchor.x + 18, top: anchor.y, translate: '0 -50%' }
    : side === 'left' ? { left: anchor.x - 18, top: anchor.y, translate: '-100% -50%' }
      : side === 'above' ? { left: anchor.x + 6, top: anchor.y - 10, translate: '0 -100%' }
        : { left: anchor.x, top: anchor.y + 14, translate: '-50% 0' }
  return (
    <div style={{ position: 'absolute', ...style, opacity: Math.min(1, p * 1.4) * gone }}>
      <div style={{ scale: String(interpolate(p, [0, 1], [0.7, 1])), padding: '12px 22px', borderRadius: 999, background: BA.ink, color: '#fff',
        fontFamily: text, fontWeight: 600, fontSize: 26, whiteSpace: 'nowrap', boxShadow: '0 14px 34px rgba(43,37,34,0.28)' }}>
        {children}
      </div>
    </div>
  )
}

/** The advisor's "!" in a circle, as the app draws a finding worth acting on. */
export const Warn = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" fill="none" stroke={BA.roseDeep} strokeWidth="2" />
    <path d="M12 7v6" stroke={BA.roseDeep} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1.3" fill={BA.roseDeep} />
  </svg>
)

/** One of the advisor's findings, as the app lists it: what, why, and where to act on it. */
export function Finding({ n, title, why, page, at, done }: { n: number; title: string; why: string; page: string; at: number; done?: number }) {
  const frame = useCurrentFrame()
  const p = useEnter(at, 200)
  const tick = done !== undefined && frame >= done
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '22px 30px', borderTop: n > 1 ? `1px solid ${BA.lineSoft}` : 'none',
      opacity: p, translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <span style={{ width: 46, height: 46, borderRadius: 23, background: tick ? BA.good : BA.roseSoft, color: tick ? '#fff' : BA.roseDeep,
        display: 'grid', placeItems: 'center', fontFamily: text, fontWeight: 700, fontSize: 24, flexShrink: 0 }}>{n}</span>
      <Warn />
      <div style={{ flex: 1, fontFamily: text }}>
        <div style={{ fontWeight: 600, fontSize: 30, color: BA.ink }}>{title}</div>
        <div style={{ fontSize: 22, color: BA.soft, marginTop: 4 }}>{why}</div>
      </div>
      <span style={{ fontFamily: text, fontWeight: 600, fontSize: 22, color: BA.roseDeep, whiteSpace: 'nowrap' }}>{page} →</span>
    </div>
  )
}

/** The café's TV on the wall: a thin dark bezel round a 16:9 screen. */
export function Tv({ width, children, style }: { width: number; children: ReactNode; style?: CSSProperties }) {
  const bezel = Math.round(width * 0.018)
  const screenW = width - 2 * bezel
  const screenH = Math.round(screenW * 9 / 16)
  return (
    <div style={{ position: 'relative', width, ...style }}>
      <div style={{ width, height: screenH + 2 * bezel, borderRadius: width * 0.016, background: '#161314', padding: bezel, boxSizing: 'border-box',
        boxShadow: '0 30px 70px rgba(43,37,34,0.30), inset 0 0 0 2px #2f2b2c' }}>
        <div style={{ position: 'relative', width: screenW, height: screenH, overflow: 'hidden', borderRadius: 4, background: '#000' }}>{children}</div>
      </div>
      <div style={{ width: width * 0.16, height: width * 0.03, margin: '0 auto', background: 'linear-gradient(180deg, #3a3536, #252122)', borderRadius: '0 0 6px 6px' }} />
    </div>
  )
}

/** The change itself, at the top of a "changed everywhere": the app's icon, what, and the new value in rose. */
export function ChangePill({ at, title, value }: { at: number; title: string; value: string }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ position: 'absolute', left: 960, top: 196, translate: '-50% 0', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px 14px 16px',
      borderRadius: 999, background: '#fff', boxShadow: '0 16px 40px rgba(60,40,30,0.12), 0 0 0 1px rgba(43,37,34,0.06)', fontFamily: text,
      opacity: p, scale: String(interpolate(p, [0, 1], [0.9, 1])), whiteSpace: 'nowrap' }}>
      <Img src={staticFile('brand/icon.png')} style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', padding: 4, border: `1px solid ${BA.line}` }} />
      <span style={{ fontWeight: 600, fontSize: 28, color: BA.ink }}>{title}</span>
      <span style={{ padding: '6px 16px', borderRadius: 999, background: BA.roseSoft, color: BA.roseDeep, fontWeight: 600, fontSize: 24 }}>{value}</span>
    </div>
  )
}

export interface Place { name: string; icon: ReactNode; width: number; body: (at: number) => ReactNode; bare?: boolean }

/**
 * "It's changed everywhere": the change at the top, a rose line drawn from it to each place, and each
 * place arriving as a card with its name and an "Updated" tick (or bare, as a device, with its name under it).
 */
export function Everywhere({ at = 0, places, top = 372, height = 470, gap = 40 }: { at?: number; places: Place[]; top?: number; height?: number; gap?: number }) {
  const frame = useCurrentFrame()
  const total = places.reduce((s, p) => s + p.width, 0) + gap * (places.length - 1)
  let x = 960 - total / 2
  const laid = places.map(p => { const at0 = x; x += p.width + gap; return { ...p, x: at0 } })
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
        {laid.map((c, i) => {
          const x2 = c.x + c.width / 2
          const d = `M 960 268 C 960 320, ${x2} 300, ${x2} ${top - 4}`
          const p = interpolate(frame, [at + 8 + i * 6, at + 26 + i * 6], [0, 1], { ...clamp, easing: ease })
          return <path key={i} d={d} fill="none" stroke={BA.rose} strokeWidth={3} strokeLinecap="round" strokeDasharray="900" strokeDashoffset={900 * (1 - p)} />
        })}
      </svg>
      {laid.map((c, i) => {
        const a = at + 16 + i * 10
        return (
          <Arrive key={c.name} at={a} x={c.x} y={top} width={c.width}>
            {c.bare ? (
              <div>
                <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.body(a)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 18, fontFamily: text, fontWeight: 600, fontSize: 28, color: BA.ink }}>
                  {c.icon}{c.name}<Tick at={a + 10} size={20} />
                </div>
              </div>
            ) : (
              <Card style={{ height, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 16px', fontFamily: text, fontWeight: 600, fontSize: 26, color: BA.ink }}>
                  {c.icon}<span style={{ flex: 1 }}>{c.name}</span><Tick at={a + 10} size={20} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: `1px solid ${BA.lineSoft}`, overflow: 'hidden' }}>{c.body(a)}</div>
              </Card>
            )}
          </Arrive>
        )
      })}
    </>
  )
}
