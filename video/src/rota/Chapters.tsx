// The shared rota video's three chapters in the app (recorded by video/capture/rota.mjs, Easy Beans in demo mode, the
// demo's Julio shown as Sam):
//   1 One rota: the owner's week; Sam's Saturday added once, straight in his row, and there for everyone.
//   2 Every phone: on Maria's phone the same rota, Sam's new Saturday on it; Sunday's open shift taken with a tap.
//   3 WhatsApp too: back at the computer all of it on the one rota; "Send on WhatsApp" (each person their own shifts)
//     and "Share to a WhatsApp group" (the whole week, for the team's group).
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Clip, Cream, Em, Phone, Sfx, useEnter, type CamKey } from '../kit'
import { clicksOf, eventAt, type ClipMeta } from '../clips'
import type { Segment } from '../timeline'
import { Recorded } from '../competitors/Chapters'
import changeLog from '../../public/clips/rota-change.json'
import phoneLog from '../../public/clips/rota-phone.json'
import whatsappLog from '../../public/clips/rota-whatsapp.json'

const CHANGE = changeLog as unknown as ClipMeta
const PHONE = phoneLog as unknown as ClipMeta
const WHATSAPP = whatsappLog as unknown as ClipMeta
const STEPS = 3
const URL = () => 'businesssagent.com/rota'
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })

// ---------- 1 One rota ----------
const CHANGE_SEGS: Segment[] = [
  { a: 1.0, b: 9.0, rate: 1.4 },   // the week's rota; Sam's Saturday, pressed
  { a: 9.0, b: 20.0, rate: 1.6 },  // nine till two, saved
  { a: 20.0, b: 24.8, rate: 1.0 }, // there in his row
]

export function Change({ len }: { len: number }) {
  const m = CHANGE, segs = CHANGE_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'week', segs, 1.3, 620, 330, 10),
    on(m, 'cell', segs, 1.3, 1000, 640),
    whole(eventAt(m, 'add', segs) + 12),
    on(m, 'who', segs, 1.35, 720, 330),
    on(m, 'start', segs, 1.35, 720, 400),
    on(m, 'save', segs, 1.1, 720, 480, 4),
    on(m, 'julio', segs, 1.25, 900, 690, 6),
  ]
  return (
    <Recorded n={1} of={STEPS} label="One rota" len={len} src="clips/rota-change.mp4" meta={m} segs={segs} keys={keys} url={URL}
      captions={[
        { from: 0, title: <>One rota. <Em>One place.</Em></> },
        { from: eventAt(m, 'add', segs) - 8, title: <>Sam on Saturday? <Em>Added once.</Em></> },
        { from: eventAt(m, 'save', segs) + 10, title: <>And there it is, <Em>for everyone.</Em></> },
      ]} />
  )
}

// ---------- 2 Every phone ----------
const PHONE_SEGS: Segment[] = [{ a: 0.3, b: 14.2, rate: 0.95 }]

export function EveryPhone({ len }: { len: number }) {
  const m = PHONE, segs = PHONE_SEGS
  const frame = useCurrentFrame()
  const p = useEnter(0, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const captions: { from: number; title: ReactNode }[] = [
    { from: 0, title: <>Maria’s phone: <Em>the same rota.</Em></> },
    { from: eventAt(m, 'sun', segs) - 6, title: <>An open shift? <Em>Taken in a tap.</Em></> },
    { from: eventAt(m, 'take', segs) + 14, title: <>Everyone, <Em>on the same page.</Em></> },
  ]
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {captions.map((c, i) => {
          const to = captions[i + 1]?.from ?? len
          return (
            <Sequence key={i} from={c.from} durationInFrames={to - c.from} layout="none">
              <Caption eyebrow="2 of 3 · Every phone" title={c.title} at={0} out={to - c.from} size={84} x={200} y={360} width={840} />
            </Sequence>
          )
        })}
        <div style={{ position: 'absolute', left: 1110, top: 70, width: 470, opacity: p, translate: `0 ${interpolate(p, [0, 1], [100, 0])}px` }}>
          <Phone width={470}><Clip src="clips/rota-phone.mp4" segs={segs} /></Phone>
        </div>
      </AbsoluteFill>
      {clicksOf(m, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.26} />)}
      <Sfx name="ping" at={eventAt(m, 'take', segs) + 8} volume={0.16} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

// ---------- 3 WhatsApp too ----------
const WHATSAPP_SEGS: Segment[] = [{ a: 1.0, b: 15.3, rate: 1.1 }]

export function WhatsApp({ len }: { len: number }) {
  const m = WHATSAPP, segs = WHATSAPP_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'weekend', segs, 1.35, 1150, 690, 10),
    on(m, 'send', segs, 1.3, 1050, 200, 10),
  ]
  return (
    <Recorded n={3} of={STEPS} label="WhatsApp too" len={len} src="clips/rota-whatsapp.mp4" meta={m} segs={segs} keys={keys} url={URL}
      captions={[
        { from: 0, title: <>All of it, <Em>on the one rota.</Em></> },
        { from: eventAt(m, 'send', segs) - 12, title: <>Each person: <Em>their own shifts.</Em></> },
        { from: eventAt(m, 'share', segs) - 12, title: <>Or the week, <Em>to the team group.</Em></> },
      ]} />
  )
}
