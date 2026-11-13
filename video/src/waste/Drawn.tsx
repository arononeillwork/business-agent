// The food waste video's drawn scenes: the title; closing time, the counter's leftovers going in the bin
// one tray at a time, what that comes to tonight; and the two days going by while nobody touches a thing,
// the banana bread's card counting down to its last day, when it's on offer by itself. The amounts are the
// demo's (Easy Beans' menu: banana bread €4,00, pain au chocolat €2,00, croissant €1,80).
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Sfx, ease, useEnter } from '../kit'
import { BA, display, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** An amount as the app writes it in Spain: €33,40. */
export const euro = (n: number) => `€${n.toFixed(2).replace('.', ',')}`

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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · food waste</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Don’t</Word><Word at={14}>bin</Word><Word at={18}>it.</Word></div>
          <div><Word at={30} italic>Sell</Word><Word at={34} italic>it.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

// ---------- What's left at closing ----------

/** A slice of banana bread, a pain au chocolat, a croissant: drawn, as the other videos' things are. */
const Bake = ({ kind, size = 64 }: { kind: 'banana' | 'pain' | 'croissant'; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    {kind === 'banana' && <>
      <rect x="10" y="14" width="44" height="38" rx="9" fill="#8B5A2B" />
      <rect x="14" y="20" width="36" height="28" rx="6" fill="#D9A866" />
      {[[22, 28], [36, 26], [28, 38], [42, 40]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#8B5A2B" opacity="0.7" />)}
    </>}
    {kind === 'pain' && <>
      <rect x="8" y="18" width="48" height="30" rx="10" fill="#D9963F" />
      <rect x="8" y="18" width="48" height="12" rx="8" fill="#E8B061" />
      <path d="M22 22v22M42 22v22" stroke="#4A2C1A" strokeWidth="4" strokeLinecap="round" />
    </>}
    {kind === 'croissant' && <>
      <path d="M6 40c6-20 46-20 52 0-6-4-12-5-14-2-4-6-12-8-12-8s-8 2-12 8c-2-3-8-2-14 2z" fill="#E0A04A" />
      <path d="M20 37c2-6 6-10 12-12M44 37c-2-6-6-10-12-12" stroke="#B0702A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>}
  </svg>
)

const LEFT = [
  { kind: 'banana' as const, name: 'Banana bread', n: 5, each: 4 },
  { kind: 'pain' as const, name: 'Pain au chocolat', n: 4, each: 2 },
  { kind: 'croissant' as const, name: 'Croissant', n: 3, each: 1.8 },
]
/** When each tray goes in the bin, and lands. */
const TOSS = [170, 205, 240]
const FLY = 26

/** A pedal bin, its lid lifting while things go in. */
function PedalBin({ open }: { open: number }) {
  return (
    <svg width={300} height={340} viewBox="0 0 300 340" style={{ overflow: 'visible' }}>
      <ellipse cx="150" cy="328" rx="120" ry="10" fill="rgba(43,37,34,0.10)" />
      <path d="M52 92h196l-18 230H70z" fill="#6B625C" />
      <path d="M52 92h196l-3 32H55z" fill="#5A524C" />
      {[100, 150, 200].map(x => <path key={x} d={`M${x} 140v160`} stroke="#7C736D" strokeWidth="8" strokeLinecap="round" />)}
      <g style={{ transformOrigin: '40px 86px', transform: `rotate(${-open * 38}deg)` }}>
        <rect x="40" y="70" width="220" height="22" rx="8" fill="#4A433E" />
        <rect x="128" y="58" width="44" height="14" rx="6" fill="#4A433E" />
      </g>
    </svg>
  )
}

export function Bin({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const tray = useEnter(10, 200)
  const binIn = useEnter(18, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const landed = TOSS.filter(t => frame >= t + FLY).length
  const total = LEFT.slice(0, landed).reduce((s, x) => s + x.n * x.each, 0)
  const lid = Math.max(...TOSS.map(t => interpolate(frame, [t - 8, t + 6, t + FLY + 4, t + FLY + 16], [0, 1, 1, 0], clamp)))
  const time = frame < 70 ? '17:58' : frame < 110 ? '17:59' : '18:00'
  const big = useEnter(TOSS[2] + FLY + 6, 14)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={160} layout="none"><Caption title={<>Closing time, <Em>and it’s still there.</Em></>} at={4} out={160} width={1200} size={64} /></Sequence>
        <Sequence from={160} durationInFrames={140} layout="none"><Caption title={<>What isn’t sold <Em>goes in the bin.</Em></>} out={140} width={1200} size={64} /></Sequence>
        <Sequence from={300} layout="none"><Caption title={<>Every evening. <Em>{euro(33.4)} tonight.</Em></>} width={1200} size={64} /></Sequence>
        {/* The clock, top right, coming up to six. */}
        <div style={{ position: 'absolute', right: 305, top: 76, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 26px 10px 16px', borderRadius: 999, background: '#fff',
          boxShadow: '0 10px 30px rgba(60,40,30,0.10)', fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink, fontVariantNumeric: 'tabular-nums', opacity: tray }}>
          <svg width={30} height={30} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke={BA.roseDeep} strokeWidth="2" /><path d="M12 6.5V12l3.5 2" stroke={BA.roseDeep} strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
          {time}<span style={{ color: BA.faint, fontWeight: 500 }}>{frame < 110 ? 'Open' : 'Closed'}</span>
        </div>
        {/* What's left on the counter. */}
        <Card style={{ position: 'absolute', left: 305, top: 250, width: 760, opacity: tray, translate: `0 ${interpolate(tray, [0, 1], [60, 0])}px` }}>
          <div style={{ padding: '26px 34px 18px', fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink }}>Left on the counter</div>
          {LEFT.map((x, i) => {
            const t = TOSS[i]
            const p = interpolate(frame, [t, t + FLY], [0, 1], { ...clamp, easing: ease })
            const gone = frame >= t + FLY
            return (
              <div key={x.name} style={{ position: 'relative', height: 112, borderTop: `1px solid ${BA.lineSoft}` }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 22, padding: '0 34px', fontFamily: text, opacity: gone ? 0.35 : 1 }}>
                  <div style={{ opacity: 1 - p, translate: `${p * 720}px ${-Math.sin(p * Math.PI) * 140 + p * 60}px`, rotate: `${p * 160}deg` }}><Bake kind={x.kind} /></div>
                  <div style={{ flex: 1, fontSize: 30, color: BA.ink, fontWeight: 500 }}>{x.name} <span style={{ color: BA.faint }}>× {x.n}</span></div>
                  <div style={{ fontSize: 30, fontWeight: 600, color: gone ? BA.roseDeep : BA.ink, textDecoration: gone ? 'line-through' : 'none', fontVariantNumeric: 'tabular-nums' }}>{euro(x.n * x.each)}</div>
                </div>
              </div>
            )
          })}
        </Card>
        {/* The bin, and what's gone in it tonight. */}
        <div style={{ position: 'absolute', left: 1240, top: 300, width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: binIn,
          translate: `0 ${interpolate(binIn, [0, 1], [60, 0])}px` }}>
          <PedalBin open={lid} />
          <div style={{ marginTop: 18, fontFamily: text, fontSize: 26, color: BA.soft }}>In the bin tonight</div>
          <div style={{ fontFamily: display, fontWeight: 500, fontSize: 84, color: BA.roseDeep, fontVariantNumeric: 'tabular-nums', scale: String(1 + 0.08 * big * (1 - big) * 4) }}>{euro(total)}</div>
        </div>
      </AbsoluteFill>
      <Sfx name="ring" at={110} volume={0.16} />
      {TOSS.map(t => <Sfx key={t} name="whoosh" at={t} volume={0.14} />)}
      {TOSS.map(t => <Sfx key={`s${t}`} name="stamp" at={t + FLY} volume={0.26} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

// ---------- Two days later ----------

const DAYS = [
  { day: 'Wednesday', date: '9', time: '09:55', left: '3 days left', share: 0 },
  { day: 'Thursday', date: '10', time: '10:05', left: '2 days left', share: 1 / 3 },
  { day: 'Friday', date: '11', time: '10:05', left: '24 hours left', share: 2 / 3 },
]
const TURN = [0, 40, 84]

/** A page of a desk calendar, turning over at `flipAt` (never, for the last) to show the day under it. */
function CalendarPage({ flipAt, z, children }: { flipAt: number | null; z: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const flip = flipAt === null ? 0 : interpolate(frame, [flipAt, flipAt + 14], [0, 1], { ...clamp, easing: ease })
  if (flip >= 1) return null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: z, transformOrigin: '50% 0%', transform: `perspective(1400px) rotateX(${flip * 100}deg)`, opacity: 1 - flip * 0.6,
      backfaceVisibility: 'hidden' }}>{children}</div>
  )
}

export function Wait({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const inn = useEnter(4, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const i = frame >= TURN[2] + 14 ? 2 : frame >= TURN[1] + 14 ? 1 : 0
  const d = DAYS[i]
  const share = interpolate(frame, [0, TURN[1] + 14, TURN[2] + 14, TURN[2] + 34], [0, 1 / 3, 1 / 3, 2 / 3], { ...clamp, easing: ease })
  const onOffer = frame >= TURN[2] + 40
  const pop = useEnter(TURN[2] + 40, 12)
  const card = useEnter(12, 200)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Two days later. <Em>Its last day.</Em></>} sub="Nobody touched a thing." at={0} width={1300} size={64} />
        {/* The calendar. */}
        <div style={{ position: 'absolute', left: 305, top: 330, width: 460, height: 500, opacity: inn, translate: `0 ${interpolate(inn, [0, 1], [50, 0])}px` }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 30, background: '#fff', boxShadow: '0 30px 70px rgba(60,40,30,0.16), 0 0 0 1px rgba(43,37,34,0.06)' }} />
          {DAYS.map((x, n) => (
            <CalendarPage key={x.day} flipAt={TURN[n + 1] ?? null} z={10 - n}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 110, background: BA.roseDeep, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: text, fontWeight: 600, fontSize: 38, letterSpacing: '0.06em' }}>December</div>
                <div style={{ fontFamily: display, fontWeight: 500, fontSize: 210, lineHeight: 1, color: BA.ink, marginTop: 28 }}>{x.date}</div>
                <div style={{ fontFamily: text, fontWeight: 600, fontSize: 40, color: BA.soft, marginTop: 10 }}>{x.day}</div>
                <div style={{ fontFamily: text, fontSize: 30, color: BA.faint, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{x.time}</div>
              </div>
            </CalendarPage>
          ))}
        </div>
        {/* The banana bread on the counter, as Freshly made shows it. */}
        <Card style={{ position: 'absolute', left: 860, top: 400, width: 760, padding: '30px 34px 32px', boxSizing: 'border-box', fontFamily: text,
          opacity: card, translate: `0 ${interpolate(card, [0, 1], [50, 0])}px` }}>
          <div style={{ fontSize: 34, fontWeight: 500, color: BA.ink }}>Banana bread <span style={{ color: BA.faint }}>× 12</span></div>
          <div style={{ fontSize: 24, color: BA.soft, marginTop: 6 }}>Made Wed 9 Dec, 09:55 by Aron · keeps 3 days</div>
          <div style={{ position: 'relative', height: 14, borderRadius: 7, background: BA.matchaSoft, marginTop: 28 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${share * 100}%`, borderRadius: 7, background: share > 0.6 ? '#9A6A1E' : '#6B8E4E' }} />
            <div style={{ position: 'absolute', left: '66.7%', top: -6, width: 4, height: 26, borderRadius: 2, background: BA.ink }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: BA.soft, marginTop: 10 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.left}</span><span>Good until Sat 12 Dec, 09:55</span>
          </div>
          <div style={{ marginTop: 22, height: 44, display: 'flex', alignItems: 'center' }}>
            {!onOffer
              ? <span style={{ padding: '6px 16px', borderRadius: 999, background: BA.goodSoft, color: BA.good, fontWeight: 600, fontSize: 22 }}>Fresh · 50% off from Fri 11 Dec, 09:55</span>
              : <span style={{ padding: '6px 18px', borderRadius: 999, background: BA.roseSoft, color: BA.roseDeep, fontWeight: 700, fontSize: 24,
                  scale: String(interpolate(pop, [0, 1], [0.7, 1])), display: 'inline-flex', gap: 10 }}>On offer now: 50% off · {euro(2)} <s style={{ fontWeight: 500, opacity: 0.7 }}>{euro(4)}</s></span>}
          </div>
        </Card>
      </AbsoluteFill>
      {TURN.slice(1).map(t => <Sfx key={t} name="whoosh" at={t} volume={0.16} />)}
      <Sfx name="ping" at={TURN[2] + 40} volume={0.24} />
      <Sfx name="pop" at={TURN[2] + 40} volume={0.2} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}
