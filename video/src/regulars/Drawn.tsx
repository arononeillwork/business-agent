// The "customers who never come back" video's drawn scenes: the title; the café's week, a rush on Saturday and a
// quiet Monday (the 36% the app's own takings give for the demo's Mondays), and the regulars the owner knows by
// their order but can't reach; and at the end Monday morning, the quiet-day message on a regular's phone, with what
// the owner gets. The phone's messages are drawn (not any one messaging app), with the campaign's own words.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Phone, Sfx, Tick, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Word({ children, at, italic }: { children: string; at: number; italic?: boolean }) {
  const p = useEnter(at, 16)
  return (
    <span style={{ display: 'inline-block', opacity: Math.min(1, p * 1.3), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`,
      fontStyle: italic ? 'italic' : 'normal', color: italic ? BA.roseDeep : BA.ink, marginRight: '0.24em' }}>{children}</span>
  )
}

export function Title() {
  const frame = useCurrentFrame()
  const eyebrow = useEnter(4, 200)
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.16em', textTransform: 'uppercase', color: BA.roseDeep,
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Customers who never come back</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Bring</Word><Word at={14}>them</Word><Word at={18}>back.</Word></div>
          <div><Word at={30} italic>On</Word><Word at={34} italic>the</Word><Word at={38} italic>quiet</Word><Word at={42} italic>days.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

/** The week's takings by day, drawn: how tall each day is against the busiest (no amounts), Monday 36% under the average. */
const WEEK: { day: string; h: number }[] = [
  { day: 'Mon', h: 0.46 }, { day: 'Tue', h: 0.66 }, { day: 'Wed', h: 0.7 }, { day: 'Thu', h: 0.72 },
  { day: 'Fri', h: 0.84 }, { day: 'Sat', h: 1 }, { day: 'Sun', h: 0.66 },
]

function Week({ at = 0 }: { at?: number }) {
  const frame = useCurrentFrame()
  const H = 360
  return (
    <Card style={{ width: 720, padding: '34px 40px 30px', boxSizing: 'border-box', fontFamily: text }}>
      <div style={{ fontWeight: 600, fontSize: 28, color: BA.ink }}>Takings by day</div>
      <div style={{ fontSize: 21, color: BA.faint, marginTop: 4 }}>An average week</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 22, height: H, marginTop: 30 }}>
        {/* The average day, dashed. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * 0.72, borderTop: `2px dashed ${BA.faint}`, opacity: interpolate(frame, [at + 40, at + 52], [0, 1], clamp) }} />
        {WEEK.map((d, i) => {
          const grow = interpolate(frame, [at + i * 4, at + i * 4 + 22], [0, 1], { ...clamp, easing: t => 1 - Math.pow(1 - t, 3) })
          const mon = i === 0
          const h = d.h * H * grow
          return (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {mon && (
                <div style={{ fontWeight: 700, fontSize: 26, color: BA.roseDeep, opacity: interpolate(frame, [at + 50, at + 62], [0, 1], clamp) }}>
                  −36%
                </div>
              )}
              <div style={{ width: '100%', height: h, borderRadius: '10px 10px 4px 4px', background: mon ? BA.roseDeep : d.h === 1 ? BA.lilacDeep : BA.lilac }} />
              <div style={{ fontSize: 22, fontWeight: mon || d.h === 1 ? 700 : 500, color: mon ? BA.roseDeep : BA.soft }}>{d.day}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** The owner's notebook: the regulars, known by their order, and nothing to reach them with. */
function Notebook({ at }: { at: number }) {
  const p = useEnter(at, 200)
  const lines: { at: number; text: string; rose?: boolean }[] = [
    { at: at + 14, text: 'Lucía: oat flat white, mornings' },
    { at: at + 40, text: 'James: window table, weekdays' },
    { at: at + 66, text: 'Pablo: double espresso' },
    { at: at + 96, text: 'Their numbers? Emails? No idea.', rose: true },
  ]
  return (
    <div style={{ width: 560, padding: '36px 40px 44px', background: '#FFFDF6', boxShadow: '0 24px 50px rgba(60,40,30,0.18)', rotate: '-1.5deg', borderRadius: 6,
      backgroundImage: `repeating-linear-gradient(transparent 0 57px, #E4ECF5 57px 59px)`, backgroundPositionY: 30,
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, fontFamily: hand, fontSize: 42, lineHeight: '59px', color: BA.ink }}>
      <div style={{ fontWeight: 700, fontSize: 50 }}>Our regulars</div>
      {lines.map((l, i) => <Line key={i} at={l.at} rose={l.rose}>{l.text}</Line>)}
    </div>
  )
}

