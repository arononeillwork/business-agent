// The "Adding up hours and tips" video's three chapters in the app (recorded by video/capture/hours.mjs, Easy Beans
// in demo mode, the last week of November 2026, the demo's Julio shown as Sam):
//   1 Clock in: Maria's phone on Thursday morning, clocked in; after her shift (a cut), clocked out, the day's hours.
//   2 The hours: Sunday evening, the week's Timecards added up; Maria's correction approved in one press, her week
//     with it; the week approved and saved to Google Drive for payroll.
//   3 The tips: Monday morning, last week's card tips in from Square by who took each payment; "Share out tips": the
//     jar's cash counted, the till's card tips in one press, shared out by the hours each person worked.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Clip, Cream, Em, Phone, Sfx, useEnter, type CamKey } from '../kit'
import { clicksOf, eventAt, type ClipMeta } from '../clips'
import type { Segment } from '../timeline'
import { Recorded } from '../competitors/Chapters'
import { BA, text } from '../theme'
import phoneLog from '../../public/clips/hours-phone.json'
import hoursLog from '../../public/clips/hours-hours.json'
import tipsLog from '../../public/clips/hours-tips.json'

const PHONE = phoneLog as unknown as ClipMeta
const HOURS = hoursLog as unknown as ClipMeta
const TIPS = tipsLog as unknown as ClipMeta
const STEPS = 3
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })

// ---------- 1 Clock in ----------
const PHONE_SEGS: Segment[] = [
  { a: 0.3, b: 6.2, rate: 1 },  // Thursday, 09:55: clocked in
  { a: 6.9, b: 14.1, rate: 1 }, // the end of her shift: clocked out, the day's hours
]

export function ClockIn({ len }: { len: number }) {
  const m = PHONE, segs = PHONE_SEGS
  const frame = useCurrentFrame()
  const p = useEnter(0, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const later = eventAt(m, 'shift', segs) - 40
  const captions: { from: number; title: ReactNode }[] = [
    { from: 0, title: <>Staff clock in <Em>on their phone.</Em></> },
    { from: later, title: <>Shift over: <Em>clock out.</Em></> },
    { from: eventAt(m, 'summary', segs) - 6, title: <>The day’s hours, <Em>counted.</Em></> },
  ]
  // At the cut: the clock on, five hours, for a moment.
  const cut = Math.round(later)
  const badge = interpolate(frame, [cut, cut + 8, cut + 50, cut + 60], [0, 1, 1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {captions.map((c, i) => {
          const to = captions[i + 1]?.from ?? len
          return (
            <Sequence key={i} from={c.from} durationInFrames={to - c.from} layout="none">
              <Caption eyebrow="1 of 3 · Clock in" title={c.title} at={0} out={to - c.from} size={84} x={200} y={360} width={840} />
            </Sequence>
          )
        })}
        <div style={{ position: 'absolute', left: 1110, top: 70, width: 470, opacity: p, translate: `0 ${interpolate(p, [0, 1], [100, 0])}px` }}>
          <Phone width={470}><Clip src="clips/hours-phone.mp4" segs={segs} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 1345, top: 470, translate: '-50% 0', opacity: badge, scale: String(interpolate(badge, [0, 1], [0.85, 1])),
          padding: '14px 26px', borderRadius: 999, background: BA.ink, color: '#fff', fontFamily: text, fontWeight: 600, fontSize: 34,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>09:55 → 15:01</div>
      </AbsoluteFill>
      {clicksOf(m, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.26} />)}
      <Sfx name="ping" at={eventAt(m, 'in', segs) + 8} volume={0.16} />
      <Sfx name="rewind" at={cut} volume={0.12} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

// ---------- 2 The hours ----------
const HOURS_SEGS: Segment[] = [
  { a: 1.0, b: 7.0, rate: 1.4 },   // Sunday evening, the week: 101 hours paid
  { a: 7.0, b: 13.0, rate: 1.3 },  // Maria's correction (she stayed 20 minutes), approved
  { a: 13.0, b: 21.0, rate: 1.7 }, // her week, the correction in it
  { a: 21.0, b: 27.3, rate: 2.0 }, // the week approved
  { a: 27.3, b: 35.8, rate: 1.7 }, // saved to Google Drive, for payroll
]

export function Hours({ len }: { len: number }) {
  const m = HOURS, segs = HOURS_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'paid', segs, 1.3, 840, 540, 10),
    on(m, 'request', segs, 1.3, 846, 480, 10),
    on(m, 'approve', segs, 1.3, 846, 480),
    on(m, 'maria', segs, 1.15, 846, 450, 6),
    on(m, 'edited', segs, 1.4, 960, 400),
    on(m, 'week', segs, 1.35, 1000, 300, 10),
    on(m, 'menu', segs, 1.35, 760, 380, 6),
    whole(eventAt(m, 'save', segs) + 6),
  ]
  return (
    <Recorded n={2} of={STEPS} label="The hours" len={len} src="clips/hours-hours.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/timecards'}
      captions={[
        { from: 0, title: <>The hours <Em>add themselves up.</Em></> },
        { from: eventAt(m, 'request', segs) - 12, title: <>A correction? <Em>One press.</Em></> },
        { from: eventAt(m, 'week', segs) - 14, title: <>The week, <Em>approved.</Em></> },
        { from: eventAt(m, 'export', segs) - 8, title: <>Ready for payroll. <Em>Saved.</Em></> },
      ]} />
  )
}

// ---------- 3 The tips ----------
const TIPS_SEGS: Segment[] = [
  { a: 1.0, b: 9.6, rate: 1.6 },   // last week's card tips, in from Square by who took each payment
  { a: 9.6, b: 19.8, rate: 1.7 },  // Share out tips: the jar's cash, the till's card tips
  { a: 19.8, b: 26.5, rate: 1.6 }, // by the hours each person worked
  { a: 26.5, b: 33.5, rate: 1.8 }, // shared out, saved
  { a: 33.5, b: 38.9, rate: 1.3 }, // there, with everyone's share
]

export function Tips({ len }: { len: number }) {
  const m = TIPS, segs = TIPS_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'week', segs, 1.3, 846, 300, 10),
    on(m, 'square', segs, 1.3, 846, 400, 6),
    whole(eventAt(m, 'share', segs) + 6),
    on(m, 'period', segs, 1.45, 720, 240, 4),
    on(m, 'split', segs, 1.45, 720, 460, 6),
    on(m, 'status', segs, 1.4, 720, 640, 6),
    on(m, 'save', segs, 1.1, 720, 560, 4),
    on(m, 'pool', segs, 1.3, 846, 640, 6),
  ]
  return (
    <Recorded n={3} of={STEPS} label="The tips" len={len} src="clips/hours-tips.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/tips'}
      captions={[
        { from: 0, title: <>Card tips, <Em>in from Square.</Em></> },
        { from: eventAt(m, 'share', segs) - 4, title: <>Add the jar. <Em>That’s it.</Em></> },
        { from: eventAt(m, 'split', segs) - 10, title: <>Shared out <Em>by hours worked.</Em></> },
        { from: eventAt(m, 'save', segs) + 6, title: <>Everyone <Em>sees their share.</Em></> },
      ]} />
  )
}
