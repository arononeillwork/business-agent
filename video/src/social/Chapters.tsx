// The "Instagram and TikTok never get posted" video's two chapters in the app (recorded by video/capture/social.mjs,
// Easy Beans in demo mode):
//   1 The team: Julio's phone, the ideas for posts; he takes "The coffees we have now", takes the photo (the camera's
//     shutter drawn over the phone), adds it and hands it in.
//   2 One press: at the computer, the owner makes the post from it, adds a line to the caption, and schedules it for
//     six o'clock on every account (Instagram, TikTok, LinkedIn, Google Maps), to go out by itself.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Caption, Clip, Cream, Em, Phone, Sfx, useEnter, type CamKey } from '../kit'
import { clicksOf, eventAt, type ClipMeta } from '../clips'
import type { Segment } from '../timeline'
import { Recorded } from '../competitors/Chapters'
import { PHOTO } from './Drawn'
import phoneLog from '../../public/clips/social-phone.json'
import postLog from '../../public/clips/social-post.json'

const PHONE = phoneLog as unknown as ClipMeta
const POST = postLog as unknown as ClipMeta
const STEPS = 2
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The camera's shutter over the phone, and the photo it took, for a moment, before it shows on the idea. */
function Shutter() {
  const frame = useCurrentFrame()
  const flash = interpolate(frame, [0, 3, 12], [0, 1, 0], clamp)
  const photo = interpolate(frame, [2, 8, 40, 50], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: '#111', opacity: photo }}>
        <Img src={staticFile(PHOTO)} style={{ width: '100%', height: '100%', objectFit: 'cover', scale: String(interpolate(frame, [2, 50], [1.06, 1], clamp)) }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  )
}

// ---------- 1 The team ----------
const PHONE_SEGS: Segment[] = [{ a: 0.3, b: 15.9, rate: 1 }]

export function Team({ len }: { len: number }) {
  const m = PHONE, segs = PHONE_SEGS
  const frame = useCurrentFrame()
  const p = useEnter(0, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const take = eventAt(m, 'take', segs)
  const add = eventAt(m, 'add', segs)
  const handin = eventAt(m, 'handin', segs)
  const captions: { from: number; title: ReactNode }[] = [
    { from: 0, title: <>Ideas for posts, <Em>for the whole team.</Em></> },
    { from: take - 8, title: <>Julio takes one. <Em>On his phone.</Em></> },
    { from: handin - 10, title: <>Photo taken. <Em>Handed in.</Em></> },
  ]
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {captions.map((c, i) => {
          const to = captions[i + 1]?.from ?? len
          return (
            <Sequence key={i} from={c.from} durationInFrames={to - c.from} layout="none">
              <Caption eyebrow="1 of 2 · The team" title={c.title} at={0} out={to - c.from} size={84} x={200} y={360} width={840} />
            </Sequence>
          )
        })}
        <div style={{ position: 'absolute', left: 1110, top: 70, width: 470, opacity: p, translate: `0 ${interpolate(p, [0, 1], [100, 0])}px` }}>
          <Phone width={470}>
            <Clip src="clips/social-phone.mp4" segs={segs} />
            <Sequence from={Math.round(add + 4)} durationInFrames={52} layout="none"><Shutter /></Sequence>
          </Phone>
        </div>
      </AbsoluteFill>
      {clicksOf(m, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.26} />)}
      <Sfx name="stamp" at={add + 5} volume={0.18} />
      <Sfx name="ping" at={handin + 8} volume={0.16} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

// ---------- 2 One press ----------
const POST_SEGS: Segment[] = [
  { a: 1.0, b: 9.0, rate: 1.5 },   // the idea handed in, and Make a post
  { a: 9.0, b: 22.0, rate: 1.9 },  // the post made: the photo, a line added to the caption, every account ticked
  { a: 22.0, b: 35.0, rate: 1.9 }, // six o'clock, it goes out by itself; Schedule
  { a: 35.0, b: 40.6, rate: 1.3 }, // in Coming up, today at 18:00
]

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })

export function Post({ len }: { len: number }) {
  const m = POST, segs = POST_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'idea', segs, 1.4, 560, 470, 10),
    whole(eventAt(m, 'make', segs) + 12),
    on(m, 'photo', segs, 1.35, 720, 330),
    on(m, 'caption', segs, 1.35, 720, 430),
    on(m, 'targets', segs, 1.35, 720, 640),
    on(m, 'schedule', segs, 1.35, 720, 600),
    on(m, 'save', segs, 1.1, 720, 560, 4),
    on(m, 'post', segs, 1.3, 846, 450, 6),
  ]
  return (
    <Recorded n={2} of={STEPS} label="One press" len={len} src="clips/social-post.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/social'}
      captions={[
        { from: 0, title: <>One press: <Em>the post, made.</Em></> },
        { from: eventAt(m, 'caption', segs) - 10, title: <>Add a line, <Em>if you like.</Em></> },
        { from: eventAt(m, 'schedule', segs) - 12, title: <>Six o’clock, <Em>every account.</Em></> },
        { from: eventAt(m, 'post', segs) - 24, title: <>Scheduled. <Em>It posts itself.</Em></> },
      ]} />
  )
}
