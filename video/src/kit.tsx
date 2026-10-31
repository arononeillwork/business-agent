// The pieces every scene uses: captions, the browser window and the phone the app is shown in, the
// camera that zooms in on what's being clicked, recordings cut and sped up, crops of stills, logos.
import { Audio, Video } from '@remotion/media'
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { SimpleIcon } from 'simple-icons'
import { BA, display, text } from './theme'
import { FPS, type Segment } from './timeline'

export const ease = Easing.bezier(0.65, 0, 0.35, 1)
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** 0 → 1 with a soft spring, starting at `at` frames. */
export function useEnter(at = 0, damping = 200, durationInFrames?: number) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - at, fps, config: { damping }, durationInFrames })
}

/** 1 → 0 over the last `len` frames before `end`. */
export function useExit(end: number, len = 10) {
  const frame = useCurrentFrame()
  return interpolate(frame, [end - len, end], [1, 0], { ...clamp, easing: ease })
}

/** The headline over each scene: small spaced capitals, then the line itself (an <em> is in rose italic). */
export function Caption({ eyebrow, title, sub, at = 0, out, x = 305, y = 62, width = 1400, size = 70, align = 'left', light }: {
  eyebrow?: string; title: ReactNode; sub?: ReactNode; at?: number; out?: number; x?: number; y?: number; width?: number; size?: number
  align?: 'left' | 'center'; light?: boolean
}) {
  const a = useEnter(at)
  const b = useEnter(at + 5)
  const c = useEnter(at + 10)
  const gone = useExit(out ?? 1e9)
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, textAlign: align, opacity: gone }}>
      {eyebrow && (
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 22, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: light ? BA.rose : BA.roseDeep, opacity: a, translate: `0 ${interpolate(a, [0, 1], [14, 0])}px` }}>{eyebrow}</div>
      )}
      <div style={{ fontFamily: display, fontWeight: 500, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.015em',
        color: light ? '#fff' : BA.ink, marginTop: eyebrow ? 12 : 0, opacity: b, translate: `0 ${interpolate(b, [0, 1], [22, 0])}px` }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontFamily: text, fontSize: 30, lineHeight: 1.45, color: light ? 'rgba(255,255,255,0.75)' : BA.soft, marginTop: 18,
          opacity: c, translate: `0 ${interpolate(c, [0, 1], [16, 0])}px`, maxWidth: align === 'center' ? undefined : 760, marginInline: align === 'center' ? 'auto' : undefined }}>{sub}</div>
      )}
    </div>
  )
}

/** Rose italic for the word a headline turns on. */
export const Em = ({ children, color = BA.roseDeep }: { children: ReactNode; color?: string }) =>
  <em style={{ fontStyle: 'italic', color }}>{children}</em>

/** Where the camera looks: zoom `s` centred on (fx, fy), in the recording's own CSS pixels. */
export interface CamKey { f: number; s: number; fx: number; fy: number }

/** The camera at a frame: holds each key, then glides to the next over `glide` frames. */
export function cameraAt(frame: number, keys: CamKey[], glide = 22): CamKey {
  if (!keys.length) return { f: 0, s: 1, fx: 720, fy: 450 }
  let cur = keys[0]
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]
    const start = k.f - glide
    if (frame >= k.f) { cur = k; continue }
    if (frame > start) {
      const p = ease(interpolate(frame, [start, k.f], [0, 1], clamp))
      return { f: frame, s: cur.s + (k.s - cur.s) * p, fx: cur.fx + (k.fx - cur.fx) * p, fy: cur.fy + (k.fy - cur.fy) * p }
    }
    break
  }
  return cur
}

/** The recording, zoomed by the camera, filling a box of `w` × `h` (the viewport it was recorded at, scaled). */
export function Zoomed({ children, keys, w, h, vw = 1440, vh = 900, focusY = 0.5 }: {
  children: ReactNode; keys: CamKey[]; w: number; h: number; vw?: number; vh?: number; focusY?: number
}) {
  const frame = useCurrentFrame()
  const cam = cameraAt(frame, keys)
  const k = w / vw
  const s = cam.s
  // Put the focus at the middle of what's visible, without showing past the recording's edges.
  let tx = w / 2 - cam.fx * k * s
  let ty = h * focusY - cam.fy * k * s
  tx = Math.min(0, Math.max(w - w * s, tx))
  ty = Math.min(0, Math.max(h - (vh * k) * s, ty))
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: vh * k, transformOrigin: '0 0', translate: `${tx}px ${ty}px`, scale: String(s) }}>
        {children}
      </div>
    </div>
  )
}

/** A recording cut into segments, each played at its own speed, one after another. */
export function Clip({ src, segs, style }: { src: string; segs: Segment[]; style?: CSSProperties }) {
  let at = 0
  return (
    <>
      {segs.map((s, i) => {
        const len = Math.round(((s.b - s.a) * FPS) / s.rate)
        const from = at
        at += len
        const last = i === segs.length - 1
        return (
          <Sequence key={i} from={from} durationInFrames={last ? undefined : len} layout="none">
            <Video src={staticFile(src)} trimBefore={Math.round(s.a * FPS)} playbackRate={s.rate} muted
              style={{ width: '100%', height: '100%', display: 'block', ...style }} objectFit="cover" />
          </Sequence>
        )
      })}
    </>
  )
}

