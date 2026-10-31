// Onboarding: a café's ready-made setup, five apps connected one after another, all set.
import { interpolate, useCurrentFrame } from 'remotion'
import { Browser, Caption, Clip, Cream, Em, Sfx, Zoomed, useEnter, type CamKey } from '../kit'
import { META, camOn, clicksOf, eventAt } from '../clips'
import { BA, text } from '../theme'
import type { Segment } from '../timeline'

const SEGS: Segment[] = [
  { a: 1.7, b: 8.6, rate: 1.8 },   // a ready-made setup, "Café & coffee shop", Next
  { a: 12.9, b: 15.0, rate: 1.4 }, // the suggested apps, "Connect 5 apps"
  { a: 15.0, b: 23.0, rate: 3.2 }, // Continue, Continue, Continue…
  { a: 23.0, b: 26.2, rate: 1.3 }, // all set
]
const W = 1500
const H = 938

export function Setup() {
  const frame = useCurrentFrame()
  const m = META.setup
  const allSet = eventAt(m, 'all-set', SEGS)
  const keys: CamKey[] = [
    { f: 0, s: 1, fx: 720, fy: 380 },
    camOn(m, 'ready-made', SEGS, 1.3, 12),
    camOn(m, 'cafe', SEGS, 1.3, 8),
    camOn(m, 'next', SEGS, 1.25, 8),
    { f: eventAt(m, 'next', SEGS) + 14, s: 1.0, fx: 720, fy: 420 },
    camOn(m, 'connect-all', SEGS, 1.5, 10),
    camOn(m, 'continue-Square', SEGS, 1.45, 6, { x: 120, y: -80 }),
    { f: allSet - 4, s: 1.12, fx: 640, fy: 330 },
  ]
  const win = useEnter(4, 200)
  // The stopwatch: start to finish, about three minutes (the guide's own estimate), run fast.
  const secs = Math.round(interpolate(frame, [14, allSet], [0, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const done = frame >= allSet
  return (
    <Cream>
      <Caption eyebrow="Onboarding" title={<>Set up in <Em>minutes,</Em> not weeks.</>} at={0} />
      <div style={{ position: 'absolute', right: 110, top: 96, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 999,
        background: done ? BA.goodSoft : '#fff', color: done ? BA.good : BA.ink, fontFamily: text, fontWeight: 600, fontSize: 30,
        boxShadow: '0 10px 30px rgba(60,40,30,0.10)', opacity: useEnter(10), fontVariantNumeric: 'tabular-nums' }}>
        <svg width={30} height={30} viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M10 2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        <span style={{ fontWeight: 500, fontSize: 24, opacity: 0.75 }}>{done ? 'all set' : 'setting up'}</span>
      </div>
      <Browser url="businesssagent.com/setup" width={W} height={H}
        style={{ left: 210, top: 245, opacity: win, translate: `0 ${interpolate(win, [0, 1], [90, 0])}px` }}>
        <Zoomed keys={keys} w={W} h={H} focusY={0.42}>
          <Clip src="clips/setup.mp4" segs={SEGS} />
        </Zoomed>
      </Browser>
      {clicksOf(m, SEGS).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.3} />)}
      <Sfx name="chime" at={allSet} volume={0.3} />
    </Cream>
  )
}