function Line({ at, rose, children }: { at: number; rose?: boolean; children: string }) {
  const frame = useCurrentFrame()
  // Written out letter by letter.
  const shown = Math.round(interpolate(frame, [at, at + children.length * 0.9], [0, children.length], clamp))
  return <div style={{ color: rose ? BA.roseDeep : BA.ink, fontWeight: rose ? 700 : 500 }}>{children.slice(0, shown)}</div>
}

export function Quiet({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const week = useEnter(4, 200)
  const second = 180
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const slide = interpolate(frame, [second - 14, second + 6], [0, 1], { ...clamp, easing: t => t * t * (3 - 2 * t) })
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>A rush on Saturday. <Em>Then a quiet Monday.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>You know your regulars. <Em>You can’t reach them.</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: interpolate(slide, [0, 1], [580, 305]), top: 250, opacity: week, translate: `0 ${interpolate(week, [0, 1], [70, 0])}px` }}>
          <Week at={12} />
        </div>
        {frame >= second - 10 && (
          <div style={{ position: 'absolute', left: 1075, top: 260 }}><Notebook at={second - 4} /></div>
        )}
      </AbsoluteFill>
      <Sfx name="pop" at={64} volume={0.2} />
      <Sfx name="whoosh" at={second - 14} volume={0.18} />
      <Sfx name="buzz" at={second + 100} volume={0.14} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

/** Monday at ten on a regular's phone: the quiet-day message, as Campaigns wrote it. */
function Messages({ at }: { at: number }) {
  const p = useEnter(at, 14)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F6F4F1', fontFamily: text, color: BA.ink }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 6px', fontSize: 15, fontWeight: 600 }}>
        <span>10:00</span><span style={{ fontSize: 13 }}>Mon</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 0 14px', borderBottom: `1px solid ${BA.line}`, background: '#fff' }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: BA.roseSoft, color: BA.roseDeep, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20 }}>EB</div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>Easy Beans Coffee</div>
        <div style={{ fontSize: 12, color: BA.faint }}>Text message</div>
      </div>
      <div style={{ padding: '22px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignSelf: 'center', fontSize: 12, color: BA.faint }}>Monday 10:00</div>
        <div style={{ maxWidth: '86%', padding: '12px 15px', borderRadius: '18px 18px 18px 6px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          fontSize: 15.5, lineHeight: 1.42, opacity: p, translate: `0 ${interpolate(p, [0, 1], [24, 0])}px`, scale: String(interpolate(p, [0, 1], [0.92, 1])), transformOrigin: '0 100%' }}>
          Easy Beans Coffee: quiet afternoons are better with cake. This Monday and Tuesday from 3 pm, coffee and a slice of cake at a special price. Show this message at the till.
        </div>
      </div>
    </div>
  )
}

function Point({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: text, fontSize: 30, lineHeight: 1.3, color: BA.ink, opacity: p,
      translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <Tick at={at + 4} label="" size={22} /><span>{children}</span>
    </div>
  )
}

export function Recap({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(6, 200)
  const line = useEnter(130, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Monday, ten o’clock. <Em>A reason to come in.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 380, top: 200, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <Phone width={380}><Messages at={26} /></Phone>
        </div>
        <div style={{ position: 'absolute', left: 900, top: 330, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <Point at={44}>Your regulars, and who said yes</Point>
          <Point at={62}>A message for the quiet day, ready-made</Point>
          <Point at={80}>A Mondays draw, its rules written</Point>
          <Point at={98}>A stamp card, straight from the till</Point>
          <div style={{ fontFamily: text, fontSize: 28, lineHeight: 1.5, color: BA.soft, maxWidth: 700, marginTop: 10, opacity: line }}>
            Quiet days get a reason to come in, and regulars come back more often.
          </div>
        </div>
      </AbsoluteFill>
      <Sfx name="ping" at={26} volume={0.2} />
      {[44, 62, 80, 98].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
