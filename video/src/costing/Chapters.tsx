// The "prices set by feel" video's three chapters in the app (recorded by video/capture/costing.mjs, Easy Beans in
// demo mode with the till connected off camera), laid out as the competitor video's are:
//   1 What it costs: Menu costing's margins at a glance; a flat white from what goes in (espresso €0,33, milk €0,14,
//     cup €0,08, lid €0,04): €0,61 to make, €2,30 to the café (78,9%); with oat milk, €0,69.
//   2 When costs move: on Stock, the house blend's new price (€18,50 → €21 a kilo) typed once; on Menu costing, the
//     coffees, each recosted (the flat white €0,66), and the average margin with them.
//   3 Thin margins: the advisor's "Some prices don't reach your margin"; Pain au chocolat at €2,90, 60% and on target.
import { Em, Sfx, type CamKey } from '../kit'
import { eventAt, type ClipMeta } from '../clips'
import type { Segment } from '../timeline'
import { Recorded } from '../competitors/Chapters'
import costLog from '../../public/clips/costing-cost.json'
import beansLog from '../../public/clips/costing-beans.json'
import marginLog from '../../public/clips/costing-margin.json'

const COST = costLog as unknown as ClipMeta
const BEANS = beansLog as unknown as ClipMeta
const MARGIN = marginLog as unknown as ClipMeta
const STEPS = 3

/** The camera on a point of the recording (its own CSS pixels), zoom `s`, settled `lead` frames before a logged moment. */
const on = (m: ClipMeta, label: string, segs: Segment[], s: number, fx: number, fy: number, lead = 8): CamKey =>
  ({ f: Math.max(0, Math.round(eventAt(m, label, segs) - lead)), s, fx, fy })
const whole = (f: number): CamKey => ({ f: Math.max(0, Math.round(f)), s: 1, fx: 720, fy: 450 })
/** Where a segment begins in the scene (frames): a cut between pages falls there. */
const startOf = (segs: Segment[], n: number) => segs.slice(0, n).reduce((f, s) => f + Math.round(((s.b - s.a) * 30) / s.rate), 0)

// ---------- 1 What it costs ----------
const COST_SEGS: Segment[] = [
  { a: 1.0, b: 9.6, rate: 1.7 },   // the margins at a glance; the flat white
  { a: 9.6, b: 26.0, rate: 1.9 },  // its price, and what goes in
  { a: 26.4, b: 33.6, rate: 1.35 }, // what it costs and makes; with oat milk
]

export function Cost({ len }: { len: number }) {
  const m = COST, segs = COST_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'average', segs, 1.5, 846, 300, 10),
    on(m, 'row', segs, 1.25, 846, 700),
    whole(eventAt(m, 'item', segs) + 12),
    on(m, 'price', segs, 1.35, 720, 300),
    on(m, 'ingredients', segs, 1.35, 720, 360),
    on(m, 'cost', segs, 1.35, 720, 430),
    on(m, 'oat', segs, 1.35, 720, 640),
  ]
  return (
    <Recorded n={1} of={STEPS} label="What it costs" len={len} src="clips/costing-cost.mp4" meta={m} segs={segs} keys={keys}
      url={() => 'businesssagent.com/recipes'}
      captions={[
        { from: 0, title: <>Your menu, <Em>with its margins.</Em></> },
        { from: eventAt(m, 'item', segs) - 4, title: <>Built from <Em>what goes in.</Em></> },
        { from: eventAt(m, 'cost', segs) - 10, title: <>€0,61 to make. <Em>€2,30 to you.</Em></> },
      ]} />
  )
}

// ---------- 2 When costs move ----------
const BEANS_SEGS: Segment[] = [
  { a: 1.0, b: 18.2, rate: 1.9 },  // Stock: the house blend, its supplier, the new price typed, saved
  { a: 19.0, b: 33.0, rate: 1.9 }, // Menu costing: the coffees, recosted
]

export function Beans({ len }: { len: number }) {
  const m = BEANS, segs = BEANS_SEGS
  const costing = startOf(segs, 1)
  const keys: CamKey[] = [
    whole(0),
    on(m, 'blend', segs, 1.25, 846, 462, 10),
    whole(eventAt(m, 'item', segs) + 12),
    on(m, 'supplier', segs, 1.35, 720, 330),
    on(m, 'cost', segs, 1.35, 720, 380),
    on(m, 'save', segs, 1.1, 720, 500, 4),
    whole(costing),
    on(m, 'flat', segs, 1.25, 846, 520, 10),
    on(m, 'average', segs, 1.4, 760, 280, 6),
  ]
  return (
    <Recorded n={2} of={STEPS} label="When costs move" len={len} src="clips/costing-beans.mp4" meta={m} segs={segs} keys={keys}
      url={f => (f < costing ? 'businesssagent.com/stock' : 'businesssagent.com/recipes')}
      captions={[
        { from: 0, title: <>Beans up? <Em>Type it once.</Em></> },
        { from: costing - 4, title: <>Every coffee, <Em>recosted.</Em></> },
      ]} />
  )
}

// ---------- 3 Thin margins ----------
const MARGIN_SEGS: Segment[] = [
  { a: 1.0, b: 7.8, rate: 1.5 },   // the advisor's finding, and Open page
  { a: 7.8, b: 26.9, rate: 1.8 },  // Pain au chocolat: at €2,90 it reaches its margin; saved
  { a: 26.9, b: 32.0, rate: 1.3 }, // on target, in the list
]

export function Margin({ len }: { len: number }) {
  const m = MARGIN, segs = MARGIN_SEGS
  const keys: CamKey[] = [
    whole(0),
    on(m, 'tip', segs, 1.4, 620, 450, 10),
    whole(eventAt(m, 'open', segs) + 10),
    on(m, 'row', segs, 1.25, 846, 450),
    whole(eventAt(m, 'item', segs) + 12),
    on(m, 'before', segs, 1.35, 720, 380),
    on(m, 'save', segs, 1.1, 720, 500, 4),
    on(m, 'row-after', segs, 1.25, 846, 400, 6),
  ]
  return (
    <Recorded n={3} of={STEPS} label="Thin margins" len={len} src="clips/costing-margin.mp4" meta={m} segs={segs} keys={keys}
      url={f => (f < eventAt(m, 'open', segs) + 6 ? 'businesssagent.com/advisor' : 'businesssagent.com/recipes')}
      captions={[
        { from: 0, title: <>Flagged: <Em>a thin margin.</Em></> },
        { from: eventAt(m, 'price', segs) - 10, title: <>€2,90, and it’s <Em>on target.</Em></> },
      ]}>
      <Sfx name="ping" at={eventAt(m, 'save', segs) + 8} volume={0.14} />
    </Recorded>
  )
}
