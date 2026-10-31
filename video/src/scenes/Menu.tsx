// Prices: Flat White goes up on the till (Square); Business Agent reads it; every menu has it: the
// printed one, the café's TV, the website's click & collect, Google Maps.
import { Sequence, interpolate, useCurrentFrame } from 'remotion'
import { siSquare } from 'simple-icons'
import { Browser, Caption, Card, Clip, Cream, Crop, Em, Logo, Phone, Sfx, Tick, Zoomed, easeOut, useEnter, type CamKey } from '../kit'
import { META, camOn, clicksOf, eventAt } from '../clips'
import { Arrive, Head, MapsCard, Ring } from '../places'
import { BA, text } from '../theme'
import type { Segment } from '../timeline'

const MENU: Segment[] = [{ a: 3.6, b: 12.1, rate: 1.7 }]
const W = 1500
const H = 938
const B = 105 // the app
const C = 255 // the tiles
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Arrow({ x, y, down }: { x: number; y: number; down: boolean }) {
  return (
    <svg width={34} height={34} viewBox="0 0 28 28" style={{ position: 'absolute', left: x - 6, top: y - 4, scale: down ? '0.86' : '1', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
      <path d="M5 3 L5 22 L10 17.5 L13.5 25 L16.8 23.6 L13.4 16.2 L20 16.2 Z" fill="#1f1a17" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

/** The till: Flat White's price changed in Square's item library. */
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
          <Logo icon={siSquare} size={34} /> Square <span style={{ fontWeight: 400, color: BA.faint }}>· Item library</span>
          <span style={{ flex: 1 }} />{saved && <Tick at={66} label="Saved" size={20} />}
        </div>
        <div style={{ padding: '28px', display: 'flex', gap: 26 }}>
          <div style={{ width: 120, height: 120, borderRadius: 18, background: BA.roseSoft, display: 'grid', placeItems: 'center' }}>
            <svg width={60} height={60} viewBox="0 0 24 24"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zm13 1h1.5a2.5 2.5 0 0 1 0 5H17M7 3c0 1.5 1 1.5 1 3M11 3c0 1.5 1 1.5 1 3" fill="none" stroke={BA.roseDeep} strokeWidth={1.6} strokeLinecap="round" /></svg>
          </div>
          <div style={{ flex: 1, fontFamily: text }}>
            <div style={{ fontWeight: 600, fontSize: 36, color: BA.ink }}>Flat White</div>
            <div style={{ fontSize: 22, color: BA.faint, marginTop: 4 }}>Classics · Hot</div>
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

const Printer = () => <svg width={30} height={30} viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z" fill="none" stroke={BA.roseDeep} strokeWidth={1.8} strokeLinejoin="round" /></svg>
const Tv = () => <svg width={30} height={30} viewBox="0 0 24 24"><path d="M3 5h18v12H3zM8 21h8M12 17v4" fill="none" stroke={BA.lilacDeep} strokeWidth={1.8} strokeLinejoin="round" /></svg>

export function Menu() {
  const frame = useCurrentFrame()
  const m = META.menu
  const keys: CamKey[] = [
    { f: 0, s: 1.55, fx: 1130, fy: 726 },
    camOn(m, 'square', MENU, 1.35, 8, { x: 260, y: 40 }),
    { f: eventAt(m, 'dialog', MENU) - 2, s: 1.4, fx: 720, fy: 450 },
    camOn(m, 'new-price', MENU, 1.75, 6, { x: 150, y: 0 }),
  ]
  const win = useEnter(B, 200)
  const winOut = interpolate(frame, [C - 10, C], [1, 0], clamp)
  return (
    <Cream>
      <Sequence durationInFrames={B} layout="none">
        <Caption eyebrow="Menu & prices" title={<>New price? Change it on <Em>your till.</Em></>} at={0} out={B} />
        <SquareCard />
        <Sfx name="click" at={26} volume={0.3} />
        <Sfx name="click" at={62} volume={0.3} />
        <Sfx name="ping" at={66} volume={0.15} />
      </Sequence>
      <Sequence from={B} durationInFrames={C - B} layout="none">
        <Caption eyebrow="Your menu" title={<>Business Agent <Em>follows Square.</Em></>} at={0} out={C - B} />
        <Browser url="businesssagent.com/menu" width={W} height={H}
          style={{ left: 210, top: 245, opacity: win * winOut, translate: `0 ${interpolate(win, [0, 1], [90, 0])}px` }}>
          <Zoomed keys={keys} w={W} h={H} focusY={0.42}><Clip src="clips/menu.mp4" segs={MENU} /></Zoomed>
        </Browser>
        {clicksOf(m, MENU).map((f, i) => <Sfx key={i} name="click" at={f} volume={0.3} />)}
      </Sequence>
      <Sequence from={C} layout="none">
        <Caption eyebrow="Everywhere, by itself" title={<>Every menu is <Em>already right.</Em></>} sub="Flat White, €3.80: printed, on the TV, online and on Google." at={0} />
        <Arrive at={4} x={80} y={350} width={400}>
          <Card>
            <Head icon={<Printer />} name="Printed menu" at={14} />
            <div style={{ position: 'relative', borderTop: `1px solid ${BA.lineSoft}` }}>
              <Crop src="stills/print.png" x={1164} y={437} w={645} h={663} width={400} />
              <Ring at={20} x={(1214 - 1164) * (400 / 645)} y={(812 - 437) * (400 / 645)} w={256 * (400 / 645)} h={26 * (400 / 645)} />
            </div>
          </Card>
        </Arrive>
        <Arrive at={14} x={505} y={350} width={590}>
          <Card>
            <Head icon={<Tv />} name="Café TV" at={24} />
            <div style={{ position: 'relative', borderTop: `1px solid ${BA.lineSoft}`, background: BA.tint }}>
              <Crop src="stills/tv.png" x={916} y={437} w={1141} h={675} width={590} />
              <Ring at={30} x={(1004 - 916) * (590 / 1141)} y={(770 - 437) * (590 / 1141)} w={470 * (590 / 1141)} h={36 * (590 / 1141)} />
            </div>
          </Card>
        </Arrive>
        <Arrive at={24} x={1115} y={290} width={310}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: text, fontWeight: 600, fontSize: 22, color: BA.ink, textAlign: 'center' }}>Website · click & collect</div>
            <div style={{ position: 'relative', width: 310, height: 670 }}>
              <Phone width={310}>
                <Sequence from={24} layout="none"><Clip src="clips/weborder.mp4" segs={[{ a: 0, b: 4.3, rate: 0.9 }]} /></Sequence>
              </Phone>
            </div>
          </div>
        </Arrive>
        <Arrive at={34} x={1445} y={350} width={420}><MapsCard at={34} mode="menu" /></Arrive>
        <div style={{ position: 'absolute', left: 1115, top: 990, width: 310, display: 'flex', justifyContent: 'center' }}><Tick at={82} size={20} /></div>
        {[4, 14, 24, 34].map(f => <Sfx key={f} name="pop" at={f} volume={0.3} />)}
        <Sfx name="click" at={24 + 1.5 * 30 / 0.9} volume={0.3} />
      </Sequence>
      <Sfx name="whoosh" at={B - 8} volume={0.2} />
      <Sfx name="whoosh" at={C - 10} volume={0.25} />
    </Cream>
  )
}
