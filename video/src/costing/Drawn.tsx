// The "prices set by feel" video's drawn scenes: the title; the café's chalkboard menu with its prices, and the
// owner's guesses at what each costs on a sticky note; then the roaster's email with a new price for the house blend;
// and at the end the same board, every price with what it costs and what it makes (the demo's own figures, after the
// beans' new price and Pain au chocolat at €2,90). The email is drawn, not any one mail app.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Card, Cream, Em, Sfx, Tick, useEnter } from '../kit'
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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · Prices set by feel</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>What</Word><Word at={14}>does</Word><Word at={18}>a</Word><Word at={22}>flat</Word><Word at={26}>white</Word></div>
          <div><Word at={36} italic>really</Word><Word at={40} italic>cost?</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={36} volume={0.22} />
    </Cream>
  )
}

/** A line of the board: the item, its price and (`known`) what it costs and makes. */
interface Line { item: string; price: string; was?: string; cost: string; margin: string; low?: boolean }
const BOARD: Line[] = [
  { item: 'Flat white', price: '3,20', cost: '0,66', margin: '77%' },
  { item: 'Cappuccino', price: '2,90', cost: '0,69', margin: '74%' },
  { item: 'Espresso', price: '1,60', cost: '0,39', margin: '73%' },
  { item: 'Croissant', price: '1,80', cost: '0,94', margin: '43%', low: true },
  { item: 'Pain au chocolat', price: '2,90', was: '2,00', cost: '1,05', margin: '60%' },
]

/** The café's chalkboard menu. Known: each price with what it costs and makes, as Menu costing has them. */
function Board({ at = 0, known = false, width = 700 }: { at?: number; known?: boolean; width?: number }) {
  const frame = useCurrentFrame()
  const chalk = 'rgba(255,255,255,0.92)'
  return (
    <div style={{ width, padding: '40px 48px 44px', boxSizing: 'border-box', borderRadius: 18, background: '#2E3A33',
      border: '14px solid #8A6447', boxShadow: '0 30px 70px rgba(60,40,30,0.25), inset 0 0 60px rgba(0,0,0,0.35)', fontFamily: hand, color: chalk }}>
      <div style={{ fontSize: 58, fontWeight: 700, textAlign: 'center', marginBottom: 18 }}>Easy Beans</div>
      {BOARD.map((l, i) => {
        const p = interpolate(frame, [at + i * 6, at + i * 6 + 12], [0, 1], clamp)
        const k = interpolate(frame, [at + 30 + i * 8, at + 42 + i * 8], [0, 1], clamp)
        const price = known && l.was ? l.price : l.was ?? l.price
        return (
          <div key={l.item} style={{ opacity: p, padding: known ? '6px 0' : '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontSize: 48 }}>
              <span>{l.item}</span>
              <span style={{ flex: 1, borderBottom: '3px dotted rgba(255,255,255,0.35)', translate: '0 -10px' }} />
              {known && l.was && <span style={{ fontSize: 34, opacity: 0.5, textDecoration: 'line-through' }}>{l.was}</span>}
              <span style={{ fontWeight: 700 }}>{price}</span>
            </div>
            {known && (
              <div style={{ fontFamily: text, fontSize: 22, opacity: k, color: l.low ? '#F7B3BA' : '#BFE3C6', marginTop: -4 }}>
                costs €{l.cost} · makes {l.margin}{l.low ? ' · below target, next to look at' : ''}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The owner's guesses at what things cost, on a sticky note. */
function Note({ at }: { at: number }) {
  const p = useEnter(at - 10, 200)
  const lines = ['Flat white costs us… €1?', 'Does pain au chocolat even pay?', 'Same prices as last year.']
  return (
    <div style={{ width: 470, padding: '34px 36px 40px', background: '#FFF3B8', boxShadow: '0 24px 50px rgba(60,40,30,0.20)', rotate: '2.5deg',
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`, fontFamily: hand, fontSize: 44, lineHeight: 1.15, color: BA.ink }}>
      {lines.map((l, i) => <Written key={i} at={at + i * 30}>{l}</Written>)}
    </div>
  )
}

function Written({ at, children }: { at: number; children: string }) {
  const frame = useCurrentFrame()
  // Written out letter by letter.
  const shown = Math.round(interpolate(frame, [at, at + children.length * 0.9], [0, children.length], clamp))
  return <div style={{ marginTop: 14, minHeight: 50 }}>{children.slice(0, shown)}</div>
}

/** The roaster's email: the house blend's new price. */
function Email({ at }: { at: number }) {
  const p = useEnter(at, 200)
  return (
    <Card style={{ width: 560, padding: '30px 34px', boxSizing: 'border-box', fontFamily: text, opacity: p, translate: `0 ${interpolate(p, [0, 1], [50, 0])}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: '#6E4B3A', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20 }}>TS</div>
        <div><div style={{ fontWeight: 600, fontSize: 24, color: BA.ink }}>Tostadores del Sur</div><div style={{ fontSize: 19, color: BA.faint }}>New trade prices</div></div>
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.45, color: BA.ink, marginTop: 18 }}>From next month, our house espresso blend goes up.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BA.lineSoft}`, fontSize: 24 }}>
        <span style={{ color: BA.soft }}>House espresso blend, 1 kg</span>
        <span><span style={{ color: BA.faint, textDecoration: 'line-through', marginRight: 12 }}>€18,50</span><b style={{ color: BA.roseDeep }}>€21,00</b></span>
      </div>
    </Card>
  )
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const board = useEnter(4, 200)
  const second = 180
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const noteOut = interpolate(frame, [second - 12, second], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>Prices on the board. <Em>Costs? A guess.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>Then the beans go up. <Em>Which prices still pay?</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 305, top: 210, opacity: board, translate: `0 ${interpolate(board, [0, 1], [70, 0])}px` }}>
          <Board at={14} />
        </div>
        {frame < second && <div style={{ position: 'absolute', left: 1100, top: 320, opacity: noteOut }}><Note at={60} /></div>}
        {frame >= second - 4 && <div style={{ position: 'absolute', left: 1060, top: 380 }}><Email at={second} /></div>}
      </AbsoluteFill>
      <Sfx name="whoosh" at={second - 10} volume={0.18} />
      <Sfx name="ping" at={second + 6} volume={0.22} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

function Point({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: text, fontSize: 29, lineHeight: 1.3, color: BA.ink, opacity: p,
      translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <Tick at={at + 4} label="" size={22} /><span>{children}</span>
    </div>
  )
}

export function Recap({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const board = useEnter(4, 200)
  const line = useEnter(130, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Every price, <Em>on real costs.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 305, top: 200, opacity: board, translate: `0 ${interpolate(board, [0, 1], [70, 0])}px` }}>
          <Board at={0} known width={720} />
        </div>
        <div style={{ position: 'absolute', left: 1080, top: 330, width: 540, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <Point at={50}>Every item, costed to the cent</Point>
          <Point at={68}>New supplier prices in every recipe</Point>
          <Point at={86}>Thin margins flagged by the advisor</Point>
          <div style={{ fontFamily: text, fontSize: 27, lineHeight: 1.5, color: BA.soft, marginTop: 8, opacity: line }}>
            Prices set on real costs, so every sale earns what you think it does.
          </div>
        </div>
      </AbsoluteFill>
      {[50, 68, 86].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
