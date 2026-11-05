// The close. The usual way (six places, one after another, the clock running) beside one sentence to the AI;
// then "How much is your time worth?", the brand coming in under it, so the video ends on the question.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Sfx, ease, useEnter } from '../kit'
import { BA, display, text } from '../theme'
import { Check, MicGlyph } from './chat'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const STEPS = ['Open the app', 'Find Opening hours', 'Change Sunday', 'Update Google Maps', 'Update the website', 'Tell the team']

/** A clock counting up to `to` minutes (or seconds) between two frames. */
function Clock({ from, to, by, unit, color }: { from: number; to: number; by: number; unit: 'min' | 'sec'; color: string }) {
  const frame = useCurrentFrame()
  const n = Math.round(interpolate(frame, [from, by], [0, to], { ...clamp, easing: ease }))
  return <span style={{ fontFamily: display, fontWeight: 500, fontSize: 64, color, fontVariantNumeric: 'tabular-nums' }}>{n} {unit}</span>
}

export function Compare({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const left = useEnter(6, 200)
  const right = useEnter(20, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const bubble = useEnter(150, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>No app to open. No forms. <Em>Just say it.</Em></>} at={0} align="center" x={160} width={1600} />
        <div style={{ position: 'absolute', left: 250, top: 260, width: 660, opacity: left, translate: `0 ${interpolate(left, [0, 1], [40, 0])}px` }}>
          <Card style={{ padding: '30px 36px', height: 600, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: '#F7F3EF' }}>
            <div style={{ fontFamily: text, fontWeight: 600, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase', color: BA.faint }}>The usual way</div>
            {STEPS.map((s, i) => {
              const p = interpolate(frame, [20 + i * 16, 30 + i * 16], [0, 1], clamp)
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18, fontFamily: text, fontSize: 30, color: BA.soft, opacity: p,
                  translate: `${interpolate(p, [0, 1], [20, 0])}px 0` }}>
                  <span style={{ width: 38, height: 38, borderRadius: 19, border: `2px solid ${BA.limewash}`, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 700 }}>{i + 1}</span>
                  {s}
                </div>
              )
            })}
            <div style={{ marginTop: 'auto' }}><Clock from={20} to={15} by={130} unit="min" color={BA.soft} /></div>
          </Card>
        </div>
        <div style={{ position: 'absolute', left: 1010, top: 260, width: 660, opacity: right, translate: `0 ${interpolate(right, [0, 1], [40, 0])}px` }}>
          <Card style={{ padding: '30px 36px', height: 600, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', borderTop: `6px solid ${BA.rose}` }}>
            <div style={{ fontFamily: text, fontWeight: 600, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase', color: BA.roseDeep }}>With your AI</div>
            <div style={{ marginTop: 70, display: 'flex', justifyContent: 'flex-end', opacity: bubble, translate: `0 ${interpolate(bubble, [0, 1], [20, 0])}px` }}>
              <div style={{ padding: '18px 24px', borderRadius: 26, background: BA.tint, fontFamily: text, fontSize: 32, color: BA.ink, display: 'flex', gap: 12, alignItems: 'center' }}>
                <MicGlyph size={30} color={BA.roseDeep} />We’re closing at 3 on Sundays.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 30, fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.good,
              opacity: interpolate(frame, [176, 186], [0, 1], clamp) }}>
              <Check size={36} />Done, everywhere.
            </div>
            <div style={{ marginTop: 'auto' }}><Clock from={150} to={10} by={190} unit="sec" color={BA.roseDeep} /></div>
          </Card>
        </div>
      </AbsoluteFill>
      {STEPS.map((_, i) => <Sfx key={i} name="pop" at={20 + i * 16} volume={0.1} />)}
      <Sfx name="pop" at={150} volume={0.24} />
      <Sfx name="ping" at={180} volume={0.24} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

/** "How much is your time worth?", then the brand under it, and it stays. */
export function Close() {
  const frame = useCurrentFrame()
  const a = useEnter(6, 200)
  const b = useEnter(20, 200)
  // From four seconds in, the question rises and the brand comes in under it.
  const up = interpolate(frame, [120, 150], [0, 1], { ...clamp, easing: ease })
  const mark = useEnter(140, 14)
  const word = useEnter(146, 200)
  const cta = useEnter(170, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: display, fontWeight: 500, letterSpacing: '-0.02em', textAlign: 'center', translate: `0 ${interpolate(up, [0, 1], [0, -170])}px`,
          scale: String(interpolate(up, [0, 1], [1, 0.82])) }}>
          <div style={{ fontSize: 132, lineHeight: 1.05, color: BA.ink, opacity: a, translate: `0 ${interpolate(a, [0, 1], [30, 0])}px` }}>How much is</div>
          <div style={{ fontSize: 132, lineHeight: 1.1, color: BA.ink, opacity: b, translate: `0 ${interpolate(b, [0, 1], [30, 0])}px` }}>
            <em style={{ color: BA.roseDeep }}>your time</em> worth?
          </div>
        </div>
        <div style={{ position: 'absolute', top: 640, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Img src={staticFile('brand/icon.png')} style={{ width: 96, height: 96, borderRadius: 28, background: '#fff', padding: 10, border: `1px solid ${BA.line}`,
              boxShadow: '0 20px 50px rgba(60,40,30,0.14)', scale: String(interpolate(mark, [0, 1], [0.5, 1])), opacity: Math.min(1, mark * 1.5) }} />
            <div style={{ fontFamily: display, fontWeight: 500, fontSize: 84, color: BA.ink, letterSpacing: '-0.01em', opacity: word, translate: `${interpolate(word, [0, 1], [-30, 0])}px 0` }}>
              Business <em style={{ color: BA.roseDeep }}>Agent</em>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 40, opacity: cta, translate: `0 ${interpolate(cta, [0, 1], [20, 0])}px` }}>
            <div style={{ padding: '18px 40px', borderRadius: 999, background: BA.ink, color: BA.bg, fontFamily: text, fontWeight: 600, fontSize: 30 }}>Start free</div>
            <div style={{ fontFamily: text, fontWeight: 500, fontSize: 30, color: BA.ink }}>businesssagent.com</div>
          </div>
        </div>
      </AbsoluteFill>
      <Sfx name="chime" at={142} volume={0.3} />
    </Cream>
  )
}
