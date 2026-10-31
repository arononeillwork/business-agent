// "What if you changed it in one place?" The night opens onto the cream page, and Business Agent arrives.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Cream, Sfx, easeOut, useEnter } from '../kit'
import { BA, display } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Word({ children, at, italic }: { children: string; at: number; italic?: boolean }) {
  const p = useEnter(at, 16)
  return (
    <span style={{ display: 'inline-block', opacity: Math.min(1, p * 1.3), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`,
      fontStyle: italic ? 'italic' : 'normal', color: italic ? BA.roseDeep : BA.ink, marginRight: '0.24em' }}>{children}</span>
  )
}

export function Turn() {
  const frame = useCurrentFrame()
  const open = interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: easeOut })
  const brand = useEnter(62, 18)
  const lift = interpolate(frame, [56, 76], [0, -90], { ...clamp, easing: easeOut })
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: BA.night }}>
      <AbsoluteFill style={{ clipPath: `circle(${open * 1250}px at 50% 50%)` }}>
        <Cream>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
            <div style={{ fontFamily: display, fontWeight: 500, fontSize: 112, lineHeight: 1.08, letterSpacing: '-0.02em', textAlign: 'center', translate: `0 ${lift}px` }}>
              <div><Word at={8}>What</Word><Word at={12}>if</Word><Word at={16}>you</Word><Word at={20}>changed</Word><Word at={24}>it</Word></div>
              <div><Word at={30} italic>in</Word><Word at={33} italic>one</Word><Word at={36} italic>place?</Word></div>
            </div>
            <div style={{ position: 'absolute', top: 700, display: 'flex', alignItems: 'center', gap: 22, opacity: brand,
              translate: `0 ${interpolate(brand, [0, 1], [30, 0])}px` }}>
              <Img src={staticFile('brand/icon.png')} style={{ width: 84, height: 84, borderRadius: 26, background: '#fff', padding: 9, border: `1px solid ${BA.line}` }} />
              <div style={{ fontFamily: display, fontWeight: 500, fontSize: 76, color: BA.ink, letterSpacing: '-0.01em' }}>
                Business <em style={{ color: BA.roseDeep }}>Agent</em>
              </div>
            </div>
          </AbsoluteFill>
        </Cream>
      </AbsoluteFill>
      <Sfx name="pop" at={32} volume={0.25} />
      <Sfx name="chime" at={58} volume={0.25} />
      <Sfx name="whoosh" at={112} volume={0.3} />
    </AbsoluteFill>
  )
}
