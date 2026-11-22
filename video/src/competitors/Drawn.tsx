// The competitor insights video's drawn scenes: the title; the café's street, Easy Beans in the middle and the
// five places it competes with round it, while the owner guesses on a sticky note; then a new café opening round
// the corner that nobody mentioned; and at the end the same street, known. The places, their distances and
// ratings are the demo's (src/data/demoCompetitors.ts: made up, so no real business is shown); the map is drawn,
// not anyone's map app.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Sfx, Tick, useEnter } from '../kit'
import { Ring } from '../places'
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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Competitor insights</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Know</Word><Word at={14}>your</Word><Word at={18}>competition.</Word></div>
          <div><Word at={30} italic>Every</Word><Word at={34} italic>week.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

/** A place on the street: where its pin is on the 860 × 600 map, which side its label sits, and what the label says. */
interface Spot { name: string; far: string; rating: string; x: number; y: number; side: 'left' | 'right' }

/** The five places the demo café follows, round it (as the demo has them, not to scale). */
const RIVALS: Spot[] = [
  { name: 'Molino Coffee Lab', far: '180 m', rating: '4,7', x: 350, y: 238, side: 'left' },
  { name: 'Café Bar La Plaza', far: '310 m', rating: '4,3', x: 196, y: 140, side: 'right' },
  { name: 'Horno de Santa Ana', far: '420 m', rating: '4,5', x: 470, y: 92, side: 'right' },
  { name: 'The Brunch Garden', far: '650 m', rating: '4,6', x: 690, y: 452, side: 'left' },
  { name: 'Verde Juice Bar', far: '900 m', rating: '4,4', x: 500, y: 552, side: 'right' },
]
/** The café that opened last week, 150 m away (the demo's Nuevo Rincón Café, new on Google). */
const NEW: Spot = { name: 'Nuevo Rincón Café', far: '150 m', rating: '4,9', x: 440, y: 210, side: 'right' }
const YOU = { x: 430, y: 340 }
const MAP = { w: 860, h: 600 }

function Pin({ colour, at, size = 34 }: { colour: string; at: number; size?: number }) {
  const p = useEnter(at, 11)
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 24 31" style={{ position: 'absolute', left: -size / 2, top: -size * 1.3,
      transformOrigin: '50% 100%', scale: String(interpolate(p, [0, 1], [0.2, 1])), opacity: Math.min(1, p * 2), filter: 'drop-shadow(0 3px 4px rgba(60,40,30,0.25))' }}>
      <path d="M12 30C12 30 23 18.6 23 11.5a11 11 0 1 0-22 0C1 18.6 12 30 12 30z" fill={colour} stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="11.5" r="4.4" fill="#fff" />
    </svg>
  )
}

/** A pin and its label: the place, how far, and (known) its rating; `tag` adds a pill after it. */
function Place({ s, colour, at, known, tag }: { s: Spot; colour: string; at: number; known?: boolean; tag?: ReactNode }) {
  const p = useEnter(at + 4, 200)
  return (
    <div style={{ position: 'absolute', left: s.x, top: s.y }}>
      <Pin colour={colour} at={at} />
      <div style={{ position: 'absolute', top: -46, [s.side === 'left' ? 'right' : 'left']: 24, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
        padding: '7px 14px', borderRadius: 12, background: '#fff', boxShadow: '0 6px 18px rgba(60,40,30,0.14)', fontFamily: text, fontSize: 20, color: BA.ink,
        opacity: p, translate: `${interpolate(p, [0, 1], [s.side === 'left' ? 12 : -12, 0])}px 0` }}>
        <span style={{ fontWeight: 600 }}>{s.name}</span>
        <span style={{ color: BA.faint }}>{s.far}</span>
        {known && <span style={{ color: BA.soft }}>{s.rating}<span style={{ color: '#F4B400' }}>★</span></span>}
        {tag}
      </div>
    </div>
  )
}

const NewTag = () => (
  <span style={{ padding: '2px 10px', borderRadius: 999, background: BA.roseSoft, color: BA.roseDeep, fontWeight: 700, fontSize: 17 }}>New</span>
)

