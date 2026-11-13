// The same tray of twelve banana breads, two ways: without the app, seven sold and five in the bin; with it,
// the five sold at half price on their last day. €10,00 more from one tray, and nothing thrown away.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Sfx, useEnter } from '../kit'
import { Mark } from '../places'
import { BA, display, text } from '../theme'
import { euro } from './Drawn'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Line({ left, right, at, strong, struck }: { left: ReactNode; right: string; at: number; strong?: boolean; struck?: boolean }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 34px', borderTop: `1px solid ${BA.lineSoft}`, fontFamily: text,
      fontSize: strong ? 34 : 28, fontWeight: strong ? 700 : 400, color: BA.ink, opacity: p, translate: `${interpolate(p, [0, 1], [30, 0])}px 0` }}>
      <span style={{ color: strong ? BA.ink : BA.soft }}>{left}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', textDecoration: struck ? 'line-through' : 'none', color: struck ? BA.faint : undefined }}>{right}</span>
    </div>
  )
}

function Side({ x, at, title, accent, children, foot }: { x: number; at: number; title: string; accent: string; children: ReactNode; foot: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <Card style={{ position: 'absolute', left: x, top: 290, width: 640, borderTop: `8px solid ${accent}`, opacity: p, translate: `0 ${interpolate(p, [0, 1], [50, 0])}px` }}>
      <div style={{ padding: '26px 34px 20px', fontFamily: text, fontWeight: 600, fontSize: 32, color: BA.ink }}>{title}</div>
      <div style={{ padding: '0 34px 18px', fontFamily: text, fontSize: 24, color: BA.faint, marginTop: -12 }}>12 banana breads at {euro(4)}</div>
      {children}
      <div style={{ padding: '20px 34px 26px', borderTop: `1px solid ${BA.lineSoft}`, fontFamily: text, fontWeight: 600, fontSize: 28 }}>{foot}</div>
    </Card>
  )
}

export function Result({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const more = useEnter(200, 14)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={250} layout="none"><Caption title={<>The same tray. <Em>Sold, not binned.</Em></>} at={0} out={250} width={1300} size={64} /></Sequence>
        <Sequence from={250} layout="none"><Caption title={<>Every tray, every day. <Em>It adds up.</Em></>} width={1300} size={64} /></Sequence>
        <Side x={305} at={14} title="Without it" accent={BA.limewash}
          foot={<span style={{ color: BA.roseDeep }}>5 in the bin</span>}>
          <Line left="7 sold at full price" right={euro(28)} at={30} />
          <Line left="5 thrown away" right={euro(0)} at={42} struck />
          <Line left="Taken" right={euro(28)} at={54} strong />
        </Side>
        <Side x={975} at={70} title="With Business Agent" accent={BA.rose}
          foot={<span style={{ color: BA.good }}>Nothing in the bin</span>}>
          <Line left="7 sold at full price" right={euro(28)} at={86} />
          <Line left={<>5 sold at <Mark at={110}>50% off</Mark></>} right={euro(10)} at={98} />
          <Line left="Taken" right={euro(38)} at={120} strong />
        </Side>
        <div style={{ position: 'absolute', left: 960, top: 880, translate: '-50% 0', display: 'flex', alignItems: 'center', gap: 18, padding: '18px 38px',
          borderRadius: 999, background: BA.ink, color: '#fff', fontFamily: text, fontWeight: 600, fontSize: 36, whiteSpace: 'nowrap',
          opacity: Math.min(1, more * 1.4), scale: String(interpolate(more, [0, 1], [0.7, 1])) }}>
          <span style={{ fontFamily: display, fontWeight: 500, fontSize: 52, color: BA.rose }}>+{euro(10)}</span> from one tray, and less waste
        </div>
      </AbsoluteFill>
      {[30, 42, 54, 86, 98, 120].map(f => <Sfx key={f} name="pop" at={f} volume={0.14} />)}
      <Sfx name="chime" at={200} volume={0.24} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
