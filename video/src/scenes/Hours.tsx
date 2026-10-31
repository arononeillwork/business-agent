// Opening hours: closed on Sundays from now on, saved once. The calendar: the bank holidays already
// in, Christmas added once as a closure, then a closer look at the days off. Then where it shows:
// Google Maps, the café's website, the team's calendar.
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { META, camOn, clicksOf, eventAt } from '../clips'
import { Arrive, CalendarCard, MapsCard, Ring, WebsiteHoursCard } from '../places'
import { WIN, lengthOf, type Segment } from '../timeline'

const HOURS: Segment[] = [{ a: 1.6, b: 11.0, rate: 1.8 }]
const CLOSURE: Segment[] = [
  { a: 0.8, b: 7.8, rate: 1.8 },   // December, the bank holidays already there
  { a: 9.4, b: 24.2, rate: 3.2 },  // "Add a closure": Closed for Christmas, 24 to 26 December
  { a: 24.2, b: 29.6, rate: 1.6 }, // the days off, up close
]
const B = lengthOf(HOURS)            // the calendar starts
const HOLIDAYS = lengthOf(CLOSURE.slice(0, 1))
const C = B + lengthOf(CLOSURE)      // the cards

/** A rose ring round each bank holiday as the cursor reaches it, gone when the closure dialog opens. */
function HolidayRings({ until }: { until: number }) {
  const frame = useCurrentFrame()
  const c = META.closure
  const k = WIN.w / c.viewport.width
  const fade = interpolate(frame, [until - 6, until + 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fade }}>
      {c.events.filter(e => e.label?.startsWith('holiday-') && e.box).map(e => (
        <Ring key={e.label} at={eventAt(c, e.label!, CLOSURE) - 4} x={e.box!.x * k - 4} y={e.box!.y * k - 3} w={e.box!.width * k + 8} h={e.box!.height * k + 6} />
      ))}
    </div>
  )
}

export function Hours() {
  const frame = useCurrentFrame()
  const h = META.hours
  const c = META.closure
  const hoursKeys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 450 },
    { f: eventAt(h, 'sunday', HOURS) - 14, s: 1.25, fx: 640, fy: 560 },
    { f: eventAt(h, 'google', HOURS) - 12, s: 1.2, fx: 760, fy: 690 },
  ]
  const closureKeys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 450 },
    { f: eventAt(c, 'add-closure', CLOSURE) + 4, s: 1.15, fx: 720, fy: 430 },
    { f: eventAt(c, 'save', CLOSURE) + 8, s: 1, fx: 720, fy: 450 },
    camOn(c, 'closed-days', CLOSURE, 1.8, 0, { x: 160, y: 0 }),
  ]
  const win = useEnter(2, 200)
  const winOut = interpolate(frame, [C - 10, C], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // The calendar takes over the window with a quick crossfade.
  const swap = interpolate(frame, [B - 6, B + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption title={<>Change your hours <Em>once.</Em></>} at={0} out={B} />
      </Sequence>
      <Sequence from={B} durationInFrames={HOLIDAYS} layout="none">
        <Caption title={<>Bank holidays, <Em>already in.</Em></>} at={0} out={HOLIDAYS} />
      </Sequence>
      <Sequence from={B + HOLIDAYS} durationInFrames={C - B - HOLIDAYS} layout="none">
        <Caption title={<>Days off? Add them <Em>once.</Em></>} at={0} out={C - B - HOLIDAYS} />
      </Sequence>
      {frame < C && (
        <Browser url={swap < 0.5 ? 'businesssagent.com/opening-hours' : 'businesssagent.com/calendar'} width={WIN.w} height={WIN.h}
          style={{ left: WIN.x, top: WIN.y, opacity: win * winOut, translate: `0 ${interpolate(win, [0, 1], [90, 0]) + interpolate(winOut, [0, 1], [60, 0])}px` }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 1 - swap }}>
            <Zoomed keys={hoursKeys} w={WIN.w} h={WIN.h}><Clip src="clips/hours.mp4" segs={HOURS} /></Zoomed>
          </div>
          <Sequence from={B} layout="none">
            <div style={{ position: 'absolute', inset: 0, opacity: swap }}>
              <Zoomed keys={closureKeys} w={WIN.w} h={WIN.h}>
                <Clip src="clips/closure.mp4" segs={CLOSURE} />
                <HolidayRings until={eventAt(c, 'add-closure', CLOSURE)} />
              </Zoomed>
            </div>
          </Sequence>
        </Browser>
      )}
      <Sequence from={C} layout="none">
        <Caption title={<>It’s changed <Em>everywhere.</Em></>} at={0} />
        <Arrive at={4} x={110} y={376} width={600}><MapsCard at={4} mode="hours" /></Arrive>
        <Arrive at={16} x={750} y={250} width={1060}><WebsiteHoursCard at={16} width={1060} /></Arrive>
        <Arrive at={28} x={750} y={612} width={1060}><CalendarCard at={28} width={1060} /></Arrive>
        {[4, 16, 28].map(f => <Sfx key={f} name="pop" at={f} volume={0.3} />)}
        {[14, 26, 38].map(f => <Sfx key={f} name="ping" at={f} volume={0.12} />)}
      </Sequence>
      {clicksOf(h, HOURS).map((f, i) => <Sfx key={`h${i}`} name="click" at={f} volume={0.28} />)}
      {clicksOf(c, CLOSURE).map((f, i) => <Sfx key={`c${i}`} name="click" at={B + f} volume={0.28} />)}
      <Sfx name="whoosh" at={C - 10} volume={0.25} />
    </Cream>
  )
}
