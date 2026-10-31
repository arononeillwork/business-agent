// The team on their phones (Maria clocks in); the owner's day at a glance, taken slowly; then the
// Business advisor: what the takings, the team, the menu and the reviews say, and what to try.
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Phone, Sfx, Tick, Zoomed, useEnter } from '../kit'
import { META, clicksOf, eventAt } from '../clips'
import { WIN, lengthOf, type Segment } from '../timeline'

const CLOCKIN: Segment[] = [{ a: 0, b: 6.0, rate: 1.4 }]
const TODAY: Segment[] = [{ a: 0.5, b: 11.6, rate: 2.0 }]
const ADVISOR: Segment[] = [{ a: 0.6, b: 23.8, rate: 2.35 }]
const B = 130                    // your day
const C = B + lengthOf(TODAY) + 4 // the advisor
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const STILL = [{ f: 0, s: 1, fx: 720, fy: 450 }]

export function Team() {
  const frame = useCurrentFrame()
  const m = META.clockin
  const phone = useEnter(0, 200)
  const phoneOut = interpolate(frame, [B - 12, B], [1, 0], clamp)
  const today = useEnter(B, 200)
  // Today hands over to the advisor in the same window, with a quick crossfade.
  const swap = interpolate(frame, [C - 6, C + 4], [0, 1], clamp)
  const clockedIn = eventAt(m, 'clock-in', CLOCKIN)
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption title={<>Everyone knows<br /><Em>where to be.</Em></>} size={96} x={160} y={330} width={980}
          sub="Rota, clock-in and time off, on their own phone." at={4} out={B} />
        <div style={{ position: 'absolute', left: 1230, top: 100, width: 420, height: 880, opacity: phone * phoneOut,
          translate: `0 ${interpolate(phone, [0, 1], [120, 0])}px` }}>
          <Phone width={420}><Clip src="clips/clockin.mp4" segs={CLOCKIN} /></Phone>
          <div style={{ position: 'absolute', left: -330, top: 600 }}><Tick at={clockedIn + 8} label="Clocked in · 09:55" size={22} /></div>
        </div>
        {clicksOf(m, CLOCKIN).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
        <Sfx name="ping" at={clockedIn + 8} volume={0.15} />
      </Sequence>
      <Sequence from={B} durationInFrames={C - B} layout="none">
        <Caption title={<>And you see the day <Em>at a glance.</Em></>} at={0} out={C - B} />
      </Sequence>
      <Sequence from={C} layout="none">
        <Caption title={<>Make data-driven decisions <Em>for your business.</Em></>} at={0} />
      </Sequence>
      {frame >= B && (
        <Browser url={swap < 0.5 ? 'businesssagent.com' : 'businesssagent.com/advisor'} width={WIN.w} height={WIN.h}
          style={{ left: WIN.x, top: WIN.y, opacity: today, translate: `0 ${interpolate(today, [0, 1], [90, 0])}px` }}>
          <Sequence from={B} layout="none">
            <div style={{ position: 'absolute', inset: 0, opacity: 1 - swap }}>
              <Zoomed keys={STILL} w={WIN.w} h={WIN.h}><Clip src="clips/today.mp4" segs={TODAY} /></Zoomed>
            </div>
          </Sequence>
          <Sequence from={C - 6} layout="none">
            <div style={{ position: 'absolute', inset: 0, opacity: swap }}>
              <Zoomed keys={STILL} w={WIN.w} h={WIN.h}><Clip src="clips/advisor.mp4" segs={ADVISOR} /></Zoomed>
            </div>
          </Sequence>
        </Browser>
      )}
      <Sfx name="whoosh" at={B - 6} volume={0.2} />
      <Sfx name="whoosh" at={C - 8} volume={0.18} />
    </Cream>
  )
}
