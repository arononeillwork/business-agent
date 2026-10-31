// The four things the advisor found, each a chapter made the same way, so it's easy to follow:
//   the advisor's tip, one click to the page, the change made once (recorded in the app),
//   then where it shows, each place ticking "Updated".
// 1 Opening hours: Sunday closes at three → Google Maps, the website.
// 2 Prices: Pain au chocolat to €2,90, on its margin → Google Maps, the café TV, the printed menu.
// 3 Offers: leftover croissants on offer by themselves, and the story drawn from it → the TV, Instagram.
// 4 Reviews: Tom's review answered from a drafted reply → Google Maps.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { camOn, clicksOf, eventAt, type ClipMeta } from '../clips'
import { Globe } from '../places'
import { WIN, lengthOf, type Segment } from '../timeline'
import { CLIPS, ChangePill, Everywhere, Step, type Place } from './parts'
import { InstagramIcon, MapsHours, MapsIcon, MapsMenu, MapsReview, PrintedMenu, StoryPhone, TvClip, WebsiteHours } from './where'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

interface ChapterProps {
  n: number; label: string; len: number; src: string; meta: ClipMeta; segs: Segment[]; keys: CamKey[]; url: (frame: number) => string
  /** The headline over the window, from frame `from` on. */
  captions: { from: number; title: ReactNode }[]
  everywhere: ReactNode; change: { title: string; value: string }; places: Place[]
  /** The places' cards' height. */
  height?: number
}