/** A desktop browser window (the app at businesssagent.com), its top bar and its page. */
export function Browser({ url, width, height, children, style }: { url: string; width: number; height: number; children: ReactNode; style?: CSSProperties }) {
  const bar = 46
  return (
    <div style={{ position: 'absolute', width, height: height + bar, borderRadius: 18, overflow: 'hidden', background: '#fff',
      boxShadow: '0 40px 90px rgba(60,40,30,0.22), 0 8px 24px rgba(60,40,30,0.10), 0 0 0 1px rgba(43,37,34,0.08)', ...style }}>
      <div style={{ height: bar, background: '#F6F2EE', borderBottom: `1px solid ${BA.line}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9 }}>
        {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 22, flex: 1, maxWidth: 560, height: 28, borderRadius: 8, background: '#fff', border: `1px solid ${BA.line}`,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontFamily: text, fontSize: 16, color: BA.soft }}>
          <svg width="12" height="14" viewBox="0 0 12 14"><path d="M2 6V4a4 4 0 0 1 8 0v2" stroke={BA.faint} strokeWidth="1.6" fill="none" /><rect x="1" y="6" width="10" height="7.5" rx="1.6" fill={BA.faint} /></svg>
          {url}
        </div>
      </div>
      <div style={{ position: 'relative', width, height }}>{children}</div>
    </div>
  )
}

/** A phone, the app or the website on it. The screen is the recording's 393 × 852 viewport, scaled. */
export function Phone({ width = 400, children, style }: { width?: number; children: ReactNode; style?: CSSProperties }) {
  const pad = Math.round(width * 0.035)
  const screenW = width - 2 * pad
  const screenH = Math.round(screenW * (852 / 393))
  return (
    <div style={{ position: 'absolute', width, height: screenH + 2 * pad, borderRadius: width * 0.16, background: '#1F1A17', padding: pad,
      boxShadow: '0 40px 90px rgba(60,40,30,0.28), 0 6px 18px rgba(60,40,30,0.18), inset 0 0 0 2px #3a332e', ...style }}>
      <div style={{ position: 'relative', width: screenW, height: screenH, borderRadius: width * 0.125, overflow: 'hidden', background: '#fff' }}>
        {children}
        <div style={{ position: 'absolute', top: pad * 0.6, left: '50%', translate: '-50% 0', width: screenW * 0.3, height: pad * 1.9, borderRadius: pad, background: '#0d0b0a' }} />
      </div>
    </div>
  )
}

/** Part of a still (x, y, w, h in the still's own pixels), shown `width` wide. */
export function Crop({ src, x, y, w, h, width, natural = 2160 }: { src: string; x: number; y: number; w: number; h: number; width: number; natural?: number }) {
  const k = width / w
  return (
    <div style={{ position: 'relative', width, height: h * k, overflow: 'hidden' }}>
      <Img src={staticFile(src)} style={{ position: 'absolute', left: -x * k, top: -y * k, width: natural * k, maxWidth: 'none' }} />
    </div>
  )
}

/** A brand's logo from Simple Icons, in its own colour. */
export function Logo({ icon, size = 34, color }: { icon: SimpleIcon; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={icon.title}>
      <path d={icon.path} fill={color ?? `#${icon.hex}`} />
    </svg>
  )
}

/** A green "Updated" tick that pops in. */
export function Tick({ at = 0, label = 'Updated', size = 22 }: { at?: number; label?: string; size?: number }) {
  const p = useEnter(at, 12)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 9px', borderRadius: 999, background: BA.goodSoft,
      color: BA.good, fontFamily: text, fontWeight: 600, fontSize: size, scale: String(interpolate(p, [0, 1], [0.6, 1])), opacity: Math.min(1, p * 1.5) }}>
      <svg width={size + 4} height={size + 4} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={BA.good} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </div>
  )
}

/** A sound effect at a frame. */
export function Sfx({ name, at, volume = 0.35 }: { name: string; at: number; volume?: number }) {
  if (at < 0) return null
  return (
    <Sequence from={Math.round(at)} layout="none" durationInFrames={90}>
      <Audio src={staticFile(`audio/sfx-${name}.mp3`)} volume={volume} />
    </Sequence>
  )
}

/** The cream, softly glowing page every product scene sits on. */
export function Cream({ children }: { children?: ReactNode }) {
  return <AbsoluteFill style={{ background: BA.bg }}><AbsoluteFill style={{ backgroundImage: `radial-gradient(1200px 620px at 85% -10%, rgba(247,155,164,0.20), transparent 70%), radial-gradient(1000px 560px at -10% 15%, rgba(183,163,216,0.18), transparent 70%)` }} />{children}</AbsoluteFill>
}

/** A white card with a soft shadow. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: 26, boxShadow: '0 30px 70px rgba(60,40,30,0.16), 0 0 0 1px rgba(43,37,34,0.06)', overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}

/** Scene in/out: fades and lifts in over `inLen` frames, fades out before `end`. */
export function SceneFade({ children, end, inLen = 12, outLen = 10 }: { children: ReactNode; end: number; inLen?: number; outLen?: number }) {
  const frame = useCurrentFrame()
  const o = interpolate(frame, [0, inLen, end - outLen, end], [0, 1, 1, 0], clamp)
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}
