// 23:47. The café closed hours ago, and its owner is still changing the same thing in seven places.
import type { ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { siGooglemaps, siSquare, siWhatsapp } from 'simple-icons'
import { Caption, Logo, Sfx, easeOut, useEnter } from '../kit'
import { BA, display, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const POP = 50
const EVERY = 17

const Glyph = ({ d, color = BA.ink }: { d: string; color?: string }) => (
  <svg width={34} height={34} viewBox="0 0 24 24"><path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const GLOBE = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'
const PRINTER = 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z'
const TV = 'M3 5h18v12H3zM8 21h8M12 17v4'
const BAG = 'M5 8h14l-1 13H6L5 8zm4 0V6a3 3 0 0 1 6 0v2'

const PLACES: { name: string; icon: ReactNode; task: string; value: string }[] = [
  { name: 'Google Maps', icon: <Logo icon={siGooglemaps} size={30} />, task: 'Special hours · 24–26 Dec', value: 'Closed' },
  { name: 'Your website', icon: <Glyph d={GLOBE} />, task: 'Footer · Opening hours', value: 'Sunday: Closed' },
  { name: 'Square', icon: <Logo icon={siSquare} size={30} />, task: 'Flat White · price', value: '€3.80' },
  { name: 'Printed menus', icon: <Glyph d={PRINTER} />, task: 'Reprint the drinks menu', value: '× 12' },
  { name: 'TV menu', icon: <Glyph d={TV} />, task: 'Edit the menu board', value: '€3.80' },
  { name: 'Click & collect', icon: <Glyph d={BAG} />, task: 'Online menu · Flat White', value: '€3.80' },
  { name: 'Team chat', icon: <Logo icon={siWhatsapp} size={30} />, task: 'Who can work Christmas Eve?', value: '…' },
]
// Four across, then three, a little askew.
const SPOTS = [[130, 250, -2.5], [575, 236, 1.5], [1020, 256, -1], [1465, 240, 2.2], [350, 560, 1.8], [795, 572, -2], [1240, 556, 1]] as const

function Place({ i }: { i: number }) {
  const frame = useCurrentFrame()
  const at = POP + i * EVERY
  const p = useEnter(at, 14)
  const p2 = PLACES[i]
  const [x, y, r] = SPOTS[i]
  // Earlier windows sink back as new ones arrive; all dim when the review lands.
  const older = interpolate(frame, [at + EVERY, Math.max(at + EVERY + 1, POP + 7 * EVERY)], [1, 0.72], clamp)
  const dim = interpolate(frame, [170, 182], [1, 0.35], clamp)
  const typed = interpolate(frame, [at + 4, at + 16], [0, p2.value.length], clamp)
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 420, rotate: `${r}deg`, opacity: Math.min(1, p * 1.4) * dim * older,
      scale: String(interpolate(p, [0, 1], [0.82, 1])), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px` }}>
      <div style={{ background: '#2A2420', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ height: 38, background: '#342C27', display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px' }}>
          {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, opacity: 0.85 }} />)}
        </div>
        <div style={{ padding: '18px 22px 22px', background: '#FBF8F4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: text, fontWeight: 600, fontSize: 25, color: BA.ink }}>
            {p2.icon}{p2.name}
          </div>
          <div style={{ fontFamily: text, fontSize: 19, color: BA.soft, marginTop: 12 }}>{p2.task}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1, height: 44, borderRadius: 10, border: `1.5px solid ${BA.roseDeep}`, background: '#fff', display: 'flex', alignItems: 'center',
              padding: '0 12px', fontFamily: text, fontSize: 21, color: BA.ink }}>
              {p2.value.slice(0, Math.round(typed))}<span style={{ width: 2, height: 24, background: BA.roseDeep, marginLeft: 2, opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }} />
            </div>
            <div style={{ height: 44, padding: '0 18px', borderRadius: 22, background: BA.rose, display: 'flex', alignItems: 'center', fontFamily: text, fontWeight: 600, fontSize: 19, color: BA.ink }}>Save</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Review() {
  const frame = useCurrentFrame()
  const p = useEnter(172, 11)
  const shake = frame >= 172 && frame < 186 ? Math.sin((frame - 172) * 2.4) * (186 - frame) * 0.9 : 0
  return (
    <div style={{ position: 'absolute', left: 960 - 380, top: 330, width: 760, opacity: Math.min(1, p * 1.5),
      scale: String(interpolate(p, [0, 1], [1.25, 1])), translate: `${shake}px 0` }}>
      <div style={{ background: '#fff', borderRadius: 26, padding: '34px 40px', boxShadow: '0 40px 100px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: BA.lilacSoft, color: BA.lilacDeep, fontFamily: text, fontWeight: 700, fontSize: 24,
            display: 'grid', placeItems: 'center' }}>L</div>
          <div>
            <div style={{ fontFamily: text, fontWeight: 600, fontSize: 24, color: BA.ink }}>A customer’s review</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <svg key={i} width={26} height={26} viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={i === 0 ? '#F4B400' : '#E3DDD6'} /></svg>
              ))}
              <span style={{ fontFamily: text, fontSize: 20, color: BA.faint, marginLeft: 10 }}>on Google · just now</span>
            </div>
          </div>
        </div>
        <div style={{ fontFamily: display, fontSize: 44, lineHeight: 1.18, color: BA.ink, marginTop: 22 }}>
          “Google said open on Sunday. We drove over. <em style={{ color: BA.roseDeep }}>Closed.</em>”
        </div>
      </div>
    </div>
  )
}

export function ColdOpen() {
  const frame = useCurrentFrame()
  // The clock: big in the middle, then up into the corner, still ticking.
  const lift = interpolate(frame, [36, 56], [0, 1], { ...clamp, easing: easeOut })
  const minutes = frame < 120 ? '23:47' : '23:48'
  const clockIn = interpolate(frame, [2, 16], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 800px at 50% 0%, #2E2520, ${BA.night} 70%)` }}>
      <div style={{ position: 'absolute', left: interpolate(lift, [0, 1], [960, 170]), top: interpolate(lift, [0, 1], [430, 110]), translate: '-50% -50%',
        fontFamily: display, fontWeight: 400, fontSize: interpolate(lift, [0, 1], [230, 64]), color: '#fff', opacity: clockIn, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums' }}>
        {minutes.slice(0, 2)}<span style={{ opacity: Math.floor(frame / 15) % 2 ? 0.35 : 1 }}>:</span>{minutes.slice(3)}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 590, textAlign: 'center', fontFamily: text, fontSize: 38, color: 'rgba(255,255,255,0.72)',
        opacity: interpolate(frame, [10, 20, 34, 44], [0, 1, 1, 0], clamp) }}>
        The café closed at three.
      </div>
      {PLACES.map((_, i) => <Place key={i} i={i} />)}
      <div style={{ position: 'absolute', right: 110, top: 86, fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.rose,
        opacity: interpolate(frame, [POP, POP + 6, 168, 176], [0, 1, 1, 0], clamp), fontVariantNumeric: 'tabular-nums' }}>
        {Math.min(7, Math.max(1, Math.floor((frame - POP) / EVERY) + 1))} of 7
      </div>
      <div style={{ opacity: interpolate(frame, [164, 172], [1, 0], clamp) }}>
        <Caption at={POP + 8} title={<>Christmas hours. New prices.<br /><span style={{ color: BA.rose }}>Seven places to change them.</span></>}
          x={110} y={850} width={1700} size={62} light />
      </div>
      <Review />
      <Caption at={186} title={<>Miss one, and your customers <em style={{ color: BA.rose, fontStyle: 'italic' }}>find out first.</em></>}
        x={110} y={880} width={1700} size={62} light align="center" />
      {Array.from({ length: 7 }, (_, i) => <Sfx key={i} name="ping" at={POP + i * EVERY} volume={0.22} />)}
      <Sfx name="buzz" at={172} volume={0.3} />
      <Sfx name="whoosh" at={230} volume={0.35} />
    </AbsoluteFill>
  )
}
