// The close: home at half past three, not six. "How much is your time worth?" Then the brand.
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Cream, Sfx, ease, useEnter } from '../kit'
import { BA, display, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Home() {
  const frame = useCurrentFrame()
  // 18:00, when the video began, rolls back to 15:30.
  const minutes = Math.round(interpolate(frame, [14, 62], [18 * 60, 15 * 60 + 30], { ...clamp, easing: ease }))
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  const warm = interpolate(frame, [14, 62], [0, 1], clamp)
  const line = useEnter(58, 200)
  const out = interpolate(frame, [110, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${mix('#2E2520', '#F9D9C9', warm)} 0%, ${mix(BA.night, '#FBEFE8', warm)} 100%)` }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: display, fontSize: 240, letterSpacing: '-0.02em', color: mix('#FFFFFF', BA.ink, warm), fontVariantNumeric: 'tabular-nums', marginTop: -80 }}>
          {hh}:{mm}
        </div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 76, color: BA.ink, opacity: line, translate: `0 ${interpolate(line, [0, 1], [24, 0])}px` }}>
          Closed at three. <em style={{ color: BA.roseDeep }}>Home</em> by half past.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Blend two hex colours. */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}

function Question() {
  const frame = useCurrentFrame()
  const a = useEnter(4, 200)
  const b = useEnter(16, 200)
  const out = interpolate(frame, [112, 120], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, fontFamily: display, fontWeight: 500, letterSpacing: '-0.02em', textAlign: 'center' }}>
        <div style={{ fontSize: 132, lineHeight: 1.05, color: BA.ink, opacity: a, translate: `0 ${interpolate(a, [0, 1], [30, 0])}px` }}>How much is</div>
        <div style={{ fontSize: 132, lineHeight: 1.1, color: BA.ink, opacity: b, translate: `0 ${interpolate(b, [0, 1], [30, 0])}px` }}>
          <em style={{ color: BA.roseDeep }}>your time</em> worth?
        </div>
      </AbsoluteFill>
    </Cream>
  )
}

function Brand() {
  const mark = useEnter(2, 14)
  const word = useEnter(8, 200)
  const tag = useEnter(22, 200)
  const cta = useEnter(36, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <Img src={staticFile('brand/icon.png')} style={{ width: 120, height: 120, borderRadius: 36, background: '#fff', padding: 12, border: `1px solid ${BA.line}`,
            boxShadow: '0 20px 50px rgba(60,40,30,0.14)', scale: String(interpolate(mark, [0, 1], [0.5, 1])), opacity: Math.min(1, mark * 1.5) }} />
          <div style={{ fontFamily: display, fontWeight: 500, fontSize: 112, color: BA.ink, letterSpacing: '-0.01em', opacity: word, translate: `${interpolate(word, [0, 1], [-30, 0])}px 0` }}>
            Business <em style={{ color: BA.roseDeep }}>Agent</em>
          </div>
        </div>
        <div style={{ fontFamily: display, fontSize: 54, lineHeight: 1.2, color: BA.ink, marginTop: 38, textAlign: 'center', opacity: tag, translate: `0 ${interpolate(tag, [0, 1], [20, 0])}px` }}>
          Your entire business in one place.<br /><em style={{ color: BA.roseDeep }}>Less admin, more enjoyment.</em>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 56, opacity: cta, translate: `0 ${interpolate(cta, [0, 1], [20, 0])}px` }}>
          <div style={{ padding: '20px 44px', borderRadius: 999, background: BA.ink, color: BA.bg, fontFamily: text, fontWeight: 600, fontSize: 34 }}>Start free</div>
          <div style={{ fontFamily: text, fontWeight: 500, fontSize: 34, color: BA.ink }}>businesssagent.com</div>
        </div>
      </AbsoluteFill>
    </Cream>
  )
}

export function Close() {
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={120}><Home /></Sequence>
      <Sequence from={120} durationInFrames={120}><Question /></Sequence>
      <Sequence from={240}><Brand /></Sequence>
      <Sfx name="whoosh" at={10} volume={0.2} />
      <Sfx name="chime" at={242} volume={0.3} />
    </AbsoluteFill>
  )
}