/** The café's street, drawn: blocks, roads, a square, the sea at the bottom; Easy Beans in the middle, the places round it. */
function Street({ at = 0, known = false, newAt, newTag }: { at?: number; known?: boolean; newAt?: number; newTag?: ReactNode }) {
  return (
    <Card style={{ position: 'relative', width: MAP.w, height: MAP.h, background: '#F4EFE7', borderRadius: 30, overflow: 'visible' }}>
      {/* The labels may hang over the map's edge; the map itself keeps its rounded corners. */}
      <svg width={MAP.w} height={MAP.h} style={{ position: 'absolute', inset: 0, borderRadius: 30 }}>
        {/* The blocks between the streets. */}
        {[[30, 30, 140, 150], [220, 30, 200, 70], [520, 30, 300, 120], [30, 230, 260, 130], [380, 130, 110, 60], [620, 190, 210, 170],
          [30, 400, 200, 110], [270, 390, 300, 90], [620, 400, 210, 40]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx={12} fill="#EAE2D6" />
        ))}
        {/* A square with trees. */}
        <rect x={330} y={260} width={170} height={100} rx={16} fill="#E3EBD9" />
        {[[360, 285], [470, 285], [360, 335], [470, 335]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill="#CBDDB8" />)}
        {/* The sea, and the promenade along it. */}
        <path d={`M0 ${MAP.h - 46} C 200 ${MAP.h - 62}, 420 ${MAP.h - 30}, ${MAP.w} ${MAP.h - 52} L ${MAP.w} ${MAP.h} L 0 ${MAP.h} Z`} fill="#D6E6EE" />
        <text x={36} y={MAP.h - 16} fontFamily="Figtree, sans-serif" fontSize={16} fill="#8AA6B3" letterSpacing="2">PASEO MARÍTIMO</text>
        <text x={240} y={214} fontFamily="Figtree, sans-serif" fontSize={15} fill={BA.faint} letterSpacing="1.5">C. PIZARRO</text>
      </svg>
      <div style={{ position: 'absolute', left: YOU.x, top: YOU.y }}>
        <Pin colour={BA.lilacDeep} at={at} size={42} />
        <YouLabel at={at + 4} />
      </div>
      {RIVALS.map((s, i) => <Place key={s.name} s={s} colour={BA.roseDeep} at={at + 14 + i * 7} known={known} />)}
      {newAt !== undefined && <Place s={NEW} colour={BA.roseDeep} at={newAt} known={known} tag={newTag ?? <NewTag />} />}
    </Card>
  )
}

function YouLabel({ at }: { at: number }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ position: 'absolute', top: 10, left: '50%', translate: `-50% ${interpolate(p, [0, 1], [10, 0])}px`, whiteSpace: 'nowrap', opacity: p,
      padding: '8px 16px', borderRadius: 12, background: BA.lilacDeep, color: '#fff', fontFamily: text, fontWeight: 600, fontSize: 21,
      boxShadow: '0 6px 18px rgba(60,40,30,0.18)' }}>Easy Beans Coffee (you)</div>
  )
}

/** The owner's guesses, handwritten on a sticky note. */
function Note({ lines }: { lines: { at: number; text: string; rose?: boolean }[] }) {
  const p = useEnter(lines[0].at - 10, 200)
  return (
    <div style={{ width: 460, padding: '34px 36px 40px', background: '#FFF3B8', boxShadow: '0 24px 50px rgba(60,40,30,0.20)', rotate: '-2.5deg',
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, fontFamily: hand, fontSize: 44, lineHeight: 1.12, color: BA.ink }}>
      {lines.map((l, i) => <Line key={i} at={l.at} rose={l.rose}>{l.text}</Line>)}
    </div>
  )
}

function Line({ at, rose, children }: { at: number; rose?: boolean; children: string }) {
  const frame = useCurrentFrame()
  // Written out letter by letter.
  const shown = Math.round(interpolate(frame, [at, at + children.length * 1.1], [0, children.length], clamp))
  return <div style={{ marginTop: 14, minHeight: 50, color: rose ? BA.roseDeep : BA.ink, fontWeight: rose ? 700 : 500 }}>{children.slice(0, shown)}</div>
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const map = useEnter(4, 200)
  const second = 180
  const newAt = second + 14
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>Five cafés round the corner. <Em>You’re guessing.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>Then a new one opens. <Em>Nobody tells you.</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 305, top: 230, opacity: map, translate: `0 ${interpolate(map, [0, 1], [70, 0])}px` }}>
          <Street at={14} newAt={newAt} />
          {frame >= newAt && <Ring at={newAt + 10} x={NEW.x + 22} y={NEW.y - 48} w={352} h={40} />}
        </div>
        <div style={{ position: 'absolute', left: 1180, top: 300 }}>
          <Note lines={[
            { at: 64, text: 'Our cappuccino’s €2,90. Too dear?' },
            { at: 100, text: 'Who opens before us?' },
            { at: 130, text: 'Does everyone do brunch now?' },
            { at: newAt + 20, text: 'A new café?! Since when?', rose: true },
          ]} />
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={18} volume={0.18} />
      {[28, 35, 42, 49, 56].map(f => <Sfx key={f} name="pop" at={f} volume={0.1} />)}
      <Sfx name="pop" at={newAt} volume={0.26} />
      <Sfx name="buzz" at={newAt + 10} volume={0.16} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
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
  const map = useEnter(4, 200)
  const line = useEnter(130, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const followed = (
    <span style={{ padding: '2px 10px', borderRadius: 999, background: BA.goodSoft, color: BA.good, fontWeight: 700, fontSize: 17 }}>Followed</span>
  )
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Every café round you. <Em>Known.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 305, top: 250, opacity: map, translate: `0 ${interpolate(map, [0, 1], [70, 0])}px`,
          scale: '0.8', transformOrigin: '0 0' }}>
          <Street at={0} known newAt={10} newTag={followed} />
        </div>
        <div style={{ position: 'absolute', left: 1050, top: 330, width: 570, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <Point at={40}>Their prices next to yours</Point>
          <Point at={58}>What they offer that you don’t</Point>
          <Point at={76}>Hours and ratings, checked weekly</Point>
          <Point at={94}>New cafés nearby, spotted for you</Point>
          <div style={{ fontFamily: text, fontSize: 27, lineHeight: 1.5, color: BA.soft, marginTop: 8, maxWidth: 520, opacity: line }}>
            Prices, hours and what’s on offer, decided knowing what’s round the corner.
          </div>
        </div>
      </AbsoluteFill>
      {[40, 58, 76, 94].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
