// Onboarding, at a pace you can follow: a ready-made setup, each kind of business looked at, the café
// picked, its suggested apps, five connected one after another, all set.
import { interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { META, clicksOf, eventAt } from '../clips'
import { BA, text } from '../theme'
import { WIN, type Segment } from '../timeline'

const SEGS: Segment[] = [
  { a: 1.0, b: 5.9, rate: 1.5 },   // "Use a ready-made setup"
  { a: 5.9, b: 18.4, rate: 1.6 },  // each kind of business: café, restaurant & bar, salon & beauty, something else
  { a: 18.4, b: 24.6, rate: 1.8 }, // the café, Next, its suggested apps
  { a: 31.9, b: 34.4, rate: 1.6 }, // "Connect 5 apps"
  { a: 34.4, b: 44.0, rate: 3.2 }, // Continue, Continue, Continue…
  { a: 44.0, b: 46.6, rate: 1.0 }, // all set
]

export function Setup() {
  const frame = useCurrentFrame()
  const m = META.setup
  const allSet = eventAt(m, 'all-set', SEGS)
  const kinds = eventAt(m, 'kind-Café & coffee shop', SEGS)
  const connect = eventAt(m, 'connect-all', SEGS)
  const keys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 450 },
    // The four kinds of business, a touch closer while they're looked at.
    { f: kinds - 14, s: 1.15, fx: 870, fy: 300 },
    { f: eventAt(m, 'next', SEGS) + 6, s: 1, fx: 720, fy: 450 },
    { f: connect + 10, s: 1.15, fx: 765, fy: 300 },
    { f: allSet - 2, s: 1, fx: 720, fy: 450 },
  ]
  const win = useEnter(4, 200)
  // The stopwatch: start to finish, about three minutes (the guide's own estimate), run fast.
  const secs = Math.round(interpolate(frame, [14, allSet], [0, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const done = frame >= allSet
  return (
    <Cream>
      <Caption title={<>Set up in <Em>minutes.</Em></>} at={0} />
      <div style={{ position: 'absolute', right: WIN.x, top: 78, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderRadius: 999,
        background: done ? BA.goodSoft : '#fff', color: done ? BA.good : BA.ink, fontFamily: text, fontWeight: 600, fontSize: 32,
        boxShadow: '0 10px 30px rgba(60,40,30,0.10)', opacity: useEnter(10), fontVariantNumeric: 'tabular-nums' }}>
        <svg width={30} height={30} viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M10 2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
      </div>
      <Browser url="businesssagent.com/setup" width={WIN.w} height={WIN.h}
        style={{ left: WIN.x, top: WIN.y, opacity: win, translate: `0 ${interpolate(win, [0, 1], [90, 0])}px` }}>
        <Zoomed keys={keys} w={WIN.w} h={WIN.h}>
          <Clip src="clips/setup.mp4" segs={SEGS} />
        </Zoomed>
      </Browser>
      {clicksOf(m, SEGS).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.28} />)}
      <Sfx name="chime" at={allSet} volume={0.3} />
    </Cream>
  )
}
