// Prices: Flat White goes up on the till (Square), and the new price is everywhere it shows: the
// till, the café's TV, the website's click & collect, Google Maps.
import type { ReactNode } from 'react'
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { siSquare } from 'simple-icons'
import { Caption, Card, Clip, Cream, Crop, Em, Logo, Phone, Sfx, Tick, easeOut, useEnter } from '../kit'
import { Arrive, MapsCard, Ring } from '../places'
import { Till } from '../devices'
import { BA, text } from '../theme'

const B = 105 // everywhere
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Arrow({ x, y, down }: { x: number; y: number; down: boolean }) {
  return (
    <svg width={34} height={34} viewBox="0 0 28 28" style={{ position: 'absolute', left: x - 6, top: y - 4, scale: down ? '0.86' : '1', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
      <path d="M5 3 L5 22 L10 17.5 L13.5 25 L16.8 23.6 L13.4 16.2 L20 16.2 Z" fill="#1f1a17" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

/** The till's item library: Flat White's price changed in Square. */
function SquareCard() {
  const frame = useCurrentFrame()
  const enter = useEnter(0, 200)
  const out = interpolate(frame, [B - 12, B], [1, 0], clamp)
  // Select the old price, type the new one, save.
  const typing = interpolate(frame, [34, 52], [0, 5], clamp)
  const price = frame < 30 ? '€3.20' : frame < 34 ? '' : '€3.80'.slice(0, Math.round(typing))
  const saved = frame >= 66
  const cur = frame < 26
    ? { x: interpolate(frame, [6, 26], [1180, 1010], { ...clamp, easing: easeOut }), y: interpolate(frame, [6, 26], [760, 545], { ...clamp, easing: easeOut }) }
    : frame < 54 ? { x: 1010, y: 545 } : { x: interpolate(frame, [54, 64], [1010, 1170], { ...clamp, easing: easeOut }), y: interpolate(frame, [54, 64], [545, 655], { ...clamp, easing: easeOut }) }
  return (
    <div style={{ position: 'absolute', left: 560, top: 330, width: 800, opacity: enter * out, translate: `0 ${interpolate(enter, [0, 1], [60, 0])}px` }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px', borderBottom: `1px solid ${BA.lineSoft}`, fontFamily: text, fontWeight: 600, fontSize: 28, color: BA.ink }}>
          <Logo icon={siSquare} size={34} /> Square
          <span style={{ flex: 1 }} />{saved && <Tick at={66} label="Saved" size={20} />}
        </div>
        <div style={{ padding: '28px', display: 'flex', gap: 26, alignItems: 'center' }}>
          <div style={{ width: 120, height: 120, borderRadius: 18, background: BA.roseSoft, display: 'grid', placeItems: 'center' }}>
            <svg width={60} height={60} viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zm13 1h1.5a2.5 2.5 0 0 1 0 5H17M7 3c0 1.5 1 1.5 1 3M11 3c0 1.5 1 1.5 1 3" fill="none" stroke={BA.roseDeep} strokeWidth={1.6} strokeLinecap="round" /></svg>
          </div>
          <div style={{ flex: 1, fontFamily: text }}>
            <div style={{ fontWeight: 600, fontSize: 36, color: BA.ink }}>Flat White</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
              <div style={{ fontSize: 22, color: BA.soft, width: 70 }}>Price</div>
              <div style={{ width: 220, height: 58, borderRadius: 12, border: `2px solid ${frame >= 26 && frame < 66 ? '#006AFF' : BA.line}`, display: 'flex', alignItems: 'center',
                padding: '0 16px', fontSize: 30, fontWeight: 600, color: BA.ink, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ background: frame >= 26 && frame < 34 ? 'rgba(0,106,255,0.2)' : 'transparent' }}>{price}</span>
                {frame >= 26 && frame < 66 && <span style={{ width: 2, height: 30, background: '#006AFF', marginLeft: 2, opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }} />}
              </div>
              <div style={{ marginLeft: 'auto', height: 58, padding: '0 30px', borderRadius: 12, background: '#006AFF', color: '#fff', display: 'flex', alignItems: 'center',
                fontSize: 24, fontWeight: 600, scale: frame >= 62 && frame < 68 ? '0.95' : '1' }}>Save</div>
            </div>
          </div>
        </div>
      </Card>
      <Arrow x={cur.x - 560} y={cur.y - 330} down={(frame >= 26 && frame < 30) || (frame >= 62 && frame < 66)} />
    </div>
  )
}

/** A device's name under it, with a green tick. */
function Label({ x, width, at, children }: { x: number; width: number; at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ position: 'absolute', left: x, top: 935, width, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
      fontFamily: text, fontWeight: 600, fontSize: 28, color: BA.ink, opacity: p, translate: `0 ${interpolate(p, [0, 1], [14, 0])}px` }}>
      <svg width={30} height={30} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={BA.good} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {children}
    </div>
  )
}

const TV_K = 470 / 1141

export function Menu() {
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption title={<>New price? Change it on <Em>your till.</Em></>} at={0} out={B} />
        <SquareCard />
        <Sfx name="click" at={26} volume={0.28} />
        <Sfx name="click" at={62} volume={0.28} />
        <Sfx name="ping" at={66} volume={0.15} />
      </Sequence>
      <Sequence from={B} layout="none">
        <Caption title={<>One price. <Em>Everywhere it shows.</Em></>} at={0} />
        <Arrive at={4} x={60} y={290} width={600}><Till width={600} at={14} /></Arrive>
        <Arrive at={14} x={690} y={385} width={470}>
          <div style={{ position: 'relative', filter: 'drop-shadow(0 30px 50px rgba(43,37,34,0.25))' }}>
            <Crop src="stills/tv.png" x={916} y={548} w={1141} h={654} width={470} />
            <Ring at={26} x={(1004 - 916) * TV_K} y={(876 - 548) * TV_K} w={470 * TV_K} h={38 * TV_K} />
          </div>
        </Arrive>
        <Arrive at={24} x={1190} y={300} width={260}>
          <div style={{ position: 'relative', width: 260, height: 560 }}>
            <Phone width={260}>
              <Sequence from={24} layout="none"><Clip src="clips/weborder.mp4" segs={[{ a: 0, b: 4.4, rate: 0.9 }]} /></Sequence>
            </Phone>
          </div>
        </Arrive>
        <Arrive at={34} x={1480} y={340} width={390}><MapsCard at={34} mode="menu" head={false} /></Arrive>
        <Label x={60} width={600} at={20}>Your till</Label>
        <Label x={690} width={470} at={30}>Café TV</Label>
        <Label x={1150} width={340} at={40}>Click & collect</Label>
        <Label x={1480} width={390} at={50}>Google Maps</Label>
        {[4, 14, 24, 34].map(f => <Sfx key={f} name="pop" at={f} volume={0.3} />)}
        <Sfx name="click" at={24 + 1.5 * 30 / 0.9} volume={0.28} />
      </Sequence>
      <Sfx name="whoosh" at={B - 8} volume={0.25} />
    </Cream>
  )
}
