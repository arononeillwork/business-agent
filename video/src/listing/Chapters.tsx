// The Google reviews & opening hours video's two chapters, each made as the owner video's are (the change made
// once in the app, recorded by video/capture/listing.mjs; then everywhere it shows, each place ticking "Updated"):
//   1 Opening hours: Sunday closes at three, saved once → Google Maps, the café's website.
//   2 Reviews: Tom's two-star review, the reply drafted in his language, posted → Google Maps.
import { Chapter } from '../owner/Fix'
import { MapsHours, MapsIcon, MapsReview, WebsiteHours } from '../owner/where'
import { Em, type CamKey } from '../kit'
import { camOn, eventAt, type ClipMeta } from '../clips'
import { Globe } from '../places'
import type { Segment } from '../timeline'
import hoursLog from '../../public/clips/listing-hours.json'
import reviewsLog from '../../public/clips/listing-reviews.json'

const HOURS_LOG = hoursLog as unknown as ClipMeta
const REVIEWS_LOG = reviewsLog as unknown as ClipMeta
const START: CamKey = { f: 0, s: 1, fx: 720, fy: 450 }

// ---------- 1 Opening hours ----------
const HOURS: Segment[] = [
  { a: 1.4, b: 9.4, rate: 1.5 },   // Sunday closes at 15:00, saved
  { a: 9.4, b: 14.4, rate: 1.25 }, // Google Maps kept in step by itself
]

export function Hours({ len }: { len: number }) {
  const m = HOURS_LOG
  const save = eventAt(m, 'save', HOURS)
  const keys: CamKey[] = [
    START,
    camOn(m, 'sunday', HOURS, 1.55, 10, { x: -60, y: -60 }),
    camOn(m, 'save', HOURS, 1.35, 10, { x: 200, y: -120 }),
    camOn(m, 'google', HOURS, 1.4, 10, { x: 0, y: -40 }),
  ]
  return (
    <Chapter n={1} of={2} label="Opening hours" len={len} src="clips/listing-hours.mp4" meta={m} segs={HOURS} keys={keys}
      url={() => 'businesssagent.com/opening-hours'}
      captions={[
        { from: 0, title: <>Close at three on Sundays. <Em>Once.</Em></> },
        { from: save + 6, title: <>Saved, and <Em>Google is told.</Em></> },
      ]}
      everywhere={<>Google Maps and your site <Em>follow.</Em></>}
      change={{ title: 'Opening hours', value: 'Sunday 09:00–15:00' }}
      places={[
        { name: 'Google Maps', icon: <MapsIcon />, width: 500, body: a => <MapsHours at={a} /> },
        { name: 'Your website', icon: <Globe />, width: 500, body: a => <WebsiteHours at={a} /> },
      ]} />
  )
}

// ---------- 2 Reviews ----------
const REVIEWS: Segment[] = [
  { a: 1.4, b: 7.9, rate: 1.6 },   // the reviews, Tom's two stars with no reply yet
  { a: 7.9, b: 17.6, rate: 1.6 },  // the reply drafted in his language, posted on Google
]

export function Reviews({ len }: { len: number }) {
  const m = REVIEWS_LOG
  const reply = eventAt(m, 'reply', REVIEWS)
  const keys: CamKey[] = [
    START,
    camOn(m, 'review', REVIEWS, 1.4, 10, { x: 0, y: 40 }),
    camOn(m, 'draft', REVIEWS, 1.45, 8, { x: 0, y: 30 }),
    camOn(m, 'post', REVIEWS, 1.2, 8, { x: 300, y: -120 }),
  ]
  return (
    <Chapter n={2} of={2} label="Reviews" len={len} src="clips/listing-reviews.mp4" meta={m} segs={REVIEWS} keys={keys}
      url={() => 'businesssagent.com/reviews'}
      captions={[
        { from: 0, title: <>Two stars, <Em>and no reply yet.</Em></> },
        { from: reply + 4, title: <>A reply, <Em>drafted for you.</Em></> },
      ]}
      everywhere={<>Answered, <Em>on Google Maps.</Em></>}
      change={{ title: 'Reply to Tom', value: 'posted on Google' }} height={560}
      places={[
        { name: 'Google Maps', icon: <MapsIcon />, width: 680, body: a => <MapsReview at={a} /> },
      ]} />
  )
}