function Chapter({ n, label, len, src, meta, segs, keys, url, captions, everywhere, change, places, height }: ChapterProps) {
  const frame = useCurrentFrame()
  const W = lengthOf(segs)
  const win = useEnter(2, 200)
  const winOut = interpolate(frame, [W - 10, W], [1, 0], clamp)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {captions.map((c, i) => {
          const to = captions[i + 1]?.from ?? W
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
        <Sequence from={W} layout="none">
          <Caption title={everywhere} at={0} width={960} size={64} />
          <ChangePill at={2} title={change.title} value={change.value} />
          <Everywhere at={4} places={places} height={height} />
          {places.map((_, i) => <Sfx key={i} name="pop" at={20 + i * 10} volume={0.28} />)}
          {places.map((_, i) => <Sfx key={`p${i}`} name="ping" at={30 + i * 10} volume={0.12} />)}
        </Sequence>
        <Step n={n} label={label} at={0} />
      </AbsoluteFill>
      {clicksOf(meta, segs).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
      <Sfx name="whoosh" at={W - 10} volume={0.22} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

const START: CamKey = { f: 0, s: 1, fx: 720, fy: 450 }
const at = (f: number): CamKey => ({ f, s: 1, fx: 720, fy: 450 })

// ---------- 1 Opening hours ----------
const HOURS: Segment[] = [
  { a: 1.0, b: 6.6, rate: 1.6 },   // the tip, and "Open page"
  { a: 6.6, b: 15.2, rate: 1.7 },  // Sunday closes at 15:00, saved
  { a: 15.2, b: 18.8, rate: 1.4 }, // Google Maps kept in step
]

export function Hours({ len }: { len: number }) {
  const m = CLIPS.hours
  const open = eventAt(m, 'open', HOURS)
  const keys: CamKey[] = [
    START,
    camOn(m, 'tip', HOURS, 1.28, 8, { x: 120, y: 0 }),
    at(open + 14),
    camOn(m, 'sunday', HOURS, 1.45, 10, { x: -120, y: -40 }),
    camOn(m, 'google', HOURS, 1.25, 10, { x: 0, y: -60 }),
  ]
  return (
    <Chapter n={1} label="Opening hours" len={len} src="clips/owner-hours.mp4" meta={m} segs={HOURS} keys={keys}
      url={f => (f < open + 6 ? 'businesssagent.com/advisor' : 'businesssagent.com/opening-hours')}
      captions={[
        { from: 0, title: <>Sunday’s last hour <Em>is quiet.</Em></> },
        { from: open + 6, title: <>Close an hour earlier. <Em>Once.</Em></> },
      ]}
      everywhere={<>Google Maps and your site <Em>follow.</Em></>}
      change={{ title: 'Opening hours', value: 'Sunday 09:00–15:00' }}
      places={[
        { name: 'Google Maps', icon: <MapsIcon />, width: 500, body: a => <MapsHours at={a} /> },
        { name: 'Your website', icon: <Globe />, width: 500, body: a => <WebsiteHours at={a} /> },
      ]} />
  )
}

// ---------- 2 Prices ----------
const PRICE: Segment[] = [
  { a: 1.0, b: 6.2, rate: 1.6 },   // the tip, and "Open page"
  { a: 6.2, b: 19.0, rate: 1.9 },  // Menu costing: Pain au chocolat, €2.90, saved
  { a: 19.0, b: 22.6, rate: 1.3 }, // on target
]

export function Price({ len }: { len: number }) {
  const m = CLIPS.price
  const open = eventAt(m, 'open', PRICE)
  const keys: CamKey[] = [
    START,
    camOn(m, 'tip', PRICE, 1.3, 8, { x: 60, y: 0 }),
    at(open + 14),
    camOn(m, 'row', PRICE, 1.3, 10, { x: 260, y: 0 }),
    camOn(m, 'price', PRICE, 1.4, 8, { x: 330, y: 90 }),
    { ...camOn(m, 'save', PRICE, 1, 6), fx: 720, fy: 450 },
    camOn(m, 'after', PRICE, 1.35, 6, { x: 330, y: 0 }),
  ]
  return (
    <Chapter n={2} label="Prices" len={len} src="clips/owner-price.mp4" meta={m} segs={PRICE} keys={keys}
      url={f => (f < open + 6 ? 'businesssagent.com/advisor' : 'businesssagent.com/recipes')}
      captions={[
        { from: 0, title: <>Pain au chocolat <Em>earns too little.</Em></> },
        { from: open + 6, title: <>€2,90, and it’s <Em>on target.</Em></> },
      ]}
      everywhere={<>The new price, <Em>everywhere.</Em></>}
      change={{ title: 'Pain au chocolat', value: '€2,90' }}
      places={[
        { name: 'Google Maps', icon: <MapsIcon />, width: 420, body: a => <MapsMenu at={a} /> },
        { name: 'Café TV', icon: null, width: 620, bare: true, body: a => <TvClip width={620} a={21} b={27} at={a} ring={{ x: 820, y: 640, w: 680, h: 50 }} /> },
        { name: 'Printed menu', icon: null, width: 380, bare: true, body: a => <PrintedMenu at={a} width={380} /> },
      ]} />
  )
}

// ---------- 3 Offers ----------
const OFFER: Segment[] = [
  { a: 0.8, b: 8.6, rate: 1.8 },   // today's croissants, on offer by themselves (the last-day rule), on the counter TV
  { a: 8.6, b: 17.6, rate: 1.6 },  // its story: the picture drawn from the offer, posted
]

export function Offer({ len }: { len: number }) {
  const m = CLIPS.offer
  const story = eventAt(m, 'story', OFFER)
  const keys: CamKey[] = [
    START,
    camOn(m, 'automatic', OFFER, 1.55, 10, { x: 120, y: 30 }),
    camOn(m, 'story', OFFER, 1.4, 8, { x: 140, y: -40 }),
    camOn(m, 'picture', OFFER, 1.3, 8, { x: 200, y: 120 }),
    at(eventAt(m, 'schedule', OFFER) + 4),
  ]
  return (
    <Chapter n={3} label="Offers" len={len} src="clips/owner-offer.mp4" meta={m} segs={OFFER} keys={keys}
      url={() => 'businesssagent.com/offers'}
      captions={[
        { from: 0, title: <>Leftovers? <Em>On offer by themselves.</Em></> },
        { from: story - 4, title: <>Its story, drawn for you. <Em>Posted.</Em></> },
      ]}
      everywhere={<>On the café TV, and <Em>on Instagram.</Em></>}
      change={{ title: 'Butter croissants', value: '€1.68 until closing' }}
      places={[
        { name: 'Café TV', icon: null, width: 760, bare: true, body: a => <TvClip width={760} a={1} b={7} at={a} /> },
        { name: 'Instagram', icon: <InstagramIcon />, width: 300, bare: true, body: a => <StoryPhone width={240} at={a} /> },
      ]} />
  )
}

// ---------- 4 Reviews ----------
const REVIEWS: Segment[] = [
  { a: 1.0, b: 6.15, rate: 1.6 },  // the tip, and "Open page"
  { a: 6.6, b: 21.6, rate: 2.0 },  // Tom's review: a reply drafted in his language, posted on Google
]

export function Reviews({ len }: { len: number }) {
  const m = CLIPS.reviews
  const open = eventAt(m, 'open', REVIEWS)
  const keys: CamKey[] = [
    START,
    camOn(m, 'tip', REVIEWS, 1.3, 8, { x: 60, y: 0 }),
    at(open + 14),
    camOn(m, 'review', REVIEWS, 1.3, 10, { x: 0, y: 40 }),
    camOn(m, 'draft', REVIEWS, 1.3, 8, { x: 0, y: 30 }),
  ]
  return (
    <Chapter n={4} label="Reviews" len={len} src="clips/owner-reviews.mp4" meta={m} segs={REVIEWS} keys={keys}
      url={f => (f < open + 6 ? 'businesssagent.com/advisor' : 'businesssagent.com/reviews')}
      captions={[
        { from: 0, title: <>Two reviews <Em>waiting for a reply.</Em></> },
        { from: open + 6, title: <>A reply, <Em>drafted for you.</Em></> },
      ]}
      everywhere={<>Answered, <Em>on Google Maps.</Em></>}
      change={{ title: 'Reply to Tom', value: 'posted on Google' }} height={560}
      places={[
        { name: 'Google Maps', icon: <MapsIcon />, width: 680, body: a => <MapsReview at={a} /> },
      ]} />
  )
}

