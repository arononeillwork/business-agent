// The till on the counter: a tablet on its stand, its checkout showing the café's drinks at the
// till's prices (Flat White at its new €3.80). Drawn here, not a photo of any one brand's hardware.
import { interpolate, useCurrentFrame } from 'remotion'
import { BA, text } from './theme'

const ITEMS: [string, string, string][] = [
  ['Flat White', '€3.80', BA.roseSoft], ['Cappuccino', '€3.50', '#F3EEE8'], ['Latte', '€4.00', '#EFE6DA'],
  ['Americano', '€2.80', '#F3EEE8'], ['Cortado', '€3.00', '#EFE6DA'], ['Espresso', '€2.40', '#F3EEE8'],
  ['Matcha Latte', '€5.50', BA.matchaSoft], ['Ube Latte', '€5.90', BA.lilacSoft], ['Chai Latte', '€4.50', '#F6EADF'],
  ['Mocha', '€4.50', '#EFE6DA'], ['Cold Brew', '€4.70', '#EAE7E3'], ['Hot Chocolate', '€4.00', '#F1E4DC'],
]

const Cup = ({ color }: { color: string }) => (
  <svg width={34} height={34} viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zm13 1h1.5a2.5 2.5 0 0 1 0 5H17" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" /></svg>
)

/** The checkout screen, drawn at 1000 × 625 and scaled to fit. */
function Checkout({ at }: { at: number }) {
  const frame = useCurrentFrame()
  const ring = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ width: 1000, height: 625, background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: text }}>
      <div style={{ height: 58, display: 'flex', alignItems: 'center', padding: '0 26px', borderBottom: `1px solid ${BA.lineSoft}` }}>
        <span style={{ fontWeight: 600, fontSize: 24, color: BA.ink }}>Checkout</span>
        <span style={{ marginLeft: 26, fontSize: 19, color: BA.faint }}>Drinks</span>
        <span style={{ marginLeft: 20, fontSize: 19, color: BA.faint }}>Food</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 19, color: BA.faint, fontVariantNumeric: 'tabular-nums' }}>09:55</span>
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr', gap: 12 }}>
          {ITEMS.map(([name, price, bg], i) => (
            <div key={name} style={{ position: 'relative', borderRadius: 14, background: bg, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {i === 0 && <div style={{ position: 'absolute', inset: -4, borderRadius: 18, border: `4px solid ${BA.roseDeep}`, opacity: ring, scale: String(interpolate(ring, [0, 1], [1.08, 1])) }} />}
              <Cup color={i === 0 ? BA.roseDeep : BA.soft} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 19, color: BA.ink }}>{name}</div>
                <div style={{ fontWeight: 600, fontSize: 19, color: i === 0 ? BA.roseDeep : BA.soft, fontVariantNumeric: 'tabular-nums' }}>{price}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ width: 300, borderLeft: `1px solid ${BA.lineSoft}`, padding: '22px 22px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 600, fontSize: 21, color: BA.ink }}>Current sale</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 20, color: BA.ink }}>
            <span>Flat White</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>€3.80</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${BA.lineSoft}`, paddingTop: 14, fontSize: 22, fontWeight: 600, color: BA.ink }}>
            <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>€3.80</span>
          </div>
          <div style={{ marginTop: 14, height: 56, borderRadius: 28, background: BA.ink, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 21 }}>
            Charge €3.80
          </div>
        </div>
      </div>
    </div>
  )
}

/** The till: a tablet on a countertop stand, turned a little towards the viewer. */
export function Till({ width, at }: { width: number; at: number }) {
  const bezel = width * 0.022
  const screenW = width - 2 * bezel
  const k = screenW / 1000
  const screenH = 625 * k
  const tabletH = screenH + 2 * bezel
  return (
    <div style={{ position: 'relative', width, height: tabletH + width * 0.36 }}>
      {/* The base and its shadow, then the neck, then the tablet itself. */}
      <div style={{ position: 'absolute', left: '50%', top: tabletH + width * 0.29, width: width * 0.62, height: width * 0.05, translate: '-50% 0',
        borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(43,37,34,0.28), transparent)', filter: 'blur(6px)' }} />
      <div style={{ position: 'absolute', left: '50%', top: tabletH + width * 0.255, width: width * 0.46, height: width * 0.05, translate: '-50% 0', borderRadius: width * 0.02,
        background: 'linear-gradient(180deg, #9C9AA0, #6E6C72)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35)' }} />
      <div style={{ position: 'absolute', left: '50%', top: tabletH - width * 0.02, width: width * 0.16, height: width * 0.29, translate: '-50% 0',
        clipPath: 'polygon(18% 0, 82% 0, 100% 100%, 0 100%)', background: 'linear-gradient(90deg, #77757B, #B3B1B6 45%, #8A888E)' }} />
      <div style={{ position: 'absolute', inset: 0, height: tabletH, transform: 'perspective(2400px) rotateY(-9deg) rotateX(3deg)', transformOrigin: '50% 100%' }}>
        <div style={{ width, height: tabletH, borderRadius: width * 0.04, background: '#1D1B1E', padding: bezel, boxSizing: 'border-box',
          boxShadow: '0 30px 60px rgba(43,37,34,0.28), inset 0 0 0 2px #3A373B' }}>
          <div style={{ width: screenW, height: screenH, borderRadius: width * 0.02, overflow: 'hidden', background: '#fff' }}>
            <div style={{ width: 1000, height: 625, transformOrigin: '0 0', scale: String(k) }}><Checkout at={at} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
