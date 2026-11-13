// The food waste video's three chapters in the app (recorded by video/capture/waste.mjs, Easy Beans in demo
// mode), each with its step top right, as the owner video's are:
//   1 Log it once: Stock → Freshly made → Record a batch: banana bread × 12, keeps 3 days, 50% off from a day
//     before the end, on every screen that's on. Recorded, with its offer.
//   2 On offer by itself: two days on (the clock moved, nothing else), its card says it's on offer now, and
//     Offers & specials has it live, €2,00 instead of €4,00, on the counter TV.
//   3 On the café TV: the TV's own recording, the offer coming round in its slideshow.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { camOn, clicksOf, eventAt, type ClipMeta } from '../clips'
import { Ring } from '../places'
import { WIN, lengthOf, type Segment } from '../timeline'
import { ChangePill, Everywhere, Step, Tv } from '../owner/parts'
import batchLog from '../../public/clips/waste-batch.json'
import { euro } from './Drawn'

const BATCH = batchLog as unknown as ClipMeta
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const STEPS = 3

/** A recording in the browser window under its headlines, with its step top right; the window goes at the end of the recording. */
function Recorded({ n, label, len, segs, keys, url, captions, children }: {
  n: number; label: string; len: number; segs: Segment[]; keys: CamKey[]; url: (frame: number) => string
  captions: { from: number; title: ReactNode }[]; children?: ReactNode
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
            <Zoomed keys={keys} w={WIN.w} h={WIN.h}><Clip src="clips/waste-batch.mp4" segs={segs} /></Zoomed>
          </Browser>
        )}
        {children}
        <Step n={n} of={STEPS} label={label} at={0} />
      </AbsoluteFill>
      {clicksOf(BATCH, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

const centre = (f: number, s = 1, fx = 720, fy = 450): CamKey => ({ f: Math.max(0, Math.round(f)), s, fx, fy })

// ---------- 1 Log it once ----------
const LOG: Segment[] = [
  { a: 1.4, b: 6.6, rate: 1.6 },   // Freshly made, "Record a batch"
  { a: 6.6, b: 34.4, rate: 2.1 },  // banana bread × 12, 3 days, half price from its last day, recorded
  { a: 34.4, b: 38.8, rate: 1.3 }, // on the counter
]

export function Log({ len }: { len: number }) {
  const m = BATCH
  const e = (label: string) => eventAt(m, label, LOG)
  const keys: CamKey[] = [
    centre(0),
    camOn(m, 'record', LOG, 1.35, 10, { x: -160, y: 70 }),
    centre(e('name') - 12, 1.3, 720, 300),
    centre(e('shelf') - 8, 1.3, 720, 420),
    centre(e('offer-on') - 8, 1.38, 720, 470),
    centre(e('percent') - 8, 1.42, 720, 520),
    centre(e('summary') - 6, 1.42, 720, 615),
    centre(e('save') - 8, 1.22, 720, 640),
    camOn(m, 'card', LOG, 1.45, 12),
  ]
  return (
    <Recorded n={1} label="Log it once" len={len} segs={LOG} keys={keys} url={() => 'businesssagent.com/stock?tab=fresh'}
      captions={[
        { from: 0, title: <>Log it once, <Em>and how long it keeps.</Em></> },
        { from: e('offer-on') - 6, title: <>Half price <Em>on its last day.</Em></> },
        { from: e('save') + 8, title: <>Then <Em>forget about it.</Em></> },
      ]} />
  )
}

// ---------- 2 On offer by itself ----------
const OFFER: Segment[] = [
  { a: 39.6, b: 47.0, rate: 1.3 }, // two days on: on offer now, by itself
  { a: 47.0, b: 55.5, rate: 1.5 }, // live on Offers & specials, on the counter TV
]

export function Offer({ len }: { len: number }) {
  const m = BATCH
  const page = eventAt(m, 'offers-page', OFFER)
  const keys: CamKey[] = [
    centre(0, 1.5, 561, 800),
    camOn(m, 'offer-link', OFFER, 1.7, 10, { x: 120, y: -40 }),
    centre(page + 4),
    camOn(m, 'offer', OFFER, 1.4, 10, { x: 140, y: -20 }),
    camOn(m, 'tv', OFFER, 1.55, 10, { x: 80, y: 20 }),
  ]
  return (
    <Recorded n={2} label="On offer by itself" len={len} segs={OFFER} keys={keys}
      url={f => (f < page ? 'businesssagent.com/stock?tab=fresh' : 'businesssagent.com/offers')}
      captions={[
        { from: 0, title: <>Its last day: <Em>on offer by itself.</Em></> },
        { from: page + 2, title: <>Live now, <Em>{euro(2)} instead of {euro(4)}.</Em></> },
      ]} />
  )
}

// ---------- 3 On the café TV ----------

/** The TV's own recording (video/capture/waste.mjs `tv`), its offer slide first; the price ringed. */
function TvClip({ width, at }: { width: number; at: number }) {
  const screenW = width - 2 * Math.round(width * 0.018)
  const k = screenW / 1600
  return (
    <Tv width={width}>
      <Sequence from={at} layout="none"><Clip src="clips/waste-tv.mp4" segs={[{ a: 1, b: 14, rate: 1 }]} /></Sequence>
      <Ring at={at + 22} x={590 * k} y={448 * k} w={300 * k} h={118 * k} />
    </Tv>
  )
}

export function Screen({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>On the café TV. <Em>Nobody has to remember.</Em></>} at={0} width={1300} size={64} />
        <ChangePill at={2} title="Banana bread" value={`${euro(2)} until tomorrow`} />
        <Everywhere at={4} height={560} places={[
          { name: 'Counter TV', icon: null, width: 980, bare: true, body: a => <TvClip width={980} at={a} /> },
        ]} />
        <Step n={3} of={STEPS} label="On the café TV" at={0} />
      </AbsoluteFill>
      <Sfx name="pop" at={20} volume={0.28} />
      <Sfx name="ping" at={30} volume={0.14} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}
