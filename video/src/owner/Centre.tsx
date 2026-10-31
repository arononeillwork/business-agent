// The two places the owner finds out what to do. Today, the first page each morning: what's been taken,
// what's running low, the jobs, and the advisor's first tip; then everything the advisor found, by area.
// One recording in one window. Then the four things to do this morning, as a list the chapters follow.
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Card, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { camOn, clicksOf, eventAt } from '../clips'
import { BA, text } from '../theme'
import { WIN, type Segment } from '../timeline'
import { CLIPS, Callout, Finding } from './parts'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const SEGS: Segment[] = [
  { a: 0.6, b: 17.4, rate: 1.8 },  // Today: the takings, what's low, the jobs; down to the advisor's first tip
  { a: 17.4, b: 24.4, rate: 1.5 }, // "Everything the advisor found": worth acting on first
  { a: 26.4, b: 38.4, rate: 3.0 }, // and the rest, area by area
]
/** Where the advisor's page takes over from Today (frames into the scene). */
export const ADVISOR_AT = 280
export const CENTRE_LEN = 540

export function TodayAndAdvisor() {
  const frame = useCurrentFrame()
  const m = CLIPS.today
  const box = (l: string) => m.events.find(e => e.label === l)!.box!
  const takings = box('takings'), jobs = box('jobs')
  const keys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 450 },
    { f: eventAt(m, 'takings', SEGS) - 6, s: 1.22, fx: (takings.x + jobs.x + jobs.width) / 2, fy: takings.y + takings.height * 0.42 },
    camOn(m, 'tip', SEGS, 1.3, 10),
    { f: ADVISOR_AT + 22, s: 1, fx: 720, fy: 450 },
    camOn(m, 'first-0', SEGS, 1.18, 8, { x: 0, y: 70 }),
    { f: 425, s: 1, fx: 720, fy: 450 },
  ]
  const win = useEnter(2, 200)
  const out = interpolate(frame, [CENTRE_LEN - 10, CENTRE_LEN], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={ADVISOR_AT} layout="none">
          <Caption title={<>Every morning starts on <Em>Today.</Em></>} at={0} out={ADVISOR_AT} />
        </Sequence>
        <Sequence from={ADVISOR_AT} layout="none">
          <Caption title={<>Then the advisor: <Em>what’s worth doing?</Em></>} at={0} />
        </Sequence>
        <Browser url={frame < ADVISOR_AT + 8 ? 'businesssagent.com' : 'businesssagent.com/advisor'} width={WIN.w} height={WIN.h}
          style={{ left: WIN.x, top: WIN.y, opacity: win, translate: `0 ${interpolate(win, [0, 1], [90, 0])}px` }}>
          <Zoomed keys={keys} w={WIN.w} h={WIN.h}><Clip src="clips/owner-today.mp4" segs={SEGS} /></Zoomed>
        </Browser>
        <Callout meta={m} label="takings" keys={keys} at={eventAt(m, 'takings', SEGS) + 4} out={eventAt(m, 'stock', SEGS)} side="above">What you’ve taken</Callout>
        <Callout meta={m} label="stock" keys={keys} at={eventAt(m, 'stock', SEGS) + 2} out={eventAt(m, 'jobs', SEGS)} side="above">What’s running low</Callout>
        <Callout meta={m} label="jobs" keys={keys} at={eventAt(m, 'jobs', SEGS) + 2} out={eventAt(m, 'jobs', SEGS) + 46} side="above">Jobs to do</Callout>
        <Callout meta={m} label="tip" keys={keys} at={eventAt(m, 'tip', SEGS) + 6} out={ADVISOR_AT - 4} side="above">The advisor’s first tip</Callout>
      </AbsoluteFill>
      {clicksOf(m, SEGS).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
      {[eventAt(m, 'takings', SEGS), eventAt(m, 'stock', SEGS), eventAt(m, 'jobs', SEGS), eventAt(m, 'tip', SEGS)].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.14} />)}
      <Sfx name="whoosh" at={CENTRE_LEN - 10} volume={0.22} />
    </Cream>
  )
}

/** This morning's four, as the advisor found them: each one the next chapter. */
export const FOUR = [
  { title: 'Closing an hour earlier could pay', why: 'Sunday’s last hour takes 24% of a usual hour.', page: 'Opening hours' },
  { title: 'Some prices don’t reach your margin', why: 'Pain au chocolat makes 43%. At €2,90 it would get there.', page: 'Menu costing' },
  { title: 'Waste is high', why: 'Most of it butter croissants, thrown away at closing.', page: 'Offers' },
  { title: 'Reviews waiting for a reply', why: 'Two Google reviews have no reply yet.', page: 'Reviews' },
]

export function Plan({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const card = useEnter(0, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Four things to do. <Em>One place to do them.</Em></>} at={0} align="center" x={160} width={1600} />
        <div style={{ position: 'absolute', left: 290, top: 300, width: 1340, opacity: card, translate: `0 ${interpolate(card, [0, 1], [50, 0])}px` }}>
          <Card style={{ borderLeft: `6px solid ${BA.rose}` }}>
            <div style={{ padding: '24px 30px 4px', fontFamily: text, fontWeight: 600, fontSize: 26, color: BA.ink }}>Worth acting on this morning</div>
            {FOUR.map((x, i) => <Finding key={x.title} n={i + 1} {...x} at={10 + i * 8} />)}
            <div style={{ height: 8 }} />
          </Card>
        </div>
      </AbsoluteFill>
      {FOUR.map((x, i) => <Sfx key={x.title} name="pop" at={10 + i * 8} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 10} volume={0.22} />
    </Cream>
  )
}

