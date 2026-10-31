// The team on their phones (Maria clocks in), and the owner's day at a glance.
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Phone, Sfx, Tick, Zoomed, useEnter } from '../kit'
import { META, clicksOf, eventAt } from '../clips'
import type { Segment } from '../timeline'

const CLOCKIN: Segment[] = [{ a: 0, b: 6.0, rate: 1.25 }]
const TODAY: Segment[] = [{ a: 0.5, b: 12.0, rate: 3.6 }]
const B = 140
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export function Team() {
  const frame = useCurrentFrame()
  const m = META.clockin
  const phone = useEnter(0, 200)
  const phoneOut = interpolate(frame, [B - 12, B], [1, 0], clamp)
  const win = useEnter(B, 200)
  const clockedIn = eventAt(m, 'clock-in', CLOCKIN)
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption eyebrow="Your team" title={<>Everyone knows<br /><Em>where to be.</Em></>} size={96} x={110} y={300} width={980}
          sub="Shifts, clock-in and time off on their own phone. The hours record the law asks for keeps itself." at={4} out={B} />
        <div style={{ position: 'absolute', left: 1230, top: 100, width: 420, height: 880, opacity: phone * phoneOut,
          translate: `0 ${interpolate(phone, [0, 1], [120, 0])}px` }}>
          <Phone width={420}><Clip src="clips/clockin.mp4" segs={CLOCKIN} /></Phone>
          <div style={{ position: 'absolute', left: -330, top: 640 }}><Tick at={clockedIn + 8} label="Clocked in · 09:55" size={22} /></div>
        </div>
        {clicksOf(m, CLOCKIN).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.3} />)}
        <Sfx name="ping" at={clockedIn + 8} volume={0.15} />
      </Sequence>
      <Sequence from={B} layout="none">
        <Caption eyebrow="You" title={<>And you see the day <Em>at a glance.</Em></>} at={0} />
        <Browser url="businesssagent.com" width={1500} height={938}
          style={{ left: 210, top: 245, opacity: win, translate: `0 ${interpolate(win, [0, 1], [90, 0])}px` }}>
          <Zoomed keys={[{ f: 0, s: 1.08, fx: 820, fy: 420 }]} w={1500} h={938} focusY={0.42}><Clip src="clips/today.mp4" segs={TODAY} /></Zoomed>
        </Browser>
        <Sfx name="whoosh" at={-6} volume={0.2} />
      </Sequence>
    </Cream>
  )
}
