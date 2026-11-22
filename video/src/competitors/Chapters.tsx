// The competitor insights video's three chapters in the app (recorded by video/capture/competitors.mjs, Easy Beans in
// demo mode on the Competitors page), each with its step top right, as the food waste video's are:
//   1 At a glance: the places followed, your prices against the area, your Google rating; then what it all means
//     for you, in plain words (breakfast is a gap; laptops only you; three open before you; a new café on Google).
//   2 Prices: the cappuccino at every place, yours in purple against the dashed average; the croissant; then every
//     price rise nearby in the last 90 days.
//   3 New nearby: Google looks around again every week; the new café 150 m away, followed, now in Places.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { clicksOf, eventAt, type ClipMeta } from '../clips'
import { WIN, lengthOf, type Segment } from '../timeline'
import { Step } from '../owner/parts'
import glanceLog from '../../public/clips/competitors-glance.json'
import pricesLog from '../../public/clips/competitors-prices.json'
import nearbyLog from '../../public/clips/competitors-nearby.json'

const GLANCE = glanceLog as unknown as ClipMeta
const PRICES = pricesLog as unknown as ClipMeta
const NEARBY = nearbyLog as unknown as ClipMeta
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const STEPS = 3
const URL = () => 'businesssagent.com/competitors'

/**
 * A recording in the browser window under its headlines, with its step top right (`n` of `of`); the window goes at
 * the end of the recording. `url` is the address bar at a frame (the Competitors page unless said).
 */
export function Recorded({ n, of = STEPS, label, len, src, meta, segs, keys, captions, url = URL, children }: {
  n: number; of?: number; label: string; len: number; src: string; meta: ClipMeta; segs: Segment[]; keys: CamKey[]
  captions: { from: number; title: ReactNode }[]; url?: (frame: number) => string; children?: ReactNode
}) {
  const frame = useCurrentFrame()
  const W = lengthOf(segs)
  const win = useEnter(2, 200)
  const winOut = interpolate(frame, [W - 10, W], [1, 0], clamp)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {captions.map((c, i) => {
          const to = captions[i + 1]?.from ?? len
          return (
            <Sequence key={i} from={c.from} durationInFrames={to - c.from} layout="none">
              <Caption title={c.title} at={0} out={to - c.from} width={960} size={64} />
            </Sequence>
          )
        })}
        {frame < W && (
          <Browser url={url(frame)} width={WIN.w} height={WIN.h}
            style={{ left: WIN.x, top: WIN.y, opacity: win * winOut, translate: `0 ${interpolate(win, [0, 1], [90, 0]) + interpolate(winOut, [0, 1], [60, 0])}px` }}>
            <Zoomed keys={keys} w={WIN.w} h={WIN.h}><Clip src={src} segs={segs} /></Zoomed>
          </Browser>
        )}
        {children}
        <Step n={n} of={of} label={label} at={0} />
      </AbsoluteFill>
      {clicksOf(meta, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
      <Sfx name="whoosh" at={W - 10} volume={0.2} />
    </Cream>
  )
}

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })

// ---------- 1 At a glance ----------
const GLANCE_SEGS: Segment[] = [
  { a: 1.0, b: 10.4, rate: 1.4 },  // following five, your prices against the area, your rating
  { a: 10.4, b: 22.8, rate: 1.4 }, // what it means for you
]

export function Glance({ len }: { len: number }) {
  const m = GLANCE, segs = GLANCE_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'following', segs, 1.6, 560, 300, 10),
    on(m, 'prices', segs, 1.6, 705, 300),
    on(m, 'rating', segs, 1.6, 860, 300),
    on(m, 'gap', segs, 1.25, 846, 534, 10),
    on(m, 'hours', segs, 1.3, 846, 560),
    on(m, 'new', segs, 1.3, 846, 600),
  ]
  return (
    <Recorded n={1} label="At a glance" len={len} src="clips/competitors-glance.mp4" meta={m} segs={segs} keys={keys}
      captions={[
        { from: 0, title: <>Every café round you, <Em>in one place.</Em></> },
        { from: eventAt(m, 'gap', segs) - 16, title: <>What it means, <Em>in plain words.</Em></> },
      ]} />
  )
}

// ---------- 2 Prices ----------
const PRICES_SEGS: Segment[] = [
  { a: 1.5, b: 8.2, rate: 1.6 },   // the Prices tab, down to Compare one item
  { a: 8.2, b: 19.6, rate: 1.3 },  // the cappuccino at every place, yours in purple; the croissant
  { a: 19.6, b: 25.2, rate: 1.25 }, // the price rises nearby in the last 90 days
]

export function Prices({ len }: { len: number }) {
  const m = PRICES, segs = PRICES_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'sentence', segs, 1.25, 846, 300, 12),
    on(m, 'you', segs, 1.3, 846, 320),
    on(m, 'croissant', segs, 1.25, 846, 300),
    on(m, 'rise', segs, 1.25, 846, 720, 6),
  ]
  return (
    <Recorded n={2} label="Prices" len={len} src="clips/competitors-prices.mp4" meta={m} segs={segs} keys={keys}
      captions={[
        { from: 0, title: <>Your cappuccino, <Em>against the street.</Em></> },
        { from: eventAt(m, 'rise', segs) - 40, title: <>Every price rise nearby, <Em>on record.</Em></> },
      ]} />
  )
}

// ---------- 3 New nearby ----------
const NEARBY_SEGS: Segment[] = [
  { a: 1.5, b: 7.6, rate: 1.5 },   // the Nearby tab
  { a: 7.6, b: 16.4, rate: 1.25 }, // looked around every week; the new café, followed
  { a: 16.4, b: 24.5, rate: 1.3 }, // in Places, with the others
]

export function Nearby({ len }: { len: number }) {
  const m = NEARBY, segs = NEARBY_SEGS
  const follow = eventAt(m, 'follow', segs)
  const places = eventAt(m, 'places', segs)
  const keys: CamKey[] = [
    whole(0),
    on(m, 'weekly', segs, 1.25, 846, 420, 12),
    on(m, 'new', segs, 1.3, 846, 600),
    { f: Math.round(follow + 28), s: 1.12, fx: 760, fy: 380 },
    whole(places + 4),
    on(m, 'followed', segs, 1.25, 846, 520, 6),
  ]
  return (
    <Recorded n={3} label="New nearby" len={len} src="clips/competitors-nearby.mp4" meta={m} segs={segs} keys={keys}
      captions={[
        { from: 0, title: <>Google looks around, <Em>every week.</Em></> },
        { from: eventAt(m, 'new', segs) - 14, title: <>A new café nearby? <Em>You know first.</Em></> },
        { from: places - 6, title: <>Followed, <Em>from now on.</Em></> },
      ]}>
      <Sfx name="ping" at={follow + 10} volume={0.14} />
    </Recorded>
  )
}
