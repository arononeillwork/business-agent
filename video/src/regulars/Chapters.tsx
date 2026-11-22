// The "customers who never come back" video's three chapters in the app (recorded by video/capture/regulars.mjs,
// Easy Beans in demo mode with the till connected off camera), laid out as the competitor video's are:
//   1 Your regulars: Customers searched for "regular", who said yes to marketing; then Loyalty & gift cards, the stamp
//     card read from the till, its members and when each last came in.
//   2 A message: Campaigns' ready-made quiet-day boost, to the customers tagged regular who said yes (3), how one of
//     them gets it, planned for Monday at ten with a reminder; saved, in the list.
//   3 A draw: Competitions' Mondays draw (Mondays take 36% less than the average day), its prize, how to enter, the
//     bases legales and the post written; saved.
import { Em, Sfx, type CamKey } from '../kit'
import { eventAt, type ClipMeta } from '../clips'
import type { Segment } from '../timeline'
import { Recorded } from '../competitors/Chapters'
import customersLog from '../../public/clips/regulars-customers.json'
import campaignLog from '../../public/clips/regulars-campaign.json'
import drawLog from '../../public/clips/regulars-draw.json'

const CUSTOMERS = customersLog as unknown as ClipMeta
const CAMPAIGN = campaignLog as unknown as ClipMeta
const DRAW = drawLog as unknown as ClipMeta
const STEPS = 3

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })

// ---------- 1 Your regulars ----------
const REGULARS_SEGS: Segment[] = [
  { a: 1.2, b: 14.3, rate: 1.5 },  // Customers: "regular", three of them, Lucía, said yes
  { a: 15.0, b: 29.2, rate: 1.6 }, // Loyalty & gift cards: the stamp card, the members, their last visit
]

export function Regulars({ len }: { len: number }) {
  const m = CUSTOMERS, segs = REGULARS_SEGS
  // The cut to Loyalty falls between the two segments: where the second begins.
  const loyalty = Math.round(((REGULARS_SEGS[0].b - REGULARS_SEGS[0].a) * 30) / REGULARS_SEGS[0].rate)
  const keys: CamKey[] = [
    whole(0),
    on(m, 'search', segs, 1.3, 1080, 330, 10),
    on(m, 'found', segs, 1.25, 846, 560),
    on(m, 'lucia', segs, 1.25, 846, 600),
    whole(loyalty),
    on(m, 'stamps', segs, 1.3, 846, 420, 10),
    on(m, 'visits', segs, 1.25, 846, 560, 6),
  ]
  return (
    <Recorded n={1} of={STEPS} label="Your regulars" len={len} src="clips/regulars-customers.mp4" meta={m} segs={segs} keys={keys}
      url={f => (f < loyalty ? 'businesssagent.com/customers' : 'businesssagent.com/loyalty')}
      captions={[
        { from: 0, title: <>Your regulars, <Em>and who said yes.</Em></> },
        { from: loyalty - 4, title: <>Their stamp card, <Em>from the till.</Em></> },
      ]} />
  )
}

// ---------- 2 A message ----------
const CAMPAIGN_SEGS: Segment[] = [
  { a: 1.0, b: 9.4, rate: 1.8 },   // Suggested: the quiet-day boost, started
  { a: 9.4, b: 32.4, rate: 1.8 },  // the message, to the regulars who said yes, how Pablo gets it, planned for Monday; saved
  { a: 33.9, b: 39.4, rate: 1.4 }, // in the list: planned, 14 Dec at ten, three people
]

export function Campaign({ len }: { len: number }) {
  const m = CAMPAIGN, segs = CAMPAIGN_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'idea', segs, 1.3, 846, 640, 10),
    whole(eventAt(m, 'start', segs) + 14),
    on(m, 'message', segs, 1.3, 720, 300),
    on(m, 'tagged', segs, 1.3, 720, 430),
    on(m, 'preview', segs, 1.3, 720, 560),
    on(m, 'planned', segs, 1.3, 720, 640),
    on(m, 'save', segs, 1.15, 720, 560, 4),
    whole(eventAt(m, 'list', segs) - 6),
    on(m, 'row', segs, 1.25, 846, 560, 6),
  ]
  return (
    <Recorded n={2} of={STEPS} label="A message" len={len} src="clips/regulars-campaign.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/campaigns'}
      captions={[
        { from: 0, title: <>Monday’s message, <Em>ready-made.</Em></> },
        { from: eventAt(m, 'tagged', segs) - 10, title: <>Only to regulars <Em>who said yes.</Em></> },
        { from: eventAt(m, 'planned', segs) - 12, title: <>Planned, <Em>with a reminder.</Em></> },
      ]} />
  )
}

// ---------- 3 A draw ----------
const DRAW_SEGS: Segment[] = [
  { a: 0.8, b: 8.0, rate: 1.6 },   // Ideas for you: the Mondays draw, from the takings
  { a: 8.0, b: 23.4, rate: 1.75 }, // the prize, how to enter, the bases legales and the post; saved
  { a: 23.4, b: 29.2, rate: 1.4 }, // in Your competitions
]

export function Draw({ len }: { len: number }) {
  const m = DRAW, segs = DRAW_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'idea', segs, 1.35, 620, 500, 10),
    whole(eventAt(m, 'use', segs) + 14),
    on(m, 'prize', segs, 1.3, 720, 380),
    on(m, 'enter', segs, 1.3, 720, 500),
    on(m, 'post', segs, 1.3, 720, 600, 10),
    on(m, 'save', segs, 1.1, 720, 500, 4),
    on(m, 'row', segs, 1.25, 846, 480, 6),
  ]
  return (
    <Recorded n={3} of={STEPS} label="A draw" len={len} src="clips/regulars-draw.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/competitions'}
      captions={[
        { from: 0, title: <>Mondays: 36% less. <Em>So, a draw.</Em></> },
        { from: eventAt(m, 'prize', segs) - 10, title: <>The rules and post, <Em>written.</Em></> },
        { from: eventAt(m, 'row', segs) - 24, title: <>Saved. <Em>Ready for Monday.</Em></> },
      ]}>
      <Sfx name="ping" at={eventAt(m, 'save', segs) + 8} volume={0.14} />
    </Recorded>
  )
}
