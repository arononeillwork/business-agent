// Opening hours: closed on Sundays from now on, saved once; Christmas added once in the calendar;
// then where it shows: Google Maps, the café's website, the team's calendar.
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { META, camOn, clicksOf, eventAt } from '../clips'
import { Arrive, CalendarCard, MapsCard, WebsiteHoursCard } from '../places'
import type { Segment } from '../timeline'

const HOURS: Segment[] = [{ a: 0.5, b: 9.2, rate: 1.6 }]
const CLOSURE: Segment[] = [{ a: 1.5, b: 17.9, rate: 3.0 }]
const W = 1500
const H = 938
const B = 165 // the calendar starts
const C = 330 // the cards

export function Hours() {
  const frame = useCurrentFrame()
  const h = META.hours
  const c = META.closure
  const hoursKeys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 420 },
    camOn(h, 'sunday', HOURS, 1.7, 14, { x: 170, y: -40 }),
    camOn(h, 'google', HOURS, 1.55, 12),
  ]
  const closureKeys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 420 },
    camOn(c, 'add-closure', CLOSURE, 1.35, 6),
    { f: eventAt(c, 'title', CLOSURE) - 4, s: 1.6, fx: 720, fy: 400 },
    camOn(c, 'closed-days', CLOSURE, 1.55, 8),
  ]
  const win = useEnter(2, 200)
  const winOut = interpolate(frame, [C - 10, C], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // The calendar takes over the window with a quick crossfade.
  const swap = interpolate(frame, [B - 6, B + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption eyebrow="Opening hours" title={<>Change it <Em>once.</Em></>} at={0} out={B} />
      </Sequence>
      <Sequence from={B} durationInFrames={C - B} layout="none">
        <Caption eyebrow="Holidays & closures" title={<>Christmas? Add it <Em>once.</Em></>} at={0} out={C - B} />
      </Sequence>
      {frame < C && (
        <Browser url={swap < 0.5 ? 'businesssagent.com/opening-hours' : 'businesssagent.com/calendar'} width={W} height={H}
          style={{ left: 210, top: 245, opacity: win * winOut, translate: `0 ${interpolate(win, [0, 1], [90, 0]) + interpolate(winOut, [0, 1], [60, 0])}px` }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 1 - swap }}>
            <Zoomed keys={hoursKeys} w={W} h={H} focusY={0.42}><Clip src="clips/hours.mp4" segs={HOURS} /></Zoomed>
          </div>
          <Sequence from={B - 6} layout="none">
            <div style={{ position: 'absolute', inset: 0, opacity: swap }}>
              <Zoomed keys={closureKeys.map(k => ({ ...k, f: k.f }))} w={W} h={H} focusY={0.42}><Clip src="clips/closure.mp4" segs={CLOSURE} /></Zoomed>
            </div>
          </Sequence>
        </Browser>
      )}
      <Sequence from={C} layout="none">
        <Caption eyebrow="Everywhere, by itself" title={<>It’s changed <Em>everywhere.</Em></>}
          sub="Google Maps within a minute. Your website. Your team’s calendar." at={0} />
        <Arrive at={4} x={110} y={420} width={600}><MapsCard at={4} mode="hours" /></Arrive>
        <Arrive at={16} x={750} y={330} width={1060}><WebsiteHoursCard at={16} width={1060} /></Arrive>
        <Arrive at={28} x={750} y={712} width={1060}><CalendarCard at={28} width={1060} /></Arrive>
        {[4, 16, 28].map(f => <Sfx key={f} name="pop" at={f} volume={0.3} />)}
        {[14, 26, 38].map(f => <Sfx key={f} name="ping" at={f} volume={0.12} />)}
      </Sequence>
      {clicksOf(h, HOURS).map((f, i) => <Sfx key={`h${i}`} name="click" at={f} volume={0.3} />)}
      {clicksOf(c, CLOSURE).map((f, i) => <Sfx key={`c${i}`} name="click" at={B - 6 + f} volume={0.3} />)}
      <Sfx name="whoosh" at={C - 10} volume={0.25} />
    </Cream>
  )
}
